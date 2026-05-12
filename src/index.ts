import { AmbaClient, type AmbaConfig } from '@layers/amba-client';

import { asyncStorageAdapter } from './storage.js';
import {
  cacheRegisteredPushToken,
  registerForPushNotificationsAsync,
  removePushNotificationHandler,
  type PushToken,
  type RemovePushNotificationHandlerOptions,
} from './push.js';
import type { EventSubscription } from 'expo-modules-core';
import { isAppleAuthAvailable, signInWithApple } from './auth-apple.js';
import { configureGoogleAuth, signInWithGoogle, type GoogleAuthConfig } from './auth-google.js';

// ─── Re-exports from core ──────────────────────────────────────────────

export { AmbaClient } from '@layers/amba-client';
export type { AmbaConfig, AmbaStorage } from '@layers/amba-client';

// ─── Expo-specific exports ─────────────────────────────────────────────

export { asyncStorageAdapter } from './storage.js';
export {
  cacheRegisteredPushToken,
  registerForPushNotificationsAsync,
  removePushNotificationHandler,
  type PushToken,
  type RemovePushNotificationHandlerOptions,
} from './push.js';
export { isAppleAuthAvailable, signInWithApple } from './auth-apple.js';
export { configureGoogleAuth, signInWithGoogle, type GoogleAuthConfig } from './auth-google.js';

// ─── Config ────────────────────────────────────────────────────────────

export interface ExpoAmbaConfig extends AmbaConfig {
  /**
   * Auto-register the device push token with the Amba API after
   * `init()` completes. Defaults to `true`. Set to `false` if you want
   * to register the token manually (e.g. after the user opts in later).
   */
  autoRegisterPushToken?: boolean;
  /**
   * Google OAuth client ids. Pass this if you plan to call
   * `Amba.signInWithGoogle()` or `signInWithGoogle()`.
   */
  google?: GoogleAuthConfig;
}

// ─── Client wrapper ────────────────────────────────────────────────────

/**
 * Expo-flavoured wrapper around {@link AmbaClient}.
 *
 * Deferring construction until `init()` lets us inject the AsyncStorage
 * adapter (which must come from React Native) and auto-register the push
 * token before handing the client back to the caller.
 */
export class ExpoAmbaClient {
  private client: AmbaClient | null = null;
  private initPromise: Promise<void> | null = null;
  private config: ExpoAmbaConfig | null = null;
  private storage: import('@layers/amba-client').AmbaStorage | null = null;

  /**
   * Initialise the Expo client. Safe to call multiple times — subsequent
   * calls return the same promise.
   */
  init(config: ExpoAmbaConfig): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.config = config;
    const { autoRegisterPushToken = true, google, storage, ...rest } = config;

    if (google) {
      configureGoogleAuth(google);
    }

    const resolvedStorage = storage ?? asyncStorageAdapter;
    this.storage = resolvedStorage;

    this.client = new AmbaClient({
      ...rest,
      storage: resolvedStorage,
    });

    const client = this.client;

    this.initPromise = (async () => {
      await client.init();

      if (autoRegisterPushToken) {
        try {
          const result = await registerForPushNotificationsAsync();
          if (result) {
            await client.push.registerToken(result.token, result.platform);
            await cacheRegisteredPushToken(resolvedStorage, result.token);
          }
        } catch {
          // Push registration is best-effort — denied permissions, simulators,
          // and network errors should never block init.
        }
      }
    })();

    return this.initPromise;
  }

  /**
   * Returns the underlying {@link AmbaClient}. Throws if `init()` has not
   * been awaited yet.
   */
  get core(): AmbaClient {
    if (!this.client) {
      throw new Error(
        'Amba has not been initialised. Call `await Amba.init({ projectId, apiKey })` first.',
      );
    }
    return this.client;
  }

  // ── Passthrough accessors so callers can write `Amba.auth.loginWithEmail(...)` ──

  get auth() {
    return this.core.auth;
  }
  get streaks() {
    return this.core.streaks;
  }
  get content() {
    return this.core.content;
  }
  get configModule() {
    return this.core.config;
  }
  get entitlements() {
    return this.core.entitlements;
  }
  get push() {
    return this.core.push;
  }
  get achievements() {
    return this.core.achievements;
  }
  get catalog() {
    return this.core.catalog;
  }
  get challenges() {
    return this.core.challenges;
  }
  get currencies() {
    return this.core.currencies;
  }
  get deepLinks() {
    return this.core.deepLinks;
  }
  get feeds() {
    return this.core.feeds;
  }
  get friends() {
    return this.core.friends;
  }
  get groups() {
    return this.core.groups;
  }
  get inventory() {
    return this.core.inventory;
  }
  get leaderboards() {
    return this.core.leaderboards;
  }
  get media() {
    return this.core.media;
  }
  get messaging() {
    return this.core.messaging;
  }
  get moderation() {
    return this.core.moderation;
  }
  get onboarding() {
    return this.core.onboarding;
  }
  get referrals() {
    return this.core.referrals;
  }
  get reviews() {
    return this.core.reviews;
  }
  get roles() {
    return this.core.roles;
  }
  get sessions() {
    return this.core.sessions;
  }
  get stores() {
    return this.core.stores;
  }
  get sync() {
    return this.core.sync;
  }
  get xp() {
    return this.core.xp;
  }

  /** See {@link AmbaClient.track}. */
  track(event: string, properties?: Record<string, unknown>): Promise<void> {
    return this.core.track(event, properties);
  }

  /**
   * Register the device push token explicitly. Useful when you set
   * `autoRegisterPushToken: false` and want to defer the permission prompt.
   */
  async registerPushToken(): Promise<PushToken | null> {
    const result = await registerForPushNotificationsAsync();
    if (result) {
      await this.core.push.registerToken(result.token, result.platform);
      if (this.storage) {
        await cacheRegisteredPushToken(this.storage, result.token);
      }
    }
    return result;
  }

  /**
   * Unregister the cached device push token with the Amba API, remove any
   * Expo notification listeners, and clear the cached token from storage.
   *
   * Pass `subscriptions` for any `Notifications.add*Listener` subscriptions
   * you created; they will be released via `removeNotificationSubscription`.
   */
  async unregisterPushHandler(subscriptions?: EventSubscription[]): Promise<void> {
    const options: RemovePushNotificationHandlerOptions = {
      client: this.client ?? undefined,
      subscriptions,
      storage: this.storage ?? undefined,
    };
    await removePushNotificationHandler(options);
  }

  // ── One-liner social sign-in helpers ───────────────────────────────

  /** Prompt Apple Sign In and exchange the identity token for an Amba session. */
  async signInWithApple() {
    if (!(await isAppleAuthAvailable())) {
      throw new Error('Apple Sign In is not available on this device');
    }
    const identityToken = await signInWithApple();
    return this.core.auth.loginWithApple(identityToken);
  }

  /** Prompt Google Sign In and exchange the id_token for an Amba session. */
  async signInWithGoogle() {
    if (!this.config?.google) {
      throw new Error(
        'Google Sign In not configured. Pass `google` to Amba.init({ google: { clientId: "..." } })',
      );
    }
    const idToken = await signInWithGoogle();
    return this.core.auth.loginWithGoogle(idToken);
  }
}

/**
 * Singleton Expo Amba client. Call `Amba.init({ projectId, apiKey })`
 * once at app startup (typically in your root layout) and then use the
 * singleton from anywhere.
 */
export const Amba = new ExpoAmbaClient();
