import type { HapticBackend, HapticChannel } from '../types';

/**
 * Message contract between the web engine (inside a react-native-webview) and the
 * Expo host. The host listens via WebView.onMessage and drives expo-haptics.
 * Keep this in sync with mobile/App.tsx.
 */
export interface HapticBridgeMessage {
  source: 'resonance';
  type: 'haptic' | 'cancel';
  /** on/off milliseconds (Web Vibration style); host maps to Taptic/Vibrator. */
  pattern: number[];
  /** 0..1 advisory strength (host maps to impact style on iOS). */
  intensity: number;
  channel: HapticChannel;
}

interface RNWebView {
  postMessage(data: string): void;
}

function rnWebView(): RNWebView | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ReactNativeWebView?: RNWebView };
  return w.ReactNativeWebView ?? null;
}

/**
 * WebViewBridge backend — used when the web app runs INSIDE the Expo app's
 * react-native-webview. Posts haptic events to the native host, which fires
 * expo-haptics (real Taptic on iOS, Vibrator on Android). This is the only
 * web-reachable path to felt haptics on iPhone (Safari has no navigator.vibrate).
 */
export class WebViewBridgeHapticBackend implements HapticBackend {
  readonly name = 'expo-bridge';

  available(): boolean {
    return rnWebView() !== null;
  }

  prime(): void {
    this.post([1], 0.2, 'accent'); // tiny warm-up tick from the user gesture
  }

  fire(pattern: number[], intensity: number, channel: HapticChannel = 'bass'): void {
    this.post(pattern, intensity, channel);
  }

  /** Tell the host to clear any scheduled impacts (stops an in-flight buzz-train). */
  cancel(): void {
    const host = rnWebView();
    if (!host) return;
    const msg: HapticBridgeMessage = { source: 'resonance', type: 'cancel', pattern: [], intensity: 0, channel: 'other' };
    try {
      host.postMessage(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  private post(pattern: number[], intensity: number, channel: HapticChannel): void {
    const host = rnWebView();
    if (!host) return;
    const msg: HapticBridgeMessage = { source: 'resonance', type: 'haptic', pattern, intensity, channel };
    try {
      host.postMessage(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}
