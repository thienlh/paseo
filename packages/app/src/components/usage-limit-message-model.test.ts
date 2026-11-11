import { describe, expect, it } from "vitest";
import type { StreamItem, UserMessageItem } from "@/types/stream";
import { findUsageLimitRetryMessage, parseUsageLimitMessage } from "./usage-limit-message-model";

const NOW = Date.UTC(2026, 10, 11, 9, 46, 33);

describe("parseUsageLimitMessage", () => {
  it("removes the system prefix and resolves the provider reset clock in its timezone", () => {
    expect(
      parseUsageLimitMessage(
        "[System Error] You've hit your 5-hour limit · resets 4:50pm (Asia/Saigon)",
        NOW,
      ),
    ).toEqual({
      message: "You've hit your 5-hour limit",
      resetAt: "2026-11-11T09:50:00.000Z",
    });
  });

  it("uses the next day's reset when today's clock time has passed", () => {
    expect(
      parseUsageLimitMessage(
        "[System Error] You've hit your 5-hour limit · resets 4:50pm (Asia/Saigon)",
        Date.UTC(2026, 10, 11, 10, 0, 0),
      )?.resetAt,
    ).toBe("2026-11-12T09:50:00.000Z");
  });

  it("preserves a limit message without reset metadata", () => {
    expect(
      parseUsageLimitMessage("[System Error] Your plan has reached its usage limit", NOW),
    ).toEqual({
      message: "Your plan has reached its usage limit",
      resetAt: null,
    });
  });

  it("keeps the original reset text when the timezone is invalid", () => {
    const text = "[System Error] You've hit your 5-hour limit · resets 4:50pm (Not/AZone)";
    expect(parseUsageLimitMessage(text, NOW)).toEqual({
      message: "You've hit your 5-hour limit · resets 4:50pm (Not/AZone)",
      resetAt: null,
    });
  });

  it("does not transform ordinary assistant text or unrelated system errors", () => {
    expect(parseUsageLimitMessage("You've hit your 5-hour limit", NOW)).toBeNull();
    expect(parseUsageLimitMessage("[System Error] Connection failed", NOW)).toBeNull();
  });
});

describe("findUsageLimitRetryMessage", () => {
  const user: UserMessageItem = {
    kind: "user_message",
    id: "user-1",
    text: "Original prompt",
    timestamp: new Date(NOW - 1000),
  };
  const error: StreamItem = {
    kind: "assistant_message",
    id: "error-1",
    messageId: "error-1",
    text: "[System Error] You've hit your 5-hour limit",
    timestamp: new Date(NOW),
  };

  it("finds the nearest preceding user message across the stream boundary", () => {
    const earlier: StreamItem = {
      kind: "assistant_message",
      id: "assistant-1",
      messageId: "assistant-1",
      text: "Earlier response",
      timestamp: new Date(NOW - 500),
    };
    expect(
      findUsageLimitRetryMessage({ tail: [user, earlier], head: [error], errorItemId: error.id }),
    ).toBe(user);
  });

  it("returns null when there is no prompt to retry", () => {
    expect(
      findUsageLimitRetryMessage({ tail: [], head: [error], errorItemId: error.id }),
    ).toBeNull();
  });
});
