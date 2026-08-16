import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

const MASCOT = require('../../../assets/images/mascot.png') as number;

export type MascotSize = 'small' | 'medium' | 'large';

const DIMENSIONS: Record<MascotSize, number> = {
  small: 84,
  medium: 132,
  large: 190,
};

/**
 * The app's eagle.
 *
 * Used at moments worth marking — welcome, a finished day, a passed test — and
 * deliberately not on the answering screens, where anything decorative competes
 * with the question the user is trying to recall.
 *
 * Hidden from assistive technology: it is atmosphere, and a screen reader
 * announcing it would only get between the user and the content.
 */
export function Mascot({
  size = 'medium',
  style,
}: {
  size?: MascotSize;
  style?: object;
}): React.ReactElement {
  const dimension = DIMENSIONS[size];
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={MASCOT}
        style={{ width: dimension, height: dimension * 0.92 }}
        contentFit="contain"
        transition={220}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
