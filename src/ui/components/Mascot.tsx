import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The app's eagle, in five poses.
 *
 * Used at moments worth marking and deliberately NOT on the answering screens,
 * where anything decorative competes with the question the user is trying to
 * recall. Hidden from assistive technology: it is atmosphere, and announcing it
 * would only get between the user and the content.
 */

export type MascotPose =
  /** Sitting on books, wing to chin. Loading and empty states. */
  | 'thinking'
  /** Thumbs up. Shown after a WRONG answer — supportive, never a penalty. */
  | 'encouraging'
  /** Wings spread, walking. Welcome and general presence. */
  | 'greeting'
  /** Leaping with confetti. The biggest moments only: day complete, test passed. */
  | 'cheering'
  /** Pointing, determined. Calls to action. */
  | 'pointing';

const POSES: Record<MascotPose, number> = {
  thinking: require('../../../assets/images/mascot/thinking.png') as number,
  encouraging: require('../../../assets/images/mascot/encouraging.png') as number,
  greeting: require('../../../assets/images/mascot/greeting.png') as number,
  cheering: require('../../../assets/images/mascot/cheering.png') as number,
  pointing: require('../../../assets/images/mascot/pointing.png') as number,
};

/** Each pose has its own aspect ratio, so a single multiplier would squash some. */
const ASPECT: Record<MascotPose, number> = {
  thinking: 480 / 333,
  encouraging: 480 / 371,
  greeting: 442 / 480,
  cheering: 480 / 430,
  pointing: 480 / 449,
};

export type MascotSize = 'small' | 'medium' | 'large';

const WIDTHS: Record<MascotSize, number> = {
  small: 72,
  medium: 116,
  large: 168,
};

export function Mascot({
  pose = 'greeting',
  size = 'medium',
  style,
}: {
  pose?: MascotPose;
  size?: MascotSize;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const width = WIDTHS[size];
  const height = width * ASPECT[pose];

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={POSES[pose]} style={{ width, height }} contentFit="contain" transition={200} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
