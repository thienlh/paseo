import type { ToolCallDetail, ToolCallTimelineItem } from "./agent-types.js";
import { parseMcpToolName } from "./tool-name-normalization.js";

interface SettledQuestionToolInput {
  name: string;
  status: ToolCallTimelineItem["status"];
  detail: ToolCallDetail;
  metadata?: Record<string, unknown>;
}

export interface SettledQuestionOption {
  label: string;
  description?: string;
  selected: boolean;
}

export interface SettledQuestionEntry {
  question?: string;
  answer?: string;
  multiSelect?: boolean;
  options?: SettledQuestionOption[];
  /** Typed answer that is not one of the options. */
  customAnswer?: string;
}

export interface SettledQuestionToolProjection {
  displayName: "[ANSWERED]" | "[CANCELLED]";
  summary?: string;
  entries: SettledQuestionEntry[];
  detail: Extract<ToolCallDetail, { type: "plain_text" }>;
  cancelled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Claude's AskUserQuestion, including the MCP alias Conductor uses. */
export function isAskUserQuestionToolName(name: string): boolean {
  const trimmed = name.trim();
  const leaf = parseMcpToolName(trimmed)?.method ?? trimmed;
  return leaf.replace(/[\s_-]+/g, "").toLowerCase() === "askuserquestion";
}

interface QuestionOptionPrompt {
  label: string;
  description?: string;
}

interface QuestionPrompt {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: QuestionOptionPrompt[];
}

function readOptions(value: unknown): QuestionOptionPrompt[] {
  if (!Array.isArray(value)) return [];
  const options: QuestionOptionPrompt[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) options.push({ label });
      continue;
    }
    if (!isRecord(item) || typeof item.label !== "string") continue;
    const label = item.label.trim();
    if (!label) continue;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    options.push(description ? { label, description } : { label });
  }
  return options;
}

function readQuestions(value: unknown): QuestionPrompt[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) return [];
  const questions: QuestionPrompt[] = [];
  for (const item of value.questions) {
    if (!isRecord(item) || typeof item.question !== "string") continue;
    const question = item.question.trim();
    if (!question) continue;
    const header = typeof item.header === "string" ? item.header.trim() : "";
    questions.push({
      question,
      ...(header ? { header } : {}),
      multiSelect: item.multiSelect === true,
      options: readOptions(item.options),
    });
  }
  return questions;
}

function unwrapToolOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ("answers" in value || "questions" in value || "selectedOptions" in value) return value;
  if ("output" in value) return unwrapToolOutput(value.output);
  return value;
}

function answerText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  if (isRecord(value) && Array.isArray(value.answers)) return answerText(value.answers);
  return undefined;
}

function readAnswerRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.answers)) return undefined;
  return value.answers;
}

/**
 * Claude's AskUserQuestion tool_result is a sentence, not the answers object:
 * `User has answered your questions: "question"="picked option". You can now continue...`
 */
function parseQuotedAnswerPairs(
  text: string,
  questions: readonly QuestionPrompt[],
): Record<string, string> | undefined {
  const marker = "User has answered your questions:";
  const start = text.indexOf(marker);
  if (start < 0) return undefined;
  const body = text.slice(start + marker.length);
  const keys = [
    ...new Set(
      questions.flatMap((question) =>
        [question.question, question.header].filter((key): key is string => Boolean(key)),
      ),
    ),
  ];
  const located = keys
    .map((key) => ({ key, token: `"${key}"="`, at: body.indexOf(`"${key}"="`) }))
    .filter((item) => item.at >= 0)
    .sort((left, right) => left.at - right.at);
  if (located.length === 0) return undefined;

  const pairs: Record<string, string> = {};
  for (let index = 0; index < located.length; index++) {
    const current = located[index];
    const valueStart = current.at + current.token.length;
    const nextAt = located[index + 1]?.at ?? body.length;
    const close = body.lastIndexOf('"', nextAt - 1);
    if (close < valueStart) continue;
    const value = body.slice(valueStart, close).trim();
    if (value) pairs[current.key] = value;
  }
  return Object.keys(pairs).length > 0 ? pairs : undefined;
}

