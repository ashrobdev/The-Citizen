import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Physical feedback.
 *
 * Wrapped rather than called directly so ~20 call sites do not each carry a
 * platform check, and so it can be muted in one place.
 *
 * Haptics deliberately stay ON under reduce-motion: they are not motion, they
 * are a separate iOS setting, and on the answering screens they do the
 * emotional work that the design forbids pixels from doing. Someone who wants
 * them off has the Settings toggle below.
 */
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Module-level rather than context, because `haptics` is called from event
 * handlers and effects that have no reason to re-render when it changes. The
 * persisted value is loaded once at startup; see `AppProvider`.
 */
let enabled = true;

function fire(run: () => void): void {
  if (SUPPORTED && enabled) run();
}

export const haptics = {
  /** Turned on or off from Settings; persisted by the caller. */
  setEnabled(next: boolean): void {
    enabled = next;
  },
  isEnabled(): boolean {
    return enabled;
  },
  /** A selection or button press. */
  tap(): void {
    fire(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** A correct answer. */
  success(): void {
    fire(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** A wrong answer. Warning, never Error — this is not a failure state. */
  warning(): void {
    fire(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** A celebration. */
  celebrate(): void {
    fire(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
};

export const HAPTICS_KEY = 'ui.hapticsEnabled';
