import { activeRedemption } from "@/domain/rewards/rewardsRules";
import { DiscountType, OrderType, TakeOutFulfillmentKind } from "@/types/enums";
import { calculateTaxBreakdown, orderItemsSubtotal } from "@/utils/helpers";
import { create } from "zustand";

type CartState = {
  order: OrderDraft;
  takeOutCustomerSuggestDismissedLast7: string | undefined;
  dismissTakeOutCustomerNameSuggestion: (last7: string) => void;
  clearTakeOutCustomerNameSuggestionDismissal: () => void;
  updateOrder: (fields: OrderDraft) => void;
  addItem: (item: OrderItem) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearOrder: () => void;
  getTotalItems: () => number;
  getTaxBreakdown: () => TaxBreakDown | undefined;
  updateOrderItem: (itemId: string, fields: Partial<OrderItem>) => void;
  setOrder: (order: OrderDraft) => void;
};

const defaultTakeOutDraft: OrderDraft = {
  orderItems: [],
  orderType: OrderType.TakeOut,
  printed: false,
  fulfillment: {
    kind: TakeOutFulfillmentKind.Immediate,
    readyTimeMinutes: 15,
  },
};

function discountInputsFromOrder(order: OrderDraft): { type: DiscountType; value: number } {
  const d = order.taxBreakDown?.discount;
  return { type: d?.discountType ?? DiscountType.None, value: d?.discountValue ?? 0 };
}

function withRecalculatedTax(order: OrderDraft): OrderDraft {
  const subtotal = orderItemsSubtotal(order.orderItems);
  const { type, value } = discountInputsFromOrder(order);
  return {
    ...order,
    taxBreakDown:
      subtotal > 0
        ? calculateTaxBreakdown(subtotal, type, value, activeRedemption(order.loyalty))
        : undefined,
  };
}

function mergeOrderDraft(prev: OrderDraft, fields: OrderDraft): OrderDraft {
  const cleanFields: OrderDraft = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) (cleanFields as Record<string, unknown>)[key] = value;
  });
  let merged: OrderDraft = { ...prev, ...cleanFields };

  if (cleanFields.orderType === OrderType.DineIn) {
    const m = { ...merged } as Record<string, unknown>;
    delete m.fulfillment;
    delete m.customerName;
    delete m.phoneNumber;
    merged = m as OrderDraft;
  }
  if (cleanFields.orderType === OrderType.TakeOut) {
    const m = { ...merged } as Record<string, unknown>;
    delete m.tableNumber;
    delete m.guests;
    merged = m as OrderDraft;
    if (!merged.fulfillment) {
      merged.fulfillment = { kind: TakeOutFulfillmentKind.Immediate, readyTimeMinutes: 15 };
    }
  }

  return withRecalculatedTax(merged);
}

export const useCartStore = create<CartState>((set, get) => ({
  order: { ...defaultTakeOutDraft },
  takeOutCustomerSuggestDismissedLast7: undefined,

  dismissTakeOutCustomerNameSuggestion: (last7) => set({ takeOutCustomerSuggestDismissedLast7: last7 }),

  clearTakeOutCustomerNameSuggestionDismissal: () =>
    set({ takeOutCustomerSuggestDismissedLast7: undefined }),

  updateOrder: (fields) =>
    set((state) => ({ order: mergeOrderDraft(state.order, fields) })),

  addItem: (item) =>
    set((state) => ({
      order: mergeOrderDraft(state.order, {
        orderItems: [...(state.order.orderItems ?? []), item],
      }),
    })),

  removeItem: (itemId) =>
    set((state) => ({
      order: mergeOrderDraft(state.order, {
        orderItems: state.order.orderItems?.filter((i) => i.id !== itemId) ?? [],
      }),
    })),

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    const items = get().order.orderItems ?? [];
    set((state) => ({
      order: mergeOrderDraft(state.order, {
        orderItems: items.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
      }),
    }));
  },

  clearOrder: () =>
    set({
      order: { ...defaultTakeOutDraft },
      takeOutCustomerSuggestDismissedLast7: undefined,
    }),

  getTotalItems: () =>
    (get().order.orderItems ?? []).reduce((acc, item) => acc + item.quantity, 0),

  getTaxBreakdown: () => {
    const { order } = get();
    if (order.taxBreakDown) return order.taxBreakDown;
    const subtotal = orderItemsSubtotal(order.orderItems);
    return subtotal > 0 ? calculateTaxBreakdown(subtotal, DiscountType.None, 0) : undefined;
  },

  updateOrderItem: (itemId, fields) =>
    set((state) => {
      if (!state.order.orderItems || !Array.isArray(state.order.orderItems)) return state;

      const newOrderItems = state.order.orderItems.map((item) => {
        if (item.id !== itemId) return item;
        const updatedItem: OrderItem = {
          id: item.id,
          name: fields.name ?? item.name,
          price: fields.price ?? item.price,
          quantity: fields.quantity ?? item.quantity,
          togo: fields.togo ?? item.togo,
          appetizer: fields.appetizer ?? item.appetizer,
          kitchenType: fields.kitchenType ?? item.kitchenType,
          paid: fields.paid ?? item.paid,
          completed: fields.completed ?? item.completed,
          ...(fields.instructions !== undefined
            ? fields.instructions.trim()
              ? { instructions: fields.instructions.trim() }
              : {}
            : item.instructions
              ? { instructions: item.instructions }
              : {}),
          options: fields.options !== undefined ? fields.options : (item.options ?? []),
          extras: fields.extras !== undefined ? fields.extras : (item.extras ?? []),
          changes: fields.changes !== undefined ? fields.changes : (item.changes ?? []),
        };
        return updatedItem;
      });

      return { order: mergeOrderDraft(state.order, { orderItems: newOrderItems }) };
    }),

  setOrder: (order) => {
    const o: OrderDraft = { ...order };
    if (o.orderType === OrderType.TakeOut && !o.fulfillment) {
      o.fulfillment = { kind: TakeOutFulfillmentKind.Immediate, readyTimeMinutes: 15 };
    }
    set({ order: withRecalculatedTax(o) });
  },
}));
