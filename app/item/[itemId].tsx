import {
  AddExtraEditor,
  ItemChangeEditor,
  SpecialFlagsSelector,
} from "@/features/order";
import { menuItemLabel } from "@/domain/menu/menuItemNumber";
import { ItemOptionGroupSelector } from "@/features/order/components/ItemOptionGroupSelector";
import { useItemCustomizer } from "@/features/order/hooks/useItemCustomizer";
import SafeAreaViewWrapper from "@/layout/SafeAreaViewWrapper";
import { useCartStore } from "@/stores/useCartStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { changeKey, usePendingItemChangesStore } from "@/stores/usePendingItemChangesStore";
import { extraKey, usePendingExtrasStore } from "@/stores/usePendingExtrasStore";
import { OrderType } from "@/types/enums";
import Header from "@/ui/Header";
import { getItemOptionGroupsInDisplayOrder } from "@/utils/menuOrdering";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function Item() {
  const router = useRouter();
  const { itemId, orderType, orderItemId } = useLocalSearchParams();
  const { menuItems, optionGroups, options } = useMenuStore();
  const { order } = useCartStore();

  const itemIdStr = Array.isArray(itemId) ? itemId[0] : itemId;
  const orderTypeStr = Array.isArray(orderType) ? orderType[0] : orderType;
  const orderItemIdStr = Array.isArray(orderItemId) ? orderItemId[0] : orderItemId;

  const item = menuItems.find((i) => i.id === itemIdStr);
  const isEditMode = !!orderItemIdStr;
  const existingOrderItem = isEditMode
    ? order.orderItems?.find((oi) => oi.id === orderItemIdStr)
    : null;

  const {
    quantity, setQuantity,
    instructions, setInstructions,
    selectedOptions,
    extras, setExtras,
    changes, setChanges,
    specialFlag, setSpecialFlag,
    toggleOption,
    updateOptionQuantity,
    handleSubmit,
  } = useItemCustomizer({ item: item!, existingOrderItem, isEditMode, orderItemId: orderItemIdStr, optionGroups, options });

  // Apply the diff of changes toggled in the menu-changes picker on return —
  // additions get merged in, removals drop matching entries, both deduped by
  // from/to so re-navigating in and out doesn't create duplicates.
  useFocusEffect(
    useCallback(() => {
      const { additions, removals } = usePendingItemChangesStore.getState().consume();
      if (additions.length === 0 && removals.length === 0) return;
      setChanges((prev) => {
        const withoutRemoved = prev.filter(
          (c) => !removals.some((r) => changeKey(r) === changeKey(c)),
        );
        const existingKeys = new Set(withoutRemoved.map(changeKey));
        const toAdd = additions.filter((c) => !existingKeys.has(changeKey(c)));
        return [...withoutRemoved, ...toAdd];
      });
    }, [setChanges]),
  );

  // Same diff-apply pattern as above, but for extras toggled in the add-extras picker.
  useFocusEffect(
    useCallback(() => {
      const { additions, removals } = usePendingExtrasStore.getState().consume();
      if (additions.length === 0 && removals.length === 0) return;
      setExtras((prev) => {
        const withoutRemoved = prev.filter(
          (e) => !removals.some((r) => extraKey(r) === extraKey(e)),
        );
        const existingKeys = new Set(withoutRemoved.map(extraKey));
        const toAdd = additions.filter((e) => !existingKeys.has(extraKey(e)));
        return [...withoutRemoved, ...toAdd];
      });
    }, [setExtras]),
  );

  if (!item) {
    return (
      <SafeAreaViewWrapper>
        <Text>Item not found</Text>
      </SafeAreaViewWrapper>
    );
  }

  const onSubmit = () => {
    const success = handleSubmit();
    if (!success) return;
    router.back();
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaViewWrapper className="flex-1 bg-white">
        <Header title={menuItemLabel(item)} onBack={() => router.back()} />

        <ScrollView
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          className="flex-1"
        >
          <Text className="text-base mb-2">Special instructions:</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3 mb-4 min-h-[80px]"
            placeholder="Add instructions..."
            value={instructions}
            onChangeText={setInstructions}
            returnKeyLabel="Hide"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          {getItemOptionGroupsInDisplayOrder(item, optionGroups).map((group) => (
            <ItemOptionGroupSelector
              key={group.id}
              group={group}
              options={options}
              selectedOptions={selectedOptions}
              onToggleOption={toggleOption}
              onUpdateOptionQuantity={updateOptionQuantity}
            />
          ))}

          <AddExtraEditor
            extras={extras}
            onChange={setExtras}
            onBrowseAddExtras={() => {
              usePendingExtrasStore.getState().clear();
              router.push({
                pathname: "/add-extras",
                params: { existingExtras: JSON.stringify(extras) },
              });
            }}
          />
          <ItemChangeEditor
            changes={changes}
            onChange={setChanges}
            onBrowseMenuChanges={() => {
              usePendingItemChangesStore.getState().clear();
              router.push({
                pathname: "/menu-changes",
                params: { existingChanges: JSON.stringify(changes) },
              });
            }}
          />
          {orderTypeStr === OrderType.DineIn && (
            <View className="mt-3">
              <SpecialFlagsSelector selected={specialFlag} onChange={setSpecialFlag} />
            </View>
          )}

          <View className="mt-6 mb-4 bg-white border-t border-gray-200 pt-4">
            <View className="flex-row justify-center items-center mb-4">
              <TouchableOpacity
                className="w-14 h-14 rounded-full bg-gray-200 justify-center items-center"
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Text className="text-2xl font-bold">−</Text>
              </TouchableOpacity>
              <Text className="mx-6 text-2xl font-semibold">{quantity}</Text>
              <TouchableOpacity
                className="w-14 h-14 rounded-full bg-gray-200 justify-center items-center"
                onPress={() => setQuantity((q) => q + 1)}
              >
                <Text className="text-2xl font-bold">＋</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="bg-gray-800 py-4 rounded-lg items-center"
              onPress={onSubmit}
            >
              <Text className="text-white font-bold text-lg">
                {isEditMode ? "Update Item" : "Add to Order"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaViewWrapper>
    </KeyboardAvoidingView>
  );
}
