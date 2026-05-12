// Expo config plugin for Amba. Wires up iOS push entitlements + background
// mode, URL schemes, Universal Links, and Android intent filters + notification
// permissions so a fresh Expo app can deep link and receive push notifications
// with a single plugin entry.
//
// NOTE: This file is bundled to BOTH ESM (`dist/plugin.js`) and CJS
// (`dist/plugin.cjs`). The `app.plugin.cjs` loader at the package root uses
// `require('./dist/plugin.cjs')` so Expo's plugin-resolver (which does a
// synchronous `require()`) always gets CJS. Expo's `expo/config-plugins` is
// itself CJS and using ESM named imports against it fails at runtime because
// the CJS module.exports surface isn't statically detectable.
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
} from 'expo/config-plugins';

export interface AmbaIntentFilter {
  /** URI scheme (e.g. `'myapp'` or `'https'`). */
  scheme: string;
  /** Optional host for the intent filter (e.g. `'example.com'`). */
  host?: string;
  /** Optional path prefix (e.g. `'/invite'`). */
  pathPrefix?: string;
}

export interface AmbaExpoPluginOptions {
  ios?: {
    /** Custom URL schemes for deep linking (e.g. `['myapp']`). */
    urlSchemes?: string[];
    /** Domains for Apple Universal Links — `applinks:` is added automatically. */
    associatedDomains?: string[];
    /** Register the `aps-environment` entitlement for push notifications. Defaults to `true`. */
    pushNotifications?: boolean;
    /**
     * APNs environment. `'development'` for debug builds (Xcode sandbox),
     * `'production'` for TestFlight / App Store. EAS flips this to production
     * automatically for release builds, but pin explicitly if you want to
     * override Xcode's default.
     */
    apnsEnvironment?: 'development' | 'production';
  };
  android?: {
    /** Deep link intent filters added to MainActivity. */
    intentFilters?: AmbaIntentFilter[];
    /**
     * Firebase sender id (FCM project number) used by `google-services.json`.
     * Warned (not enforced) when push is enabled and this is missing — the
     * actual wiring happens when the consumer drops `google-services.json` in
     * via `expo.android.googleServicesFile`.
     */
    fcmProjectNumber?: string;
  };
}

const URL_TYPE_NAME = 'AmbaDeepLinks';

/** Android permissions required for push + reliable delivery. */
const ANDROID_PUSH_PERMISSIONS = [
  // Android 13+: runtime permission for showing notifications.
  'android.permission.POST_NOTIFICATIONS',
  // Keep device awake briefly when a high-priority notification arrives.
  'android.permission.WAKE_LOCK',
  // Vibrate when a notification fires (the channel still has to opt-in).
  'android.permission.VIBRATE',
  // Restart the FCM registration after a device reboot.
  'android.permission.RECEIVE_BOOT_COMPLETED',
];

