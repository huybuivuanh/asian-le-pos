import { bizDoc } from "@/lib/business";
import { firebase } from "@/lib/firebaseConfig";
import { DiscountType, OrderStatus, OrderType, TableStatus } from "@/types/enums";
import { kitchenTypeSortRank } from "@/features/order/orderItemSections";
import { ungroupOrderItems } from "@/utils/groupOrderItems";
import { redemptionDiscountInputs } from "@/domain/rewards/rewardsRules";
import { calculateTaxBreakdown, orderItemsSubtotal } from "@/utils/helpers";
import { normalizeOrderItemTextForDb } from "@/utils/normalizeOrderItemText";
import { runTransaction, setDoc, Timestamp, writeBatch } from "firebase/firestore";

function discountInputs(order: OrderDraft): { type: DiscountType; value: number } {
  const d = order.taxBreakDown?.discount;
  return { type: d?.discountType ?? DiscountType.None, value: d?.discountValue ?? 0 };
}

function sortOrderItems(items: OrderItem[]): OrderItem[] {
  return [...items].sort((a, b) => {
    const ra = kitchenTypeSortRank(a.kitchenType);
    const rb = kitchenTypeSortRank(b.kitchenType);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

export async function submitOrder(
  order: OrderDraft,
  tableDocId?: string,
): Promise<{ merged: boolean }> {
  if (!order.id) throw new Error("Cannot submit order without ID.");
  if (!order.orderItems || order.orderItems.length === 0) throw new Error("Cannot submit empty order.");

  if (order.orderType === OrderType.TakeOut) {
    if (!order.customerName?.trim() && !order.phoneNumber?.trim()) throw new Error("Missing customer info.");
    if (!order.fulfillment) throw new Error("Missing fulfillment.");
  }

  const { type, value } = discountInputs(order);
  const taxBreakDown = calculateTaxBreakdown(orderItemsSubtotal(order.orderItems), type, value);

  const rawItems = ungroupOrderItems(order.orderItems ?? []);
  const normalizedItems = sortOrderItems(rawItems).map(normalizeOrderItemTextForDb);

  const payload: Record<string, unknown> = {
    id: order.id,
    orderType: order.orderType,
    orderItems: normalizedItems,
    taxBreakDown,
    status: OrderStatus.InProgress,
    paid: false,
    printed: false,
    createdAt: Timestamp.fromDate(new Date()),
    staff: order.staff,
  };

  if (order.orderType === OrderType.TakeOut) {
    payload.customerName = order.customerName?.trim().toUpperCase() ?? null;
    payload.phoneNumber = order.phoneNumber ?? null;
    payload.fulfillment = order.fulfillment;

    await setDoc(bizDoc("takeOutOrders", order.id), payload);
    return { merged: false };
  }

  payload.tableNumber = order.tableNumber;
  payload.guests = order.guests;

  if (!tableDocId) {
    throw new Error("Cannot find table in app. Open the Tables tab to sync, then try again.");
  }

  const orderRef = bizDoc("dineInOrders", order.id);
  const tableRef = bizDoc("tables", tableDocId);

  // Transaction, not a batch: the table's currentOrderId must be read fresh from
  // the server at commit time, not from the client's possibly-stale local cache.
  // If another device already attached an order to this table in the meantime,
  // merge this draft's items into that existing order instead of overwriting it —
  // the staff member submitting still has real items to add, they just weren't
  // the first to claim the table.
  return await runTransaction(firebase.db, async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) throw new Error("Table not found. Refresh and try again.");
    const existingOrderId = (tableSnap.data() as Table).currentOrderId;

    if (existingOrderId) {
      const existingOrderRef = bizDoc("dineInOrders", existingOrderId);
      const existingSnap = await tx.get(existingOrderRef);

      if (existingSnap.exists()) {
        const existingOrder = existingSnap.data() as DineInOrder;
        const mergedItems = sortOrderItems([
          ...(existingOrder.orderItems ?? []),
          ...normalizedItems,
        ]);
        const existingDiscount = existingOrder.taxBreakDown?.discount;
        const mergedTaxBreakDown = calculateTaxBreakdown(
          orderItemsSubtotal(mergedItems),
          existingDiscount?.discountType ?? DiscountType.None,
          existingDiscount?.discountValue ?? 0,
        );
        tx.update(existingOrderRef, {
          orderItems: mergedItems,
          taxBreakDown: mergedTaxBreakDown,
        });
        return { merged: true };
      }
      // Table pointed at an order that no longer exists (e.g. deleted) — treat as free.
    }

    tx.set(orderRef, payload);
    tx.update(tableRef, { status: TableStatus.Occupied, currentOrderId: order.id });
    return { merged: false };
  });
}

export async function updateOrder(order: OrderDraft): Promise<void> {
  if (!order.id) throw new Error("Cannot update order without ID.");

  const firestoreCollection = order.orderType === OrderType.DineIn ? "dineInOrders" : "takeOutOrders";
  // A rewards redemption is the order's discount, whatever the cart's discount says.
  const { type, value } = redemptionDiscountInputs(order.loyalty) ?? discountInputs(order);
  const taxBreakDown = calculateTaxBreakdown(orderItemsSubtotal(order.orderItems), type, value);

  const rawItems = ungroupOrderItems(order.orderItems ?? []).sort((a, b) => {
    const ra = kitchenTypeSortRank(a.kitchenType);
    const rb = kitchenTypeSortRank(b.kitchenType);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  const cleanItems = rawItems.map((item) =>
    normalizeOrderItemTextForDb({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      togo: item.togo,
      appetizer: item.appetizer,
      kitchenType: item.kitchenType,
      paid: item.paid,
      completed: item.completed,
      options: item.options ?? [],
      extras: item.extras ?? [],
      changes: item.changes ?? [],
      ...(item.instructions && { instructions: item.instructions }),
    }),
  );

  const updateData: Record<string, unknown> = {
    id: order.id,
    orderType: order.orderType,
    orderItems: cleanItems,
    taxBreakDown,
    status: order.status,
    printed: order.printed ?? false,
    staff: order.staff,
    ...(order.createdAt && { createdAt: order.createdAt }),
  };

  if (order.orderType === OrderType.TakeOut) {
    if (order.customerName) updateData.customerName = order.customerName.trim().toUpperCase();
    if (order.phoneNumber) updateData.phoneNumber = order.phoneNumber;
    if (order.fulfillment) updateData.fulfillment = order.fulfillment;
  } else {
    if (order.tableNumber !== undefined) updateData.tableNumber = order.tableNumber;
    if (order.guests !== undefined) updateData.guests = order.guests;
  }

  const batch = writeBatch(firebase.db);
  batch.update(bizDoc(firestoreCollection, order.id), updateData);
  await batch.commit();
}

export async function cancelOrder(order: OrderDraft, tableDocId?: string | null): Promise<void> {
  if (!order.id) throw new Error("Order ID is required to cancel.");

  const firestoreCollection = order.orderType === OrderType.DineIn ? "dineInOrders" : "takeOutOrders";

  const nextStatus =
    order.status === OrderStatus.Cancelled ? OrderStatus.InProgress : OrderStatus.Cancelled;

  const batch = writeBatch(firebase.db);
  batch.update(bizDoc(firestoreCollection, order.id), { status: nextStatus });

  if (order.orderType === OrderType.DineIn && tableDocId && nextStatus === OrderStatus.Cancelled) {
    batch.update(bizDoc("tables", tableDocId), {
      status: TableStatus.Open,
      currentOrderId: null,
      guests: 0,
    });
  }

  await batch.commit();
}

export async function completeOrder(order: OrderDraft, tableDocId?: string | null): Promise<void> {
  if (!order.id) throw new Error("Order ID is required to complete.");

  const firestoreCollection = order.orderType === OrderType.DineIn ? "dineInOrders" : "takeOutOrders";

  const nextStatus =
    order.status === OrderStatus.Cancelled
      ? OrderStatus.Completed
      : order.status === OrderStatus.Completed
        ? OrderStatus.InProgress
        : OrderStatus.Completed;

  const batch = writeBatch(firebase.db);
  batch.update(bizDoc(firestoreCollection, order.id), { status: nextStatus });

  if (order.orderType === OrderType.DineIn && tableDocId && nextStatus === OrderStatus.Completed) {
    batch.update(bizDoc("tables", tableDocId), {
      status: TableStatus.Open,
      currentOrderId: null,
      guests: 0,
    });
  }

  await batch.commit();
}

/** Writes an already-mutated orderItems array to Firestore (used by paid-toggle debounce). */
export async function updateLineItemsPaid(orderId: string, items: OrderItem[]): Promise<void> {
  const batch = writeBatch(firebase.db);
  batch.update(bizDoc("dineInOrders", orderId), { orderItems: items });
  await batch.commit();
}

export async function markPaid(order: OrderDraft, paid: boolean): Promise<void> {
  if (!order.id) throw new Error("Order ID is required to mark as paid.");

  const firestoreCollection = order.orderType === OrderType.DineIn ? "dineInOrders" : "takeOutOrders";
  const nextItems = (order.orderItems ?? []).map((it) => ({ ...it, paid }));
  const batch = writeBatch(firebase.db);
  batch.update(bizDoc(firestoreCollection, order.id), { orderItems: nextItems });
  await batch.commit();
}
