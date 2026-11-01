// Second Firebase connection: the Asian Le Rewards (loyalty) project.
// Each POS device signs in once as the shared POS account (Profile tab);
// the login is remembered. The password is never stored in .env.
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { Functions, getFunctions } from "firebase/functions";
import { Platform } from "react-native";

const REWARDS_APP_NAME = "rewards";

// Public client config, like the POS one. Optional: if it's missing the POS
// still works, and the Rewards screens say rewards isn't set up.
const rewardsConfig = {
  apiKey: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_REWARDS_FIREBASE_APP_ID,
};

export const rewardsConfigured = Boolean(
  rewardsConfig.apiKey && rewardsConfig.projectId && rewardsConfig.appId,
);

let rewardsApp: FirebaseApp | null = null;
let rewardsAuth: Auth | null = null;
let rewardsFunctions: Functions | null = null;
// Read-only use: the member doc the Rewards screen has open (live balance).
let rewardsDb: Firestore | null = null;

if (rewardsConfigured) {
  rewardsApp = getApps().some((a) => a.name === REWARDS_APP_NAME)
    ? getApp(REWARDS_APP_NAME)
    : initializeApp(rewardsConfig, REWARDS_APP_NAME);

  // Persistence keys include the app name, so this login is stored
  // separately from the staff POS login.
  rewardsAuth =
    Platform.OS === "web"
      ? getAuth(rewardsApp)
      : initializeAuth(rewardsApp, {
          persistence: getReactNativePersistence(ReactNativeAsyncStorage),
        });

  rewardsFunctions = getFunctions(rewardsApp);
  rewardsDb = getFirestore(rewardsApp);
}

export { rewardsAuth, rewardsDb, rewardsFunctions };
