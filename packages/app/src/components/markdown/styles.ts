import type { MarkdownStyle } from "react-native-enriched-markdown";
import type { Theme } from "@/styles/theme";
import { isNative, isWeb } from "@/constants/platform";

// iOS Safari needs the prefix to override the gesture host's selection suppression.
const WEB_CONTAINER = { userSelect: "text", WebkitUserSelect: "text" } as const;

function fileLinkVariants(theme: Theme, urls: ReadonlySet<string> | undefined) {
  const fontFamily =
    theme.fontFamily.mono === "ui-monospace" && !isWeb ? "" : theme.fontFamily.mono;
  return Object.fromEntries(
    [...(urls ?? [])].map((url) => [
      `^(?:${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})$`,
      {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        fontFamily,
      },
    ]),
  );
}

export function createMarkdownStyles(
  theme: Theme,
  {
    compact = false,
    muted = false,
    blockGap,
    fileLinkUrls,
  }: { compact?: boolean; muted?: boolean; blockGap: number; fileLinkUrls?: ReadonlySet<string> },
): { markdownStyle: MarkdownStyle; selectionColor: string; containerStyle?: typeof WEB_CONTAINER } {
  const fontSize = compact ? theme.fontSize.base : theme.fontSize.content;
  // Every block is followed by the same gap; the library drops it after the last block.
  const block = { marginTop: 0, marginBottom: blockGap };
  const paragraph = {
    fontSize,
    fontFamily: theme.fontFamily.ui,
    // Native uses the regular face; web can render the intermediate content weight.
    fontWeight: isWeb ? theme.fontWeight.content : theme.fontWeight.normal,
    lineHeight: Math.round(fontSize * 1.4),
    color: muted ? theme.colors.foregroundMuted : theme.colors.foreground,
    ...block,
  };
  const heading = (scale: number, fontWeight: string) => ({
    ...paragraph,
    fontSize: Math.round(fontSize * scale),
    lineHeight: Math.round(fontSize * scale * 1.3),
    fontWeight,
  });
  return {
    containerStyle: isWeb ? WEB_CONTAINER : undefined,
    selectionColor: theme.colors.terminal.selectionBackground,
    markdownStyle: {
      paragraph,
      h1: heading(1.6, theme.fontWeight.semibold),
      h2: heading(1.4, theme.fontWeight.semibold),
      h3: heading(1.2, theme.fontWeight.semibold),
      h4: heading(1.1, theme.fontWeight.medium),
      h5: heading(1, theme.fontWeight.medium),
      h6: { ...heading(1, theme.fontWeight.medium), color: theme.colors.foregroundMuted },
      list: {
        ...paragraph,
        bulletColor: theme.colors.foregroundMuted,
        markerColor: theme.colors.foregroundMuted,
        gapWidth: 7,
        itemSpacing: 4,
        marginLeft: 20,
      },
      blockquote: {
        ...paragraph,
        color: `${theme.colors.foreground}cc`,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.surface2,
        borderWidth: 3,
        padding: 12,
        gapWidth: 8,
        admonitions: {
          note: { color: theme.colors.foregroundMuted, backgroundColor: theme.colors.surface2 },
          tip: { color: theme.colors.statusSuccess, backgroundColor: theme.colors.surface2 },
          important: { color: theme.colors.statusMerged, backgroundColor: theme.colors.surface2 },
          warning: { color: theme.colors.statusWarning, backgroundColor: theme.colors.surface2 },
          caution: { color: theme.colors.statusDanger, backgroundColor: theme.colors.surface2 },
        },
      },
      // Native has no hover cue; web keeps prose quiet until the pointer is over a link.
      link: { color: theme.colors.foreground, underline: isNative },
      strong: { fontWeight: theme.fontWeight.medium },
      linkVariants: fileLinkVariants(theme, fileLinkUrls),
      code: {
        fontFamily: theme.fontFamily.mono === "ui-monospace" && !isWeb ? "" : theme.fontFamily.mono,
        fontScale: theme.fontSize.code / fontSize,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.surface3,
      },
      codeBlock: {
        ...paragraph,
        fontFamily: theme.fontFamily.mono === "ui-monospace" && !isWeb ? "" : theme.fontFamily.mono,
        fontSize: theme.fontSize.code,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
      },
      table: {
        ...paragraph,
        borderColor: theme.colors.border,
        headerBackgroundColor: theme.colors.surface2,
        headerTextColor: theme.colors.foreground,
        rowEvenBackgroundColor: theme.colors.surface0,
        rowOddBackgroundColor: theme.colors.surface1,
      },
      taskList: {
        checkedTextColor: theme.colors.foregroundMuted,
        checkedColor: theme.colors.foregroundMuted,
        checkmarkColor: theme.colors.surface0,
        borderColor: theme.colors.foregroundMuted,
      },
      inlineImage: { size: paragraph.lineHeight },
      image: { ...block, height: 320, resizeMode: "contain", borderRadius: 8 },
      thematicBreak: { ...block, color: theme.colors.border, height: 1 },
    },
  };
}
