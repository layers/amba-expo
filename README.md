# @layers/amba-expo

Expo wrapper around [`@layers/amba-client`](https://www.npmjs.com/package/@layers/amba-client).
Adds the React Native pieces the core client can't ship on its own:

- AsyncStorage adapter for session persistence
- Apple / Google sign-in helpers
- Push notification registration via `expo-notifications`
- Expo config plugin for push entitlements, URL schemes, associated domains, and Android intent filters

## Install

```bash
npm install @layers/amba-expo
npx expo install expo-notifications expo-device \
  expo-apple-authentication expo-auth-session expo-crypto \
  @react-native-async-storage/async-storage
```

## Initialise

```tsx
import { Amba } from '@layers/amba-expo';

Amba.init({
  projectId: process.env.EXPO_PUBLIC_AMBA_PROJECT_ID!,
  apiKey: process.env.EXPO_PUBLIC_AMBA_API_KEY!,
  google: {
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!,
  },
});

await Amba.signInWithApple();
await Amba.track('posts_viewed');
```

## Config plugin

In `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["@layers/amba-expo", {
        "ios": { "urlSchemes": ["myapp"], "pushNotifications": true },
        "android": { "intentFilters": [{ "scheme": "myapp" }] }
      }]
    ]
  }
}
```

Then `npx expo prebuild`.

## License

MIT