function answersInQuestionOrder(
  answers: Record<string, unknown>,
  questions: readonly QuestionPrompt[],
): string[] {
  if (questions.length === 0) {
    return Object.values(answers)
      .map((value) => answerText(value))
      .filter((value): value is string => value !== undefined);
  }
  return questions
    .map(
      (question) =>
        answerText(answers[question.question]) ??
        (question.header ? answerText(answers[question.header]) : undefined),
    )
    .filter((value): value is string => value !== undefined);
}

function collectQuestions(
  input: unknown,
  output: unknown,
  metadata: Record<string, unknown> | undefined,
): QuestionPrompt[] {
  const merged = new Map<string, QuestionPrompt>();
  for (const question of [
    ...readQuestions(input),
    ...readQuestions(metadata),
    ...readQuestions(unwrapToolOutput(output)),
  ]) {
    const existing = merged.get(question.question);
    if (!existing) {
      merged.set(question.question, question);
      continue;
    }
    if (existing.options.length === 0 && question.options.length > 0) {
      existing.options = question.options;
    }
    if (!existing.header && question.header) existing.header = question.header;
    if (!existing.multiSelect && question.multiSelect) existing.multiSelect = true;
  }
  return [...merged.values()];
}

/**
 * Marks the options the answer string picked. A full match of one or more option
 * labels wins. Multi-select can also leave a trailing custom answer. Anything
 * else is a freeform answer, so no option is marked picked.
 */
function partitionSelection(
  answer: string,
  labels: readonly string[],
  multiSelect: boolean,
): { selected: string[]; custom?: string } {
  if (labels.length === 0) return { selected: [], custom: answer };
  if (labels.some((label) => label === answer)) return { selected: [answer] };

  const byLength = [...labels].sort((left, right) => right.length - left.length);
  const selected: string[] = [];
  let rest = answer;
  while (rest.length > 0) {
    const match = byLength.find((label) => rest === label || rest.startsWith(`${label}, `));
    if (!match) break;
    selected.push(match);
    if (rest === match) {
      rest = "";
      break;
    }
    rest = rest.slice(match.length + 2);
  }

  if (selected.length > 0 && rest.length === 0) return { selected };
  if (multiSelect && selected.length > 0 && rest.length > 0) return { selected, custom: rest };
  return { selected: [], custom: answer };
}

function resolveAnswerRecord(
  questions: readonly QuestionPrompt[],
  input: unknown,
  output: unknown,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const unwrapped = unwrapToolOutput(output);
  for (const source of [metadata, input, unwrapped]) {
    const answers = readAnswerRecord(source);
    if (answers && Object.keys(answers).length > 0) return answers;
  }
  const prose = proseOutput(output);
  if (prose) {
    const quoted = parseQuotedAnswerPairs(prose, questions);
    if (quoted) return quoted;
  }
  if (isRecord(unwrapped) && questions.length === 1) {
    const selected = answerText(unwrapped.selectedOptions);
    if (selected) return { [questions[0].question]: selected };
  }
  return undefined;
}

function collectAnswers(
  questions: readonly QuestionPrompt[],
  answers: Record<string, unknown> | undefined,
): string[] {
  if (!answers) return [];
  if (questions.length === 0) {
    return Object.values(answers)
      .map((value) => answerText(value))
      .filter((value): value is string => value !== undefined);
  }
  return answersInQuestionOrder(answers, questions);
}

function proseOutput(output: unknown): string | undefined {
  const unwrapped = unwrapToolOutput(output);
  if (typeof unwrapped === "string") {
    const trimmed = unwrapped.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!isRecord(unwrapped) && !Array.isArray(unwrapped)) return undefined;
  let blocks: unknown[] = [];
  if (Array.isArray(unwrapped)) {
    blocks = unwrapped;
  } else if (Array.isArray(unwrapped.content)) {
    blocks = unwrapped.content;
  }
  const text = blocks
    .map((block) => {
      if (typeof block === "string") return block.trim();
      return isRecord(block) && typeof block.text === "string" ? block.text.trim() : "";
    })
    .filter((block) => block.length > 0)
    .join("\n");
  return text.length > 0 ? text : undefined;
}

function formatResponses(answers: readonly string[]): string {
  return ["[ANSWERED]", ...answers.map((answer, index) => `${index + 1}. ${answer}`)].join("\n");
}

function answerForQuestion(
  question: QuestionPrompt,
  answers: Record<string, unknown> | undefined,
): string | undefined {
  if (!answers) return undefined;
  return (
    answerText(answers[question.question]) ??
    (question.header ? answerText(answers[question.header]) : undefined)
  );
}

