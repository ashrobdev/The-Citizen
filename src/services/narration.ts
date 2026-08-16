import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

/**
 * Spoken narration of questions.
 *
 * Two things the default setup gets wrong for this app:
 *
 * 1. Speech is silenced by the iOS ring/silent switch. That is right for a
 *    game and wrong here — the user has deliberately asked to hear a question
 *    read aloud, and many people leave their phone permanently on silent. The
 *    audio session is therefore configured for playback, which ignores the
 *    switch, the same as any media app.
 *
 * 2. The default system voice is the basic one. iOS and Android both ship
 *    higher-quality voices, and iOS users can install "Enhanced" and "Premium"
 *    ones. Picking the best installed voice costs nothing and sounds markedly
 *    better than the default.
 */

let audioConfigured = false;

/**
 * Allows narration through the silent switch.
 *
 * Called lazily on first speak rather than at startup: it is only meaningful
 * once the user actually asks for audio, and a failure here must never stop
 * the app from opening.
 */
async function configureAudioSession(): Promise<void> {
  if (audioConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      // Narration is short and deliberate; it should duck other audio rather
      // than stop someone's music outright.
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    audioConfigured = true;
  } catch {
    // Non-fatal: narration still works, it just obeys the silent switch.
    audioConfigured = true;
  }
}

let cachedVoice: string | null | undefined;

/**
 * The best English voice installed on this device.
 *
 * Prefers an explicitly Enhanced voice, then a known-good named family, then
 * any en-US voice. Returns null when nothing beats the default, in which case
 * we simply do not pass a voice and let the system choose.
 */
export async function bestEnglishVoice(): Promise<string | null> {
  if (cachedVoice !== undefined) return cachedVoice;

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
    if (english.length === 0) {
      cachedVoice = null;
      return cachedVoice;
    }

    const enhanced = english.filter((v) => v.quality === Speech.VoiceQuality.Enhanced);
    const pool = enhanced.length > 0 ? enhanced : english;

    // US English first — the test is American civics, and a US accent is what
    // an applicant will actually hear in the interview.
    const us = pool.filter((v) => v.language?.toLowerCase().startsWith('en-us'));
    const candidates = us.length > 0 ? us : pool;

    cachedVoice = candidates[0]?.identifier ?? null;
    return cachedVoice;
  } catch {
    cachedVoice = null;
    return cachedVoice;
  }
}

export interface SpeakHandlers {
  onDone?: () => void;
  onError?: () => void;
}

/** Reads text aloud, through the silent switch, in the best available voice. */
export async function speakQuestion(text: string, handlers: SpeakHandlers = {}): Promise<void> {
  await configureAudioSession();
  const voice = await bestEnglishVoice();

  Speech.speak(text, {
    language: 'en-US',
    // expo-speech normalizes rate so 1.0 is normal on both platforms.
    // Slightly under that: the audience is largely non-native English
    // speakers, and officers tend to speak deliberately.
    rate: 0.9,
    pitch: 1.0,
    // Use the app's audio session — the one configured above for playback.
    // With this false, iOS builds its own session and the silent switch
    // silences narration again, which is the bug being fixed.
    useApplicationAudioSession: true,
    ...(voice !== null ? { voice } : {}),
    ...(handlers.onDone !== undefined ? { onDone: handlers.onDone } : {}),
    ...(handlers.onError !== undefined ? { onError: handlers.onError } : {}),
    ...(handlers.onDone !== undefined ? { onStopped: handlers.onDone } : {}),
  });
}

export async function stopNarration(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // Nothing was speaking.
  }
}

/**
 * Forces the next speak to re-pick a voice.
 *
 * Voices are cached because enumerating them is not free, but a user who
 * installs a better voice in iOS Settings expects the app to notice without
 * being restarted. Settings calls this before re-checking.
 */
export function refreshVoiceSelection(): void {
  cachedVoice = undefined;
}
