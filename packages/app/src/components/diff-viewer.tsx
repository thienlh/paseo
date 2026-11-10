import React from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView as RNScrollView,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DiffLine } from "@/utils/tool-call-parsers";
import { diffLinePrefix } from "@/utils/diff-highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { getCodeInsets, lineNumberGutterWidth } from "./code-insets";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";

const ScrollView = isWeb ? RNScrollView : GHScrollView;
const COLLAPSE_UNMODIFIED_AFTER = 6;
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface DiffViewerProps {
  diffLines: DiffLine[];
  maxHeight?: number;
  emptyLabel?: string;
  fillAvailableHeight?: boolean;
}

interface DiffViewerLayoutEvent {
  nativeEvent: { layout: { width: number } };
}

interface NumberedDiffLine {
  key: string;
  line: DiffLine;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

interface UnmodifiedGroup {
  kind: "unmodified";
  id: string;
  lines: NumberedDiffLine[];
}

interface SingleLine {
  kind: "line";
  item: NumberedDiffLine;
}

type DisplayRow = UnmodifiedGroup | SingleLine;

function hunkStart(line: DiffLine): { old: number; next: number } | null {
  const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line.content);
  if (!match) return null;
  return { old: Number(match[1]), next: Number(match[2]) };
}

function buildDisplayRows(diffLines: readonly DiffLine[]): {
  rows: DisplayRow[];
  maxLineNumber: number;
} {
  const rows: DisplayRow[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let maxLineNumber = 1;
  let unmodified: NumberedDiffLine[] = [];

  const flushUnmodified = () => {
    if (unmodified.length === 0) return;
    rows.push({ kind: "unmodified", id: `unmodified:${unmodified[0]!.key}`, lines: unmodified });
    unmodified = [];
  };
  const numbered = (
    line: DiffLine,
    index: number,
    oldLine: number | null,
    newLine: number | null,
  ): NumberedDiffLine => {
    maxLineNumber = Math.max(maxLineNumber, oldLine ?? 0, newLine ?? 0);
    return {
      key: `${index}-${line.type}-${line.content}`,
      line,
      oldLineNumber: oldLine,
      newLineNumber: newLine,
    };
  };

  for (const [index, line] of diffLines.entries()) {
    if (line.type === "header") {
      flushUnmodified();
      rows.push({ kind: "line", item: numbered(line, index, null, null) });
      const start = hunkStart(line);
      if (start) {
        oldLineNumber = start.old;
        newLineNumber = start.next;
      }
      continue;
    }
    if (line.type === "context") {
      unmodified.push(numbered(line, index, oldLineNumber, newLineNumber));
      oldLineNumber += 1;
      newLineNumber += 1;
      continue;
    }
    flushUnmodified();
    if (line.type === "add") {
      rows.push({ kind: "line", item: numbered(line, index, null, newLineNumber) });
      newLineNumber += 1;
    } else {
      rows.push({ kind: "line", item: numbered(line, index, oldLineNumber, null) });
      oldLineNumber += 1;
    }
  }
  flushUnmodified();
  return { rows, maxLineNumber };
}

function LineNumber({
  side,
  value,
  gutterWidth,
}: {
  side: "old" | "new";
  value: number | null;
  gutterWidth: number;
}) {
  const style = React.useMemo(
    () => [styles.lineNumber, inlineUnistylesStyle({ width: gutterWidth })],
    [gutterWidth],
  );
  return (
    <Text testID={`diff-${side}-line-number`} style={style}>
      {value ?? ""}
    </Text>
  );
}

function DiffLineContent({
  line,
  plainLineTextStyle,
  prefixStyle,
}: {
  line: DiffLine;
  plainLineTextStyle: StyleProp<TextStyle>;
  prefixStyle: StyleProp<TextStyle>;
}) {
  if (line.tokens) {
    return (
      <Text style={styles.lineText}>
        <Text style={prefixStyle}>{diffLinePrefix(line)}</Text>
        <DiffTokens tokens={line.tokens} />
      </Text>
    );
  }
  if (line.segments) {
    return (
      <Text style={styles.lineText}>
        <Text style={line.type === "add" ? styles.addText : styles.removeText}>
          {line.content[0]}
        </Text>
        {line.segments.map((segment) => (
          <DiffSegment
            key={`${segment.changed ? "c" : "u"}:${segment.text}`}
            segment={segment}
            lineType={line.type}
          />
        ))}
      </Text>
    );
  }
  return (
    <Text testID="diff-line-text" style={plainLineTextStyle}>
      {line.content}
    </Text>
  );
}

function DiffLineRow({ item, gutterWidth }: { item: NumberedDiffLine; gutterWidth: number }) {
  const { line } = item;
  const lineContainerStyle = React.useMemo(
    () => [
      styles.line,
      line.type === "header" && styles.headerLine,
      line.type === "add" && styles.addLine,
      line.type === "remove" && styles.removeLine,
      line.type === "context" && styles.contextLine,
    ],
    [line.type],
  );
  const plainLineTextStyle = React.useMemo(
    () => [
      styles.lineText,
      line.type === "header" && styles.headerText,
      line.type === "add" && styles.addText,
      line.type === "remove" && styles.removeText,
      line.type === "context" && styles.contextText,
    ],
    [line.type],
  );
  const prefixStyle = React.useMemo(
    () => [
      line.type === "add" && styles.addText,
      line.type === "remove" && styles.removeText,
      line.type === "context" && styles.contextText,
    ],
    [line.type],
  );

  return (
    <View style={lineContainerStyle}>
      <View style={styles.lineNumbers}>
        <LineNumber side="old" value={item.oldLineNumber} gutterWidth={gutterWidth} />
        <LineNumber side="new" value={item.newLineNumber} gutterWidth={gutterWidth} />
      </View>
      <View style={styles.lineContent}>
        <DiffLineContent
          line={line}
          plainLineTextStyle={plainLineTextStyle}
          prefixStyle={prefixStyle}
        />
      </View>
    </View>
  );
}

function DiffTokens({ tokens }: { tokens: NonNullable<DiffLine["tokens"]> }) {
  const keyed = React.useMemo(
    () => tokens.map((token, index) => ({ key: `${index}-${token.text}`, token })),
    [tokens],
  );
  return (
    <>
      {keyed.map(({ key, token }) => (
        <Text key={key} style={token.style ? syntaxTokenStyleFor(token.style) : undefined}>
          {token.text}
        </Text>
      ))}
    </>
  );
}

function DiffSegment({
  segment,
  lineType,
}: {
  segment: NonNullable<DiffLine["segments"]>[number];
  lineType: DiffLine["type"];
}) {
  const segmentStyle = React.useMemo(
    () => [
      lineType === "add" ? styles.addText : styles.removeText,
      segment.changed && (lineType === "add" ? styles.addHighlight : styles.removeHighlight),
    ],
    [lineType, segment.changed],
  );
  return <Text style={segmentStyle}>{segment.text}</Text>;
}

function UnmodifiedGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: UnmodifiedGroup;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const handlePress = React.useCallback(() => onToggle(group.id), [group.id, onToggle]);
  const Chevron = expanded ? ThemedChevronDown : ThemedChevronRight;
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={t("diffViewer.unmodifiedLines", { count: group.lines.length })}
      onPress={handlePress}
      style={styles.unmodifiedRow}
      testID="diff-unmodified-toggle"
    >
      <Chevron size={14} uniProps={foregroundMutedMapping} />
      <Text style={styles.unmodifiedText} numberOfLines={1}>
        {t("diffViewer.unmodifiedLines", { count: group.lines.length })}
      </Text>
    </PressHighlight>
  );
}

