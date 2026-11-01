import { firebase } from "@/lib/firebaseConfig";
import { createStoreCache } from "@/utils/storeCache";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { create } from "zustand";

// Read-only copies of website orders (written by the website project's
// mirrorOnlineOrder function). Shown in the take-out list next to POS orders.
const CACHE_LIMIT = 100;
const cache = createStoreCache<OnlineOrder[]>("@onlineOrders:cache");

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(data: OnlineOrder[]) {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void cache.save(data);
    saveTimer = null;
  }, 500);
}

type OnlineOrdersState = {
  onlineOrders: OnlineOrder[];
  subscribeToOnlineOrders: () => () => void;
  clearData: () => void;
};

export const useOnlineOrdersStore = create<OnlineOrdersState>((set, get) => ({
  onlineOrders: [],

  subscribeToOnlineOrders: () => {
    // Serve the cache right away so the list isn't missing online orders offline — but
    // only until live data arrives. (Checking for an empty list instead would bring back
    // deleted orders when the live list really is empty.)
    let gotLiveData = false;
    void cache.load().then((cached) => {
      if (!gotLiveData && cached?.length) {
        set({ onlineOrders: cached });
      }
    });

    const q = query(
      collection(firebase.db, "onlineOrders"),
      orderBy("createdAt", "desc"),
      limit(CACHE_LIMIT),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        gotLiveData = true;
        const data = snapshot.docs.map(
          (d) => ({ ...(d.data() as OnlineOrder), id: d.id, source: "online" }) as OnlineOrder,
        );
        set({ onlineOrders: data });
        debouncedSave(data);
      },
      (error) => {
        // Demo database / missing rule: just show no online orders.
        console.error("❌ Online orders snapshot error:", error);
      },
    );
    return () => unsubscribe();
  },

  clearData: () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    void cache.clear();
    set({ onlineOrders: [] });
  },
}));
