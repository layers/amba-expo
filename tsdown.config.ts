import { defineConfig } from 'tsdown';

const sharedExternal = [
  'expo',
  'expo-notifications',
  'expo-apple-authentication',
  'expo-auth-session',
  'expo-device',
  'expo-linking',
  'expo-crypto',
  'react',
  'react-native',
  '@react-native-async-storage/async-storage',
  'expo/config-plugins',
];

// Two builds:
// 1. ESM bundle for runtime code (`dist/index.js`, `dist/plugin.js`) — imported
//    from JS/TS code via `@layers/amba-expo` and `@layers/amba-expo/plugin`.
// 2. CJS bundle for the Expo config-plugin file (`dist/plugin.cjs`) — Expo's
//    plugin-resolver does a synchronous `require()` on `<pkg>/app.plugin.js`
//    (which we alias to `app.plugin.cjs` in package.json `exports`). That CJS
//    loader `require()`s `./dist/plugin.cjs`, which must itself be CJS so it
//    can statically destructure `expo/config-plugins` (also CJS).
//
// `hash: false` keeps emitted .d.ts / .js filenames stable (no content hash)
// so they match `package.json` `types` / `exports`.
//
// `sourcemap: false` is critical: emitted .d.ts.map files otherwise embed
// `sourcesContent` with the full upstream type source, which leaks internal
// type declarations from transitive deps into the published package.
export default defineConfig([
  {
    entry: ['src/index.ts', 'src/plugin.ts'],
    format: 'esm',
    dts: false,
    hash: false,
    clean: true,
    sourcemap: false,
    external: sharedExternal,
  },
  {
    entry: ['src/plugin.ts'],
    format: 'cjs',
    dts: false,
    hash: false,
    clean: false,
    sourcemap: false,
    external: sharedExternal,
  },
]);
