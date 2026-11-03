import { rewardsBadgeText, type RewardsBadgeLoyalty } from "@/domain/rewards/rewardsBadge";
import React from "react";
import { Text, View } from "react-native";

type Props = {
  loyalty: (RewardsBadgeLoyalty & { memberId?: string }) | undefined | null;
};

/** Amber "name · redeem/collect status" badge on order cards. */
export default function RewardsBadge({ loyalty }: Props) {
  if (!loyalty?.memberId) return null;
  const text = rewardsBadgeText(loyalty);
  if (!text) return null;
  return (
    <View className="mt-1 self-start rounded-md bg-amber-500 px-2 py-1">
      <Text className="text-xs font-bold text-white">{text}</Text>
    </View>
  );
}
