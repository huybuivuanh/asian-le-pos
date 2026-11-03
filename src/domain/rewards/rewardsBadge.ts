/** Loyalty fields the rewards badge reads. POS orders and online order copies both fit. */
export type RewardsBadgeLoyalty = {
  memberName?: string;
  pointsEarned?: number;
  collectedAt?: unknown;
  pointsRedeemed?: number;
  reversedAt?: unknown;
};

/**
 * Text for the rewards badge: the member's name, then the points redeemed and/or collected
 * on this order. Null when neither happened, or the points were reversed.
 */
export function rewardsBadgeText(loyalty: RewardsBadgeLoyalty): string | null {
  if (loyalty.reversedAt != null) return null;

  const parts: string[] = [];
  if (loyalty.pointsRedeemed != null) parts.push(`−${loyalty.pointsRedeemed} pts used`);
  if (loyalty.collectedAt != null) parts.push(`+${loyalty.pointsEarned ?? 0} pts`);

  if (parts.length === 0) return null;
  return [loyalty.memberName || "Member", ...parts].join(" · ");
}
