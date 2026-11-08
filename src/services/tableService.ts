import { bizDoc } from "@/lib/business";
import { firebase } from "@/lib/firebaseConfig";
import { TableStatus } from "@/types/enums";
import { runTransaction } from "firebase/firestore";

/**
 * Updates a table's guests/status, and the guests field on its attached order (if any).
 * Transactional so a stale client (e.g. one that hasn't caught up to another device
 * having just started an order on this table) can't blindly stomp real state — the
 * write only proceeds if `currentOrderId` still matches what the caller expected when
 * the edit form was opened. On mismatch, the caller gets the live table back instead
 * so it can reconcile its UI to reality rather than silently overwriting it.
 */
export async function updateTableGuestsAndStatus(
  tableDocId: string,
  expectedCurrentOrderId: string | null,
  data: { guests: number; status: TableStatus },
): Promise<{ conflict: boolean; liveTable?: Table }> {
  const tableRef = bizDoc("tables", tableDocId);

  return runTransaction(firebase.db, async (tx) => {
    const snap = await tx.get(tableRef);
    if (!snap.exists()) throw new Error("Table not found. Refresh and try again.");
    const liveTable = { ...(snap.data() as Table), id: snap.id };

    if (liveTable.currentOrderId !== expectedCurrentOrderId) {
      return { conflict: true, liveTable };
    }

    tx.update(tableRef, data);
    if (liveTable.currentOrderId) {
      tx.update(bizDoc("dineInOrders", liveTable.currentOrderId), {
        guests: data.guests,
      });
    }

    return { conflict: false };
  });
}

export async function changeDineInOrderTable(
  orderId: string,
  fromTableNumber: string,
  toTableNumber: string,
  getTableDocId: (tableNumber: string) => string | undefined,
): Promise<void> {
  if (fromTableNumber === toTableNumber) throw new Error("Select a different table.");

  const orderRef = bizDoc("dineInOrders", orderId);

  // Transaction, not a batch: the destination table must be re-checked as still free
  // at commit time — otherwise a device that just claimed it with a brand-new order
  // (via submitOrder's transaction) in the gap between our read and our write gets
  // silently overwritten here.
  await runTransaction(firebase.db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found.");

    const orderData = orderSnap.data() as { tableNumber?: string; guests?: number };
    const actualFrom = orderData.tableNumber;
    if (!actualFrom) throw new Error("Order has no table.");

    const rawGuests = Math.floor(Number(orderData.guests ?? 0));
    const g = rawGuests >= 1 ? rawGuests : 1;

    const fromDocId = getTableDocId(actualFrom);
    const toDocId = getTableDocId(toTableNumber);
    if (!fromDocId || !toDocId) {
      throw new Error("Cannot find table in app. Open the Tables tab to sync, then try again.");
    }

    const oldTableRef = bizDoc("tables", fromDocId);
    const newTableRef = bizDoc("tables", toDocId);

    const [oldTableSnap, newTableSnap] = await Promise.all([
      tx.get(oldTableRef),
      tx.get(newTableRef),
    ]);

    if (!oldTableSnap.exists() || !newTableSnap.exists()) throw new Error("Table not found.");

    const oldT = { ...(oldTableSnap.data() as Table), id: oldTableSnap.id };
    const newT = { ...(newTableSnap.data() as Table), id: newTableSnap.id };

    if (oldT.currentOrderId !== orderId) {
      throw new Error("This order is no longer on the original table. Go back and refresh.");
    }
    if (newT.status !== TableStatus.Open || newT.currentOrderId) {
      throw new Error("That table is not available. Choose another.");
    }

    tx.update(oldTableRef, { status: TableStatus.Open, currentOrderId: null, guests: 0 });
    tx.update(newTableRef, { status: TableStatus.Occupied, currentOrderId: orderId, guests: g });
    tx.update(orderRef, { tableNumber: toTableNumber, guests: g });
  });
}
