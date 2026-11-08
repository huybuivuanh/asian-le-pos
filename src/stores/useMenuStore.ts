// src/stores/useMenuStore.ts
import { bizCol, bizDoc, bizKey } from "@/lib/business";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDocs, onSnapshot } from "firebase/firestore";
import { create } from "zustand";

type MenuState = {
  categories: FoodCategory[];
  menuItems: MenuItem[];
  optionGroups: OptionGroup[];
  options: ItemOption[];
  loading: boolean;
  subscribeToMenuVersion: () => () => void;
  resetVersionCache: () => void;
  clearData: () => void;
};

const STORAGE_KEY = "@menu_cache";
const VERSION_KEY = "@menu_version";

// In-memory version cache to avoid AsyncStorage reads on every Firestore event
let localMenuVersionCache: number | null = null;

// Keys corresponding only to menu arrays
type MenuArrayKeys = "categories" | "menuItems" | "optionGroups" | "options";

export const useMenuStore = create<MenuState>((set) => ({
  categories: [],
  menuItems: [],
  optionGroups: [],
  options: [],
  loading: true,

  subscribeToMenuVersion: () => {
    const versionDocRef = bizDoc("menuVersion", "versionDoc");

    const unsubscribe = onSnapshot(versionDocRef, async (snapshot) => {
      const remoteVersion = snapshot.data()?.version ?? 0;

      // Read from AsyncStorage only once per session; use memory cache after that
      if (localMenuVersionCache === null) {
        const localVersionStr = await AsyncStorage.getItem(bizKey(VERSION_KEY));
        localMenuVersionCache = localVersionStr ? parseInt(localVersionStr) : -1;
      }

      if (remoteVersion > localMenuVersionCache) {
        try {
          // Fetch all menu collections fresh
          const newMenu = await fetchMenuCollections();

          // Update AsyncStorage cache
          await AsyncStorage.setItem(bizKey(STORAGE_KEY), JSON.stringify(newMenu));
          await AsyncStorage.setItem(bizKey(VERSION_KEY), String(remoteVersion));
          localMenuVersionCache = remoteVersion;

          // Update Zustand store
          set({ ...newMenu, loading: false });
        } catch (error) {
          console.error("❌ Failed to fetch menu from Firestore:", error);
        }
      } else {
        // Version unchanged — only hydrate from cache if the store hasn't
        // loaded yet. Skipping this when already loaded prevents an
        // unnecessary AsyncStorage read + full re-render on every snapshot.
        if (useMenuStore.getState().loading) {
          const cached = await AsyncStorage.getItem(bizKey(STORAGE_KEY));
          if (cached) {
            set({ ...JSON.parse(cached), loading: false });
          } else {
            set({ loading: false });
          }
        }
      }
    });

    return unsubscribe;
  },

  resetVersionCache: () => {
    localMenuVersionCache = null;
  },

  clearData: () => {
    localMenuVersionCache = null;
    void AsyncStorage.removeItem(bizKey(VERSION_KEY));
    set({
      categories: [],
      menuItems: [],
      optionGroups: [],
      options: [],
      loading: true,
    });
  },
}));

// Fetch all menu-related collections in parallel
const fetchMenuCollections = async (): Promise<Pick<MenuState, MenuArrayKeys>> => {
  const [catSnap, itemsSnap, groupsSnap, optionsSnap] = await Promise.all([
    getDocs(bizCol("categories")),
    getDocs(bizCol("menuItems")),
    getDocs(bizCol("optionGroups")),
    getDocs(bizCol("options")),
  ]);

  const categories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as (FoodCategory & { order?: number })[];
  categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    categories: categories as FoodCategory[],
    menuItems: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as MenuItem[],
    optionGroups: groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionGroup[],
    options: optionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ItemOption[],
  };
};

// Load cached menu on app startup — always clears loading so the UI never
// blocks waiting for a Firestore round-trip when there is no local cache.
export const loadCachedMenu = async () => {
  const cache = await AsyncStorage.getItem(bizKey(STORAGE_KEY));
  if (cache) {
    useMenuStore.setState({ ...JSON.parse(cache), loading: false });
  } else {
    useMenuStore.setState({ loading: false });
  }
};
