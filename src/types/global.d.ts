import type { Timestamp } from "firebase/firestore";

export {};

declare global {
  interface FoodCategory {
    id?: string;
    name: string;
    itemIds?: string[];
    order: number;
    createdAt: Timestamp;
  }

  interface OptionGroupId {
    optionGroupId: string;
    order: number;
  }

  interface MenuItem {
    id?: string;
    name: string;
    price: number;
    optionGroupIds?: OptionGroupId[];
    categoryIds?: string[];
    kitchenType: KitchenType;
    createdAt: Timestamp;
  }

  interface OptionGroup {
    id?: string;
    name: string;
    minSelection: number;
    maxSelection: number;
    multipleOptionQuantity: boolean;
    optionIds?: string[];
    itemIds?: string[];
    defaultOptionId?: string;
    createdAt: Timestamp;
  }

  interface ItemOption {
    id?: string;
    name: string;
    price: number;
    groupIds?: string[];
    createdAt: Timestamp;
  }

  interface OrderItemOption {
    name: string;
    price: number;
    quantity: number;
  }

  interface OrderItem {
    id?: string;
    name: string;
    price: number;
    quantity: number;
    options?: OrderItemOption[];
    changes?: ItemChange[];
    extras?: AddExtra[];
    togo: boolean;
    appetizer: boolean;
    kitchenType: KitchenType;
    instructions?: string;
    paid: boolean;
    completed: boolean;
  }

  interface ItemChange {
    from: string;
    to: string;
    price: number;
  }

  interface AddExtra {
    description: string;
    price: number;
  }

  interface ExtraCatalogItem extends AddExtra {
    id?: string;
    createdAt: Timestamp;
  }

  interface Discount {
    discountType: DiscountType;
    discountValue: number;
    discountAmount: number;
    taxableSubtotal: number;
  }

  interface TaxBreakDown {
    subTotal: number;
    discount?: Discount;
    pst: number;
    gst: number;
    total: number;
  }

  type TakeOutFulfillment =
    | {
        kind: "immediate";
        readyTimeMinutes?: number;
      }
    | {
        kind: "scheduled";
        scheduledAt: Timestamp;
      };

  interface Order {
    id?: string;
    staff: string;
    orderType: OrderType;
    orderItems: OrderItem[];
    taxBreakDown: TaxBreakDown;
    status: OrderStatus;
    printed: boolean;
    createdAt: Timestamp;
    /** Rewards member attached to this order (set on first redeem or collect). */
    loyalty?: OrderLoyalty;
  }

  interface OrderLoyalty {
    memberId: string;
    memberName: string;
    /** Set when points are collected (once per order). */
    pointsEarned?: number;
    collectedAt?: Timestamp;
    /** Set when points are redeemed for an Amount discount. */
    pointsRedeemed?: number;
    redeemedAmount?: number;
    /** Set when the order was cancelled and its points were reversed. */
    reversedAt?: Timestamp;
    /** Net balance change from the reverse (refunded redeem minus removed earn). */
    pointsReversed?: number;
    /** Cancelled, but the reverse call failed — points still need reversing. */
    reversePending?: boolean;
  }

  interface TakeOutOrder extends Order {
    orderType: OrderType.TakeOut;
    customerName?: string;
    phoneNumber?: string;
    fulfillment: TakeOutFulfillment;
  }

  interface DineInOrder extends Order {
    orderType: OrderType.DineIn;
    tableNumber: string;
    guests: number;
  }

  type AnyOrder = TakeOutOrder | DineInOrder;

  /** In-memory cart / Firestore write payload. Wider than `AnyOrder` because drafts are partial. */
  type OrderDraft = Partial<Order> & {
    customerName?: string;
    phoneNumber?: string;
    fulfillment?: TakeOutFulfillment;
    tableNumber?: string;
    guests?: number;
  };

  interface Table {
    id?: string;
    tableNumber: string;
    status: TableStatus;
    guests: number;
    currentOrderId: string | null;
  }

  /** A website order as the POS shows it (businesses/{id}/orders, mapped by
   * src/domain/order/onlineOrderMapper.ts). The POS never writes it. */
  interface OnlineOrderItem {
    name: string;
    /** Per-unit price including options. */
    price: number;
    quantity: number;
    instructions?: string;
    options?: { name: string; price: number; quantity: number }[];
  }

  interface OnlineOrder {
    id: string;
    source: "online";
    orderNumber?: string;
    /** Every website order is copied, including New (not accepted yet). Rejected ones
     * end up Cancelled. */
    status: "New" | "InProgress" | "ReadyForPickup" | "Completed" | "Cancelled";
    fulfillment?: TakeOutFulfillment;
    customerName: string;
    phoneNumber: string;
    orderItems: OnlineOrderItem[];
    taxBreakDown?: TaxBreakDown;
    /** Rewards member linked at checkout. Points used for the discount
     * (`pointsToRedeem`) are only taken from the balance when the Orders app completes
     * the order (`pointsRedeemed`) — until then they're held, see pendingOnlineRedeemPoints. */
    loyalty?: {
      memberId: string;
      memberName?: string;
      pointsToRedeem?: number;
      pointsRedeemed?: number;
      /** Staff skipped taking the points (member no longer had them). */
      redeemWaived?: boolean;
      pointsEarned?: number;
      collectedAt?: Timestamp;
      reversedAt?: Timestamp;
    };
    paid: boolean;
    printed: boolean;
    createdAt: Timestamp;
  }

  interface Customer {
    id?: string;
    name: string;
    phone: string;
    isBlocked: boolean;
    note?: string;
    createdAt: Timestamp;
    numberOfOrders: number;
    totalSpent: number;
  }

  interface MenuChange {
    id?: string;
    name: string;
    changes: ItemChange[];
    createdAt: Timestamp;
  }

  interface Credit {
    id?: string;
    name?: string;
    phoneNumber?: string;
    description?: string;
    amount: number;
    completed: boolean;
    createdAt: Timestamp;
  }

  interface StaffMember {
    id?: string;
    name: string;
    email: string;
    role: string;
    createdAt: Timestamp;
  }
}
