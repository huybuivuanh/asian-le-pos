import AsyncStorage from "@react-native-async-storage/async-storage";
import { bizKey } from "@/lib/business";

export type StoreCache<T> = {
  save: (data: T) => Promise<void>;
  load: () => Promise<T | null>;
  clear: () => Promise<void>;
};

/** Device cache for one business's data; the key gets the current business id. */
export function createStoreCache<T>(baseKey: string): StoreCache<T> {
  return {
    save: async (data) => {
      const key = bizKey(baseKey);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.error(`❌ storeCache.save [${key}]:`, e);
      }
    },
    load: async () => {
      const key = bizKey(baseKey);
      try {
        const raw = await AsyncStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (e) {
        console.error(`❌ storeCache.load [${key}]:`, e);
        return null;
      }
    },
    clear: async () => {
      const key = bizKey(baseKey);
      try {
        await AsyncStorage.removeItem(key);
      } catch (e) {
        console.error(`❌ storeCache.clear [${key}]:`, e);
      }
    },
  };
}
