import {
  collectBlockedReason,
  DOLLARS_PER_REDEEM_STEP,
  maxRedeemSteps,
  orderEarnableAmount,
  pendingOnlineRedeemPoints,
  pointsForAmount,
  POINTS_PER_REDEEM_STEP,
  redeemBlockedReason,
  hasActiveRedemption,
} from "@/domain/rewards/rewardsRules";
import SafeAreaViewWrapper from "@/layout/SafeAreaViewWrapper";
import { firebase } from "@/lib/firebaseConfig";
import {
  applyRedemptionToOrder,
  markPointsCollected,
  orderCollection,
} from "@/services/orderLoyaltyService";
import {
  earnPoints,
  lookupMember,
  redeemPoints,
  subscribeToMemberPoints,
  type RewardsMember,
} from "@/services/rewardsService";
import { OrderType } from "@/types/enums";
import Header from "@/ui/Header";
import { formatRewardsPhone } from "@/features/rewards/rewardsPhone";
import { useRewardsCustomerDisplay } from "@/features/rewards/rewardsCustomerDisplay";
import { useOnlineOrdersStore } from "@/stores/useOnlineOrdersStore";
import MessageModal from "@/ui/MessageModal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { Minus, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";

type Params = {
  orderId: string;
  /** "dinein" | "takeout" */
  orderType: string;
  /** From a QR scan, or the member already linked to the order. */
  memberId?: string;
  /** From the phone number field (10 digits). */
  phone?: string;
};

