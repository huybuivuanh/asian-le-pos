// app/layout.tsx (Expo)
import * as Sentry from "@sentry/react-native";
import {
  createCustomerDisplayChannel,
  isCustomerDisplayRoute,
  type CustomerDisplayMessage,
} from "@/lib/customerDisplay";
import { loadSavedBusiness } from "@/lib/business";
import { AuthProvider } from "@/providers/AuthProvider";
import { useCartStore } from "@/stores/useCartStore";
import { loadCachedCustomers } from "@/stores/useCustomersStore";
import { loadCachedMenu } from "@/stores/useMenuStore";
import { loadCachedStaff } from "@/stores/useStaffStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import OfflineBanner from "@/ui/OfflineBanner";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { enableNetwork } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { firebase } from "@/lib/firebaseConfig";
import "../global.css";

Sentry.init({
  // DSN is not a secret — it only permits sending events to this project.
  // TODO: replace with the DSN of the "asian-le-pos" project in the
  // "asian-le-restaurant" Sentry org.
  dsn: "https://08ff3e290afbebdcaa6904afecf197d7@o4512046229094400.ingest.us.sentry.io/4512048833167360",
  // No PII (no emails/IPs) attached to events.
  sendDefaultPii: false,
  // Crash/error reporting only — no performance tracing, to stay well within
  // the free quota.
  tracesSampleRate: 0,
  // Keep the last 100 console.* calls, network requests, and navigations as
  // breadcrumbs so a rare crash shows what led up to it.
  maxBreadcrumbs: 100,
  // Don't report from dev / Expo Go sessions.
  enabled: !__DEV__,
  environment: __DEV__ ? "development" : "production",
});

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

const rootGestureStyle =
  Platform.OS === "web"
    ? { flex: 1, width: "100%" as const, minHeight: "100%" as const }
    : { flex: 1 };

function RootLayout({ children }: { children: React.ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const backgroundTimeRef = useRef<number | null>(null);

  // Firestore c050 (INTERNAL ASSERTION FAILED) means the WebChannel is unrecoverably
  // broken. Reload once to get a fresh SDK instance — prevents stuck loading overlays.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let reloading = false;
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (reloading) return;
      const msg: string = event.reason?.message ?? "";
      if (msg.includes("INTERNAL ASSERTION FAILED")) {
        reloading = true;
        window.location.replace("/");
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () =>
      window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  // After 5 min of inactivity, reset to home with fresh Firestore listeners.
  // Web: navigate to root (avoids 404 on deep routes in the static export).
  // Native: remount the navigation tree (Stack resets to initial route).
  useEffect(() => {
    if (Platform.OS === "web") {
      // The customer-display window has no cashier interacting with it — no
      // mouse/keyboard/touch ever fires there — so skip the inactivity
      // reload entirely for that route, or it'd bounce back to "/" every
      // 5 minutes while a customer is just watching their bill.
      if (isCustomerDisplayRoute()) return;

      // Tab hidden then visible after 5 min → reload.
      let hiddenAt: number | null = null;
      const handleVisibility = () => {
        if (document.visibilityState === "hidden") {
          hiddenAt = hiddenAt ?? Date.now();
        } else if (hiddenAt !== null) {
          if (Date.now() - hiddenAt >= INACTIVITY_TIMEOUT_MS) {
            window.location.replace("/");
          }
          hiddenAt = null;
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);

      // Tab stays open but no interaction for 5 min → reload.
      let inactivityTimer: ReturnType<typeof setTimeout>;
      const resetInactivityTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(
          () => window.location.replace("/"),
          INACTIVITY_TIMEOUT_MS,
        );
      };
      const events = [
        "mousemove",
        "mousedown",
        "keydown",
        "touchstart",
        "scroll",
      ] as const;
      events.forEach((e) =>
        document.addEventListener(e, resetInactivityTimer, { passive: true }),
      );
      resetInactivityTimer();

      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        events.forEach((e) =>
          document.removeEventListener(e, resetInactivityTimer),
        );
        clearTimeout(inactivityTimer);
      };
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== "active") {
        if (backgroundTimeRef.current === null)
          backgroundTimeRef.current = Date.now();
      } else {
        const t = backgroundTimeRef.current;
        backgroundTimeRef.current = null;
        if (t !== null && Date.now() - t >= INACTIVITY_TIMEOUT_MS) {
          void enableNetwork(firebase.db);
          setResetKey((k) => k + 1);
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Web static export: Ionicons otherwise mount before the .ttf resolves and can stay blank.
  // Preloading at root matches https://docs.expo.dev/develop/user-interface/fonts/#expo-vector-icons
  const [ioniconsReady, ioniconsError] = useFonts(
    Platform.OS === "web" ? { ...Ionicons.font } : {},
  );
  const webFontsBlocking =
    Platform.OS === "web" && !ioniconsReady && !ioniconsError;

  const startListening = useNetworkStore((s) => s.startListening);
  useEffect(() => startListening(), [startListening]);

  // Mirror the live cart to a customer-facing display window (second window
  // on the same browser, dragged to the extended monitor) over
  // BroadcastChannel — same-origin, same-browser only, no network/Firestore
  // involved. The display window mounts this same root layout, so skip when
  // this tab IS the display — otherwise it would broadcast its own
  // (always-empty) cart and stomp on the real cashier's state.
  useEffect(() => {
    if (Platform.OS !== "web" || isCustomerDisplayRoute()) return;

    const channel = createCustomerDisplayChannel();
    if (!channel) return;

    const broadcastCart = () => {
      const message: CustomerDisplayMessage = {
        type: "cart",
        order: useCartStore.getState().order,
      };
      channel.postMessage(message);
    };

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      if (event.data?.type === "hello") broadcastCart();
    };

    const unsubscribe = useCartStore.subscribe(broadcastCart);
    return () => {
      unsubscribe();
      channel.close();
    };
  }, []);

  // Start loading caches immediately — runs in parallel with auth
  // initialization so data is ready the moment the user is authenticated.
  // Caches are per business, so read the business saved on this device first.
  useEffect(() => {
    void loadSavedBusiness().then(() =>
      Promise.all([loadCachedMenu(), loadCachedCustomers(), loadCachedStaff()]),
    );
  }, []);

  if (webFontsBlocking) {
    return null;
  }

  return (
    <GestureHandlerRootView style={rootGestureStyle}>
      <BottomSheetModalProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <AuthProvider>
            <View key={resetKey} style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { flex: 1, width: "100%" },
                }}
              >
                {children}
              </Stack>
              <OfflineBanner />
            </View>
          </AuthProvider>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the error boundary + native crash hooks around the app.
export default Sentry.wrap(RootLayout);
