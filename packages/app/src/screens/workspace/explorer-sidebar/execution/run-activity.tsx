import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Play } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppVisible } from "@/hooks/use-app-visible";

const BAR_INDEXES = [0, 1, 2] as const;
const RESTING_SCALES = [0.5, 1, 0.67] as const;

/** A running-state signal; the Stop action keeps its stable, recognizable square. */
export function RunActivity({
  running,
  connected,
  color,
  size,
}: {
  running: boolean;
  connected: boolean;
  color: string;
  size: number;
}) {
  const retainedActive = useRetainedPanelActive();
  const appVisible = useAppVisible();
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  const animate = running && connected && retainedActive && appVisible && !reduceMotion;
  const frameStyle = useMemo(() => [styles.frame, { width: size, height: size }], [size]);

  useEffect(() => {
    if (animate) {
      phase.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1);
    } else {
      phase.value = 0;
    }
    return () => cancelAnimation(phase);
  }, [animate, phase]);

  return (
    <View
      style={frameStyle}
      testID="explorer-run-activity"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {running ? (
        BAR_INDEXES.map((index) => (
          <ActivityBar
            key={index}
            index={index}
            phase={phase}
            animate={animate}
            color={color}
            size={size}
          />
        ))
      ) : (
        <Play size={size} color={color} strokeWidth={1.5} />
      )}
    </View>
  );
}

function ActivityBar({
  index,
  phase,
  animate,
  color,
  size,
}: {
  index: number;
  phase: SharedValue<number>;
  animate: boolean;
  color: string;
  size: number;
}) {
  const barStyle = useMemo(
    () => ({
      width: size / 8,
      height: size * 0.75,
      marginHorizontal: size / 16,
      borderRadius: size / 8,
      backgroundColor: color,
    }),
    [color, size],
  );
  const motionStyle = useAnimatedStyle(() => {
    const wave = (Math.sin(phase.value * Math.PI * 2 - index * 1.1) + 1) / 2;
    return {
      transform: [{ scaleY: animate ? 0.3 + wave * 0.7 : RESTING_SCALES[index] }],
      opacity: animate ? 0.6 + wave * 0.4 : 1,
    };
  });
  return (
    <Animated.View style={[barStyle, motionStyle]} testID={`explorer-run-activity-bar-${index}`} />
  );
}

// Keep animated nodes on plain RN styles, outside Unistyles' native node ownership.
const styles = StyleSheet.create({
  frame: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
