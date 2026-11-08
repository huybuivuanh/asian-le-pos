import AsyncStorage from "@react-native-async-storage/async-storage";
import { bizKey } from "@/lib/business";

const TAKE_OUT_TAB_CACHE_KEY = "@takeOutOrders:tabCache";
const DINE_IN_TAB_CACHE_KEY = "@dineInOrders:tabCache";

export interface CachedOrdersTab {
  orders: AnyOrder[];
  timestamp: number;
}

async function saveTabCache(
  storageKey: string,
  orders: AnyOrder[],
): Promise<void> {
  try {
    const cacheData: CachedOrdersTab = {
      orders,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(bizKey(storageKey), JSON.stringify(cacheData));
  } catch (error) {
    console.error("❌ Error saving orders tab cache:", error);
  }
}

async function loadTabCache(storageKey: string): Promise<{
  orders: AnyOrder[] | null;
}> {
  try {
    const cachedData = await AsyncStorage.getItem(bizKey(storageKey));
    if (!cachedData) {
      return { orders: null };
    }
    const parsed: CachedOrdersTab = JSON.parse(cachedData);
    return { orders: parsed.orders };
  } catch (error) {
    console.error("❌ Error loading orders tab cache:", error);
    return { orders: null };
  }
}

async function clearTabCache(storageKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(bizKey(storageKey));
  } catch (error) {
    console.error("❌ Error clearing orders tab cache:", error);
  }
}

/** Take out orders tab (AsyncStorage) */
export async function saveTakeOutOrdersTabCache(
  orders: AnyOrder[],
): Promise<void> {
  return saveTabCache(TAKE_OUT_TAB_CACHE_KEY, orders);
}

export async function loadTakeOutOrdersTabCache(): Promise<{
  orders: AnyOrder[] | null;
}> {
  return loadTabCache(TAKE_OUT_TAB_CACHE_KEY);
}

export async function clearTakeOutOrdersTabCache(): Promise<void> {
  return clearTabCache(TAKE_OUT_TAB_CACHE_KEY);
}

/** Dine in orders tab (AsyncStorage) */
export async function saveDineInOrdersTabCache(
  orders: AnyOrder[],
): Promise<void> {
  return saveTabCache(DINE_IN_TAB_CACHE_KEY, orders);
}

export async function loadDineInOrdersTabCache(): Promise<{
  orders: AnyOrder[] | null;
}> {
  return loadTabCache(DINE_IN_TAB_CACHE_KEY);
}

export async function clearDineInOrdersTabCache(): Promise<void> {
  return clearTabCache(DINE_IN_TAB_CACHE_KEY);
}

export async function clearAllOrdersTabCaches(): Promise<void> {
  await Promise.all([
    clearTakeOutOrdersTabCache(),
    clearDineInOrdersTabCache(),
  ]);
}
