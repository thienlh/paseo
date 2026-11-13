import type { SettledQuestionEntry } from "@getpaseo/protocol/question-tool-display";
import { ChevronRight, CircleCheck, X } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PressHighlight } from "@/components/ui/press-highlight";

const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedX = withUnistyles(X);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface AnsweredQuestionCardProps {
  status: "answered" | "cancelled";
  entries: SettledQuestionEntry[];
  expanded: boolean;
  onToggle: () => void;
  disableOuterSpacing?: boolean;
}

export function AnsweredQuestionCard({
  status,
  entries,
  expanded,
  onToggle,
  disableOuterSpacing = false,
}: AnsweredQuestionCardProps) {
  const answered = status === "answered";
  const StatusIcon = answered ? ThemedCircleCheck : ThemedX;
  const hasDetails = entries.some(
    (entry) =>
      entry.question || entry.answer || entry.customAnswer || (entry.options?.length ?? 0) > 0,
  );
  const label = answered ? "ANSWERED" : "CANCELLED";
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const badgeStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.badge,
      (expanded || hovered) && styles.badgeActive,
      pressed && styles.badgePressed,
    ],
    [expanded],
  );

  return (
    <View
      testID="answered-question-card"
      style={[styles.root, disableOuterSpacing && styles.rootCompact]}
    >
      <HoverCard disabled={!hasDetails || expanded}>
        <HoverCardTrigger accessibilityLabel={label}>
          <PressHighlight
            testID="answered-question-badge"
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            disabled={!hasDetails}
            onPress={onToggle}
            style={badgeStyle}
          >
            <StatusIcon size={14} strokeWidth={1.75} uniProps={mutedIcon} />
            <Text testID="answered-question-stamp" style={styles.badgeText}>
              {label}
            </Text>
            {hasDetails ? (
              <ThemedChevronRight
                size={14}
                strokeWidth={1.75}
                uniProps={mutedIcon}
                style={expanded ? styles.chevronOpen : styles.chevron}
              />
            ) : null}
          </PressHighlight>
        </HoverCardTrigger>
        <HoverCardContent
          placement="top"
          offset={8}
          testID="answered-question-hover"
          accessibilityLabel={label}
          style={styles.hover}
        >
          <QuestionDetails entries={entries} />
        </HoverCardContent>
      </HoverCard>
      {expanded && hasDetails ? (
        <View style={styles.panel}>
          <QuestionDetails entries={entries} />
        </View>
      ) : null}
    </View>
  );
}

function QuestionDetails({ entries }: { entries: SettledQuestionEntry[] }) {
  return (
    <View testID="answered-question-details" style={styles.details}>
      {entries.map((entry) => {
        const options = entry.options ?? [];
        return (
          <View
            key={entry.question ?? entry.answer ?? entry.customAnswer ?? "question"}
            style={styles.entry}
          >
            {entry.question ? <Text style={styles.question}>{entry.question}</Text> : null}
            <EntryBody entry={entry} options={options} />
          </View>
        );
      })}
    </View>
  );
}

function EntryBody({
  entry,
  options,
}: {
  entry: SettledQuestionEntry;
  options: NonNullable<SettledQuestionEntry["options"]>;
}) {
  if (options.length > 0) {
    return (
      <View style={styles.options}>
        {options.map((option) => (
          <OptionRow key={option.label} option={option} multi={entry.multiSelect === true} />
        ))}
        {entry.customAnswer ? (
          <CustomAnswer text={entry.customAnswer} multi={entry.multiSelect === true} />
        ) : null}
      </View>
    );
  }
  if (!entry.answer) return null;
  return (
    <Text selectable style={styles.answer}>
      {entry.answer}
    </Text>
  );
}

function OptionRow({
  option,
  multi,
}: {
  option: NonNullable<SettledQuestionEntry["options"]>[number];
  multi: boolean;
}) {
  return (
    <View
      testID={option.selected ? "answered-question-option-selected" : "answered-question-option"}
      style={[styles.option, option.selected && styles.optionSelected]}
    >
      <View
        style={[
          styles.control,
          multi ? styles.controlCheckbox : styles.controlRadio,
          option.selected && styles.controlSelected,
        ]}
      >
        {option.selected ? <View style={styles.controlDot} /> : null}
      </View>
      <View style={styles.optionText}>
        <Text selectable style={option.selected ? styles.optionLabelSelected : styles.optionLabel}>
          {option.label}
        </Text>
        {option.description ? (
          <Text selectable style={styles.optionDescription}>
            {option.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CustomAnswer({ text, multi }: { text: string; multi: boolean }) {
  return (
    <View testID="answered-question-custom" style={[styles.option, styles.optionSelected]}>
      <View
        style={[
          styles.control,
          multi ? styles.controlCheckbox : styles.controlRadio,
          styles.controlSelected,
        ]}
      >
        <View style={styles.controlDot} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionDescription}>Other</Text>
        <Text selectable style={styles.optionLabelSelected}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  rootCompact: {
    marginVertical: 0,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
    ...(isWeb ? { cursor: "pointer" as const } : {}),
  },
  badgeActive: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  badgePressed: {
    opacity: 0.8,
  },
  chevron: {
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  badgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 0.4,
  },
  hover: {
    maxWidth: 480,
    padding: theme.spacing[3],
  },
  panel: {
    alignSelf: "stretch",
    minWidth: 240,
    maxWidth: 480,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  details: {
    gap: theme.spacing[3],
    ...(isWeb ? { cursor: "auto" as const, userSelect: "text" as const } : {}),
  },
  entry: {
    gap: theme.spacing[2],
  },
  options: {
    gap: theme.spacing[1],
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  optionSelected: {
    backgroundColor: theme.colors.surface1,
  },
  control: {
    width: 16,
    height: 16,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  controlRadio: {
    borderRadius: 999,
  },
  controlCheckbox: {
    borderRadius: theme.borderRadius.base,
  },
  controlSelected: {
    borderColor: theme.colors.foreground,
  },
  controlDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.foreground,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  optionLabelSelected: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
    fontWeight: "700",
  },
  optionDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  question: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  answer: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
}));
