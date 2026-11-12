import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useCallback } from "react";
import { ResizeHandle } from "@/components/resize-handle";
import type { ExecutionResizeProps } from "./resize-props";

export function ExecutionResize({ height, available, onPreview, onCommit }: ExecutionResizeProps) {
  const preview = useCallback(
    (_id: string, sizes: number[]) => onPreview(sizes[1] * available),
    [available, onPreview],
  );
  const commit = useCallback(
    (_id: string, sizes: number[]) => onCommit(sizes[1] * available),
    [available, onCommit],
  );
  if (available <= 0) return null;
  return (
    <View style={styles.handle}>
      <ResizeHandle
        testID="explorer-execution-resize"
        direction="vertical"
        groupId="explorer-execution"
        index={0}
        sizes={[1 - height / available, height / available]}
        containerSize={available}
        onPreviewResizeSplit={preview}
        onResizeSplit={commit}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  handle: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 2 },
});
