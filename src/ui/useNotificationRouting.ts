import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useSessionService } from './AppProvider';

/**
 * expo-notifications has no web implementation for the response APIs, and
 * calling them throws rather than returning empty. Web is a working target for
 * this project, so the whole hook no-ops there.
 */
const SUPPORTED = Platform.OS !== 'web';

/**
 * Sends a tapped notification to the right screen.
 *
 * `useLastNotificationResponse` covers the cold-start case as well as taps
 * while the app is running, which a plain listener does not.
 */
function useNativeNotificationRouting(): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const service = useSessionService();
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!response) return;

    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;

    const data = response.notification.request.content.data as { route?: string } | undefined;
    const route = data?.route;
    if (typeof route !== 'string' || route.length === 0) return;

    void (async () => {
      // Without a profile the app redirects to onboarding, and pushing a
      // session over that would drop someone into questions before they have
      // chosen a state — which four of the questions depend on.
      const profile = await service.profile();
      if (!profile) return;
      router.push(route as Parameters<typeof router.push>[0]);
    })();
  }, [response, router, service]);
}

function useNoNotificationRouting(): void {
  // Web: nothing to route from.
}

/**
 * Picked once at module load rather than per render.
 *
 * The previous form called `useLastNotificationResponse()` inside a ternary,
 * which is a conditional hook call — it happened to be safe because the guard
 * is a module constant, but it is exactly the shape the rule exists to catch.
 * Selecting the implementation here keeps every hook call unconditional inside
 * whichever function is used.
 */
export const useNotificationRouting: () => void = SUPPORTED
  ? useNativeNotificationRouting
  : useNoNotificationRouting;
