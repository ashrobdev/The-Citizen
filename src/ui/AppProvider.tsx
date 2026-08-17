import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { describeChanges, diffUserAnswers } from '../domain/officials/diff';
import type { Repositories } from '../data/repositories';
import { createSqliteRepositories } from '../data/sqlite/repositories';
import { openDatabase } from '../data/sqlite/db';
import { NotificationService } from '../services/notifications/notificationService';
import {
  configureNotifications,
  createExpoPlatform,
  getPermission,
} from '../services/notifications/expoPlatform';
import { BUNDLED_OFFICIALS, OfficialsUpdater } from '../services/officialsUpdater';
import { SessionService, setActiveOfficials } from '../services/sessionService';

import { Colors } from './theme/colors';

/**
 * Opens the database once and hands the services to the tree.
 *
 * Plain React context rather than a state library: there is exactly one
 * long-lived value here and no cross-cutting subscriptions.
 */

interface AppValue {
  service: SessionService;
  repos: Repositories;
  notifications: NotificationService;
  officials: OfficialsUpdater;
}

const AppContext = createContext<AppValue | undefined>(undefined);

export function useSessionService(): SessionService {
  const value = useContext(AppContext);
  if (!value) throw new Error('useSessionService must be used inside AppProvider');
  return value.service;
}

/** For read-only views that build their own service over the same storage. */
export function useRepositories(): Repositories {
  const value = useContext(AppContext);
  if (!value) throw new Error('useRepositories must be used inside AppProvider');
  return value.repos;
}

export function useNotifications(): NotificationService {
  const value = useContext(AppContext);
  if (!value) throw new Error('useNotifications must be used inside AppProvider');
  return value.notifications;
}

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; value: AppValue }
  | { phase: 'error'; message: string };

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export function AppProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const ready = status.phase === 'ready' ? status.value : undefined;
  const syncing = useRef(false);

  useEffect(() => {
    configureNotifications();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // A database open that never settles would leave the app on its
        // loading state forever with nothing to diagnose. Fail loudly instead.
        const db = await withTimeout(openDatabase(), 10_000, 'Opening the database timed out');
        const repos = createSqliteRepositories(db);
        if (cancelled) return;

        setStatus({
          phase: 'ready',
          value: {
            service: new SessionService(repos),
            repos,
            notifications: new NotificationService(repos, createExpoPlatform(), getPermission),
            officials: new OfficialsUpdater(repos.kv),
          },
        });
      } catch (error) {
        // Surfaced rather than swallowed: a failed migration means no progress
        // can be saved, and silently continuing would lose the user's work.
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) setStatus({ phase: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Refreshes officials data and re-plans notifications.
   *
   * Runs on launch and whenever the app comes back to the foreground, which is
   * what refills the rolling notification window, re-anchors it after a
   * timezone change, and picks up permission granted in system Settings.
   */
  const refresh = useCallback(async (value: AppValue) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      // Captured before the refresh: the notification is gated on what changed
      // for this user, which needs the dataset they were studying against.
      const previous = await value.officials.current();
      const result = await value.officials.refreshIfDue();
      const active = await value.officials.current();
      // Without this the app kept showing bundled data even after a successful
      // fetch — the updater was built, tested, and then never consulted.
      setActiveOfficials(active);

      const profile = await value.repos.profile.get();
      const location =
        profile === undefined
          ? undefined
          : {
              stateCode: profile.stateCode,
              ...(profile.district !== undefined ? { district: profile.district } : {}),
            };
      const changes = diffUserAnswers(previous, active, location);

      await value.notifications.sync(new Date(), {
        availableVersion: active.dataVersion,
        bundledVersion: BUNDLED_OFFICIALS.dataVersion,
        changeSummary: describeChanges(changes),
      });
      if (result.updated) {
        // Notified about this version; do not mention it again.
        await value.notifications.markOfficialsNotified(active.dataVersion);
      }
    } catch {
      // Best effort — neither refreshing nor notifying may block the app.
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh(ready);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(ready);
    });
    return () => {
      sub.remove();
    };
  }, [ready, refresh]);

  if (status.phase === 'loading') {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (status.phase === 'error') {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorTitle, { color: theme.error }]}>Could not open your data</Text>
        <Text style={[styles.errorBody, { color: theme.textSecondary }]}>{status.message}</Text>
      </View>
    );
  }

  return <AppContext.Provider value={status.value}>{children}</AppContext.Provider>;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 14, textAlign: 'center' },
});
