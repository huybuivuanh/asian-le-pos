// The business this device works in. All POS data lives under
// businesses/{businessId}/… in Firestore.
//
// The id comes from the signed-in account's `businessId` custom claim (see
// AuthProvider). It's also saved on the device so cached data can load at startup,
// before sign-in finishes. The claim always wins; the security rules enforce access.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc } from "firebase/firestore";
import { firebase } from "./firebaseConfig";

const STORAGE_KEY = "@business";

type SavedBusiness = { uid: string; businessId: string };

let currentBusinessId: string | null = null;
let savedLoad: Promise<SavedBusiness | null> | null = null;

export function getBusinessId(): string | null {
  return currentBusinessId;
}

function requireBusinessId(): string {
  if (!currentBusinessId) {
    throw new Error("No business selected. Sign out and sign in again.");
  }
  return currentBusinessId;
}

/**
 * Loads the business saved on this device (once). Call before reading cached data
 * at startup. Doesn't override a business already set by sign-in.
 */
export function loadSavedBusiness(): Promise<SavedBusiness | null> {
  savedLoad ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => (raw ? (JSON.parse(raw) as SavedBusiness) : null))
    .catch(() => null)
    .then((saved) => {
      if (saved?.businessId && !currentBusinessId) currentBusinessId = saved.businessId;
      return saved;
    });
  return savedLoad;
}

/** Sets the business for the signed-in account and remembers it on the device. */
export async function setBusiness(uid: string, businessId: string): Promise<void> {
  currentBusinessId = businessId;
  const saved: SavedBusiness = { uid, businessId };
  savedLoad = Promise.resolve(saved);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.error("❌ Failed to save business:", e);
  }
}

/** A collection inside the current business, e.g. bizCol("tables"). */
export function bizCol(name: string) {
  return collection(firebase.db, "businesses", requireBusinessId(), name);
}

/** A doc inside the current business, e.g. bizDoc("tables", id). */
export function bizDoc(name: string, id: string) {
  return doc(firebase.db, "businesses", requireBusinessId(), name, id);
}

/**
 * Device cache key for the current business, so two businesses on one device
 * never share cached menus, customers or orders.
 */
export function bizKey(key: string): string {
  return `${key}:${currentBusinessId ?? "none"}`;
}
