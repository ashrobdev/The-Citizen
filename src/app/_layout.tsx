import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';

import { AppProvider } from '@/ui/AppProvider';
import { useNotificationRouting } from '@/ui/useNotificationRouting';
import { Colors } from '@/ui/theme/colors';

/**
 * Notification routing lives in a child of AppProvider because it needs the
 * session service to check whether onboarding has happened.
 */
function Routes(): React.ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  useNotificationRouting();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      {/* The tab group supplies its own chrome; without this the stack shows
          the group's directory name, "(tabs)", as a title. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout(): React.ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    // GestureHandlerRootView and SafeAreaProvider must wrap everything:
    // useSafeAreaInsets returns zeros without the provider, silently.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Routes />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
