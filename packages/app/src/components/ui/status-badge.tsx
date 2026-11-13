import React, { useMemo, type ReactNode } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type StatusBadgeVariant = "success" | "warning" | "error" | "muted" | "merged";

interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  leading?: ReactNode;
  /** `xs` fits beside a line of `sm` text: the same label on tighter padding. */
  size?: "sm" | "xs";
}

export function StatusBadge({ label, variant = "muted", leading, size = "sm" }: StatusBadgeProps) {
  const pillStyle = useMemo(
    () => [
      styles.pill,
      size === "xs" && styles.pillXs,
      variant === "success" && styles.pillSuccess,
      variant === "warning" && styles.pillWarning,
      variant === "error" && styles.pillError,
      variant === "merged" && styles.pillMerged,
    ],
    [size, variant],
  );
  const textStyle = useMemo(
    () => [
      styles.pillText,
      variant === "success" && styles.pillTextSuccess,
      variant === "warning" && styles.pillTextWarning,
      variant === "error" && styles.pillTextError,
      variant === "merged" && styles.pillTextMerged,
    ],
    [variant],
  );

  return (
    <View style={pillStyle}>
      {leading}
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  pillXs: {
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 1,
  },
  pillSuccess: {
    backgroundColor: theme.colors.statusSuccessTint,
    borderColor: "transparent",
  },
  pillWarning: {
    backgroundColor: theme.colors.statusWarningTint,
    borderColor: "transparent",
  },
  pillMerged: { backgroundColor: theme.colors.statusMergedTint, borderColor: "transparent" },
  pillTextMerged: { color: theme.colors.statusMerged },
  pillError: {
    backgroundColor: theme.colors.statusDangerTint,
    borderColor: "transparent",
  },
  pillText: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  pillTextSuccess: {
    color: theme.colors.statusSuccess,
  },
  pillTextWarning: {
    color: theme.colors.statusWarning,
  },
  pillTextError: {
    color: theme.colors.statusDanger,
  },
}));
