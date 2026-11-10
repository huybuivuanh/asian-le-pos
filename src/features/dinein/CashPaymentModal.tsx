import { useAsyncAction } from "@/hooks/useAsyncAction";
import { openCashDrawer } from "@/services/printService";
import FullScreenLoadingOverlay from "@/ui/FullScreenLoadingOverlay";
import React, { useMemo, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  onClose: () => void;
  orderTotal: number;
};

export default function CashPaymentModal({ onClose, orderTotal }: Props) {
  const insets = useSafeAreaInsets();
  const [cashAmountText, setCashAmountText] = useState("");

  const cashReceived = useMemo(() => {
    const n = parseFloat(cashAmountText);
    return Number.isFinite(n) ? n : 0;
  }, [cashAmountText]);

  const cashDifference = cashReceived - orderTotal;

  // Only on the "Open drawer" button, not when the modal opens.
  const { execute: requestDrawer, loading: openingDrawer } = useAsyncAction(
    openCashDrawer,
    { errorTitle: "Couldn't open the cash drawer" },
  );

  const handleClose = () => {
    Keyboard.dismiss();
    setCashAmountText("");
    onClose();
  };

  const onCashAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const dot = cleaned.indexOf(".");
    if (dot !== -1 && cleaned.indexOf(".", dot + 1) !== -1) return;
    const frac = cleaned.split(".")[1];
    if (frac !== undefined && frac.length > 2) return;
    setCashAmountText(cleaned);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          className="flex-1 justify-start px-5"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Pressable
            className="absolute inset-0 bg-black/50"
            onPress={handleClose}
            accessibilityLabel="Close cash payment"
          />
          <View className="relative z-10 w-full max-w-md self-center rounded-2xl bg-white p-5 shadow-xl">
          <Text className="mb-4 text-center text-lg font-bold text-gray-900">
            Cash payment
          </Text>

          <View className="mb-4 flex-row justify-between rounded-xl bg-gray-50 px-4 py-3">
            <Text className="text-base text-gray-600">Order total</Text>
            <Text className="text-base font-bold text-gray-900">
              ${orderTotal.toFixed(2)}
            </Text>
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">
            Cash received
          </Text>
          <TextInput
            className="mb-4 rounded-xl border border-gray-300 px-4 py-3 text-lg text-gray-900"
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            value={cashAmountText}
            onChangeText={onCashAmountChange}
          />

          {cashAmountText.length > 0 ? (
            <View
              className={`mb-4 rounded-xl px-4 py-3 ${
                cashDifference >= 0 ? "bg-emerald-50" : "bg-amber-50"
              }`}
            >
              {cashDifference >= 0 ? (
                <>
                  <Text className="text-sm font-medium text-emerald-800">
                    Change
                  </Text>
                  <Text className="text-2xl font-bold text-emerald-900">
                    ${cashDifference.toFixed(2)}
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-sm font-medium text-amber-900">
                    Remaining
                  </Text>
                  <Text className="text-2xl font-bold text-amber-950">
                    ${(-cashDifference).toFixed(2)}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
              <Text className="text-center text-sm text-gray-500">
                Enter cash amount to see change or amount owed
              </Text>
            </View>
          )}

          <TouchableOpacity
            className="mb-2 rounded-xl border border-gray-300 py-3"
            onPress={() => requestDrawer()}
            disabled={openingDrawer}
            activeOpacity={0.85}
          >
            <Text className="text-center text-base font-semibold text-gray-800">
              Open drawer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-xl bg-gray-800 py-3.5"
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text className="text-center text-base font-semibold text-white">
              Close
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </KeyboardAvoidingView>
      {/* Inside the cash modal so it shows on top of it. */}
      <FullScreenLoadingOverlay
        visible={openingDrawer}
        title="Opening cash drawer…"
        subtitle=""
      />
    </Modal>
  );
}
