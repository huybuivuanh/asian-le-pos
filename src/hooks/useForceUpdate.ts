import { firebase } from "@/lib/firebaseConfig";
import Constants from "expo-constants";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

type UpdateConfig = {
  minVersion?: string;
  iosUpdateUrl?: string;
  androidUpdateUrl?: string;
};

/** Compares dot-separated version strings (e.g. "1.2.10" vs "1.10.0") numerically per segment. */
function isVersionLower(current: string, min: string): boolean {
  const c = current.split(".").map((n) => parseInt(n, 10) || 0);
  const m = min.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(c.length, m.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (cv !== mv) return cv < mv;
  }
  return false;
}

/**
 * Live-checks the app version against `appConfig/posVersion` in Firestore (top level,
 * shared by every business; each app has its own doc). Runs only while `enabled`
 * (i.e. the user is authenticated).
 * Uses onSnapshot rather than a one-time read so a mandatory update pushed while staff are
 * mid-session takes effect without requiring them to relaunch the app.
 */
export function useForceUpdate(enabled: boolean) {
  const [config, setConfig] = useState<UpdateConfig | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    const ref = doc(firebase.db, "appConfig", "posVersion");
    const unsubscribe = onSnapshot(ref, (snap) => {
      setConfig((snap.data() as UpdateConfig) ?? null);
    });
    return unsubscribe;
  }, [enabled]);

  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
  const updateRequired =
    Platform.OS !== "web" &&
    !!config?.minVersion &&
    isVersionLower(currentVersion, config.minVersion);

  const updateUrl =
    Platform.OS === "ios" ? config?.iosUpdateUrl : config?.androidUpdateUrl;

  return { updateRequired, updateUrl };
}
