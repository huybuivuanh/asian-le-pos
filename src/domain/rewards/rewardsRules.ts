import { DiscountType, OrderStatus } from "@/types/enums";

// Rewards rules (pure). The server functions are the source of truth;
// these are for showing staff what will happen before they press a button.

/** 1 point per $1 of pre-tax subtotal, after any discount/redemption. */
export const POINTS_PER_DOLLAR = 1;

/** Redemption step: 100 points = $5 off. */
export const POINTS_PER_REDEEM_STEP = 100;
export const DOLLARS_PER_REDEEM_STEP = 5;
/** Most steps in one redemption (server limit). */
export const MAX_REDEEM_STEPS = 20;

/** Points a pre-tax amount earns (whole points, rounded down). */
export const pointsForAmount = (amount: number): number =>
  amount > 0 ? Math.floor(amount * POINTS_PER_DOLLAR) : 0;

/** Pre-tax amount the order earns on: subtotal after any discount/redemption. */
export const orderEarnableAmount = (order: Pick<Order, "taxBreakDown">): number =>
  order.taxBreakDown?.discount?.taxableSubtotal ?? order.taxBreakDown?.subTotal ?? 0;

// The Rewards server allows one earn, redeem and reverse per order, so once an
// order's points are reversed, rewards can't be used on it again (even if the
// cancel is undone).
const REVERSED_MESSAGE = "Rewards were reversed when this order was cancelled.";

/**
 * Why rewards can't be used on this order at all, or null if they can.
 * Cancelled orders can't collect or redeem. (Completed orders can still
 * collect; redeem needs an open order — see redeemBlockedReason.)
 */
export const rewardsClosedReason = (status: OrderStatus | undefined): string | null =>
  status === OrderStatus.Cancelled
    ? "This order was cancelled, so points can't be collected or redeemed."
    : null;

// Online orders whose held points haven't been taken or released yet.
const OPEN_ONLINE_STATUSES: readonly OnlineOrder["status"][] = ["New", "InProgress", "ReadyForPickup"];

/**
 * Points a member used on open online orders that haven't been taken from their balance
 * yet (the Orders app takes them on Complete). Subtract from the balance before
 * redeeming here, so the same points can't be used twice. Same rule as the website.
 */
export const pendingOnlineRedeemPoints = (
  memberId: string,
  onlineOrders: readonly OnlineOrder[],
): number =>
  onlineOrders.reduce((sum, o) => {
    const l = o.loyalty;
    if (!l || l.memberId !== memberId || !OPEN_ONLINE_STATUSES.includes(o.status)) return sum;
    if (l.pointsRedeemed != null || !l.pointsToRedeem || l.pointsToRedeem <= 0) return sum;
    return sum + l.pointsToRedeem;
  }, 0);

/** True when the order's redemption is still in effect (not reversed). */
export const hasActiveRedemption = (loyalty: OrderLoyalty | undefined | null): boolean =>
  Boolean(loyalty?.redeemedAmount && !loyalty.reversedAt);

/**
 * Why Redeem is unavailable for this order, or null if it's allowed.
 * `memberPoints` is the member's balance.
 */
export const redeemBlockedReason = (
  order: Pick<Order, "status" | "taxBreakDown" | "loyalty">,
  memberPoints: number,
): string | null => {
  const closed = rewardsClosedReason(order.status);
  if (closed) return closed;
  if (order.status !== OrderStatus.InProgress) return "Only open orders can redeem.";
  if (order.loyalty?.reversedAt) return REVERSED_MESSAGE;
  if (order.loyalty?.pointsRedeemed) return "Points were already redeemed on this order.";
  if (order.loyalty?.pointsEarned != null) return "Points were already collected — redeem before collecting.";
  const d = order.taxBreakDown?.discount;
  if (d && d.discountType !== DiscountType.None) return "This order already has a discount.";
  if (memberPoints < POINTS_PER_REDEEM_STEP) return `Needs at least ${POINTS_PER_REDEEM_STEP} points.`;
  if ((order.taxBreakDown?.subTotal ?? 0) < DOLLARS_PER_REDEEM_STEP) return "Order is too small to redeem.";
  return null;
};

/** Why Collect is unavailable for this order, or null if it's allowed. */
export const collectBlockedReason = (
  order: Pick<Order, "status" | "taxBreakDown" | "loyalty">,
): string | null => {
  const closed = rewardsClosedReason(order.status);
  if (closed) return closed;
  if (order.loyalty?.reversedAt) return REVERSED_MESSAGE;
  if (order.loyalty?.pointsEarned != null) {
    return `${order.loyalty.pointsEarned} points were already collected for this order.`;
  }
  if (pointsForAmount(orderEarnableAmount(order)) <= 0) return "Nothing to collect on this order.";
  return null;
};

/**
 * Most $5 steps the member can redeem on this order: limited by their
 * balance and by the order's subtotal (a redemption never goes below $0).
 */
export const maxRedeemSteps = (balance: number, subtotal: number): number =>
  Math.max(
    0,
    Math.min(
      MAX_REDEEM_STEPS,
      Math.floor(balance / POINTS_PER_REDEEM_STEP),
      Math.floor(subtotal / DOLLARS_PER_REDEEM_STEP),
    ),
  );

/**
 * A rewards redemption fixes the order's discount: Amount = redeemed dollars.
 * Returns the discount inputs to force when saving, or null if the order has no redemption.
 */
export const redemptionDiscountInputs = (
  loyalty: OrderLoyalty | undefined | null,
): { type: DiscountType; value: number } | null =>
  hasActiveRedemption(loyalty)
    ? { type: DiscountType.Amount, value: loyalty!.redeemedAmount! }
    : null;
