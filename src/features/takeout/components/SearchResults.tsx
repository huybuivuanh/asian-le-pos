import { menuItemLabel, searchMenuItems } from "@/domain/menu/menuItemNumber";
import { FlashList } from "@shopify/flash-list";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  items: MenuItem[];
  query: string;
  onSelectItem: (item: MenuItem) => void;
};

export default function SearchResults({ items, query, onSelectItem }: Props) {
  const q = query.trim();
  const displayItems = searchMenuItems(items, q);

  if (!items.length) {
    return (
      <Text className="text-center text-gray-500 mt-4">No menu items</Text>
    );
  }

  if (q && !displayItems.length) {
    return (
      <Text className="text-center text-gray-500 mt-4">No items found</Text>
    );
  }

  return (
    <View className="flex-1 pl-4 pr-4" style={{ flex: 1, minHeight: 0 }}>
      <FlashList
        style={{ flex: 1, minHeight: 0, width: "100%", alignSelf: "stretch" }}
        keyboardShouldPersistTaps="always"
        data={displayItems}
        keyExtractor={(item, index) => item.id ?? `menu-item-${index}`}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mb-3 p-3 bg-gray-100 rounded-lg"
            onPress={() => onSelectItem(item)}
          >
            <Text className="text-lg font-medium text-gray-800">
              {menuItemLabel(item)}
            </Text>
            <Text className="text-gray-600">${item.price.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
