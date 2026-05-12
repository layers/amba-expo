// Expo config-plugin entry file. Expo's plugin-resolver looks for
// `<package>/app.plugin.js` at the package root and synchronously `require()`s
// it, so this file must be CommonJS. Because `package.json` has
// `"type": "module"` (the runtime SDK is ESM-first) we use a `.cjs` extension
// and alias `./app.plugin.js` → `./app.plugin.cjs` in the `exports` map so
// Expo still finds it. We require the CJS-built plugin (`./dist/plugin.cjs`)
// — NOT the ESM `./dist/plugin.js` — to keep this code path fully
// synchronous and interop-friendly with Expo's CJS `expo/config-plugins`.
// tsdown's CJS output re-exports the `export default` as `module.exports =`
// (it flattens default-only exports). If we ever add named exports,
// this unwrap step may need to revisit.
const plugin = require('./dist/plugin.cjs');
module.exports = plugin.default ?? plugin;
