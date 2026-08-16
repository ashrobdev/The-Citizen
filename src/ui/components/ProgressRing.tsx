import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Duration } from '../theme/tokens';
import { useReduceMotion } from '../theme/motion';
import type { Theme } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A ring that fills as the day progresses.
 *
 * The one thing genuinely not expressible with Views — the border-rotation
 * trick is sixty lines of fragile nonsense, whereas animating
 * `strokeDashoffset` is a handful.
 *
 * Progress is also stated in text by the caller, so the ring is never the only
 * indication of anything.
 */
export function ProgressRing({
  progress,
  size = 168,
  strokeWidth = 12,
  theme,
  trackColor,
  color,
  children,
}: {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  theme: Theme;
  trackColor?: string;
  color?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = useSharedValue(0);
  const reduce = useReduceMotion();

  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, progress));
    filled.value = withTiming(clamped, { duration: reduce ? 0 : Duration.slow });
  }, [progress, reduce, filled]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - filled.value),
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ?? theme.accentAlt}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
