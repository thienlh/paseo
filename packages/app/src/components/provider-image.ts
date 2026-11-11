import { isProviderImageMarkdown } from "@getpaseo/protocol/provider-image";

export type ProviderMessageSegment =
  | { kind: "markdown"; text: string; start: number }
  | { kind: "image"; source: string; alt: string; start: number };

const IMAGE_PARAGRAPH = /^!\[([^\]]*)\]\((.+)\)$/;

export function splitProviderMessage(text: string): ProviderMessageSegment[] {
  const segments: ProviderMessageSegment[] = [];
  let offset = 0;
  for (const paragraph of text.split(/\r\n\r\n|\r\r|\n\n/)) {
    const start = text.indexOf(paragraph, offset);
    offset = start + paragraph.length;
    const trimmed = paragraph.trim();
    const match = IMAGE_PARAGRAPH.exec(trimmed);
    if (match && isProviderImageMarkdown(trimmed)) {
      segments.push({ kind: "image", source: match[2]!, alt: match[1]!, start });
      continue;
    }
    const previous = segments.at(-1);
    if (previous?.kind === "markdown") previous.text += `\n\n${paragraph}`;
    else if (paragraph.length > 0) segments.push({ kind: "markdown", text: paragraph, start });
  }
  return segments;
}
