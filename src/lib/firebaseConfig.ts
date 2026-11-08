// src/lib/firebaseConfig.ts
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  memoryLruGarbageCollector,
} from "firebase/firestore";
import { Platform } from "react-native";

function requiredEnvVar(label: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${label}. Add it to a root .env file (see .env.example) and restart Expo.`,
    );
  }
  return value;
}

// Public Firebase client config — still bundled in the app; .env keeps it out of git.
const firebaseConfig = {
  apiKey: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  ),
  authDomain: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),
  projectId: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  ),
  storageBucket: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),
  messagingSenderId: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: requiredEnvVar(
    "EXPO_PUBLIC_FIREBASE_APP_ID",
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  ),
  ...(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
    ? { measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID }
    : {}),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

const firestoreSettings = {
  localCache: memoryLocalCache({
    garbageCollector: memoryLruGarbageCollector(),
  }),
};

// One database for every business; business data is under businesses/{id}
// (see src/lib/business.ts). The App Store review Demo is just another business.
export const firebase = { db: initializeFirestore(app, firestoreSettings) };

export { app, auth };
