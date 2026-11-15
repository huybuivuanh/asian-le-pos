import { OrderType, TakeOutFulfillmentKind } from "@/types/enums";
import dayjs from "dayjs";
import { collection, doc, Timestamp } from "firebase/firestore";
import { Alert, Platform } from "react-native";
import { firebase } from "../lib/firebaseConfig";

// Re-export domain calculations so existing imports keep working
export {
  amountAfterDiscount,
  calculateDiscountAmount,
  calculateTaxBreakdown,
  EMPTY_TAX_BREAKDOWN,
  orderItemsSubtotal,
  orderPaidFromLineItems,
  orderSubtotal,
  resolveTaxBreakdown,
} from "@/domain/order/orderCalculations";
import { resolveTaxBreakdown } from "@/domain/order/orderCalculations";

export const formatDate = (timestamp: Timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1_000_000);
  return dayjs(date).format("DD MMM YYYY, hh:mm A");
};

export const formatTimeOnly = (timestamp: Timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1_000_000);
  return dayjs(date).format("hh:mm A");
};

export const formatPhone = (phone: string) => {
  phone = phone.replace(/\D/g, "");
  if (phone.length > 7) {
    return phone.slice(0, -7) + " " + phone.slice(-7, -4) + "-" + phone.slice(-4);
  } else {
    return phone.slice(0, -4) + "-" + phone.slice(-4);
  }
};

export const timestampToDate = (timestamp: Timestamp | Date | undefined): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate) return timestamp.toDate();
  if (typeof timestamp === "object" && "seconds" in timestamp) {
    return new Date((timestamp as any).seconds * 1000 + ((timestamp as any).nanoseconds || 0) / 1_000_000);
  }
  return undefined;
};

export const takeoutFulfillmentIsScheduled = (order: {
  orderType?: OrderType;
  fulfillment?: TakeOutFulfillment;
}): boolean => {
  if (order.orderType !== OrderType.TakeOut) return false;
  return order.fulfillment?.kind === TakeOutFulfillmentKind.Scheduled;
};

export const takeoutScheduledAt = (order: {
  orderType?: OrderType;
  fulfillment?: TakeOutFulfillment;
}): Timestamp | undefined => {
  if (order.orderType !== OrderType.TakeOut) return undefined;
  const f = order.fulfillment;
  if (f?.kind === "scheduled") return f.scheduledAt;
  return undefined;
};

export const convertOrderTimestamps = (order: Partial<AnyOrder>): Partial<AnyOrder> => ({
  ...order,
  taxBreakDown: resolveTaxBreakdown(order),
  createdAt: order.createdAt,
});

export const generateFirestoreId = () => doc(collection(firebase.db, "dummy")).id;

export const sortTables = (tables: Table[]): Table[] =>
  [...tables].sort((a, b) => parseInt(a.tableNumber, 10) - parseInt(b.tableNumber, 10));

export const isTakeOutOrder = (o: AnyOrder): o is TakeOutOrder => o.orderType === OrderType.TakeOut;

export const isDineInOrder = (o: AnyOrder): o is DineInOrder => o.orderType === OrderType.DineIn;

export const sortOrdersByDate = <T extends Order>(orders: T[]): T[] =>
  [...orders].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

export const showAlert = (title: string, message?: string) => {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    if (message) Alert.alert(title, message);
    else Alert.alert(title);
  }
};

export const confirmAlert = (title: string, message?: string): Promise<boolean> => {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message ?? "", [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
};
