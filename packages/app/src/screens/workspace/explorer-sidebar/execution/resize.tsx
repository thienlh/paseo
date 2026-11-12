import { useCallback, useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { StyleSheet } from "react-native-unistyles";
import type { ExecutionResizeProps } from "./resize-props";

export function ExecutionResize({ height, onPreview, onCommit, onCancel }: ExecutionResizeProps) {
  const startHeight = useRef(height);
  const begin = useCallback(() => {
    startHeight.current = height;
  }, [height]);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart(begin)
        .onUpdate((event) => onPreview(startHeight.current - event.translationY))
        .onEnd((event, success) => {
          if (success) onCommit(startHeight.current - event.translationY);
        })
        .onFinalize((_event, success) => {
          if (!success) onCancel();
        }),
    [begin, onCancel, onCommit, onPreview],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.handle} testID="explorer-execution-resize" />
    </GestureDetector>
  );
}
const styles = StyleSheet.create((theme) => ({
  handle: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -theme.spacing[2],
    height: theme.spacing[4],
    zIndex: 2,
  },
}));
