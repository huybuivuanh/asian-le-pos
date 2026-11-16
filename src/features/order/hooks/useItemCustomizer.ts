import { useCartStore } from "@/stores/useCartStore";
import {
  generateFirestoreId,
  orderPaidFromLineItems,
  showAlert,
} from "@/utils/helpers";
import {
  appendOrderItemOptionsForGroup,
  getItemOptionGroupsInDisplayOrder,
  getMenuItemOptionGroupIdSet,
} from "@/utils/menuOrdering";
import { useCallback, useEffect, useRef, useState } from "react";
import { itemNumberField } from "@/domain/menu/menuItemNumber";

type UseItemCustomizerParams = {
  item: MenuItem;
  existingOrderItem: OrderItem | null | undefined;
  isEditMode: boolean;
  orderItemId: string | undefined;
  optionGroups: OptionGroup[];
  options: ItemOption[];
};

type UseItemCustomizerResult = {
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
  instructions: string;
  setInstructions: React.Dispatch<React.SetStateAction<string>>;
  selectedOptions: Record<string, Record<string, number>>;
  extras: AddExtra[];
  setExtras: React.Dispatch<React.SetStateAction<AddExtra[]>>;
  changes: ItemChange[];
  setChanges: React.Dispatch<React.SetStateAction<ItemChange[]>>;
  specialFlag: "appetizer" | "toGo" | null;
  setSpecialFlag: React.Dispatch<React.SetStateAction<"appetizer" | "toGo" | null>>;
  toggleOption: (group: OptionGroup, option: ItemOption) => void;
  updateOptionQuantity: (groupId: string, optionId: string, delta: number) => void;
  handleSubmit: () => boolean;
};

