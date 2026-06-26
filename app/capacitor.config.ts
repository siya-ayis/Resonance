import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.resonance.feel',
  appName: 'Resonance',
  webDir: 'dist',
  // Bundled offline assets (manifest + stems live under public/ -> dist/).
  // No live server: the app ships the deterministic renderer + pre-baked manifests.
  android: {
    // Allow webview navigator.vibrate patterns in addition to @capacitor/haptics.
    allowMixedContent: false,
  },
  plugins: {
    Haptics: {},
  },
};

export default config;
