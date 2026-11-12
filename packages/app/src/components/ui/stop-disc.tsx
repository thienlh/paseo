import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Square } from "lucide-react-native";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { LayoutValue } from "@/components/ui/control-sizing";
import { useIsCompactFormFactor } from "@/constants/layout";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import type { Theme } from "@/styles/theme";

const ThemedSquare = withUnistyles(Square);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundSquareMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
  fill: theme.colors.foreground,
});

export function StopDisc({
  size,
  glyphSize,
  loading = false,
}: {
  size: number | LayoutValue;
  glyphSize: number;
  loading?: boolean;
}) {
  const isCompact = useIsCompactFormFactor();
  const resolvedSize = typeof size === "number" ? size : size[isCompact ? "xs" : "md"];
  return (
    <View
      style={[styles.disc, inlineUnistylesStyle({ width: resolvedSize, height: resolvedSize })]}
    >
      {loading ? (
        <ThemedLoadingSpinner size="small" uniProps={foregroundColorMapping} />
      ) : (
        <ThemedSquare size={glyphSize} uniProps={foregroundSquareMapping} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  disc: {
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
}));