export function useItemCustomizer({
  item,
  existingOrderItem,
  isEditMode,
  orderItemId,
  optionGroups,
  options,
}: UseItemCustomizerParams): UseItemCustomizerResult {
  const { addItem, updateOrderItem, order } = useCartStore();

  const [quantity, setQuantity] = useState(existingOrderItem?.quantity ?? 1);
  const [instructions, setInstructions] = useState(existingOrderItem?.instructions ?? "");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Record<string, number>>>(() => {
    if (!existingOrderItem?.options || !optionGroups || !item?.optionGroupIds) return {};
    const selected: Record<string, Record<string, number>> = {};
    const itemGroups = getItemOptionGroupsInDisplayOrder(item, optionGroups);
    existingOrderItem.options.forEach((opt) => {
      const matchingOption = options?.find((o) => o.name === opt.name && o.price === opt.price);
      if (matchingOption) {
        for (const group of itemGroups) {
          if (group.optionIds?.includes(matchingOption.id!)) {
            if (!selected[group.id!]) selected[group.id!] = {};
            selected[group.id!][matchingOption.id!] = opt.quantity || 1;
            break;
          }
        }
      }
    });
    return selected;
  });
  const [extras, setExtras] = useState<AddExtra[]>(existingOrderItem?.extras ?? []);
  const [changes, setChanges] = useState<ItemChange[]>(existingOrderItem?.changes ?? []);
  const [specialFlag, setSpecialFlag] = useState<"appetizer" | "toGo" | null>(() => {
    if (existingOrderItem?.togo) return "toGo";
    if (existingOrderItem?.appetizer) return "appetizer";
    return null;
  });

  const prevItemIdRef = useRef<string | undefined>(undefined);

  // Pre-select default options when adding a new item
  useEffect(() => {
    if (isEditMode || !item?.id) return;
    if (!item.optionGroupIds?.length || !optionGroups.length || !options.length) return;

    const switchedItem = prevItemIdRef.current !== item.id;
    if (switchedItem) prevItemIdRef.current = item.id;

    setSelectedOptions((prev) => {
      const allowed = getMenuItemOptionGroupIdSet(item);
      let next: Record<string, Record<string, number>>;

      if (switchedItem) {
        next = {};
        for (const gid of Object.keys(prev)) {
          if (allowed.has(gid)) next[gid] = { ...prev[gid] };
        }
      } else {
        next = { ...prev };
      }

      const itemGroups = getItemOptionGroupsInDisplayOrder(item, optionGroups);
      let changed = switchedItem;

      for (const group of itemGroups) {
        const gid = group.id;
        if (!gid) continue;
        const defaultId = group.defaultOptionId;
        if (!defaultId || !group.optionIds?.includes(defaultId)) continue;
        const existing = next[gid];
        if (existing && Object.keys(existing).length > 0) continue;
        if (!options.some((o) => o.id === defaultId)) continue;
        next[gid] = { [defaultId]: 1 };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [isEditMode, item, optionGroups, options]);

  // Sync form state when editing an existing item
  useEffect(() => {
    if (!isEditMode || !existingOrderItem) return;

    setQuantity(existingOrderItem.quantity ?? 1);
    setInstructions(existingOrderItem.instructions ?? "");
    setExtras(existingOrderItem.extras ?? []);
    setChanges(existingOrderItem.changes ?? []);
    setSpecialFlag(
      existingOrderItem.togo ? "toGo" : existingOrderItem.appetizer ? "appetizer" : null,
    );

    if (existingOrderItem.options && optionGroups && options && item?.optionGroupIds) {
      const selected: Record<string, Record<string, number>> = {};
      const itemGroups = getItemOptionGroupsInDisplayOrder(item, optionGroups);
      existingOrderItem.options.forEach((opt) => {
        const matchingOption = options.find((o) => o.name === opt.name && o.price === opt.price);
        if (matchingOption) {
          for (const group of itemGroups) {
            if (group.optionIds?.includes(matchingOption.id!)) {
              if (!selected[group.id!]) selected[group.id!] = {};
              selected[group.id!][matchingOption.id!] = opt.quantity || 1;
              break;
            }
          }
        }
      });
      setSelectedOptions(selected);
    } else {
      setSelectedOptions({});
    }
  }, [existingOrderItem, isEditMode, optionGroups, options, item]);

  const toggleOption = useCallback((group: OptionGroup, option: ItemOption) => {
    setSelectedOptions((prev) => {
      const current = prev[group.id!] || {};
      if (group.multipleOptionQuantity) {
        const currentQty = current[option.id!] || 0;
        if (currentQty > 0) {
          const updated = { ...current };
          delete updated[option.id!];
          return { ...prev, [group.id!]: updated };
        }
        const activeIds = Object.keys(current).filter((id) => current[id] > 0);
        if (group.maxSelection === 1) return { ...prev, [group.id!]: { [option.id!]: 1 } };
        if (group.maxSelection != null && group.maxSelection > 0 && activeIds.length >= group.maxSelection) return prev;
        return { ...prev, [group.id!]: { ...current, [option.id!]: 1 } };
      }
      if (group.maxSelection === 1) {
        if (current[option.id!]) return { ...prev, [group.id!]: {} };
        return { ...prev, [group.id!]: { [option.id!]: 1 } };
      }
      const currentIds = Object.keys(current);
      if (current[option.id!]) {
        const updated = { ...current };
        delete updated[option.id!];
        return { ...prev, [group.id!]: updated };
      }
      if (group.maxSelection && currentIds.length >= group.maxSelection) return prev;
      return { ...prev, [group.id!]: { ...current, [option.id!]: 1 } };
    });
  }, []);

  const updateOptionQuantity = useCallback(
    (groupId: string, optionId: string, delta: number) => {
      setSelectedOptions((prev) => {
        const group = optionGroups.find((g) => g.id === groupId);
        if (!group) return prev;
        const current = prev[groupId] || {};
        const currentQty = current[optionId] || 0;
        const newQty = Math.max(0, currentQty + delta);
        if (newQty === 0) {
          const updated = { ...current };
          delete updated[optionId];
          return { ...prev, [groupId]: updated };
        }
        if (currentQty === 0 && delta > 0) {
          const activeIds = Object.keys(current).filter((id) => current[id] > 0);
          const addingNewDistinct = !activeIds.includes(optionId);
          if (addingNewDistinct) {
            if (group.maxSelection === 1) return { ...prev, [groupId]: { [optionId]: newQty } };
            if (group.maxSelection != null && group.maxSelection > 0 && activeIds.length >= group.maxSelection) return prev;
          }
        }
        return { ...prev, [groupId]: { ...current, [optionId]: newQty } };
      });
    },
    [optionGroups],
  );

  const handleSubmit = useCallback((): boolean => {
    const groups = getItemOptionGroupsInDisplayOrder(item, optionGroups);
    for (const group of groups) {
      const selectedCount = Object.values(selectedOptions[group.id!] || {}).filter((q) => q > 0).length;
      if (selectedCount < group.minSelection) {
        showAlert("Please Select Required Options");
        return false;
      }
    }

    const optionsToSubmit: OrderItemOption[] = [];
    for (const group of groups) {
      appendOrderItemOptionsForGroup(optionsToSubmit, group, selectedOptions[group.id!], options);
    }

    const extrasTotal = extras.reduce((sum, e) => sum + (e.price || 0), 0);
    const changesTotal = changes.reduce((sum, c) => sum + (c.price || 0), 0);
    const orderItemPrice =
      (item.price || 0) +
      optionsToSubmit.reduce((acc, o) => acc + o.price * o.quantity, 0) +
      extrasTotal +
      changesTotal;

    if (isEditMode && orderItemId) {
      updateOrderItem(orderItemId, {
        name: item.name,
        ...itemNumberField(item),
        togo: specialFlag === "toGo",
        appetizer: specialFlag === "appetizer",
        kitchenType: item.kitchenType,
        price: orderItemPrice,
        quantity,
        instructions: instructions.trim(),
        options: optionsToSubmit,
        extras,
        changes,
      });
    } else {
      addItem({
        id: generateFirestoreId(),
        name: item.name,
        ...itemNumberField(item),
        togo: specialFlag === "toGo",
        appetizer: specialFlag === "appetizer",
        kitchenType: item.kitchenType,
        paid: orderPaidFromLineItems(order.orderItems ?? []),
        completed: false,
        price: orderItemPrice,
        quantity,
        ...(instructions !== "" && { instructions }),
        ...(optionsToSubmit.length > 0 && { options: optionsToSubmit }),
        ...(extras.length > 0 && { extras }),
        ...(changes.length > 0 && { changes }),
      });
    }

    return true;
  }, [
    item, optionGroups, selectedOptions, options, extras, changes,
    isEditMode, orderItemId, specialFlag, instructions, quantity,
    addItem, updateOrderItem, order.orderItems,
  ]);

  return {
    quantity, setQuantity,
    instructions, setInstructions,
    selectedOptions,
    extras, setExtras,
    changes, setChanges,
    specialFlag, setSpecialFlag,
    toggleOption,
    updateOptionQuantity,
    handleSubmit,
  };
}
