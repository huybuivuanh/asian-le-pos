import { bizCol } from "@/lib/business";
import {
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { create } from "zustand";
import {
  clearTakeOutOrdersTabCache,
  loadTakeOutOrdersTabCache,
  saveTakeOutOrdersTabCache,
} from "../utils/orders-tab-cache";

type TakeOutOrdersTabState = {
  fullTakeOutOrders: TakeOutOrder[];
  takeOutOrders: TakeOutOrder[];
  visibleLimit: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  lastFetchTime: number | null;
  loadTakeOutOrders: () => Promise<void>;
  loadMoreOrders: () => Promise<void>;
  /** Show more rows even when POS orders run out (the list also holds online orders). */
  increaseVisibleLimit: () => void;
  refreshTakeOutOrders: () => Promise<void>;
  subscribeToTakeOutOrders: () => () => void;
  clearData: () => Promise<void>;
};

// Keep the in-memory list small to reduce RAM usage on long-running sessions.
const CACHE_LIMIT = 100;
const INITIAL_DISPLAY_LIMIT = 30;
const LOAD_MORE_BATCH_SIZE = 10;

let _takeOutSaveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveTakeOutCache(data: TakeOutOrder[]) {
  if (_takeOutSaveTimer !== null) clearTimeout(_takeOutSaveTimer);
  _takeOutSaveTimer = setTimeout(() => {
    void saveTakeOutOrdersTabCache(data);
    _takeOutSaveTimer = null;
  }, 500);
}

function takeOutTabQuery() {
  return query(
    bizCol("takeOutOrders"),
    orderBy("createdAt", "desc"),
    limit(CACHE_LIMIT),
  );
}

export const useTakeOutOrdersStore = create<TakeOutOrdersTabState>(
  (set, get) => {
    const applyFullList = (full: TakeOutOrder[]) => {
      const capped = full.slice(0, CACHE_LIMIT);
      const { visibleLimit } = get();
      const displayed = capped.slice(0, Math.min(visibleLimit, capped.length));
      const hasMore = capped.length > displayed.length;
      set({
        fullTakeOutOrders: capped,
        takeOutOrders: displayed,
        hasMore,
        loading: false,
        lastFetchTime: Date.now(),
      });
    };

    return {
      fullTakeOutOrders: [],
      takeOutOrders: [],
      visibleLimit: INITIAL_DISPLAY_LIMIT,
      loading: true,
      loadingMore: false,
      hasMore: false,
      lastFetchTime: null,

      loadTakeOutOrders: async () => {
        try {
          const { fullTakeOutOrders, lastFetchTime } = get();
          if (fullTakeOutOrders.length > 0 || lastFetchTime !== null) {
            set({ loading: false });
            return;
          }

          set({ loading: true });

          const { orders: cachedOrders } = await loadTakeOutOrdersTabCache();
          if (cachedOrders && cachedOrders.length > 0) {
            applyFullList(cachedOrders.slice(0, CACHE_LIMIT) as TakeOutOrder[]);
          }
        } catch (error) {
          console.error("❌ Error loading take out orders tab:", error);
          set({ loading: false });
        }
      },

      loadMoreOrders: async () => {
        const state = get();
        if (state.loadingMore || !state.hasMore) {
          return;
        }

        set({ loadingMore: true });

        try {
          const { fullTakeOutOrders, visibleLimit } = state;
          if (fullTakeOutOrders.length === 0) {
            set({ loadingMore: false, hasMore: false });
            return;
          }

          const nextLimit = visibleLimit + LOAD_MORE_BATCH_SIZE;
          const displayed = fullTakeOutOrders.slice(
            0,
            Math.min(nextLimit, fullTakeOutOrders.length),
          );
          const hasMore = displayed.length < fullTakeOutOrders.length;

          set({
            visibleLimit: nextLimit,
            takeOutOrders: displayed,
            hasMore,
            loadingMore: false,
          });
        } catch (error) {
          console.error("❌ Error loading more take out orders:", error);
          set({ loadingMore: false });
        }
      },

      increaseVisibleLimit: () => {
        const { fullTakeOutOrders, visibleLimit } = get();
        const nextLimit = visibleLimit + LOAD_MORE_BATCH_SIZE;
        const displayed = fullTakeOutOrders.slice(0, nextLimit);
        set({
          visibleLimit: nextLimit,
          takeOutOrders: displayed,
          hasMore: displayed.length < fullTakeOutOrders.length,
        });
      },

      refreshTakeOutOrders: async () => {
        try {
          const snapshot = await getDocs(takeOutTabQuery());
          const data = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as TakeOutOrder),
          }));
          await saveTakeOutOrdersTabCache(data);
          applyFullList(data);
        } catch (error) {
          console.error("❌ Error refreshing take out orders:", error);
          set({ loading: false });
        }
      },

      subscribeToTakeOutOrders: () => {
        set({ loading: true });

        void loadTakeOutOrdersTabCache().then(({ orders: cachedOrders }) => {
          if (cachedOrders?.length && get().fullTakeOutOrders.length === 0) {
            applyFullList(cachedOrders.slice(0, CACHE_LIMIT) as TakeOutOrder[]);
          }
        });

        const q = takeOutTabQuery();
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as TakeOutOrder),
            }));
            debouncedSaveTakeOutCache(data);
            applyFullList(data);
          },
          (error) => {
            console.error("❌ Take out orders snapshot error:", error);
            set({ loading: false });
          },
        );

        return () => unsubscribe();
      },

      clearData: async () => {
        await clearTakeOutOrdersTabCache();
        set({
          fullTakeOutOrders: [],
          takeOutOrders: [],
          visibleLimit: INITIAL_DISPLAY_LIMIT,
          loading: true,
          loadingMore: false,
          hasMore: false,
          lastFetchTime: null,
        });
      },
    };
  },
);