export default function RewardsMemberScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const orderId = params.orderId;
  const orderType = params.orderType === "dinein" ? OrderType.DineIn : OrderType.TakeOut;

  const [order, setOrder] = useState<AnyOrder | null>(null);
  const [orderMissing, setOrderMissing] = useState(false);
  const [member, setMember] = useState<RewardsMember | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [steps, setSteps] = useState(1);
  // Redeem / Collect progress, then its result (same modal). Success goes back when closed.
  const [notice, setNotice] = useState<{
    tone: "loading" | "success" | "error";
    title: string;
    message?: string;
  } | null>(null);
  const busy = notice?.tone === "loading";
  // Message after a redeem/collect, for the customer screen (the balance there is live).
  const [outcome, setOutcome] = useState<{ points: number; message: string } | null>(null);

  // Points held on the member's open online orders (taken when the Orders app completes
  // them). Shown and used as if already gone, so they can't be redeemed twice.
  const onlineOrders = useOnlineOrdersStore((s) => s.onlineOrders);
  const heldPoints = member ? pendingOnlineRedeemPoints(member.memberId, onlineOrders) : 0;
  const availablePoints = member ? Math.max(0, member.points - heldPoints) : 0;

  // Live balance: the lookup gives the first value, then this keeps it current (e.g. the
  // Orders app taking and earning points when it completes the member's online order).
  const memberId = member?.memberId;
  useEffect(() => {
    if (!memberId) return;
    return subscribeToMemberPoints(memberId, (points) =>
      setMember((prev) => (prev && prev.memberId === memberId ? { ...prev, points } : prev)),
    );
  }, [memberId]);

  // Customer screen: the member's name and points while this page is open.
  const displayView = useMemo(
    () =>
      member
        ? {
            name: member.name.trim(),
            points: availablePoints,
            message: outcome?.message,
          }
        : null,
    [member, outcome, availablePoints],
  );
  useRewardsCustomerDisplay(displayView);

  // Live order, so the buttons reflect edits made on other devices.
  useEffect(() => {
    if (!orderId) return;
    return onSnapshot(
      doc(firebase.db, orderCollection(orderType), orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrderMissing(true);
          return;
        }
        setOrder({ ...(snap.data() as AnyOrder), id: snap.id });
      },
      () => setOrderMissing(true),
    );
  }, [orderId, orderType]);

  useEffect(() => {
    const input = params.memberId
      ? { memberId: params.memberId }
      : params.phone
        ? { phone: params.phone }
        : null;
    if (!input) return;
    let active = true;
    lookupMember(input)
      .then((m) => active && setMember(m))
      .catch((err: Error) => active && setLookupError(err.message));
    return () => {
      active = false;
    };
  }, [params.memberId, params.phone]);

  const lookupProblem = !params.memberId && !params.phone ? "No member to look up." : lookupError;

  const linkedToOther =
    order?.loyalty && member && order.loyalty.memberId !== member.memberId
      ? order.loyalty.memberName
      : null;

  const earnable = order ? orderEarnableAmount(order) : 0;
  const collectPoints = pointsForAmount(earnable);

  const maxSteps = useMemo(
    () => (order && member ? maxRedeemSteps(availablePoints, order.taxBreakDown?.subTotal ?? 0) : 0),
    [order, member, availablePoints],
  );
  const clampedSteps = Math.min(Math.max(1, steps), Math.max(1, maxSteps));

  const redeemReason = useMemo(() => {
    if (!order || !member) return null;
    if (linkedToOther) return `This order is linked to ${linkedToOther}.`;
    return redeemBlockedReason(order, availablePoints);
  }, [order, member, linkedToOther, availablePoints]);

  const collectReason = useMemo(() => {
    if (!order || !member) return null;
    if (linkedToOther) return `This order is linked to ${linkedToOther}.`;
    return collectBlockedReason(order);
  }, [order, member, linkedToOther]);

  const handleRedeem = useCallback(async () => {
    if (!order?.id || !member) return;
    setNotice({ tone: "loading", title: "Redeeming points…" });
    try {
      const result = await redeemPoints(member.memberId, order.id, clampedSteps);
      await applyRedemptionToOrder(orderType, order.id, member, result);
      const left = Math.max(0, result.newBalance - heldPoints);
      setOutcome({
        points: left,
        message: `$${result.discountAmount.toFixed(2)} off redeemed`,
      });
      setNotice({
        tone: "success",
        title: "Points redeemed",
        message: `$${result.discountAmount.toFixed(2)} off for ${member.name}.
Balance: ${left} pts.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        title: "Redeem failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [order, member, clampedSteps, orderType, heldPoints]);

  const handleCollect = useCallback(async () => {
    if (!order?.id || !member) return;
    setNotice({ tone: "loading", title: "Collecting points…" });
    try {
      const result = await earnPoints(member.memberId, order.id, earnable);
      await markPointsCollected(orderType, order.id, member, result);
      const bonus = result.bonusPoints > 0 ? ` + ${result.bonusPoints} welcome bonus` : "";
      const left = Math.max(0, result.newBalance - heldPoints);
      setOutcome({
        points: left,
        message: `+${result.pointsEarned} points earned${bonus}`,
      });
      setNotice({
        tone: "success",
        title: "Points collected",
        message: `+${result.pointsEarned} pts${bonus} for ${member.name}.
Balance: ${left} pts.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        title: "Collect failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [order, member, earnable, orderType, heldPoints]);

  const loading = !lookupProblem && !orderMissing && (!member || !order);

  return (
    <SafeAreaViewWrapper className="flex-1 bg-gray-100">
      <Header title="Rewards" onBack={() => router.back()} />

      {lookupProblem || orderMissing ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="mb-4 text-center text-base text-gray-700">
            {orderMissing ? "This order no longer exists." : lookupProblem}
          </Text>
          <TouchableOpacity className="rounded-xl bg-gray-800 px-6 py-3" onPress={() => router.back()}>
            <Text className="font-semibold text-white">Go back</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="mt-2 text-gray-600">Looking up member…</Text>
        </View>
      ) : (
        member &&
        order && (
          <ScrollView contentContainerClassName="p-4 w-full max-w-xl self-center">
            {/* Member */}
            <View className="rounded-2xl border border-gray-200 bg-white p-4">
              <Text className="text-xl font-extrabold text-gray-900" numberOfLines={1}>
                {member.name}
              </Text>
              {member.phone ? (
                <Text className="mt-0.5 text-sm text-gray-600">{formatRewardsPhone(member.phone)}</Text>
              ) : null}
              <View className="mt-3 rounded-xl bg-red-50 px-4 py-3">
                <Text className="text-xs font-medium uppercase tracking-wide text-red-700">Balance</Text>
                <Text className="text-3xl font-extrabold text-red-700">{availablePoints} pts</Text>
                {heldPoints > 0 ? (
                  <Text className="mt-0.5 text-xs text-red-700">
                    {heldPoints} more held for an online order (taken when it&apos;s picked up)
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Order */}
            <View className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <Text className="mb-2 text-base font-bold text-gray-900">
                {orderType === OrderType.DineIn
                  ? `Table ${(order as DineInOrder).tableNumber}`
                  : `Take-out${(order as TakeOutOrder).customerName ? ` · ${(order as TakeOutOrder).customerName}` : ""}`}
              </Text>
              <Row label="Subtotal" value={`$${(order.taxBreakDown?.subTotal ?? 0).toFixed(2)}`} />
              {order.taxBreakDown?.discount ? (
                <Row
                  label={hasActiveRedemption(order.loyalty) ? "Rewards discount" : "Discount"}
                  value={`−$${order.taxBreakDown.discount.discountAmount.toFixed(2)}`}
                />
              ) : null}
              <Row label="Total" value={`$${(order.taxBreakDown?.total ?? 0).toFixed(2)}`} bold />
            </View>

            {/* Redeem */}
            <View className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <Text className="text-base font-bold text-gray-900">Redeem</Text>
              <Text className="mt-0.5 text-sm text-gray-500">
                {POINTS_PER_REDEEM_STEP} pts = ${DOLLARS_PER_REDEEM_STEP} off
              </Text>
              {redeemReason ? (
                <Text className="mt-3 text-sm text-amber-700">{redeemReason}</Text>
              ) : (
                <View className="mt-3 flex-row items-center justify-between">
                  <TouchableOpacity
                    className={`h-11 w-11 items-center justify-center rounded-xl bg-gray-200 ${clampedSteps <= 1 ? "opacity-40" : ""}`}
                    disabled={clampedSteps <= 1}
                    onPress={() => setSteps(clampedSteps - 1)}
                  >
                    <Minus size={20} color="#111827" />
                  </TouchableOpacity>
                  <View className="items-center">
                    <Text className="text-2xl font-extrabold text-gray-900">
                      ${(clampedSteps * DOLLARS_PER_REDEEM_STEP).toFixed(2)} off
                    </Text>
                    <Text className="text-sm text-gray-500">
                      uses {clampedSteps * POINTS_PER_REDEEM_STEP} pts
                    </Text>
                  </View>
                  <TouchableOpacity
                    className={`h-11 w-11 items-center justify-center rounded-xl bg-gray-200 ${clampedSteps >= maxSteps ? "opacity-40" : ""}`}
                    disabled={clampedSteps >= maxSteps}
                    onPress={() => setSteps(clampedSteps + 1)}
                  >
                    <Plus size={20} color="#111827" />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                className={`mt-3 rounded-xl bg-red-600 py-3.5 ${redeemReason || busy ? "opacity-40" : ""}`}
                disabled={Boolean(redeemReason || busy)}
                onPress={handleRedeem}
              >
                <Text className="text-center text-base font-semibold text-white">
                  Redeem ${(clampedSteps * DOLLARS_PER_REDEEM_STEP).toFixed(2)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Collect */}
            <View className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <Text className="text-base font-bold text-gray-900">Collect</Text>
              <Text className="mt-0.5 text-sm text-gray-500">
                1 pt per $1 before tax (${earnable.toFixed(2)})
              </Text>
              {collectReason ? (
                <Text className="mt-3 text-sm text-amber-700">{collectReason}</Text>
              ) : null}
              <TouchableOpacity
                className={`mt-3 rounded-xl bg-green-600 py-3.5 ${collectReason || busy ? "opacity-40" : ""}`}
                disabled={Boolean(collectReason || busy)}
                onPress={handleCollect}
              >
                <Text className="text-center text-base font-semibold text-white">
                  Collect {collectPoints} pts
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )
      )}

      <MessageModal
        visible={notice !== null}
        tone={notice?.tone ?? "success"}
        title={notice?.title ?? ""}
        message={notice?.message}
        buttonLabel={notice?.tone === "success" ? "Done" : "OK"}
        onClose={() => {
          const wasSuccess = notice?.tone === "success";
          setNotice(null);
          if (wasSuccess) router.back();
        }}
      />
    </SafeAreaViewWrapper>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-base ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>{label}</Text>
      <Text className={`text-base ${bold ? "font-bold text-gray-900" : "text-gray-900"}`}>{value}</Text>
    </View>
  );
}
