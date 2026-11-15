import { DiscountType } from "@/types/enums";
import React from "react";
import { Text, View } from "react-native";

type Props = {
  taxBreakDown: TaxBreakDown;
  isSelectionMode: boolean;
  selectedItemsTotal: number;
  selectedItemsTaxBreakDown: TaxBreakDown;
  orderSubtotal: number;
};

export default function OrderTaxBreakdown({
  taxBreakDown,
  isSelectionMode,
  selectedItemsTotal,
  selectedItemsTaxBreakDown,
  orderSubtotal,
}: Props) {
  return (
    <View className="mt-2 p-2 border-t border-gray-200">
      {isSelectionMode ? (
        <>
          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">
              Selected Items Subtotal
            </Text>
            <Text className="text-base text-gray-700">
              ${selectedItemsTotal.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">PST (6%)</Text>
            <Text className="text-base text-gray-700">
              ${selectedItemsTaxBreakDown.pst.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">GST (5%)</Text>
            <Text className="text-base text-gray-700">
              ${selectedItemsTaxBreakDown.gst.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mt-1 pt-1 border-t border-gray-200">
            <Text className="text-base font-semibold text-gray-800">
              Selected Total
            </Text>
            <Text className="text-base font-bold text-gray-900">
              ${selectedItemsTaxBreakDown.total.toFixed(2)}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">Subtotal</Text>
            <Text className="text-base text-gray-700">
              ${orderSubtotal.toFixed(2)}
            </Text>
          </View>

          {taxBreakDown.discount &&
            taxBreakDown.discount.discountAmount > 0 && (
                <View className="flex-row justify-between mb-1">
                  {taxBreakDown.discount.discountType ===
                  DiscountType.Percent ? (
                    <Text className="text-base text-gray-600">
                      {`Discount (${taxBreakDown.discount.discountValue}%)`}
                    </Text>
                  ) : (
                    <Text className="text-base text-gray-600">
                      {`Discount ($${taxBreakDown.discount.discountValue.toFixed(2)})`}
                    </Text>
                  )}
                  <Text className="text-base text-gray-700">
                    -${taxBreakDown.discount.discountAmount.toFixed(2)}
                  </Text>
                </View>
            )}

          {taxBreakDown.rewards && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-base text-gray-600">
                {`Rewards (${taxBreakDown.rewards.points} pts)`}
              </Text>
              <Text className="text-base text-gray-700">
                -${taxBreakDown.rewards.amount.toFixed(2)}
              </Text>
            </View>
          )}

          {taxBreakDown.taxableSubtotal < taxBreakDown.subTotal && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-base text-gray-700">Taxable Subtotal</Text>
              <Text className="text-base text-gray-700">
                ${taxBreakDown.taxableSubtotal.toFixed(2)}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">PST (6%)</Text>
            <Text className="text-base text-gray-700">
              ${taxBreakDown.pst.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-gray-700">GST (5%)</Text>
            <Text className="text-base text-gray-700">
              ${taxBreakDown.gst.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mb-1">
            <Text className="text-base font-semibold text-gray-800">Total</Text>
            <Text className="text-base font-bold text-gray-900">
              ${taxBreakDown.total.toFixed(2)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
