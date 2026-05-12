import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { EventSubscription } from 'expo-modules-core';
import type { AmbaClient, AmbaStorage } from '@layers/amba-client';

/** Storage key used to cache the most recently registered device push token. */
const PUSH_TOKEN_STORAGE_KEY = 'amba:push:lastToken';

export interface PushToken {
  /** The device push token (APNs token on iOS, FCM token on Android). */
  token: string;
  /** Platform the token was issued for. */
  platform: 'ios' | 'android';
}

/**
 * Prompt the user for notification permission (if not already granted) and
 * return the device push token.
 *
 * Returns `null` when:
 *   - Running on an emulator/simulator (`!Device.isDevice`)
 *   - The user denied the permission prompt
 *   - The platform is unsupported (web/Windows/etc.)
 */
export async function registerForPushNotificationsAsync(): Promise<PushToken | null> {
  // Only iOS and Android can receive device push tokens
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }

  // Device.isDevice is false on simulators — device push tokens won't be issued
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

  // Android requires a notification channel before tokens can be issued on API 26+
  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // getDevicePushTokenAsync returns the raw APNs token on iOS and the FCM token on Android
  const deviceToken = await Notifications.getDevicePushTokenAsync();

  return { token: deviceToken.data, platform };
}

export interface RemovePushNotificationHandlerOptions {
  /**
   * Amba client used to unregister the cached token from the server. Pass the
   * `core` {@link AmbaClient} (or the Expo wrapper's `.core`). When supplied
   * we look up the last token cached by {@link cacheRegisteredPushToken} and
   * call `client.push.unregisterToken(token)`.
   */
  client?: AmbaClient;
  /**
   * Notification listeners returned from `Notifications.addNotificationReceivedListener`
   * / `addNotificationResponseReceivedListener` / `addPushTokenListener`. Each
   * subscription is removed with `Notifications.removeNotificationSubscription`.
   */
  subscriptions?: EventSubscription[];
  /**
   * Optional {@link AmbaStorage} adapter to clear the cached token from. If
   * omitted we fall back to the client's storage (when provided); otherwise the
   * local cache clear is skipped.
   */
  storage?: AmbaStorage;
}

/**
 * Persist the device push token that was just registered so a later call to
 * {@link removePushNotificationHandler} can find and unregister it.
 *
 * Exposed separately from {@link registerForPushNotificationsAsync} because
 * the server-side `registerToken` call happens in the `ExpoAmbaClient`
 * wrapper — it owns the token/client pairing, not this lower-level helper.
 */
export async function cacheRegisteredPushToken(storage: AmbaStorage, token: string): Promise<void> {
  await storage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
}

/**
 * Cleanup counterpart to {@link registerForPushNotificationsAsync}.
 *
 * - Removes any Expo `Notifications` subscriptions supplied by the caller.
 * - If an `AmbaClient` is provided, looks up the last token cached by
 *   {@link cacheRegisteredPushToken} and unregisters it from the server.
 * - Clears the cached token from storage.
 *
 * Safe to call when no token was ever registered — each step is guarded and
 * individual failures are surfaced via `AggregateError` so a storage/network
 * hiccup doesn't prevent the other cleanup work from running.
 */
export async function removePushNotificationHandler(
  options: RemovePushNotificationHandlerOptions = {},
): Promise<void> {
  const { client, subscriptions, storage } = options;
  const errors: unknown[] = [];

  // 1. Remove any notification listeners the caller registered.
  if (subscriptions && subscriptions.length > 0) {
    for (const subscription of subscriptions) {
      try {
        Notifications.removeNotificationSubscription(subscription);
      } catch (err) {
        errors.push(err);
      }
    }
  }

  // 2. Resolve storage (explicit override wins, else reach into the client).
  const resolvedStorage =
    storage ?? (client ? (client as unknown as { storage?: AmbaStorage }).storage : undefined);

  // 3. Unregister the cached token from the server.
  if (client && resolvedStorage) {
    try {
      const token = await resolvedStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (token) {
        await client.push.unregisterToken(token);
      }
    } catch (err) {
      errors.push(err);
    }
  }

  // 4. Clear the locally cached token.
  if (resolvedStorage) {
    try {
      await resolvedStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    } catch (err) {
      errors.push(err);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Failed to fully remove push notification handler');
  }
}
