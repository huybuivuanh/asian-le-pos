import { bizCol, bizDoc } from "@/lib/business";
import { sortTables } from "@/utils/helpers";
import { createStoreCache } from "@/utils/storeCache";
import { onSnapshot, updateDoc } from "firebase/firestore";
import { create } from "zustand";

const cache = createStoreCache<Table[]>("@tables:cache");

type TableStore = {
  tables: Table[];
  getTable: (tableNumber: string) => Table | undefined;
  /** Resolve Firestore doc id for a display/route `tableNumber`; undefined if not in cache. */
  getTableDocId: (tableNumber: string) => string | undefined;

  /** Firestore path `tables/{tableDocId}`. */
  updateTable: (tableDocId: string, data: Partial<Table>) => Promise<void>;

  /** Merge a freshly (live, server-read) fetched table into the cached list. */
  upsertTable: (table: Table) => void;

  subscribeToTables: () => Promise<() => void>;
  clearData: () => void;
};

export const useTableStore = create<TableStore>((set, get) => ({
  tables: [],

  getTable: (tableNumber) =>
    get().tables.find((t) => t.tableNumber === tableNumber),

  // Table doc IDs are the tableNumber itself, so this never has to depend on
  // the local `tables` array being loaded/synced — no lookup, no race.
  getTableDocId: (tableNumber) => tableNumber || undefined,

  updateTable: async (tableDocId, data) => {
    const tableRef = bizDoc("tables", tableDocId);
    await updateDoc(tableRef, data);
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableDocId ? { ...t, ...data } : t,
      ),
    }));
  },

  upsertTable: (table) =>
    set((state) => {
      const idx = state.tables.findIndex((t) => t.id === table.id);
      if (idx === -1) return { tables: sortTables([...state.tables, table]) };
      const next = [...state.tables];
      next[idx] = table;
      return { tables: next };
    }),

  subscribeToTables: async () => {
    // Serve cache immediately while waiting for first snapshot
    cache.load().then((cached) => {
      if (
        cached &&
        cached.length > 0 &&
        useTableStore.getState().tables.length === 0
      ) {
        set({ tables: cached });
      }
    });

    const tablesRef = bizCol("tables");
    const unsubscribe = onSnapshot(tablesRef, (snapshot) => {
      const tablesData: Table[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data() as Partial<Table>;
        return {
          ...raw,
          id: docSnap.id,
          tableNumber: raw.tableNumber ?? docSnap.id,
        } as Table;
      });
      const sortedTables = sortTables(tablesData);
      set({ tables: sortedTables });
      void cache.save(sortedTables);
    });
    return unsubscribe;
  },

  clearData: () => {
    void cache.clear();
    set({ tables: [] });
  },
}));
