import { bizDoc } from "@/lib/business";
import { firebase } from "@/lib/firebaseConfig";
import {
  DiscountType,
  OrderStatus,
  OrderType,
  TableStatus,
} from "@/types/enums";
import { redemptionDiscountInputs } from "@/domain/rewards/rewardsRules";
import { ungroupOrderItems } from "@/utils/groupOrderItems";
import { calculateTaxBreakdown, orderItemsSubtotal } from "@/utils/helpers";
import { normalizeOrderItemTextForDb } from "@/utils/normalizeOrderItemText";
import { runTransaction, Timestamp } from "firebase/firestore";

export async function convertDineInToTakeOut(
  args: {
    orderId: string;
    tableNumber: string;
    customerName?: string;
    phoneNumber?: string;
    fulfillment: TakeOutFulfillment;
  },
  draft: OrderDraft,
  tableDocId: string,
): Promise<void> {
  const { orderId, tableNumber, customerName, phoneNumber, fulfillment } = args;
  const name = customerName?.trim().toUpperCase() ?? "";
  const phone = phoneNumber?.trim() ?? "";
  if (!name && !phone)
    throw new Error("Enter a customer name or phone number.");

  if (draft.id !== orderId)
    throw new Error("Order was replaced in the editor. Go back and try again.");
  const orderItems = draft.orderItems ?? [];
  if (orderItems.length === 0)
    throw new Error("Cannot convert an empty order.");

  const orderRef = bizDoc("dineInOrders", orderId);
  const tableRef = bizDoc("tables", tableDocId);

  // Transaction, not a batch: the table's currentOrderId must be re-checked at commit
  // time, not from a plain read taken before the batch commits — otherwise a device
  // that just claimed this table with a brand-new order (via submitOrder's transaction)
  // in the gap between our read and our write gets silently overwritten here.
  await runTransaction(firebase.db, async (tx) => {
    const [orderSnap, tableSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(tableRef),
    ]);
    if (!orderSnap.exists()) throw new Error("Dine-in order not found.");
    if (!tableSnap.exists()) throw new Error("Table not found.");

    const data = orderSnap.data() as Record<string, unknown> & {
      orderType?: string;
      tableNumber?: string;
      status?: OrderStatus;
      staff?: string;
      orderItems?: OrderItem[];
      taxBreakDown?: TaxBreakDown;
      paid?: boolean;
      printed?: boolean;
      createdAt?: Timestamp;
    };

    if (data.orderType !== OrderType.DineIn)
      throw new Error("This order is not dine-in.");
    if (data.status !== OrderStatus.InProgress)
      throw new Error("Only in-progress orders can be converted.");
    if (data.tableNumber !== tableNumber)
      throw new Error("Order is not on this table.");

    const tableData: Table = {
      ...(tableSnap.data() as Table),
      id: tableSnap.id,
    };
    if (tableData.currentOrderId !== orderId)
      throw new Error("This order is no longer on this table.");

    // A rewards redemption stays the order's discount (see redemptionDiscountInputs).
    const d = draft.taxBreakDown?.discount;
    const locked = redemptionDiscountInputs(data.loyalty as OrderLoyalty | undefined);
    const taxBreakDown = calculateTaxBreakdown(
      orderItemsSubtotal(orderItems),
      locked?.type ?? d?.discountType ?? DiscountType.None,
      locked ? locked.value : (d?.discountValue ?? 0),
    );

    const cleanItems = orderItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      togo: false,
      appetizer: false,
      kitchenType: item.kitchenType,
      paid: item.paid,
      completed: item.completed,
      options: item.options ?? [],
      extras: item.extras ?? [],
      changes: item.changes ?? [],
      ...(item.instructions && { instructions: item.instructions }),
    })) as OrderItem[];

    const takeOutPayload: Record<string, unknown> = {
      id: orderId,
      orderType: OrderType.TakeOut,
      staff: data.staff ?? "",
      orderItems: cleanItems.map(normalizeOrderItemTextForDb),
      taxBreakDown,
      status: OrderStatus.InProgress,
      printed: data.printed ?? false,
      createdAt: data.createdAt,
      customerName: name || null,
      phoneNumber: phone || null,
      fulfillment,
      // Keep the rewards member (and collect/redeem state) with the order.
      ...(data.loyalty ? { loyalty: data.loyalty } : {}),
    };

    tx.delete(orderRef);
    tx.set(bizDoc("takeOutOrders", orderId), takeOutPayload);
    tx.update(tableRef, {
      status: TableStatus.Open,
      currentOrderId: null,
      guests: 0,
    });
  });
}

