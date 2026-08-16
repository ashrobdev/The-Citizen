import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user has asked the system to reduce motion.
 *
 * Single source of truth, so the answer cannot drift between components.
 * Applied at the VALUE level rather than by branching component trees:
 * `withTiming(x, { duration: useMotionDuration(Duration.base) })` with a
 * duration of 0 lands on the end state instantly, which is correct and leaves
 * nothing to keep in sync.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduce;
}
