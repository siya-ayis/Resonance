import { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, PermissionsAndroid } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Haptics from 'expo-haptics';

/**
 * Resonance — Expo host.
 *
 * This app does NOT re-implement the engine. It hosts the existing web engine
 * (React + PIXI + Web Audio) inside a react-native-webview and bridges its
 * haptic events to expo-haptics — giving REAL device haptics, including on iOS
 * where the browser Vibration API does nothing. See
 * app/src/haptics/backends/WebViewBridgeHapticBackend.ts for the web side.
 *
 * Point WEBAPP_URL at your running web build:
 *   - set EXPO_PUBLIC_WEBAPP_URL (e.g. your cloudflared https URL), or
 *   - edit the fallback below. Corporate Wi-Fi usually needs the tunnel URL,
 *     not the LAN http://<ip>:5173 (firewall/client-isolation).
 */
const WEBAPP_URL =
  process.env.EXPO_PUBLIC_WEBAPP_URL ??
  'https://reads-router-todd-troops.trycloudflare.com';

interface HapticMessage {
  source: 'resonance';
  type: 'haptic' | 'cancel';
  pattern: number[];
  intensity: number;
  channel: 'bass' | 'drums' | 'vocals' | 'other' | 'accent';
}

/** Total "on" milliseconds in a Web-Vibration-style pattern (even indices = on). */
function onDuration(pattern: number[]): number {
  let sum = 0;
  for (let i = 0; i < pattern.length; i += 2) sum += pattern[i];
  return sum;
}

/**
 * Map a hit to a Taptic "texture" by CHANNEL so each instrument family feels
 * qualitatively different on iOS — not merely longer/shorter:
 *   bass   -> Heavy  (a deep thud you feel in the palm)
 *   drums  -> Light for a tiny tick (hat) / Rigid for a full hit (snare): snappy
 *   vocals -> Soft   (a gentle, rounded swell)
 *   accent -> Rigid  (a crisp pluck)
 * `other`/unknown falls back to a duration+velocity heuristic.
 */
function impactForChannel(
  channel: HapticMessage['channel'],
  durMs: number,
  intensity: number,
): Haptics.ImpactFeedbackStyle {
  switch (channel) {
    case 'bass':
      return Haptics.ImpactFeedbackStyle.Heavy;
    case 'drums':
      return durMs < 18 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Rigid;
    case 'vocals':
      return Haptics.ImpactFeedbackStyle.Soft;
    case 'accent':
      return Haptics.ImpactFeedbackStyle.Rigid;
    default: {
      const score = (durMs >= 100 ? 2 : durMs >= 50 ? 1 : 0) + (intensity >= 0.8 ? 1 : 0);
      if (score >= 3) return Haptics.ImpactFeedbackStyle.Heavy;
      if (score >= 1) return Haptics.ImpactFeedbackStyle.Medium;
      return Haptics.ImpactFeedbackStyle.Light;
    }
  }
}

export default function App() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // SENSE captures live audio via getUserMedia inside the WebView. On Android the
  // host app must hold RECORD_AUDIO before the WebView can grant mic access, so
  // request it up front. (iOS grants via mediaCapturePermissionGrantType below.)
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone access',
        message:
          'Resonance listens to nearby music and turns it into light and touch. Audio is analysed on-device and never recorded.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }).catch(() => {});
    }
  }, []);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  // Self-pruning schedule: each impact removes its own handle once it fires, so
  // overlapping discrete note patterns can coexist without an ever-growing list.
  const at = (delayMs: number, fn: () => void) => {
    const handle = setTimeout(() => {
      fn();
      timers.current = timers.current.filter((h) => h !== handle);
    }, Math.max(0, delayMs));
    timers.current.push(handle);
  };

  const fireHaptic = (msg: HapticMessage) => {
    const total = onDuration(msg.pattern);
    const ch = msg.channel;
    if (total >= 180) {
      // Sustained rumble (held bass / pad swell) -> a buzz-train whose TEXTURE and
      // density depend on the channel, so a held bass feels nothing like a held
      // vocal: bass = dense HEAVY thud-roll, vocals = airy SOFT swell, else Medium.
      // REPLACES whatever was playing, so clear first.
      clearTimers();
      const heavy = ch === 'bass';
      const soft = ch === 'vocals' || ch === 'other';
      const style = heavy
        ? Haptics.ImpactFeedbackStyle.Heavy
        : soft
          ? Haptics.ImpactFeedbackStyle.Soft
          : Haptics.ImpactFeedbackStyle.Medium;
      const step = heavy ? 26 : soft ? 48 : 36; // denser train = stronger-feeling
      for (let o = 0; o < total; o += step) {
        at(o, () => Haptics.impactAsync(style).catch(() => {}));
      }
      return;
    }
    // Discrete pattern (note tick / drum hit): one impact at the start of each
    // "on" segment, textured by channel so families stay distinguishable. Do NOT
    // clear in-flight discrete impacts — that would truncate the previous note's
    // multi-pulse and destroy the register cue.
    let offset = 0;
    for (let i = 0; i < msg.pattern.length; i++) {
      const ms = msg.pattern[i];
      if (i % 2 === 0) {
        const style = impactForChannel(ch, ms, msg.intensity);
        at(offset, () => Haptics.impactAsync(style).catch(() => {}));
      }
      offset += ms;
    }
  };

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as Partial<HapticMessage>;
      if (data.source !== 'resonance') return;
      if (data.type === 'cancel') {
        clearTimers(); // Pause/Stop — kill any scheduled buzz-train immediately
      } else if (data.type === 'haptic' && Array.isArray(data.pattern)) {
        fireHaptic(data as HapticMessage);
      }
    } catch {
      /* ignore malformed messages */
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden />
      <WebView
        style={styles.webview}
        source={{ uri: WEBAPP_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        // Let the Web Audio clock + visuals run without a tap-to-start gate.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // iOS: auto-grant mic to the web content (SENSE) without a 2nd prompt.
        mediaCapturePermissionGrantType="grant"
        // Keep gestures/perf sane for the canvas.
        overScrollMode="never"
        bounces={false}
        setBuiltInZoomControls={false}
        // Android: allow the WebGL/canvas to use hardware acceleration.
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05060f' },
  webview: { flex: 1, backgroundColor: '#05060f' },
});