export async function convertTakeOutToDineIn(
  args: { orderId: string; tableNumber: string; guests: number },
  getTableDocId: (tableNumber: string) => string | undefined,
): Promise<void> {
  const { orderId, tableNumber, guests } = args;
  const g = Math.floor(Number(guests));
  if (!Number.isFinite(g) || g < 1)
    throw new Error("Enter at least one guest.");

  const tableDocId = getTableDocId(tableNumber);
  if (!tableDocId) {
    throw new Error(
      "Cannot find table in app. Open the Tables tab to sync, then try again.",
    );
  }

  const takeOutRef = bizDoc("takeOutOrders", orderId);
  const tableRef = bizDoc("tables", tableDocId);

  // Transaction, not a batch: the table must be re-checked as still free at commit
  // time — otherwise a device that just claimed this table with a brand-new order
  // (via submitOrder's transaction) in the gap between our read and our write gets
  // silently overwritten here.
  await runTransaction(firebase.db, async (tx) => {
    const [orderSnap, tableSnap] = await Promise.all([
      tx.get(takeOutRef),
      tx.get(tableRef),
    ]);
    if (!orderSnap.exists()) throw new Error("Take-out order not found.");
    if (!tableSnap.exists()) throw new Error("Table not found.");

    const data = orderSnap.data() as Record<string, unknown> & {
      orderType?: string;
      status?: OrderStatus;
      staff?: string;
      orderItems?: OrderItem[];
      taxBreakDown?: TaxBreakDown;
      paid?: boolean;
      printed?: boolean;
      createdAt?: Timestamp;
    };

    if (data.orderType !== OrderType.TakeOut)
      throw new Error("This order is not take-out.");
    if (data.status !== OrderStatus.InProgress)
      throw new Error("Only in-progress orders can be converted.");

    const tableData: Table = {
      ...(tableSnap.data() as Table),
      id: tableSnap.id,
    };
    if (tableData.status !== TableStatus.Open)
      throw new Error("That table is not available. Choose another.");
    if (tableData.currentOrderId)
      throw new Error("That table already has an order.");

    const orderItems = data.orderItems ?? [];
    if (orderItems.length === 0)
      throw new Error("Cannot convert an empty order.");

    const d = data.taxBreakDown?.discount;
    const taxBreakDown = calculateTaxBreakdown(
      orderItemsSubtotal(orderItems),
      d?.discountType ?? DiscountType.None,
      d?.discountValue ?? 0,
    );

    const cleanItems = ungroupOrderItems(orderItems).map((item) =>
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

    const dineInPayload: Record<string, unknown> = {
      id: orderId,
      orderType: OrderType.DineIn,
      staff: data.staff ?? "",
      orderItems: cleanItems,
      taxBreakDown,
      status: OrderStatus.InProgress,
      printed: data.printed ?? false,
      createdAt: data.createdAt,
      tableNumber,
      guests: g,
      // Keep the rewards member (and collect/redeem state) with the order.
      ...(data.loyalty ? { loyalty: data.loyalty } : {}),
    };

    tx.delete(takeOutRef);
    tx.set(bizDoc("dineInOrders", orderId), dineInPayload);
    tx.update(tableRef, {
      status: TableStatus.Occupied,
      currentOrderId: orderId,
      guests: g,
    });
  });
}