function buildEntries(
  questions: readonly QuestionPrompt[],
  answerRecord: Record<string, unknown> | undefined,
  fallbackAnswers: readonly string[],
  cancelled: boolean,
): SettledQuestionEntry[] {
  if (questions.length === 0) {
    return cancelled ? [] : fallbackAnswers.map((answer) => ({ answer }));
  }
  const entries: SettledQuestionEntry[] = questions.map((question, index) => {
    const answer = cancelled
      ? undefined
      : (answerForQuestion(question, answerRecord) ??
        (answerRecord ? undefined : fallbackAnswers[index]));
    const picked =
      answer && question.options.length > 0
        ? partitionSelection(
            answer,
            question.options.map((option) => option.label),
            question.multiSelect,
          )
        : undefined;
    const selected = new Set(picked?.selected ?? []);
    const options = question.options.map((option) => ({
      ...option,
      selected: selected.has(option.label),
    }));
    return {
      question: question.question,
      ...(answer ? { answer } : {}),
      ...(question.multiSelect ? { multiSelect: true } : {}),
      ...(options.length > 0 ? { options } : {}),
      ...(picked?.custom ? { customAnswer: picked.custom } : {}),
    };
  });
  if (!cancelled && !answerRecord) {
    for (const answer of fallbackAnswers.slice(questions.length)) {
      entries.push({ answer });
    }
  }
  return entries;
}

function plainTextDetail(
  text: string,
  label?: string,
): Extract<ToolCallDetail, { type: "plain_text" }> {
  return {
    type: "plain_text",
    text,
    icon: "brain",
    ...(label ? { label } : {}),
  };
}

function cancelledProjection(
  entries: SettledQuestionEntry[],
  questionSummary: string,
  firstQuestion: string | undefined,
): SettledQuestionToolProjection {
  const text = questionSummary ? `[CANCELLED]\n\n${questionSummary}` : "[CANCELLED]";
  return {
    displayName: "[CANCELLED]",
    ...(firstQuestion ? { summary: firstQuestion } : {}),
    entries,
    cancelled: true,
    detail: plainTextDetail(text, firstQuestion),
  };
}

function answeredProjection(
  entries: SettledQuestionEntry[],
  summary: string | undefined,
  text: string,
  label?: string,
): SettledQuestionToolProjection {
  return {
    displayName: "[ANSWERED]",
    ...(summary ? { summary } : {}),
    entries,
    cancelled: false,
    detail: plainTextDetail(text, label),
  };
}

/**
 * Settled AskUserQuestion rows. The pending question card is unchanged; this only
 * replaces the transcript chip once the user has answered or cancelled.
 */
export function projectSettledAskUserQuestion(
  input: SettledQuestionToolInput,
): SettledQuestionToolProjection | undefined {
  if (!isAskUserQuestionToolName(input.name)) return undefined;
  if (input.status !== "completed" && input.status !== "failed" && input.status !== "canceled") {
    return undefined;
  }

  if (input.detail.type !== "unknown") return undefined;
  const rawInput = input.detail.input;
  const rawOutput = input.detail.output;
  const questions = collectQuestions(rawInput, rawOutput, input.metadata);
  const answerRecord = resolveAnswerRecord(questions, rawInput, rawOutput, input.metadata);
  const answers = collectAnswers(questions, answerRecord);
  const cancelled = input.status === "failed" || input.status === "canceled";
  const entries = buildEntries(questions, answerRecord, answers, cancelled);
  const questionSummary = questions.map((question) => question.question).join("\n");
  const firstQuestion = questions[0]?.question;

  if (cancelled) return cancelledProjection(entries, questionSummary, firstQuestion);
  if (answers.length > 0) {
    const summary = answers.join(", ");
    return answeredProjection(entries, summary, formatResponses(answers), summary);
  }

  const prose = proseOutput(rawOutput);
  if (prose) {
    const firstLine = prose
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim();
    let proseEntries = entries;
    if (proseEntries.length === 0 && firstLine) {
      proseEntries = [{ answer: firstLine }];
    }
    return answeredProjection(proseEntries, firstLine, prose, firstLine);
  }

  const text = questionSummary ? `[ANSWERED]\n\n${questionSummary}` : "[ANSWERED]";
  return answeredProjection(entries, firstQuestion, text, firstQuestion);
}
