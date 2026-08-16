const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite runs as WebAssembly on web, which needs the .wasm asset resolved
// and the page cross-origin isolated for SharedArrayBuffer. Without both, the
// database open promise never settles and the app hangs on its loading state.
//
// Native builds ignore all of this; it exists so the full session flow can be
// exercised in a browser during development.
config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
