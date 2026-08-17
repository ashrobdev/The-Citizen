import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { Palette } from '../theme/colors';
import { Duration } from '../theme/tokens';
import { useReduceMotion } from '../theme/motion';

/**
 * Confetti, without a dependency.
 *
 * Every confetti package worth having is either unmaintained or built on the
 * old Animated API, for what amounts to thirty views on a timer. One shared
 * value drives all of them, so this is one animation rather than thirty.
 *
 * Under reduce-motion it renders nothing at all — a static pile of paper is
 * clutter with no payload, and the moment is announced in text regardless.
 */

const PIECES = 28;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLOURS = [Palette.red, Palette.blue, Palette.cream];

/** Deterministic, so a celebration looks the same each time it is tested. */
function seeded(i: number): { x: number; delay: number; drift: number; spin: number; colour: string } {
  const r = (n: number): number => {
    const v = Math.sin((i + 1) * n) * 43758.5453;
    return v - Math.floor(v);
  };
  return {
    x: r(12.9898) * SCREEN_W,
    delay: r(78.233) * 400,
    drift: (r(45.164) - 0.5) * 140,
    spin: (r(94.673) - 0.5) * 720,
    colour: COLOURS[Math.floor(r(31.7) * COLOURS.length)] ?? Palette.red,
  };
}

function Piece({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const { x, delay, drift, spin, colour } = seeded(index);
  const span = Duration.celebrate;

  const style = useAnimatedStyle(() => {
    // Each piece runs its own slice of the shared timeline.
    const local = Math.max(0, Math.min(1, (progress.value * span - delay) / (span - delay)));
    return {
      transform: [
        { translateY: -60 + local * (SCREEN_H + 120) },
        { translateX: Math.sin(local * Math.PI * 2) * drift },
        { rotate: `${local * spin}deg` },
      ],
      opacity: local > 0.75 ? 1 - (local - 0.75) / 0.25 : 1,
    };
  });

  return (
    <Animated.View
      style={[styles.piece, { left: x, backgroundColor: colour }, style]}
    />
  );
}

export function Confetti({ onDone }: { onDone?: () => void }): React.ReactElement | null {
  const progress = useSharedValue(0);
  const reduce = useReduceMotion();

  useEffect(() => {
    if (reduce) {
      onDone?.();
      return;
    }
    progress.value = withTiming(
      1,
      { duration: Duration.celebrate, easing: Easing.linear },
      (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      },
    );
  }, [reduce, progress, onDone]);

  if (reduce) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} index={i} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, width: 8, height: 14, borderRadius: 2 },
});
