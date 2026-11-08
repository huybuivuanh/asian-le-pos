// Maps a website order (businesses/{id}/orders/{orderId}, written by the website and
// the Orders app) to the read-only shape the POS shows in its take-out list.
// Only the fields the POS uses are kept; the customer's email is left out on purpose.
// (This used to run in the website project's mirrorOnlineOrder function.)
import { Timestamp, type DocumentData } from "firebase/firestore";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const ts = (v: unknown) => (v instanceof Timestamp ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Rewards fields: points promised on an online order (`pointsToRedeem`) aren't taken
 * from the balance until the Orders app completes it (`pointsRedeemed`), so the POS
 * subtracts the pending ones. The rest drive the rewards badge on the order card. */
function toLoyalty(loyalty: unknown): OnlineOrder["loyalty"] {
  if (!loyalty || typeof loyalty !== "object") return undefined;
  const l = loyalty as DocumentData;
  if (typeof l.memberId !== "string" || !l.memberId) return undefined;
  return {
    memberId: l.memberId,
    memberName: str(l.memberName),
    pointsToRedeem: num(l.pointsToRedeem),
    pointsRedeemed: num(l.pointsRedeemed),
    redeemWaived: l.redeemWaived === true ? true : undefined,
    pointsEarned: num(l.pointsEarned),
    collectedAt: ts(l.collectedAt),
    reversedAt: ts(l.reversedAt),
  };
}

function toItem(item: DocumentData): OnlineOrderItem {
  return {
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    instructions: str(item.instructions),
    options: Array.isArray(item.options)
      ? item.options.map((o: DocumentData) => ({
          name: o.name,
          price: o.price,
          quantity: o.quantity,
        }))
      : undefined,
  };
}

export function toOnlineOrder(id: string, data: DocumentData): OnlineOrder {
  return {
    id,
    source: "online",
    orderNumber: data.orderNumber,
    status: data.status,
    fulfillment: data.fulfillment,
    customerName: data.customerName ?? "",
    phoneNumber: data.phoneNumber ?? "",
    orderItems: Array.isArray(data.orderItems) ? data.orderItems.map(toItem) : [],
    taxBreakDown: data.taxBreakDown,
    loyalty: toLoyalty(data.loyalty),
    paid: Boolean(data.paid),
    printed: Boolean(data.printed),
    createdAt: data.createdAt,
  };
}
