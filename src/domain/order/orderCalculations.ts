import { DiscountType } from "@/types/enums";

export const orderItemsSubtotal = (items: OrderItem[] | undefined): number => {
  return (items ?? []).reduce((acc, i) => acc + i.price * i.quantity, 0);
};

export const orderPaidFromLineItems = (items: OrderItem[] | undefined): boolean => {
  const list = items ?? [];
  return list.length > 0 && list.every((it) => it.paid === true);
};

export const calculateDiscountAmount = (
  itemsSubtotal: number,
  discountType?: DiscountType,
  discountValue?: number,
): number => {
  if (itemsSubtotal <= 0) return 0;
  const type = discountType ?? DiscountType.None;
  const value = discountValue ?? 0;
  if (type === DiscountType.Amount) return Math.min(itemsSubtotal, Math.max(0, value));
  if (type === DiscountType.Percent) return (itemsSubtotal * Math.min(100, Math.max(0, value))) / 100;
  return 0;
};

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
  if (itemsSubtotal <= 0) return { ...EMPTY_TAX_BREAKDOWN };
  const discountAmount = calculateDiscountAmount(itemsSubtotal, discountType, discountValue);
  const afterDiscount = Math.max(0, itemsSubtotal - discountAmount);
  const rewardsAmount = rewards ? Math.min(afterDiscount, Math.max(0, rewards.amount)) : 0;
  const taxableSubtotal = afterDiscount - rewardsAmount;
  const pst = taxableSubtotal * 0.06;
  const gst = taxableSubtotal * 0.05;
  return {
    subTotal: itemsSubtotal,
    ...(discountType !== DiscountType.None && discountAmount > 0
      ? { discount: { discountType, discountValue, discountAmount } }
      : {}),
    ...(rewards && rewardsAmount > 0
      ? { rewards: { points: rewards.points, amount: rewardsAmount } }
      : {}),
    taxableSubtotal,
    pst,
    gst,
    total: taxableSubtotal + pst + gst,
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
