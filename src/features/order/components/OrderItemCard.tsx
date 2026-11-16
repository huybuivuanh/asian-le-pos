import { buildItemScreenParams } from "@/features/takeout";
import { useMenuStore } from "@/stores/useMenuStore";
import { useCartStore } from "@/stores/useCartStore";
import { OrderType } from "@/types/enums";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SpecialFlagsSelector from "./SpecialFlagsSelector";
import { menuItemLabel } from "@/domain/menu/menuItemNumber";

interface Props {
  item: OrderItem;
}

export default function OrderItemCard({ item }: Props) {
  const { updateQuantity, updateOrderItem, order } = useCartStore();
  const { menuItems } = useMenuStore();
  const router = useRouter();

  const getSelectedFlag = (): "appetizer" | "toGo" | null => {
    if (item.togo) return "toGo";
    if (item.appetizer) return "appetizer";
    return null;
  };

  const handleFlagChange = (newFlag: "appetizer" | "toGo" | null) => {
    if (!item.id) return;

    const updates: Partial<OrderItem> = {};
    updates.togo = newFlag === "toGo";
    updates.appetizer = newFlag === "appetizer";

    updateOrderItem(item.id, updates);
  };

  const lineTotal = (item.price * item.quantity).toFixed(2);

  return (
    <View className="mb-2.5 rounded-2xl border border-stone-200/90 bg-white px-4 py-3.5 shadow-sm shadow-stone-200/40">
      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text
              className="flex-1 text-lg font-semibold text-stone-900"
              numberOfLines={3}
            >
              <Text className="font-bold text-stone-600">{item.quantity}</Text>
              <Text className="text-stone-400"> × </Text>
              {menuItemLabel(item)}
            </Text>
            <Text className="text-lg font-bold text-stone-900">
              ${lineTotal}
            </Text>
          </View>

          {item.options && item.options.length > 0 && (
            <View className="mt-2 border-t border-stone-100 pt-2">
              {item.options.map((option, index) => (
                <Text
                  key={index}
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

          {item.extras && item.extras.length > 0 && (
            <View className="mt-1.5">
              {item.extras.map((extra, index) => (
                <Text
                  key={index}
                  className="text-[15px] leading-5 text-stone-600"
                >
                  <Text className="text-stone-400">· </Text>
                  Add {extra.description}
                  <Text className="text-stone-500">
                    {" "}
                    {extra.price > 0 && `· $${extra.price.toFixed(2)}`}
                  </Text>
                </Text>
              ))}
            </View>
          )}

          {item.changes && item.changes.length > 0 && (
            <View className="mt-1.5">
              {item.changes.map((change, index) => (
                <Text
                  key={index}
                  className="text-[15px] leading-5 text-stone-600"
                >
                  <Text className="text-stone-400">· </Text>
                  {change.from} → {change.to}
                  <Text className="text-stone-500">
                    {" "}
                    {change.price > 0 && `· $${change.price.toFixed(2)}`}
                  </Text>
                </Text>
              ))}
            </View>
          )}

          {item.instructions ? (
            <View className="mt-2.5 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
              <Text className="text-[15px] italic leading-5 text-stone-600">
                {"\u201c"}
                {item.instructions}
                {"\u201d"}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="items-stretch justify-start">
          <View className="flex-row items-center">
            <TouchableOpacity
              className="h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 active:bg-stone-100"
              onPress={() =>
                item.id &&
                updateQuantity(item.id, Math.max(item.quantity - 1, 0))
              }
            >
              <Text className="pb-0.5 text-lg font-bold text-stone-700">−</Text>
            </TouchableOpacity>

            <Text className="mx-2 min-w-[28px] text-center text-base font-bold text-stone-900">
              {item.quantity}
            </Text>

            <TouchableOpacity
              className="h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 active:bg-stone-100"
              onPress={() =>
                item.id && updateQuantity(item.id, item.quantity + 1)
              }
            >
              <Text className="pb-0.5 text-lg font-bold text-stone-700">
                ＋
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-2.5 items-center rounded-xl bg-sky-400 px-3 py-2.5 active:bg-slate-900"
            onPress={() => {
              if (item.id) {
                const menuItem = menuItems.find((mi) => mi.name === item.name);
                if (menuItem?.id) {
                  router.push({
                    pathname: "/item/[itemId]",
                    params: buildItemScreenParams(menuItem, {
                      orderType: order.orderType ?? OrderType.TakeOut,
                      orderItemId: item.id,
                    }),
                  });
                }
              }
            }}
          >
            <Text className="text-[15px] font-semibold text-white">Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {order.orderType === OrderType.DineIn && (
        <View className="mt-3 border-t border-stone-100 pt-3">
          <SpecialFlagsSelector
            selected={getSelectedFlag()}
            onChange={handleFlagChange}
          />
        </View>
      )}
    </View>
  );
}