export function DiffViewer({
  diffLines,
  maxHeight,
  emptyLabel,
  fillAvailableHeight = false,
}: DiffViewerProps) {
  const { t } = useTranslation();
  const [scrollViewWidth, setScrollViewWidth] = React.useState(0);
  const [expandedUnmodifiedIds, setExpandedUnmodifiedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const resolvedEmptyLabel = emptyLabel ?? t("diffViewer.empty");
  const handleInnerLayout = React.useCallback(
    (event: DiffViewerLayoutEvent) => setScrollViewWidth(event.nativeEvent.layout.width),
    [],
  );
  const { rows, maxLineNumber } = React.useMemo(() => buildDisplayRows(diffLines), [diffLines]);
  const gutterWidth = lineNumberGutterWidth(maxLineNumber, styles.lineNumber.fontSize);
  const toggleUnmodified = React.useCallback((id: string) => {
    setExpandedUnmodifiedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const outerScrollStyle = React.useMemo(
    () => [
      styles.verticalScroll,
      maxHeight !== undefined && inlineUnistylesStyle({ maxHeight }),
      fillAvailableHeight && styles.fillHeight,
    ],
    [maxHeight, fillAvailableHeight],
  );
  const linesContainerStyle = React.useMemo(
    () => [
      styles.linesContainer,
      scrollViewWidth > 0 && inlineUnistylesStyle({ width: scrollViewWidth }),
    ],
    [scrollViewWidth],
  );
  const webVerticalContentStyle = React.useMemo(
    () => [styles.verticalContent, fillAvailableHeight && styles.fillHeight],
    [fillAvailableHeight],
  );

  if (!diffLines.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{resolvedEmptyLabel}</Text>
      </View>
    );
  }

  const lines = (
    <View style={linesContainerStyle} dataSet={CODE_SURFACE_DATASET}>
      {rows.map((row) => {
        if (row.kind === "unmodified") {
          const expanded = expandedUnmodifiedIds.has(row.id);
          if (row.lines.length > COLLAPSE_UNMODIFIED_AFTER && !expanded) {
            return (
              <UnmodifiedGroupRow
                key={row.id}
                group={row}
                expanded={false}
                onToggle={toggleUnmodified}
              />
            );
          }
          return (
            <React.Fragment key={row.id}>
              {row.lines.length > COLLAPSE_UNMODIFIED_AFTER ? (
                <UnmodifiedGroupRow group={row} expanded onToggle={toggleUnmodified} />
              ) : null}
              {row.lines.map((item) => (
                <DiffLineRow key={item.key} item={item} gutterWidth={gutterWidth} />
              ))}
            </React.Fragment>
          );
        }
        return <DiffLineRow key={row.item.key} item={row.item} gutterWidth={gutterWidth} />;
      })}
    </View>
  );

  const horizontalContent = (
    <View style={styles.horizontalContent} onLayout={handleInnerLayout}>
      {lines}
    </View>
  );

  return (
    <ScrollView
      style={outerScrollStyle}
      contentContainerStyle={webVerticalContentStyle}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {horizontalContent}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => {
  const insets = getCodeInsets(theme);

  return {
    verticalScroll: {},
    fillHeight: {
      flex: 1,
      minHeight: 0,
    },
    verticalContent: {
      flexGrow: 1,
      paddingBottom: insets.extraBottom,
    },
    horizontalContent: {
      flexDirection: "column" as const,
      paddingRight: insets.extraRight,
    },
    linesContainer: {
      alignSelf: "stretch",
      padding: insets.padding,
    },
    line: {
      minWidth: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 0,
      paddingVertical: theme.spacing[1],
    },
    lineNumbers: {
      flexDirection: "row",
      flexShrink: 0,
    },
    lineNumber: {
      flexShrink: 0,
      paddingRight: theme.spacing[2],
      color: theme.colors.foregroundMuted,
      fontFamily: theme.fontFamily.mono,
      fontSize: theme.fontSize.code,
      textAlign: "right",
    },
    lineContent: {
      flex: 1,
      minWidth: 0,
    },
    lineText: {
      width: "100%",
      flexShrink: 1,
      minWidth: 0,
      fontFamily: theme.fontFamily.mono,
      fontSize: theme.fontSize.code,
      color: theme.colors.foreground,
      ...(isWeb
        ? {
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }
        : null),
    },
    headerLine: {
      backgroundColor: theme.colors.surface1,
    },
    headerText: {
      color: theme.colors.foregroundMuted,
    },
    addLine: {
      backgroundColor: "rgba(46, 160, 67, 0.15)",
    },
    addText: {
      color: theme.colors.foreground,
    },
    removeLine: {
      backgroundColor: "rgba(248, 81, 73, 0.1)",
    },
    removeText: {
      color: theme.colors.foreground,
    },
    addHighlight: {
      backgroundColor: "rgba(46, 160, 67, 0.4)",
    },
    removeHighlight: {
      backgroundColor: "rgba(248, 81, 73, 0.35)",
    },
    contextLine: {
      backgroundColor: theme.colors.surface1,
    },
    contextText: {
      color: theme.colors.foregroundMuted,
    },
    unmodifiedRow: {
      minWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      backgroundColor: theme.colors.surface1,
    },
    unmodifiedText: {
      flexShrink: 1,
      color: theme.colors.foregroundMuted,
      fontFamily: theme.fontFamily.ui,
      fontSize: theme.fontSize.sm,
    },
    emptyState: {
      padding: theme.spacing[4],
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    emptyText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.foregroundMuted,
    },
  };
});
