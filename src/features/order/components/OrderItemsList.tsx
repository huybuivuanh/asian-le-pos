import React, { memo, useMemo } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import {
  groupOrderItemsByDisplaySection,
  sortOrderItemsForDisplay,
} from "../orderItemSections";
import OrderSectionHeader from "./OrderSectionHeader";
import { menuItemLabel } from "@/domain/menu/menuItemNumber";

type Props = {
  orderItems?: OrderItem[];
  orderId: string;
  selectionMode: string | null;
  selectedItemIds: Set<string>;
  onToggleItemSelection: (itemId: string) => void;
  /** When false: sorted lines only (e.g. take-out orders tab). Default true (dine-in order views). */
  showSectionHeaders?: boolean;
  /** Dine-in order detail: Paid/Unpaid control per line (including in selection mode; separate from row select). */
  linePaidToggleEnabled?: boolean;
  onToggleLinePaid?: (itemId: string, nextPaid: boolean) => void;
};

type RowProps = {
  orderItem: OrderItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  linePaidToggleEnabled: boolean;
  onToggleItemSelection: (itemId: string) => void;
  onToggleLinePaid?: (itemId: string, nextPaid: boolean) => void;
};

const OrderItemRow = memo(function OrderItemRow({
  orderItem,
  isSelectionMode,
  isSelected,
  linePaidToggleEnabled,
  onToggleItemSelection,
  onToggleLinePaid,
}: RowProps) {
  const lineTotal = (orderItem.price * orderItem.quantity).toFixed(2);
  const linePaid = orderItem.paid;
  const showPaidBtn =
    linePaidToggleEnabled && Boolean(onToggleLinePaid) && Boolean(orderItem.id);

  const cardBorder = isSelectionMode
    ? isSelected
      ? "border-2 border-blue-500 bg-blue-50/70 shadow-sm"
      : "border border-dashed border-gray-300 bg-gray-50/80"
    : linePaidToggleEnabled && linePaid
      ? "border border-emerald-300/90 bg-emerald-50/50 shadow-sm shadow-stone-200/30"
      : "border border-stone-200/90 shadow-sm shadow-stone-200/40";

  return (
    <View
      className={`mb-2.5 rounded-2xl border bg-white px-3 py-3.5 ${cardBorder}`}
    >
      <View className="flex-row items-stretch">
        {isSelectionMode && (
          <Pressable
            className="mr-2 mt-1 justify-center"
            onPress={
              orderItem.id
                ? () => onToggleItemSelection(orderItem.id!)
                : undefined
            }
            disabled={!orderItem.id}
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                isSelected
                  ? "border-blue-600 bg-blue-600"
                  : "border-stone-300 bg-white"
              }`}
            >
              {isSelected && (
                <Text className="text-xs font-bold text-white">✓</Text>
              )}
            </View>
          </Pressable>
        )}
        {/*
          RN: Pressable + flex-1 in a row often under-measures height; options then draw
          outside the bordered card. Flex lives on a wrapping View; the press target sizes to content.
        */}
        <View className="min-w-0 flex-1" style={{ alignSelf: "stretch" }}>
          <TouchableOpacity
            activeOpacity={isSelectionMode ? 0.85 : 1}
            disabled={!isSelectionMode || !orderItem.id}
            onPress={
              isSelectionMode && orderItem.id
                ? () => onToggleItemSelection(orderItem.id!)
                : undefined
            }
            className="min-w-0"
          >
            <View className="min-w-0">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text
                  className="flex-1 text-lg font-semibold text-stone-900"
                  numberOfLines={3}
                >
                  <Text className="font-bold text-stone-600">
                    {orderItem.quantity}
                  </Text>
                  <Text className="text-stone-400"> × </Text>
                  {menuItemLabel(orderItem)}
                </Text>
                <Text className="text-lg font-bold text-stone-900">
                  ${lineTotal}
                </Text>
              </View>

              {orderItem.options && orderItem.options.length > 0 && (
                <View className="mt-2 border-t border-stone-100 pt-2">
                  {orderItem.options.map((option, optIndex) => (
                    <Text
                      key={optIndex}
                      className="text-[15px] leading-5 text-stone-600"
                    >
                      <Text className="text-stone-400">· </Text>
                      {option.quantity > 1 ? `${option.quantity}× ` : ""}
                      {option.name}
                      {option.price > 0 &&
                        `  ·  $${(option.price * option.quantity).toFixed(2)}`}
                    </Text>
                  ))}
                </View>
              )}

              {orderItem.extras && orderItem.extras.length > 0 && (
                <View className="mt-1.5">
                  {orderItem.extras.map((extra, extraIndex) => (
                    <Text
                      key={extraIndex}
                      className="text-[15px] leading-5 text-stone-600"
                    >
                      <Text className="text-stone-400">· </Text>
                      Add: {extra.description}
                      <Text className="text-stone-500">
                        {extra.price > 0 && `· $${extra.price.toFixed(2)}`}
                      </Text>
                    </Text>
                  ))}
                </View>
              )}

              {orderItem.changes && orderItem.changes.length > 0 && (
                <View className="mt-1.5">
                  {orderItem.changes.map((change, changeIndex) => (
                    <Text
                      key={changeIndex}
                      className="text-[15px] leading-5 text-stone-600"
                    >
                      <Text className="text-stone-400">· </Text>
                      {change.from} → {change.to}
                      <Text className="text-stone-500">
                        {change.price > 0 && `· $${change.price.toFixed(2)}`}
                      </Text>
                    </Text>
                  ))}
                </View>
              )}

              {orderItem.instructions ? (
                <View className="mt-2.5 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                  <Text className="text-[15px] italic leading-5 text-stone-600">
                    {"\u201c"}
                    {orderItem.instructions}
                    {"\u201d"}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
        {showPaidBtn ? (
          <TouchableOpacity
            onPress={() => onToggleLinePaid!(orderItem.id!, !linePaid)}
            className={`ml-3 justify-center self-center rounded-lg px-2.5 py-2 ${
              linePaid ? "bg-emerald-600" : "bg-stone-200"
            }`}
            activeOpacity={0.75}
          >
            <Text
              className={`text-center text-[11px] font-bold uppercase ${
                linePaid ? "text-white" : "text-stone-700"
              }`}
            >
              {linePaid ? "Paid" : "Unpaid"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

const OrderItemsList = memo(function OrderItemsList({
  orderItems = [],
  orderId,
  selectionMode,
  selectedItemIds,
  onToggleItemSelection,
  showSectionHeaders = true,
  linePaidToggleEnabled = false,
  onToggleLinePaid,
}: Props) {
  const isSelectionMode = selectionMode === orderId;

  const sections = useMemo(
    () => groupOrderItemsByDisplaySection(orderItems),
    [orderItems],
  );

  const flatSorted = useMemo(
    () => sortOrderItemsForDisplay(orderItems),
    [orderItems],
  );

  if (!showSectionHeaders) {
    return (
      <>
        {flatSorted.map((orderItem, index) => (
          <OrderItemRow
            key={`${orderItem.id ?? "item"}-flat-${index}`}
            orderItem={orderItem}
            isSelectionMode={isSelectionMode}
            isSelected={
              orderItem.id ? selectedItemIds.has(orderItem.id) : false
            }
            linePaidToggleEnabled={linePaidToggleEnabled}
            onToggleItemSelection={onToggleItemSelection}
            onToggleLinePaid={onToggleLinePaid}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {sections.map((section, sectionIndex) => (
        <View key={`section-${section.tier}`}>
          <OrderSectionHeader
            title={section.title}
            tier={section.tier}
            isFirst={sectionIndex === 0}
          />
          {section.items.map((orderItem, index) => (
            <OrderItemRow
              key={`${orderItem.id ?? "item"}-${section.tier}-${index}`}
              orderItem={orderItem}
              isSelectionMode={isSelectionMode}
              isSelected={
                orderItem.id ? selectedItemIds.has(orderItem.id) : false
              }
              linePaidToggleEnabled={linePaidToggleEnabled}
              onToggleItemSelection={onToggleItemSelection}
              onToggleLinePaid={onToggleLinePaid}
            />
          ))}
        </View>
      ))}
    </>
  );
});

export default OrderItemsList;
