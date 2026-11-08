import { bizCol, bizDoc, bizKey } from "@/lib/business";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { create } from "zustand";
import { syncFromCart } from "@/services/customerService";
import { DiscountType } from "@/types/enums";
import { calculateTaxBreakdown, orderItemsSubtotal } from "@/utils/helpers";
import { extractPhoneDigits } from "../utils/customerPhone";

const CUSTOMERS_COLLECTION = "customers";
const CUSTOMERS_VERSION_COLLECTION = "customersVersion";
const CUSTOMERS_VERSION_DOC = "versionDoc";
const CACHE_KEY = "@customers:cache";
const LAST_FETCHED_KEY = "@customers:lastFetchedAt";
const VERSION_KEY = "@customers:version";

// In-memory version cache to avoid AsyncStorage reads on every Firestore event
let localCustomersVersionCache: number | null = null;

type CustomersState = {
  customers: Customer[];
  loading: boolean;
  subscribeToCustomersVersion: () => () => void;
  /** Returns new doc id, or `undefined` if name/phone missing (no write). */
  addCustomer: (input: {
    name: string;
    phone: string;
    numberOfOrders?: number;
    totalSpent?: number;
  }) => Promise<string | undefined>;
  /** No-op if trimmed name is empty (never override with blank name). */
  updateCustomer: (id: string, input: { name: string; phone: string }) => Promise<void>;
  /**
   * Atomically bumps an existing customer's order stats (+1 order, += total).
   * Uses Firestore `increment()`, so a stale local count does not matter — only
   * the doc id does. Deliberately does NOT touch `createdAt` or bump the
   * customers version: these fields are not shown in the POS, so there is no
   * need to force every other device to refetch.
   */
  bumpCustomerOrderStats: (id: string, orderTotal: number) => Promise<void>;
  /**
   * Writes to `customers` when name is non-empty and phone has ≥7 digits.
   * Accepts order data as a parameter — no store cross-dependency.
   * Does not throw (logs only) so order submit can proceed.
   *
   * Pass `recordOrder: true` only for a genuine new take-out submission — a new
   * customer is seeded with `numberOfOrders: 1` / `totalSpent: order total`, an
   * existing one gets an atomic stat bump. Edits and conversions omit it.
   */
  syncTakeOutCustomerFromCart: (
    order: Pick<
      OrderDraft,
      "customerName" | "phoneNumber" | "orderItems" | "taxBreakDown"
    >,
    recordOrder?: boolean,
  ) => Promise<void>;
  clearData: () => void;
};

/** Grand total (incl. tax, after discount) for a cart draft — mirrors orderService. */
function draftOrderTotal(
  order: Pick<OrderDraft, "orderItems" | "taxBreakDown">,
): number {
  const d = order.taxBreakDown?.discount;
  return calculateTaxBreakdown(
    orderItemsSubtotal(order.orderItems),
    d?.discountType ?? DiscountType.None,
    d?.discountValue ?? 0,
  ).total;
}

function mergeCustomers(existing: Customer[], incoming: Customer[]): Customer[] {
  const map = new Map(existing.map((c) => [c.id!, c]));
  for (const c of incoming) {
    map.set(c.id!, c);
  }
  return Array.from(map.values());
}

