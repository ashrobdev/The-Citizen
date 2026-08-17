import { Tabs } from 'expo-router';
import { Text, useColorScheme } from 'react-native';

import { Colors } from '../../ui/theme/colors';
import { Type } from '../../ui/theme/tokens';

/**
 * Bottom tabs.
 *
 * Destinations used to be links buried on the home screen, which is what made
 * the app feel like a utility. The answering screens — session, test, summary,
 * question detail — deliberately stay OUTSIDE this group and push full-screen,
 * so nothing competes with a question.
 */
function Glyph({ symbol, color }: { symbol: string; color: string }): React.ReactElement {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

export default function TabsLayout(): React.ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: Type.caption.fontSize, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <Glyph symbol="★" color={color} /> }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: 'Practice', tabBarIcon: ({ color }) => <Glyph symbol="◎" color={color} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: ({ color }) => <Glyph symbol="▤" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Glyph symbol="⚙" color={color} /> }}
      />
    </Tabs>
  );
}
