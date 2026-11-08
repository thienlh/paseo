import { memo } from "react";
import { View } from "react-native";
import {
  StatusRingFrame,
  getStatusRingArcStyle,
  type StatusRingProps,
  rotatorStyles,
} from "@/components/status-ring/frame";
import { useStatusRingAnimationRef } from "@/components/status-ring/clock.web";

/**
 * Web running indicator. A sidebar full of agents can hold dozens of these at once, so the browser
 * drives the rotation from one absolute document-timeline epoch rather than from mount time — see
 * `clock.web.ts`.
 */
export const StatusRing = memo(function StatusRing({ backdrop, tone }: StatusRingProps) {
  const rotatorRef = useStatusRingAnimationRef();

  return (
    <StatusRingFrame backdrop={backdrop} tone={tone}>
      <View ref={rotatorRef} style={rotatorStyles.rotator}>
        <View style={getStatusRingArcStyle(tone)} />
      </View>
    </StatusRingFrame>
  );
});
