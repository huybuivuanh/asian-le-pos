import { bizDoc } from "@/lib/business";
import CashPaymentModal from "@/features/dinein/CashPaymentModal";
import TableInfoCard from "@/features/dinein/TableInfoCard";
import { useDineInTableActions } from "@/features/dinein/hooks/useDineInTableActions";
import { useLinePaidDebounce } from "@/features/dinein/hooks/useLinePaidDebounce";
import OrderItemsList from "@/features/order/components/OrderItemsList";
import RewardsModal from "@/features/order/components/RewardsModal";
import { rewardsClosedReason } from "@/domain/rewards/rewardsRules";
import { openRewardsMember } from "@/features/rewards/rewardsNavigation";
import SafeAreaViewWrapper from "@/layout/SafeAreaViewWrapper";
import {
  createCustomerDisplayChannel,
  type CustomerDisplayMessage,
} from "@/lib/customerDisplay";
import { useActiveDineInOrdersStore } from "@/stores/useActiveDineInOrdersStore";
import { useDineInOrdersStore } from "@/stores/useDineInOrdersStore";
import { useCartStore } from "@/stores/useCartStore";
import { DiscountType, OrderType } from "@/types/enums";
import FullScreenLoadingOverlay from "@/ui/FullScreenLoadingOverlay";
import Header from "@/ui/Header";
import MessageModal from "@/ui/MessageModal";
import {
  calculateTaxBreakdown,
  EMPTY_TAX_BREAKDOWN,
  formatTimeOnly,
  orderPaidFromLineItems,
  showAlert,
} from "@/utils/helpers";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { getDocFromServer } from "firebase/firestore";
import { Check } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTableStore } from "@/stores/useTableStore";

const scrollContentStyle = { flexGrow: 1, paddingBottom: 12 };

