import OrderItemsList from "@/features/order/components/OrderItemsList";
import OrderTaxBreakdown from "@/features/order/components/OrderTaxBreakdown";
import RewardsBadge from "@/features/order/components/RewardsBadge";
import {
  calculateTaxBreakdown,
  EMPTY_TAX_BREAKDOWN,
  orderPaidFromLineItems,
  orderSubtotal,
  resolveTaxBreakdown,
  formatDate,
} from "@/utils/helpers";
import { DiscountType, OrderStatus } from "@/types/enums";
import React, { memo, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  item: DineInOrder;
  expanded: boolean;
  isSelectionMode: boolean;
  selectedItemIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onPrint: (order: DineInOrder) => void;
  onToggleSelectionMode: (orderId: string) => void;
  onToggleItemSelection: (itemId: string) => void;
  onPrintSelected: (order: DineInOrder) => void;
  onMarkAsPaid: (order: DineInOrder, paid: boolean) => void;
  onCancel: (order: DineInOrder) => void;
  onComplete: (order: DineInOrder) => void;
  onOpenCashPayment: (orderId: string) => void;
};

export const DineInOrderCard = memo(function DineInOrderCard({
  item,
  expanded,
  isSelectionMode,
  selectedItemIds,
  onToggleExpand,
  onPrint,
  onToggleSelectionMode,
  onToggleItemSelection,
  onPrintSelected,
  onMarkAsPaid,
  onCancel,
  onComplete,
  onOpenCashPayment,
}: Props) {
  const taxBreakDown = useMemo(() => resolveTaxBreakdown(item), [item]);
  const isPaid = useMemo(
    () => orderPaidFromLineItems(item.orderItems ?? []),
    [item.orderItems],
  );

  const displayOrderItems = item.orderItems ?? [];

  const selectedItemsTotal = useMemo(() => {
    if (!isSelectionMode || !item.orderItems || selectedItemIds.size === 0)
      return 0;
    return item.orderItems
      .filter((oi) => oi.id && selectedItemIds.has(oi.id))
      .reduce((sum, oi) => sum + oi.price * oi.quantity, 0);
  }, [isSelectionMode, item.orderItems, selectedItemIds]);

  const selectedItemsTaxBreakDown = useMemo(
    () =>
      selectedItemsTotal === 0
        ? EMPTY_TAX_BREAKDOWN
        : calculateTaxBreakdown(selectedItemsTotal, DiscountType.None, 0),
    [selectedItemsTotal],
  );

  return (
    <View
      className={`${
        item.status === OrderStatus.Cancelled
          ? "bg-red-100 border-red-200"
          : item.status === OrderStatus.Completed
            ? "bg-green-100 border-green-200"
            : "bg-amber-100 border-amber-200"
      } p-4 mb-3 rounded-xl shadow-sm border`}
    >
      <TouchableOpacity
        className="flex-row justify-between items-center"
        onPress={() => onToggleExpand(item.id!)}
      >
        <View className="flex-1 mr-2">
          <Text className="font-semibold text-gray-800 text-base">
            Table: {item.tableNumber}
          </Text>
          <Text className="font-semibold text-gray-800 text-base">
            Guests: {item.guests ?? 0}
          </Text>
          <Text className="font-semibold text-gray-800 text-base">
            Staff: {item.staff ?? "—"}
          </Text>
          <Text className="font-semibold text-gray-800 text-base">
            Ordered At: {formatDate(item.createdAt)}
          </Text>
          <RewardsBadge loyalty={item.loyalty} />
        </View>

        <View>
          <View className="items-end space-y-2">
            <View
              className={`px-3 py-1 rounded-full ${item.printed ? "bg-green-100" : "bg-yellow-100"}`}
            >
              <Text
                className={`text-xs font-semibold ${item.printed ? "text-green-700" : "text-yellow-700"}`}
              >
                {item.printed ? "Printed" : "Not Printed"}
              </Text>
            </View>
            <View
              className={`px-3 py-1 rounded-full ${isPaid ? "bg-green-100" : "bg-gray-100"} ${
                item.status === OrderStatus.Cancelled ||
                (item.status === OrderStatus.Completed && !isPaid)
                  ? "opacity-0"
                  : ""
              }`}
            >
              <Text
                className={`text-xs font-semibold ${isPaid ? "text-green-700" : "text-gray-700"}`}
              >
                {isPaid ? "Paid" : "Unpaid"}
              </Text>
            </View>
          </View>
          <View
            className={`px-3 py-1 rounded-full ${
              item.status === OrderStatus.InProgress
                ? "bg-blue-100"
                : item.status === OrderStatus.Completed
                  ? "bg-green-100"
                  : "bg-red-200"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                item.status === OrderStatus.InProgress
                  ? "text-blue-700"
                  : item.status === OrderStatus.Completed
                    ? "text-green-700"
                    : "text-red-700"
              }`}
            >
              {item.status === OrderStatus.InProgress
                ? "In Progress"
                : item.status === OrderStatus.Completed
                  ? "Completed"
                  : "Cancelled"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-3 border-t border-gray-200 pt-2">
          <OrderItemsList
            orderItems={displayOrderItems}
            orderId={item.id!}
            selectionMode={isSelectionMode ? item.id! : null}
            selectedItemIds={selectedItemIds}
            onToggleItemSelection={onToggleItemSelection}
          />

          {taxBreakDown && (
            <OrderTaxBreakdown
              taxBreakDown={taxBreakDown}
              isSelectionMode={isSelectionMode}
              selectedItemsTotal={selectedItemsTotal}
              selectedItemsTaxBreakDown={selectedItemsTaxBreakDown}
              orderSubtotal={orderSubtotal(item)}
            />
          )}

          {isSelectionMode ? (
            <View className="mt-3">
              <View className="flex-row justify-between">
                <TouchableOpacity
                  className="bg-green-500 px-4 py-3 rounded-full flex-1 mr-2"
                  onPress={() => onPrintSelected(item)}
                  disabled={selectedItemIds.size === 0}
                  style={{ opacity: selectedItemIds.size === 0 ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold text-center">
                    Print Selected ({selectedItemIds.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-gray-700 px-4 py-3 rounded-md flex-1 ml-2"
                  onPress={() => onToggleSelectionMode(item.id!)}
                >
                  <Text className="text-white font-semibold text-center">
                    Cancel Selection
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View className="flex-row justify-between mt-3">
                <TouchableOpacity
                  className="bg-yellow-600 px-3 py-3 rounded-md flex-1 mr-2"
                  onPress={() => onOpenCashPayment(item.id!)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Cash payment
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-purple-500 px-3 py-3 rounded-md flex-1 mx-1"
                  onPress={() => onToggleSelectionMode(item.id!)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Select Items
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-blue-500 px-3 py-3 rounded-md flex-1 ml-2"
                  onPress={() => onPrint(item)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Print
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-between mt-3">
                <TouchableOpacity
                  className="bg-red-500 px-3 py-3 rounded-md flex-1 mr-2"
                  onPress={() => onCancel(item)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`px-3 py-3 rounded-md flex-1 mx-1 ${isPaid ? "bg-gray-500" : "bg-pink-500"}`}
                  onPress={() => onMarkAsPaid(item, !isPaid)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    {isPaid ? "Unpaid" : "Paid"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-green-500 px-3 py-3 rounded-md flex-1 ml-2"
                  onPress={() => onComplete(item)}
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    Complete
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
});