const withAmba: ConfigPlugin<AmbaExpoPluginOptions> = (config, options = {}) => {
  const ios = options.ios ?? {};
  const android = options.android ?? {};
  const pushEnabled = ios.pushNotifications !== false;

  // ── Prop warnings ────────────────────────────────────────────────
  if (pushEnabled && !ios.apnsEnvironment) {
    // Not fatal — Xcode defaults to development for debug builds. Just nudge.
    // eslint-disable-next-line no-console
    console.warn(
      '[@layers/amba-expo] iOS push notifications enabled but `ios.apnsEnvironment` is not set. ' +
        "Defaulting to 'development'. Set to 'production' for TestFlight / App Store builds.",
    );
  }
  if (pushEnabled && !android.fcmProjectNumber) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@layers/amba-expo] Android push enabled but `android.fcmProjectNumber` was not provided. ' +
        'Ensure `google-services.json` (with your FCM sender id) is wired via ' +
        '`expo.android.googleServicesFile` in app.json.',
    );
  }

  // ── iOS: Info.plist (URL schemes + UIBackgroundModes) ─────────────
  config = withInfoPlist(config, (cfg) => {
    // URL schemes
    if (ios.urlSchemes && ios.urlSchemes.length > 0) {
      interface UrlType {
        CFBundleURLName: string;
        CFBundleURLSchemes: string[];
      }

      const existing: UrlType[] = Array.isArray(cfg.modResults.CFBundleURLTypes)
        ? (cfg.modResults.CFBundleURLTypes as UrlType[])
        : [];

      const ambaEntry = existing.find((e) => e.CFBundleURLName === URL_TYPE_NAME);

      if (ambaEntry) {
        const schemes = (ambaEntry.CFBundleURLSchemes = ambaEntry.CFBundleURLSchemes ?? []);
        const seen = new Set(schemes);
        for (const scheme of ios.urlSchemes) {
          if (!seen.has(scheme)) {
            schemes.push(scheme);
            seen.add(scheme);
          }
        }
        cfg.modResults.CFBundleURLTypes = existing;
      } else {
        cfg.modResults.CFBundleURLTypes = [
          ...existing,
          { CFBundleURLName: URL_TYPE_NAME, CFBundleURLSchemes: [...ios.urlSchemes] },
        ];
      }
    }

    // UIBackgroundModes: remote-notification (required for silent/background pushes)
    if (pushEnabled) {
      const modes = Array.isArray(cfg.modResults.UIBackgroundModes)
        ? (cfg.modResults.UIBackgroundModes as string[])
        : [];
      if (!modes.includes('remote-notification')) {
        modes.push('remote-notification');
      }
      cfg.modResults.UIBackgroundModes = modes;
    }

    return cfg;
  });

  // ── iOS: Entitlements (associated domains + push) ─────────────────
  if ((ios.associatedDomains && ios.associatedDomains.length > 0) || pushEnabled) {
    config = withEntitlementsPlist(config, (cfg) => {
      if (ios.associatedDomains && ios.associatedDomains.length > 0) {
        const existing =
          (cfg.modResults['com.apple.developer.associated-domains'] as string[] | undefined) ?? [];
        const additions = ios.associatedDomains.map((d) =>
          d.startsWith('applinks:') ? d : `applinks:${d}`,
        );
        cfg.modResults['com.apple.developer.associated-domains'] = Array.from(
          new Set([...existing, ...additions]),
        );
      }

      if (pushEnabled) {
        // Explicit override wins; otherwise default to development and let Xcode
        // / EAS flip it to production at build time for release builds.
        const apsEnv = ios.apnsEnvironment ?? 'development';
        cfg.modResults['aps-environment'] = apsEnv;
      }

      return cfg;
    });
  }

  // ── Android: manifest (permissions + intent filters) ──────────────
  config = withAndroidManifest(config, (cfg) => {
    // Permissions — POST_NOTIFICATIONS etc. Only add if push is enabled.
    if (pushEnabled) {
      for (const perm of ANDROID_PUSH_PERMISSIONS) {
        AndroidConfig.Permissions.addPermission(cfg.modResults, perm);
      }
    }

    // Intent filters
    if (android.intentFilters && android.intentFilters.length > 0) {
      const application = cfg.modResults.manifest.application?.[0];
      const mainActivity = application?.activity?.find(
        (act: Record<string, unknown>) =>
          (act.$ as Record<string, string> | undefined)?.['android:name'] === '.MainActivity',
      );

      if (!mainActivity) return cfg;

      const filters = (mainActivity['intent-filter'] = mainActivity['intent-filter'] ?? []);

      for (const f of android.intentFilters) {
        if (!f.scheme) continue;

        const data: Record<string, string> = { 'android:scheme': f.scheme };
        if (f.host) data['android:host'] = f.host;
        if (f.pathPrefix) data['android:pathPrefix'] = f.pathPrefix;

        const isDuplicate = filters.some((existing: Record<string, unknown>) => {
          const existingData = (
            existing.data as Array<{ $: Record<string, string> }> | undefined
          )?.[0]?.$;
          if (!existingData) return false;
          return (
            existingData['android:scheme'] === f.scheme &&
            (existingData['android:host'] ?? undefined) === (f.host ?? undefined) &&
            (existingData['android:pathPrefix'] ?? undefined) === (f.pathPrefix ?? undefined)
          );
        });

        if (isDuplicate) continue;

        const intentFilter: Record<string, unknown> = {
          $: f.scheme === 'https' ? { 'android:autoVerify': 'true' } : {},
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
            { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
          ],
          data: [{ $: data }],
        };

        filters.push(intentFilter as never);
      }
    }

    return cfg;
  });

  return config;
};

export default withAmba;
