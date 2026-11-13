import { useCallback, useState, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { RetainedPanel } from "@/components/retained-panel";
import { ExecutionControls, ExecutionEmpty, type ExecutionControlsProps } from "./controls";
import { ExecutionResize } from "./resize";
import { resolveExecutionHeight } from "./state";

interface ExplorerExecutionProps extends ExecutionControlsProps {
  availableHeight: number;
  visible: boolean;
  hasTerminal: boolean;
  tabRail: ReactNode;
  children: ReactNode;
  onFocus: () => void;
}

export function ExplorerExecution({
  availableHeight,
  visible,
  hasTerminal,
  tabRail,
  children,
  onFocus,
  ...controls
}: ExplorerExecutionProps) {
  const { state, dispatch, compact } = controls;
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const cancelResize = useCallback(() => setPreviewHeight(null), []);
  const height = resolveExecutionHeight({
    requested: previewHeight ?? state.height,
    available: availableHeight,
  });
  const commitHeight = useCallback(
    (requested: number) => {
      setPreviewHeight(null);
      dispatch({
        type: "resize",
        height: resolveExecutionHeight({ requested, available: availableHeight }),
      });
    },
    [availableHeight, dispatch],
  );
  const bodyVisible = state.expanded && visible;
  const compactExecution = compact && bodyVisible;
  const resizable = bodyVisible && !compact;
  const wideStyle = bodyVisible ? { height } : null;
  return (
    <View
      style={[styles.container, compactExecution ? styles.fill : wideStyle]}
      testID="explorer-execution"
    >
      {resizable ? (
        <ExecutionResize
          height={height}
          available={availableHeight}
          onPreview={setPreviewHeight}
          onCommit={commitHeight}
          onCancel={cancelResize}
        />
      ) : null}
      <ExecutionControls {...controls} />
      <RetainedPanel active={bodyVisible} testID="explorer-execution-body">
        <View
          style={styles.content}
          onTouchStart={onFocus}
          {...(isWeb ? { onPointerDown: onFocus } : {})}
        >
          {state.view === "terminal" ? tabRail : null}
          <View style={styles.content}>
            {children}
            {!hasTerminal ? (
              <ExecutionEmpty
                view={state.view}
                hasScripts={controls.scripts.length > 0}
                onCreateTerminal={controls.onCreateTerminal}
                onConfigureScripts={controls.onConfigureScripts}
                creatingTerminal={controls.creatingTerminal}
                connected={controls.connected}
              />
            ) : null}
          </View>
        </View>
      </RetainedPanel>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "relative",
    flexShrink: 0,
    minHeight: theme.spacing[8],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  fill: { flex: 1, minHeight: 0 },
  content: { flex: 1, minHeight: 0 },
}));
