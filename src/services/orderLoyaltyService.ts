// Saves rewards results onto the POS order (POS Firestore). The rewards
// function runs first; these writes record what it confirmed.
import { bizDoc } from "@/lib/business";
import { firebase } from "@/lib/firebaseConfig";
import {
  reverseOrder,
  type EarnPointsResult,
  type RedeemPointsResult,
  type RewardsMember,
} from "@/services/rewardsService";
import { DiscountType, OrderType } from "@/types/enums";
import { calculateTaxBreakdown, orderItemsSubtotal } from "@/utils/helpers";
import { getDoc, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";

export const orderCollection = (orderType: OrderType) =>
  orderType === OrderType.DineIn ? "dineInOrders" : "takeOutOrders";

/** Applies a redemption as the order's Amount discount and links the member. */
export async function applyRedemptionToOrder(
  orderType: OrderType,
  orderId: string,
  member: RewardsMember,
  result: RedeemPointsResult,
): Promise<void> {
  const ref = bizDoc(orderCollection(orderType), orderId);
  await runTransaction(firebase.db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data() as AnyOrder;

    // Already saved (retry after a slow response): nothing to do.
    if (order.loyalty?.pointsRedeemed) return;

    const existing = order.taxBreakDown?.discount;
    if (existing && existing.discountType !== DiscountType.None) {
      throw new Error(
        "A discount was added to this order meanwhile. Points were redeemed but not applied — remove the discount and press Redeem again.",
      );
    }

    tx.update(ref, {
      taxBreakDown: calculateTaxBreakdown(
        orderItemsSubtotal(order.orderItems),
        DiscountType.Amount,
        result.discountAmount,
      ),
      "loyalty.memberId": member.memberId,
      "loyalty.memberName": member.name,
      "loyalty.pointsRedeemed": result.pointsRedeemed,
      "loyalty.redeemedAmount": result.discountAmount,
    });
  });
}

/** Records collected points on the order and links the member. */
export async function markPointsCollected(
  orderType: OrderType,
  orderId: string,
  member: RewardsMember,
  result: EarnPointsResult,
): Promise<void> {
  const ref = bizDoc(orderCollection(orderType), orderId);
  await runTransaction(firebase.db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Order not found.");
    tx.update(ref, {
      "loyalty.memberId": member.memberId,
      "loyalty.memberName": member.name,
      "loyalty.pointsEarned": result.pointsEarned,
      "loyalty.collectedAt": serverTimestamp(),
    });
  });
}

const REVERSE_TIMEOUT_MS = 10_000;

/**
 * After an order is cancelled: gives back redeemed points and removes earned points.
 * Never throws — the order is already cancelled. Returns a staff-facing warning if
 * points could not be reversed (the order is marked `loyalty.reversePending`).
 */
export async function reverseCancelledOrderRewards(
  orderType: OrderType,
  orderId: string,
): Promise<string | null> {
  const ref = bizDoc(orderCollection(orderType), orderId);
  let loyalty: OrderLoyalty | undefined;
  try {
    // Read fresh: points may have been collected on another device moments ago.
    loyalty = ((await getDoc(ref)).data() as AnyOrder | undefined)?.loyalty;
  } catch {
    return null;
  }
  if (!loyalty?.memberId || loyalty.reversedAt) return null;
  if (loyalty.pointsEarned == null && !loyalty.pointsRedeemed) return null;

  try {
    const result = await Promise.race([
      reverseOrder(loyalty.memberId, orderId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("No response from Rewards.")), REVERSE_TIMEOUT_MS),
      ),
    ]);
    const reversedFields = {
      "loyalty.reversedAt": serverTimestamp(),
      "loyalty.pointsReversed": result.pointsChanged,
      "loyalty.reversePending": false,
    };
    try {
      await runTransaction(firebase.db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const order = snap.data() as AnyOrder;
        // The redeemed points went back to the member, so the rewards discount
        // goes too — otherwise un-cancelling would keep a free discount.
        const d = order.taxBreakDown?.discount;
        const isRedemptionDiscount =
          Boolean(loyalty?.redeemedAmount) &&
          d?.discountType === DiscountType.Amount &&
          d.discountValue === loyalty?.redeemedAmount;
        tx.update(ref, {
          ...reversedFields,
          ...(isRedemptionDiscount
            ? {
                taxBreakDown: calculateTaxBreakdown(
                  orderItemsSubtotal(order.orderItems),
                  DiscountType.None,
                  0,
                ),
              }
            : {}),
        });
      });
    } catch {
      // Offline etc.: at least record the reverse so rewards stay blocked on this order.
      await updateDoc(ref, reversedFields).catch(() => {});
    }
    return null;
  } catch (err) {
    await updateDoc(ref, { "loyalty.reversePending": true }).catch(() => {});
    const reason = err instanceof Error ? err.message : "Rewards request failed.";
    return `The order was cancelled, but ${loyalty.memberName}'s rewards points were not reversed. ${reason}`;
  }
}
