import { bizCol } from "@/lib/business";
import { onSnapshot } from "firebase/firestore";
import { create } from "zustand";

const MENU_CHANGES_COLLECTION = "menuChanges";

function sortMenuChanges(a: MenuChange, b: MenuChange): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function sortItemChanges(a: ItemChange, b: ItemChange): number {
  return a.from.localeCompare(b.from, undefined, { sensitivity: "base" });
}

type MenuChangesState = {
  menuChanges: MenuChange[];
  loading: boolean;
  subscribeToMenuChanges: () => () => void;
  clearData: () => void;
};

export const useMenuChangesStore = create<MenuChangesState>((set) => ({
  menuChanges: [],
  loading: true,

  subscribeToMenuChanges: () => {
    const unsubscribe = onSnapshot(
      bizCol(MENU_CHANGES_COLLECTION),
      (snapshot) => {
        const menuChanges = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MenuChange, "id">) } as MenuChange))
          .map((mc) => ({ ...mc, changes: [...mc.changes].sort(sortItemChanges) }))
          .sort(sortMenuChanges);
        set({ menuChanges, loading: false });
      },
      (e) => {
        console.error("❌ subscribeToMenuChanges failed:", e);
        set({ loading: false });
      },
    );
    return unsubscribe;
  },

  clearData: () => {
    set({ menuChanges: [], loading: true });
  },
}));
