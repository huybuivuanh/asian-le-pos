import { bizCol } from "@/lib/business";
import { onSnapshot } from "firebase/firestore";
import { create } from "zustand";

const CREDITS_COLLECTION = "credits";

function createdAtMs(c: Credit): number {
  const t = c.createdAt as { seconds?: number } | undefined;
  return t && typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

type CreditsState = {
  credits: Credit[];
  loading: boolean;
  subscribeToCredits: () => () => void;
  clearData: () => void;
};

export const useCreditsStore = create<CreditsState>((set) => ({
  credits: [],
  loading: true,

  subscribeToCredits: () => {
    const unsubscribe = onSnapshot(
      bizCol(CREDITS_COLLECTION),
      (snapshot) => {
        const credits = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Credit, "id">) } as Credit))
          .sort((a, b) => createdAtMs(b) - createdAtMs(a));
        set({ credits, loading: false });
      },
      (e) => {
        console.error("❌ subscribeToCredits failed:", e);
        set({ loading: false });
      },
    );
    return unsubscribe;
  },

  clearData: () => {
    set({ credits: [], loading: true });
  },
}));
