import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../haptics';
import { Duration } from '../theme/tokens';
import { useReduceMotion } from '../theme/motion';

/**
 * A pressable that reacts.
 *
 * Before this, nothing in the app responded to touch — buttons did not even
 * dim. A small scale and fade is the cheapest thing that makes an interface
 * feel alive, and it costs no layout and no colour.
 *
 * Under reduce-motion the duration becomes 0, so the opacity change still
 * registers the press but nothing animates.
 */
export function PressableScale({
  children,
  onPress,
  style,
  haptic = true,
  scaleTo = 0.97,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Set false for large surfaces where a tick would feel noisy. */
  haptic?: boolean;
  scaleTo?: number;
}): React.ReactElement {
  const pressed = useSharedValue(0);
  const reduce = useReduceMotion();
  const duration = reduce ? 0 : Duration.fast;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.15,
  }));

  return (
    <Pressable
      onPressIn={() => {
        pressed.value = withTiming(1, { duration });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration });
      }}
      onPress={(e) => {
        if (haptic) haptics.tap();
        onPress?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
