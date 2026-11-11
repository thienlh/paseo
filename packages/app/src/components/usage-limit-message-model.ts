import type { StreamItem, UserMessageItem } from "@/types/stream";

const SYSTEM_ERROR_PREFIX = /^\[System Error\]\s*/i;
const USAGE_LIMIT = /\bhit your\b[^\n]*\blimit\b|\busage limit\b/i;
const RESET_SUFFIX = /\s*·\s*resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?\s*$/i;

export interface UsageLimitDetails {
  message: string;
  resetAt: string | null;
}

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")) % 24,
    minute: Number(values.get("minute")),
  };
}

function zonedPartsAsUtc(parts: ZonedDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timeZone: string): Date {
  const localAsUtc = zonedPartsAsUtc(parts);
  const offsetAtGuess = zonedPartsAsUtc(zonedParts(new Date(localAsUtc), timeZone)) - localAsUtc;
  const candidate = localAsUtc - offsetAtGuess;
  const offsetAtCandidate = zonedPartsAsUtc(zonedParts(new Date(candidate), timeZone)) - candidate;
  return new Date(localAsUtc - offsetAtCandidate);
}

function nextResetInTimeZone(input: {
  now: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  const current = zonedParts(new Date(input.now), input.timeZone);
  const local = {
    year: current.year,
    month: current.month,
    day: current.day,
    hour: input.hour,
    minute: input.minute,
  };
  let candidate = zonedDateTimeToUtc(local, input.timeZone);
  if (candidate.getTime() <= input.now) {
    candidate = zonedDateTimeToUtc({ ...local, day: local.day + 1 }, input.timeZone);
  }
  return candidate;
}

function nextResetLocally(now: number, hour: number, minute: number): Date {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function parseUsageLimitMessage(text: string, now = Date.now()): UsageLimitDetails | null {
  if (!SYSTEM_ERROR_PREFIX.test(text)) return null;
  const raw = text.replace(SYSTEM_ERROR_PREFIX, "").trim();
  if (!USAGE_LIMIT.test(raw)) return null;

  const reset = RESET_SUFFIX.exec(raw);
  if (!reset) return { message: raw, resetAt: null };

  const hour = (Number(reset[1]) % 12) + (reset[3].toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(reset[2] ?? 0);
  const timeZone = reset[4]?.trim();
  try {
    const resetAt = timeZone
      ? nextResetInTimeZone({ now, hour, minute, timeZone })
      : nextResetLocally(now, hour, minute);
    return {
      message: raw.replace(RESET_SUFFIX, "").trim(),
      resetAt: resetAt.toISOString(),
    };
  } catch {
    // Keep the provider's original reset text when its timezone cannot be resolved.
    return { message: raw, resetAt: null };
  }
}

export function findUsageLimitRetryMessage(input: {
  tail: StreamItem[];
  head: StreamItem[];
  errorItemId: string;
}): UserMessageItem | null {
  let foundError = false;
  for (const items of [input.head, input.tail]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]!;
      if (!foundError) {
        foundError = item.id === input.errorItemId;
        continue;
      }
      if (item.kind === "user_message") return item;
    }
  }
  return null;
}
