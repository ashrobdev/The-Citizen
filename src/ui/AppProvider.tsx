import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { createSqliteRepositories } from '../data/sqlite/repositories';
import { openDatabase } from '../data/sqlite/db';
import { SessionService } from '../services/sessionService';

import { Colors } from './theme/colors';

/**
 * Opens the database once and hands the session service to the tree.
 *
 * Plain React context rather than a state library: there is exactly one
 * long-lived value here and no cross-cutting subscriptions. A store can be
 * introduced if that stops being true.
 */

interface AppValue {
  service: SessionService;
}

const AppContext = createContext<AppValue | undefined>(undefined);

export function useSessionService(): SessionService {
  const value = useContext(AppContext);
  if (!value) throw new Error('useSessionService must be used inside AppProvider');
  return value.service;
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // A database open that never settles would leave the app on its
        // loading state forever with nothing to diagnose — which is exactly
        // what an unconfigured web build does. Fail loudly instead.
        const db = await withTimeout(openDatabase(), 10_000, 'Opening the database timed out');
        const repos = createSqliteRepositories(db);
        if (!cancelled) setStatus({ phase: 'ready', value: { service: new SessionService(repos) } });
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