export default function TablePage() {
  const { tableNumber } = useLocalSearchParams<{ tableNumber: string }>();
  const router = useRouter();
  const table = useTableStore((state) =>
    state.tables.find((t) => t.tableNumber === tableNumber),
  );

  const [order, setOrder] = useState<Partial<DineInOrder> | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { activeDineInOrders, loading: ordersLoading } =
    useActiveDineInOrdersStore();
  const fullDineInOrders = useDineInOrdersStore((s) => s.fullDineInOrders);
  const { clearOrder, updateOrder } = useCartStore();
  const upsertTable = useTableStore((s) => s.upsertTable);

  // Server-fresh fallback for when the passive listeners haven't caught up yet
  // (e.g. right after app launch) — see currentOrder/useEffect below for how
  // this gets reconciled against the live-synced data once it arrives.
  const [liveOrderOverride, setLiveOrderOverride] = useState<DineInOrder | null>(null);

  // On every focus, do a targeted live read of just this table (bypasses the
  // passive collection-wide listener, which can lag several seconds after a
  // cold start) so a second staff member opening this table immediately sees
  // any order another staff member just submitted, instead of a stale "open"
  // table that would get silently overwritten on submit.
  useFocusEffect(
    useCallback(() => {
      if (!tableNumber) return;
      let active = true;

      (async () => {
        try {
          const tableSnap = await getDocFromServer(bizDoc("tables", tableNumber));
          if (!active || !tableSnap.exists()) return;
          const liveTable = { ...(tableSnap.data() as Table), id: tableSnap.id };
          upsertTable(liveTable);

          if (!liveTable.currentOrderId) {
            setLiveOrderOverride(null);
            return;
          }
          const alreadyLocal = useDineInOrdersStore
            .getState()
            .fullDineInOrders.some((o) => o.id === liveTable.currentOrderId);
          if (alreadyLocal) {
            setLiveOrderOverride(null);
            return;
          }

          const orderSnap = await getDocFromServer(
            bizDoc("dineInOrders", liveTable.currentOrderId),
          );
          if (!active || !orderSnap.exists()) return;
          setLiveOrderOverride({ ...(orderSnap.data() as DineInOrder), id: orderSnap.id });
        } catch (e) {
          console.error("❌ Error refreshing table on focus:", e);
        }
      })();

      return () => {
        active = false;
      };
    }, [tableNumber, upsertTable]),
  );

  const {
    actionOverlay,
    actionBusy,
    cashModal,
    handleCancelOrder,
    handleCompleteOrder,
    handlePrint,
    handleMarkAsPaid,
    handlePrintSelected,
    handleMarkSelectedPaid,
  } = useDineInTableActions();

  const { handleToggleLinePaid, flushPendingToggle, cancelPendingToggle } =
    useLinePaidDebounce();

  const currentOrder = useMemo(() => {
    if (!table?.currentOrderId) return undefined;
    return activeDineInOrders.find((o) => o.id === table.currentOrderId);
  }, [activeDineInOrders, table]);

  useEffect(() => {
    setOrder(currentOrder ?? liveOrderOverride ?? null);
    // Drop the live-fetched fallback once the real-time listener catches up
    // with the same data, so it doesn't keep shadowing subsequent live updates.
    if (currentOrder && liveOrderOverride) setLiveOrderOverride(null);
  }, [currentOrder, liveOrderOverride]);

  const closeCashModal = cashModal.close;
  const [rewardsOpen, setRewardsOpen] = useState(false);
  // Why Rewards can't open (completed / cancelled order).
  const [rewardsClosedMessage, setRewardsClosedMessage] = useState<string | null>(null);
  const closeRewards = useCallback(() => setRewardsOpen(false), []);
  useEffect(() => {
    if (!selectionMode) closeCashModal();
  }, [selectionMode, closeCashModal]);

  const hasActiveOrderItems = Boolean(
    order?.orderItems && order.orderItems.length > 0,
  );

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((p) => !p);
    setSelectedItemIds(new Set());
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const selectedItemsTotal = useMemo(() => {
    if (!selectionMode || !order?.orderItems || selectedItemIds.size === 0)
      return 0;
    return order.orderItems
      .filter((it) => it.id && selectedItemIds.has(it.id))
      .reduce((sum, it) => sum + it.price * it.quantity, 0);
  }, [order?.orderItems, selectedItemIds, selectionMode]);

  const selectedItemsTaxBreakDown = useMemo(
    () =>
      selectedItemsTotal === 0
        ? EMPTY_TAX_BREAKDOWN
        : calculateTaxBreakdown(selectedItemsTotal, DiscountType.None, 0),
    [selectedItemsTotal],
  );

  // Mirror this table's bill onto the customer-facing counter display while
  // it's open — takes over from whatever take-out cart happens to be
  // mid-build, since this is the active payment moment. Cleared on unmount
  // (back/dismiss/any way of leaving) so the next customer at the counter
  // doesn't see a stale total.
  const lastBillMessageRef = useRef<CustomerDisplayMessage | null>(null);
  const displayChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const channel = createCustomerDisplayChannel();
    if (!channel) return;
    displayChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      if (event.data?.type === "hello" && lastBillMessageRef.current) {
        channel.postMessage(lastBillMessageRef.current);
      }
    };

    return () => {
      const clearMessage: CustomerDisplayMessage = { type: "clear" };
      channel.postMessage(clearMessage);
      channel.close();
      displayChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const channel = displayChannelRef.current;
    if (!channel || !order?.orderItems?.length) return;

    const message: CustomerDisplayMessage = selectionMode
      ? {
          type: "bill",
          items: order.orderItems.filter(
            (it) => it.id && selectedItemIds.has(it.id),
          ),
          taxBreakDown: selectedItemsTaxBreakDown,
          tableNumber,
          staff: order.staff,
        }
      : {
          type: "bill",
          items: order.orderItems,
          taxBreakDown: order.taxBreakDown,
          tableNumber,
          staff: order.staff,
        };
    lastBillMessageRef.current = message;
    channel.postMessage(message);
  }, [
    order?.orderItems,
    order?.taxBreakDown,
    order?.staff,
    selectionMode,
    selectedItemIds,
    tableNumber,
    selectedItemsTaxBreakDown,
  ]);

  const isOrderPaid = useMemo(
    () => orderPaidFromLineItems(order?.orderItems ?? []),
    [order?.orderItems],
  );

  const onToggleLinePaid = useCallback(
    (itemId: string, nextPaid: boolean) => {
      if (!order?.id || !order.orderItems?.length) return;
      handleToggleLinePaid(
        itemId,
        nextPaid,
        order.id,
        order.orderItems,
        (nextItems) => {
          setOrder((prev) =>
            prev ? { ...prev, orderItems: nextItems } : prev,
          );
        },
      );
    },
    [order?.id, order?.orderItems, handleToggleLinePaid],
  );

  const orderPending = Boolean(
    table?.currentOrderId &&
    !ordersLoading &&
    !fullDineInOrders.some((o) => o.id === table.currentOrderId),
  );

  if (!table || ordersLoading || orderPending) {
    return (
      <SafeAreaViewWrapper className="flex-1 justify-center items-center bg-gray-100">
        <ActivityIndicator size="large" color="#000" />
      </SafeAreaViewWrapper>
    );
  }

  return (
    <SafeAreaViewWrapper className="flex-1 bg-gray-100">
      <Header
        title={`Table ${tableNumber}`}
        onBack={() => {
          if (!actionBusy) router.back();
        }}
      />

      <View className="flex-1 justify-between">
        <TableInfoCard tableNumber={tableNumber} />

        {!hasActiveOrderItems ? (
          <Text className="text-gray-500 text-center mt-10 text-lg">
            No active order for this table.
          </Text>
        ) : (
          <View className="mx-4 mt-3 min-h-0 flex-1">
            <ScrollView
              className="mt-3 flex-1"
              style={{ alignSelf: "stretch" }}
              contentContainerStyle={scrollContentStyle}
              keyboardShouldPersistTaps="handled"
            >
              <View
                className="rounded-2xl border border-gray-200 bg-white p-4"
                style={{ alignSelf: "stretch" }}
              >
                <OrderItemsList
                  orderItems={order!.orderItems}
                  orderId={order!.id!}
                  selectionMode={selectionMode ? order!.id! : null}
                  selectedItemIds={selectedItemIds}
                  onToggleItemSelection={toggleItemSelection}
                  linePaidToggleEnabled
                  onToggleLinePaid={onToggleLinePaid}
                />
              </View>
            </ScrollView>

            {/* Order summary bar */}
            {selectionMode ? (
              <View className="flex-row items-stretch rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                <View className="flex-1" />
                <View className="shrink-0 justify-center pl-2">
                  <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total
                  </Text>
                  <Text className="mt-0.5 text-base font-bold text-gray-900">
                    ${selectedItemsTaxBreakDown.total.toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="flex-row items-stretch rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                <View className="min-w-0 flex-1 justify-center pr-2">
                  <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Staff
                  </Text>
                  <Text
                    className="mt-0.5 text-base font-semibold text-gray-900"
                    numberOfLines={1}
                  >
                    {order!.staff ?? "—"}
                  </Text>
                </View>
                <View className="my-0.5 w-px self-stretch bg-gray-200" />
                <View className="shrink-0 justify-center px-3">
                  <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Paid
                  </Text>
                  <Text
                    className={`mt-0.5 text-base font-semibold ${isOrderPaid ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {isOrderPaid ? "Paid" : "Unpaid"}
                  </Text>
                </View>
                <View className="my-0.5 w-px self-stretch bg-gray-200" />
                <View className="shrink-0 justify-center px-3">
                  <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Ordered At
                  </Text>
                  <Text className="mt-0.5 text-base font-semibold text-gray-900">
                    {formatTimeOnly(order!.createdAt!)}
                  </Text>
                </View>
                <View className="my-0.5 w-px self-stretch bg-gray-200" />
                <View className="shrink-0 justify-center pl-2">
                  <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total
                  </Text>
                  <Text className="mt-0.5 text-base font-bold text-gray-900">
                    ${(order!.taxBreakDown?.total ?? 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Footer Actions */}
        <View className="m-4">
          {selectionMode ? (
            <View>
              <View className="flex-row">
                <TouchableOpacity
                  className={`bg-green-600 px-3 py-3 rounded-lg items-center justify-center flex-1 mr-1.5 ${selectedItemIds.size === 0 ? "opacity-50" : "opacity-100"}`}
                  onPress={() =>
                    handlePrintSelected(order!, selectedItemIds, () => {
                      setSelectionMode(false);
                      setSelectedItemIds(new Set());
                    })
                  }
                  disabled={selectedItemIds.size === 0 || actionBusy}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Print Selected ({selectedItemIds.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`bg-emerald-700 px-3 py-3 rounded-lg items-center justify-center flex-1 ml-1.5 ${selectedItemIds.size === 0 ? "opacity-50" : "opacity-100"}`}
                  onPress={() =>
                    handleMarkSelectedPaid(
                      order!,
                      selectedItemIds,
                      cancelPendingToggle,
                      (nextItems) => {
                        setOrder((prev) =>
                          prev ? { ...prev, orderItems: nextItems } : prev,
                        );
                        setSelectionMode(false);
                        setSelectedItemIds(new Set());
                      },
                    )
                  }
                  disabled={selectedItemIds.size === 0 || actionBusy}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Mark Paid
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row mt-2">
                <TouchableOpacity
                  className="bg-red-600 px-3 py-3 rounded-lg items-center justify-center flex-1 mr-1.5"
                  onPress={toggleSelectionMode}
                  disabled={actionBusy}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`bg-yellow-600 px-3 py-3 rounded-lg items-center justify-center flex-1 ml-1.5 ${selectedItemIds.size === 0 ? "opacity-50" : "opacity-100"}`}
                  onPress={cashModal.open}
                  disabled={selectedItemIds.size === 0 || actionBusy}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Cash payment (selected)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View className="flex-row mb-3 gap-2">
                <TouchableOpacity
                  onPress={() => {
                    if (!order) {
                      if (table.guests === 0) {
                        showAlert("Please Enter Number of Guests");
                        return;
                      }
                      clearOrder();
                      updateOrder({ orderType: OrderType.DineIn });
                      router.push({
                        pathname: "/dinein/take-order/[tableNumber]",
                        params: { tableNumber },
                      });
                    } else {
                      clearOrder();
                      updateOrder({ orderType: OrderType.DineIn });
                      router.push({
                        pathname: "/dinein/edit-order/[tableNumber]",
                        params: { tableNumber },
                      });
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={actionBusy}
                  className={`bg-orange-500 px-2 py-3 rounded-lg items-center justify-center flex-1 min-w-0 ${actionBusy ? "opacity-50" : ""}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    {order ? "Edit Order" : "Take Order"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={toggleSelectionMode}
                  activeOpacity={0.7}
                  disabled={!order?.id || actionBusy}
                  className={`px-2 py-3 rounded-lg items-center justify-center flex-1 min-w-0 ${order?.id && !actionBusy ? "bg-purple-600" : "bg-purple-300"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Select Items
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePrint(order!)}
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-lg items-center justify-center flex-1 min-w-0 ${order && !actionBusy ? "bg-blue-500" : "bg-blue-300"}`}
                >
                  <View className="flex-row items-center justify-center">
                    <Text className="text-white text-sm font-semibold">
                      Print
                    </Text>
                    {order?.printed && (
                      <Check
                        size={14}
                        color="orange"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              </View>

              <View className="flex-row mb-3 gap-2">
                <TouchableOpacity
                  onPress={() => {
                    if (!order?.id) return;
                    router.push({
                      pathname: "/dinein/change-table/[tableNumber]",
                      params: { tableNumber, orderId: order.id },
                    } as Href);
                  }}
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0 ${order && !actionBusy ? "bg-teal-500" : "bg-teal-200"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Change Table
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={cashModal.open}
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-lg items-center justify-center flex-1 min-w-0 ${order && !actionBusy ? "bg-yellow-600" : "bg-yellow-300"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Cash Payment
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (!order?.id) return;
                    router.push({
                      pathname: "/dinein/change-to-takeout/[tableNumber]",
                      params: { tableNumber },
                    } as Href);
                  }}
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0 ${order && !actionBusy ? "bg-sky-500" : "bg-sky-300"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Change Type
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row mb-4 gap-2">
                <TouchableOpacity
                  onPress={() =>
                    handleCancelOrder(order!, () => setOrder(null))
                  }
                  activeOpacity={0.7}
                  className={`${order && !actionBusy ? "bg-red-500" : "bg-red-300"} px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0`}
                  disabled={!order || actionBusy}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    cancelPendingToggle();
                    handleMarkAsPaid(order!, !isOrderPaid);
                  }}
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0 ${isOrderPaid ? "bg-gray-500" : order && !actionBusy ? "bg-pink-500" : "bg-gray-300"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    {isOrderPaid ? "Unpaid" : "Paid"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (!order?.id) return;
                    const closed = rewardsClosedReason(order.status);
                    if (closed) {
                      setRewardsClosedMessage(closed);
                      return;
                    }
                    // Member already linked (redeemed earlier): skip scanning.
                    if (order.loyalty?.memberId) {
                      openRewardsMember(router, order.id, OrderType.DineIn, {
                        memberId: order.loyalty.memberId,
                      });
                    } else {
                      setRewardsOpen(true);
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={!order?.id || actionBusy}
                  className={`px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0 ${order?.id && !actionBusy ? "bg-red-600" : "bg-red-300"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Rewards
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    handleCompleteOrder(order!, flushPendingToggle, () =>
                      setOrder(null),
                    )
                  }
                  activeOpacity={0.7}
                  disabled={!order || actionBusy}
                  className={`px-2 py-3 rounded-md items-center justify-center flex-1 min-w-0 ${order && !actionBusy ? "bg-green-500" : "bg-green-200"}`}
                >
                  <Text className="text-white text-sm font-semibold text-center">
                    Complete
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {rewardsOpen && order?.id && (
        <RewardsModal orderId={order.id} orderType={OrderType.DineIn} onClose={closeRewards} />
      )}

      <MessageModal
        visible={rewardsClosedMessage !== null}
        tone="error"
        title="Rewards unavailable"
        message={rewardsClosedMessage ?? undefined}
        onClose={() => setRewardsClosedMessage(null)}
      />

      {cashModal.isOpen && (
        <CashPaymentModal
          onClose={cashModal.close}
          orderTotal={
            selectionMode
              ? selectedItemsTaxBreakDown.total
              : (order?.taxBreakDown?.total ?? 0)
          }
        />
      )}

      <FullScreenLoadingOverlay
        visible={Boolean(actionOverlay)}
        title={actionOverlay?.title ?? "Please wait…"}
      />
    </SafeAreaViewWrapper>
  );
}
