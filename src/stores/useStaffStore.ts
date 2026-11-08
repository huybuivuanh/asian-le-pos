import { bizCol, bizKey } from "@/lib/business";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDocs } from "firebase/firestore";
import { create } from "zustand";

const STAFF_COLLECTION = "users";
const CACHE_KEY = "@staff:cache";
const MODE_KEY = "@staff:sharedDeskMode";

type StaffState = {
  staff: StaffMember[];
  sharedDeskMode: boolean;
  loading: boolean;
  fetchStaff: () => Promise<void>;
  toggleSharedDeskMode: () => Promise<void>;
  clearData: () => void;
};

export const useStaffStore = create<StaffState>((set, get) => ({
  staff: [],
  sharedDeskMode: false,
  loading: true,

  fetchStaff: async () => {
    try {
      const snap = await getDocs(bizCol(STAFF_COLLECTION));
      const staff = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, "id">) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      set({ staff, loading: false });
      void AsyncStorage.setItem(bizKey(CACHE_KEY), JSON.stringify(staff));
    } catch (e) {
      console.error("❌ Failed to fetch staff:", e);
      set({ loading: false });
    }
  },

  toggleSharedDeskMode: async () => {
    const next = !get().sharedDeskMode;
    set({ sharedDeskMode: next });
    await AsyncStorage.setItem(MODE_KEY, JSON.stringify(next));
  },

  clearData: () => {
    set({ staff: [], loading: true });
  },
}));

export const loadCachedStaff = async () => {
  const [cached, mode] = await Promise.all([
    AsyncStorage.getItem(bizKey(CACHE_KEY)),
    AsyncStorage.getItem(MODE_KEY),
  ]);
  if (cached) {
    useStaffStore.setState({ staff: JSON.parse(cached) });
  }
  // mode is null on first run → defaults to false (mode off)
  if (mode !== null) {
    useStaffStore.setState({ sharedDeskMode: JSON.parse(mode) });
  }
  useStaffStore.setState({ loading: false });
};
