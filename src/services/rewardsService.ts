// Calls the rewards Cloud Functions as the signed-in staff account. The functions
// take the business from the account's `businessId` claim, so a POS only ever
// reaches its own business's members. Each response is the confirmation.
import { bizDoc } from "@/lib/business";
import { app } from "@/lib/firebaseConfig";
import { onSnapshot } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(app);

export type RewardsMember = {
  memberId: string;
  name: string;
  phone: string;
  points: number;
};

export type LookupMemberInput = { memberId: string } | { phone: string };

export type EarnPointsResult = {
  pointsEarned: number;
  /** Welcome bonus on the member's first order ($15+ pre-tax), otherwise 0. */
  bonusPoints: number;
  newBalance: number;
};

export type RedeemPointsResult = {
  pointsRedeemed: number;
  /** Dollars off, applied to the order as an Amount discount. */
  discountAmount: number;
  newBalance: number;
};

export type ReverseOrderResult = {
  /** Net change to the member's balance (refunded redeem minus removed earn). */
  pointsChanged: number;
  newBalance: number;
};

async function call<In, Out>(name: string, data: In): Promise<Out> {
  try {
    const result = await httpsCallable<In, Out>(functions, name)(data);
    return result.data;
  } catch (err) {
    throw new Error(rewardsErrorMessage(err));
  }
}

/** Staff-facing message for a failed rewards call. */
export function rewardsErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "functions/not-found":
        return err.message || "No rewards member found.";
      case "functions/unauthenticated":
        return "You're signed out. Sign in again to use Rewards.";
      case "functions/permission-denied":
        return "This account can't use Rewards. Ask an admin.";
      case "functions/already-exists":
        return "Points were already collected for this order.";
      case "functions/failed-precondition":
      case "functions/invalid-argument":
        // Server writes a staff-readable message for rule violations
        // (not enough points, order has a discount, …).
        return err.message || "This action isn't allowed for this order.";
      case "functions/unavailable":
      case "functions/deadline-exceeded":
        return "No connection to Rewards. Check the internet and try again.";
    }
  }
  return "Rewards request failed. Try again.";
}

// The functions name the member id `uid` and return `balance`; the POS keeps its
// own names (`memberId`, `newBalance`) and maps them here.

type ServerMember = { uid: string; name: string; phone: string; points: number };

export async function lookupMember(input: LookupMemberInput): Promise<RewardsMember> {
  const data = "memberId" in input ? { uid: input.memberId } : { phone: input.phone };
  const { member } = await call<typeof data, { member: ServerMember }>("lookupMember", data);
  return {
    memberId: member.uid,
    name: member.name,
    phone: member.phone,
    points: member.points ?? 0,
  };
}

/**
 * Live points balance of one member (businesses/{id}/members/{memberId}; the rules let
 * staff read a single member). Returns an unsubscribe. On error (offline) it just
 * stops — callers keep the balance from lookupMember.
 */
export function subscribeToMemberPoints(
  memberId: string,
  onPoints: (points: number) => void,
): () => void {
  return onSnapshot(
    bizDoc("members", memberId),
    (snap) => {
      const points = snap.get("points");
      if (typeof points === "number") onPoints(points);
    },
    (err) => console.warn("Rewards balance listener stopped:", err.message),
  );
}

/** Once per order: calling again returns the first result. */
export async function earnPoints(
  memberId: string,
  orderId: string,
  subtotal: number,
): Promise<EarnPointsResult> {
  const r = await call<
    { uid: string; orderId: string; subtotal: number },
    { pointsEarned: number; bonusPoints?: number; balance: number }
  >("earnPoints", { uid: memberId, orderId, subtotal });
  return { pointsEarned: r.pointsEarned, bonusPoints: r.bonusPoints ?? 0, newBalance: r.balance };
}

/** `steps` × 100 points → `steps` × $5 off. Calling again returns the first result. */
export async function redeemPoints(
  memberId: string,
  orderId: string,
  steps: number,
): Promise<RedeemPointsResult> {
  const r = await call<
    { uid: string; orderId: string; steps: number },
    { pointsRedeemed: number; discount: number; balance: number }
  >("redeemPoints", { uid: memberId, orderId, steps });
  return { pointsRedeemed: r.pointsRedeemed, discountAmount: r.discount, newBalance: r.balance };
}

/** On cancel: undoes the order's earned and redeemed points, once. */
export async function reverseOrder(memberId: string, orderId: string): Promise<ReverseOrderResult> {
  const r = await call<
    { uid: string; orderId: string },
    { pointsChanged: number; balance: number }
  >("reverseOrder", { uid: memberId, orderId });
  return { pointsChanged: r.pointsChanged, newBalance: r.balance };
}
