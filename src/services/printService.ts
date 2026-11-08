import { bizDoc } from "@/lib/business";
import { DiscountType } from "@/types/enums";
import { calculateTaxBreakdown, generateFirestoreId } from "@/utils/helpers";
import { setDoc, Timestamp } from "firebase/firestore";

export async function submitToPrintQueue(order: OrderDraft): Promise<void> {
  if (!order.id) throw new Error("Order ID is required to print.");

  await setDoc(
    bizDoc("printQueue", order.id),
    {
      ...order,
      orderItems: order.orderItems ?? [],
      id: order.id,
      printed: false,
      createdAt: Timestamp.now(),
    } as Record<string, unknown>,
    { merge: true },
  );
}

export async function submitSelectedItemsToPrintQueue(
  order: OrderDraft,
  selectedItemIds: string[],
): Promise<void> {
  if (!order.id) throw new Error("Order ID is required to print.");
  if (selectedItemIds.length === 0) throw new Error("At least one item must be selected.");

  const selectedItems =
    order.orderItems?.filter((item) => item.id && selectedItemIds.includes(item.id)) ?? [];

  const selectedSubtotal = selectedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const selectedTaxBreakDown = calculateTaxBreakdown(selectedSubtotal, DiscountType.None, 0);

  const queueDocId = generateFirestoreId();
  await setDoc(bizDoc("printQueue", queueDocId), {
    ...order,
    orderItems: selectedItems,
    taxBreakDown: selectedTaxBreakDown,
    id: queueDocId,
    printed: false,
    createdAt: Timestamp.now(),
  } as Record<string, unknown>);
}

/**
 * Asks the print server to pop the cash drawer.
 * Uses the device clock (not serverTimestamp) on purpose: if this write is
 * queued while offline, it arrives with an old time and the print server
 * skips it instead of opening the drawer late.
 */
export async function openCashDrawer(): Promise<void> {
  await setDoc(bizDoc("cashDrawer", "main"), {
    openDrawer: true,
    requestedAt: Timestamp.now(),
  });
}
