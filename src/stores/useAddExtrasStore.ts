import { bizCol } from "@/lib/business";
import { onSnapshot } from "firebase/firestore";
import { create } from "zustand";

const ADD_EXTRAS_COLLECTION = "addExtras";

function sortAddExtras(a: ExtraCatalogItem, b: ExtraCatalogItem): number {
  return a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
}

type AddExtrasState = {
  addExtras: ExtraCatalogItem[];
  loading: boolean;
  subscribeToAddExtras: () => () => void;
  clearData: () => void;
};

export const useAddExtrasStore = create<AddExtrasState>((set) => ({
  addExtras: [],
  loading: true,

  subscribeToAddExtras: () => {
    const unsubscribe = onSnapshot(
      bizCol(ADD_EXTRAS_COLLECTION),
      (snapshot) => {
        const addExtras = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ExtraCatalogItem, "id">) } as ExtraCatalogItem))
          .sort(sortAddExtras);
        set({ addExtras, loading: false });
      },
      (e) => {
        console.error("❌ subscribeToAddExtras failed:", e);
        set({ loading: false });
      },
    );
    return unsubscribe;
  },

  clearData: () => {
    set({ addExtras: [], loading: true });
  },
}));