// Sets localCustomersVersionCache synchronously before the Firestore write so
// when the snapshot fires for our own write it is already a no-op.
async function bumpVersion(): Promise<void> {
  const version = Date.now();
  localCustomersVersionCache = version;
  await setDoc(
    bizDoc(CUSTOMERS_VERSION_COLLECTION, CUSTOMERS_VERSION_DOC),
    { version },
    { merge: true },
  );
}

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: [],
  loading: true,

  subscribeToCustomersVersion: () => {
    const versionDocRef = bizDoc(CUSTOMERS_VERSION_COLLECTION, CUSTOMERS_VERSION_DOC);

    const unsubscribe = onSnapshot(versionDocRef, async (snapshot) => {
      const remoteVersion = snapshot.data()?.version ?? 0;

      // Read from AsyncStorage only once per session; use memory cache after that
      if (localCustomersVersionCache === null) {
        const stored = await AsyncStorage.getItem(bizKey(VERSION_KEY));
        localCustomersVersionCache = stored ? parseInt(stored) : -1;
      }

      if (remoteVersion > localCustomersVersionCache) {
        try {
          const lastFetchedStr = await AsyncStorage.getItem(bizKey(LAST_FETCHED_KEY));
          const lastFetchedAt = lastFetchedStr ? parseInt(lastFetchedStr) : 0;
          const fetchStart = Date.now();

          // First ever load → full fetch; subsequent → incremental by createdAt
          const snap =
            lastFetchedAt === 0
              ? await getDocs(bizCol(CUSTOMERS_COLLECTION))
              : await getDocs(
                  query(
                    bizCol(CUSTOMERS_COLLECTION),
                    where("createdAt", ">", Timestamp.fromMillis(lastFetchedAt)),
                  ),
                );

          const incoming = snap.docs.map((d) => ({
            ...(d.data() as Customer),
            id: d.id,
          }));

          const merged =
            lastFetchedAt === 0 ? incoming : mergeCustomers(get().customers, incoming);

          set({ customers: merged, loading: false });
          await AsyncStorage.setItem(bizKey(CACHE_KEY), JSON.stringify(merged));
          await AsyncStorage.setItem(bizKey(LAST_FETCHED_KEY), String(fetchStart));
          await AsyncStorage.setItem(bizKey(VERSION_KEY), String(remoteVersion));
          localCustomersVersionCache = remoteVersion;
        } catch (e) {
          console.error("❌ Failed to fetch customers:", e);
          set({ loading: false });
        }
      } else {
        // Version unchanged — only hydrate from cache if the store hasn't loaded yet
        if (useCustomersStore.getState().loading) {
          const cached = await AsyncStorage.getItem(bizKey(CACHE_KEY));
          if (cached) {
            set({ customers: JSON.parse(cached), loading: false });
          } else {
            set({ loading: false });
          }
        }
      }
    });

    return unsubscribe;
  },

  addCustomer: async ({ name, phone, numberOfOrders = 0, totalSpent = 0 }) => {
    const n = name.trim().toUpperCase();
    const p = extractPhoneDigits(phone) || phone.trim();
    if (!n || !p) return undefined;

    const now = Timestamp.now();
    const ref = await addDoc(bizCol(CUSTOMERS_COLLECTION), {
      name: n,
      phone: p,
      isBlocked: false,
      createdAt: now,
      numberOfOrders,
      totalSpent,
    });

    const newCustomer: Customer = {
      id: ref.id,
      name: n,
      phone: p,
      isBlocked: false,
      createdAt: now,
      numberOfOrders,
      totalSpent,
    };
    const updated = [...get().customers, newCustomer];
    set({ customers: updated });
    void AsyncStorage.setItem(bizKey(CACHE_KEY), JSON.stringify(updated));
    void bumpVersion();

    return ref.id;
  },

  updateCustomer: async (id, { name, phone }) => {
    const n = name.trim().toUpperCase();
    const p = extractPhoneDigits(phone) || phone.trim();
    if (!n || !p) return;

    const now = Timestamp.now();
    await updateDoc(bizDoc(CUSTOMERS_COLLECTION, id), {
      name: n,
      phone: p,
      createdAt: now,
    });

    const updated = get().customers.map((c) =>
      c.id === id ? { ...c, name: n, phone: p } : c,
    );
    set({ customers: updated });
    void AsyncStorage.setItem(bizKey(CACHE_KEY), JSON.stringify(updated));
    void bumpVersion();
  },

  bumpCustomerOrderStats: async (id, orderTotal) => {
    // increment() is server-atomic: correct even if the cached counts are stale.
    await updateDoc(bizDoc(CUSTOMERS_COLLECTION, id), {
      numberOfOrders: increment(1),
      totalSpent: increment(orderTotal),
    });

    // Keep this device's cache roughly in step; no version bump / createdAt touch.
    const updated = get().customers.map((c) =>
      c.id === id
        ? {
            ...c,
            numberOfOrders: (c.numberOfOrders ?? 0) + 1,
            totalSpent: (c.totalSpent ?? 0) + orderTotal,
          }
        : c,
    );
    set({ customers: updated });
    void AsyncStorage.setItem(bizKey(CACHE_KEY), JSON.stringify(updated));
  },

  syncTakeOutCustomerFromCart: async (order, recordOrder = false) => {
    const { customers, addCustomer, updateCustomer, bumpCustomerOrderStats } = get();
    try {
      const orderTotal = recordOrder ? draftOrderTotal(order) : null;
      const { id, created } = await syncFromCart(
        order,
        customers,
        addCustomer,
        updateCustomer,
        orderTotal,
      );
      // New customers are already seeded with 1 / total by syncFromCart; only an
      // existing customer still needs the separate atomic bump.
      if (recordOrder && !created && id) {
        await bumpCustomerOrderStats(id, orderTotal!);
      }
    } catch (e) {
      console.error("Customer sync failed:", e);
    }
  },

  clearData: () => {
    localCustomersVersionCache = null;
    void AsyncStorage.multiRemove([bizKey(CACHE_KEY), bizKey(LAST_FETCHED_KEY), bizKey(VERSION_KEY)]);
    set({ customers: [], loading: true });
  },
}));

export const loadCachedCustomers = async () => {
  const cached = await AsyncStorage.getItem(bizKey(CACHE_KEY));
  if (cached) {
    useCustomersStore.setState({ customers: JSON.parse(cached), loading: false });
  } else {
    useCustomersStore.setState({ loading: false });
  }
};
