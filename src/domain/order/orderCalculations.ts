import { DiscountType } from "@/types/enums";

export const orderItemsSubtotal = (items: OrderItem[] | undefined): number => {
  return (items ?? []).reduce((acc, i) => acc + i.price * i.quantity, 0);
};

export const orderPaidFromLineItems = (items: OrderItem[] | undefined): boolean => {
  const list = items ?? [];
  return list.length > 0 && list.every((it) => it.paid === true);
};

/*
 * Money math follows the cash register (cash-register/lib/tax.ts): amounts are worked
 * in integer cents, rates in basis points (6% = 600), and each tax is rounded half up
 * to the cent — so PST + GST + taxable subtotal always adds up to the total shown.
 */

/** Dollars → integer cents (prices are already cent values; this only drops float noise). */
const toCents = (dollars: number): number => Math.round(dollars * 100);
const toDollars = (cents: number): number => cents / 100;

/** round_half_up(cents × rateBps / 10000) for non-negative integer cents. */
const percentOfCents = (cents: number, rateBps: number): number =>
  Math.floor((cents * rateBps + 5000) / 10000);

const PST_BPS = 600;
const GST_BPS = 500;

const discountCents = (
  subtotalCents: number,
  discountType?: DiscountType,
  discountValue?: number,
): number => {
  if (subtotalCents <= 0) return 0;
  const type = discountType ?? DiscountType.None;
  const value = Math.max(0, discountValue ?? 0);
  if (type === DiscountType.Amount) return Math.min(subtotalCents, toCents(value));
  if (type === DiscountType.Percent)
    return percentOfCents(subtotalCents, Math.round(Math.min(100, value) * 100));
  return 0;
};

export const calculateDiscountAmount = (
  itemsSubtotal: number,
  discountType?: DiscountType,
  discountValue?: number,
): number => toDollars(discountCents(toCents(itemsSubtotal), discountType, discountValue));

export const EMPTY_TAX_BREAKDOWN: TaxBreakDown = {
  subTotal: 0,
  taxableSubtotal: 0,
  pst: 0,
  gst: 0,
  total: 0,
};

/**
 * Staff discount comes off the subtotal first, then the rewards redemption comes off
 * what's left (capped so the order never goes below $0). Tax is on what remains.
 * `rewards.amount` is the redeemed dollars; the result's `rewards.amount` is what was
 * actually taken off.
 */
export const calculateTaxBreakdown = (
  itemsSubtotal: number,
  discountType: DiscountType = DiscountType.None,
  discountValue = 0,
  rewards?: RewardsRedemption | null,
): TaxBreakDown => {
  const subtotalCents = toCents(itemsSubtotal);
  if (subtotalCents <= 0) return { ...EMPTY_TAX_BREAKDOWN };
  const discCents = discountCents(subtotalCents, discountType, discountValue);
  const afterDiscountCents = Math.max(0, subtotalCents - discCents);
  const rewardsCents = rewards
    ? Math.min(afterDiscountCents, toCents(Math.max(0, rewards.amount)))
    : 0;
  const taxableCents = afterDiscountCents - rewardsCents;
  const pstCents = percentOfCents(taxableCents, PST_BPS);
  const gstCents = percentOfCents(taxableCents, GST_BPS);

  const discountAmount = toDollars(discCents);
  const rewardsAmount = toDollars(rewardsCents);
  const taxableSubtotal = toDollars(taxableCents);
  const pst = toDollars(pstCents);
  const gst = toDollars(gstCents);
  return {
    subTotal: toDollars(subtotalCents),
    ...(discountType !== DiscountType.None && discountAmount > 0
      ? { discount: { discountType, discountValue, discountAmount } }
      : {}),
    ...(rewards && rewardsAmount > 0
      ? { rewards: { points: rewards.points, amount: rewardsAmount } }
      : {}),
    taxableSubtotal,
    pst,
    gst,
    total: toDollars(taxableCents + pstCents + gstCents),
  };
};

/** What's left after the staff discount — the most a rewards redemption can take off. */
export const amountAfterDiscount = (taxBreakDown: TaxBreakDown | undefined): number =>
  Math.max(0, (taxBreakDown?.subTotal ?? 0) - (taxBreakDown?.discount?.discountAmount ?? 0));

export const resolveTaxBreakdown = (order: Partial<Order>): TaxBreakDown | undefined => {
  if (order.taxBreakDown) return order.taxBreakDown;
  const itemsSubtotal = orderItemsSubtotal(order.orderItems);
  return itemsSubtotal > 0 ? calculateTaxBreakdown(itemsSubtotal, DiscountType.None, 0) : undefined;
};

export const orderSubtotal = (order?: Partial<Order> | null): number => {
  if (!order) return 0;
  if (order.taxBreakDown?.subTotal != null) return order.taxBreakDown.subTotal;
  return orderItemsSubtotal(order.orderItems);
};
