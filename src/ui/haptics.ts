import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Physical feedback.
 *
 * Wrapped rather than called directly so ~20 call sites do not each carry a
 * platform check, and so it can be muted in one place later.
 *
 * Haptics deliberately stay ON under reduce-motion: they are not motion, they
 * are a separate iOS setting, and on the answering screens they do the
 * emotional work that the design forbids pixels from doing.
 */
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** A selection or button press. */
  tap(): void {
    if (SUPPORTED) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  /** A correct answer. */
  success(): void {
    if (SUPPORTED) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  /** A wrong answer. Warning, never Error — this is not a failure state. */
  warning(): void {
    if (SUPPORTED) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
  /** A celebration. */
  celebrate(): void {
    if (SUPPORTED) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },
};
