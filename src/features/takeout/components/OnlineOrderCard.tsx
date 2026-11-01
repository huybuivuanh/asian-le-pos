import { DiscountType, TakeOutFulfillmentKind } from "@/types/enums";
import { formatDate, formatPhone } from "@/utils/helpers";
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  item: OnlineOrder;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
};

const STATUS_BADGE: Record<OnlineOrder["status"], { label: string; className: string; text: string }> = {
  New: { label: "New", className: "bg-yellow-300", text: "text-yellow-900" },
  InProgress: { label: "In Progress", className: "bg-blue-200", text: "text-blue-800" },
  ReadyForPickup: { label: "Ready for pickup", className: "bg-teal-200", text: "text-teal-800" },
  Completed: { label: "Completed", className: "bg-green-200", text: "text-green-800" },
  Cancelled: { label: "Cancelled", className: "bg-red-200", text: "text-red-800" },
};

const money = (n: number | undefined) => `$${(n ?? 0).toFixed(2)}`;

/** Read-only online order (from the website). Managed in the Orders app, not here. */
export const OnlineOrderCard = memo(function OnlineOrderCard({
  item,
  expanded,
  onToggleExpand,
}: Props) {
  const scheduledAt =
    item.fulfillment?.kind === TakeOutFulfillmentKind.Scheduled
      ? item.fulfillment.scheduledAt
      : undefined;
  const readyMinutes =
    item.fulfillment?.kind === TakeOutFulfillmentKind.Immediate
      ? item.fulfillment.readyTimeMinutes
      : undefined;

  // Same colours as take-out cards (New included; its badge sets it apart).
  const cardBg =
    item.status === "Cancelled"
      ? "bg-red-100 border-red-200"
      : item.status === "Completed"
        ? "bg-green-100 border-green-200"
        : scheduledAt
          ? "bg-orange-100 border-orange-200"
          : "bg-blue-100 border-blue-200";

  const status = STATUS_BADGE[item.status] ?? STATUS_BADGE.InProgress;
  const showPaid = !(item.status === "Cancelled" || (item.status === "Completed" && !item.paid));
  const tax = item.taxBreakDown;

  return (
    <View className={`${cardBg} p-4 mb-3 rounded-xl shadow-sm border`}>
      <TouchableOpacity
        className="flex-row justify-between items-center"
        onPress={() => onToggleExpand(item.id)}
      >
        <View className="flex-1 mr-2">
          <Text className="font-bold text-purple-800 text-base">
            Online{item.orderNumber ? ` #${item.orderNumber}` : ""}
          </Text>
          {item.customerName ? (
            <Text className="font-semibold text-gray-800 text-base">Name: {item.customerName}</Text>
          ) : null}
          {item.phoneNumber ? (
            <Text className="font-semibold text-gray-800 text-base">
              Phone #: {formatPhone(item.phoneNumber)}
            </Text>
          ) : null}
          {readyMinutes != null && (
            <Text className="font-semibold text-gray-800 text-base">Ready In: {readyMinutes} min</Text>
          )}
          <Text className="font-semibold text-gray-800 text-base">
            Ordered At: {formatDate(item.createdAt)}
          </Text>
          {scheduledAt && (
            <Text className="font-semibold text-gray-800 text-base">
              Preorder: {formatDate(scheduledAt)}
            </Text>
          )}
        </View>

        <View className="items-end">
          <View className="px-3 py-1 rounded-full bg-purple-200 mb-1">
            <Text className="text-xs font-semibold text-purple-800">Online</Text>
          </View>
          <View className={`px-3 py-1 rounded-full mb-1 ${item.printed ? "bg-indigo-100" : "bg-amber-100"}`}>
            <Text className={`text-xs font-semibold ${item.printed ? "text-indigo-700" : "text-amber-700"}`}>
              {item.printed ? "Printed" : "Not Printed"}
            </Text>
          </View>
          <View
            className={`px-3 py-1 rounded-full mb-1 ${item.paid ? "bg-fuchsia-100" : "bg-slate-200"} ${showPaid ? "" : "opacity-0"}`}
          >
            <Text className={`text-xs font-semibold ${item.paid ? "text-fuchsia-700" : "text-slate-600"}`}>
              {item.paid ? "Paid" : "Unpaid"}
            </Text>
          </View>
          <View className={`px-3 py-1 rounded-full ${status.className}`}>
            <Text className={`text-xs font-semibold ${status.text}`}>{status.label}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-3 border-t border-gray-200 pt-2">
          {(item.orderItems ?? []).map((oi, index) => (
            <View key={`${oi.name}-${index}`} className="py-1.5 border-b border-gray-100">
              <View className="flex-row justify-between">
                <Text className="text-base font-semibold text-gray-800 flex-1 mr-2">
                  {oi.quantity} × {oi.name}
                </Text>
                <Text className="text-base text-gray-800">{money(oi.price * oi.quantity)}</Text>
              </View>
              {oi.options?.map((opt, i) => (
                <Text key={`${opt.name}-${i}`} className="text-sm text-gray-600 ml-4">
                  • {opt.name}
                  {opt.quantity > 1 ? ` ×${opt.quantity}` : ""}
                  {opt.price > 0 ? ` (+${money(opt.price)})` : ""}
                </Text>
              ))}
              {oi.instructions ? (
                <Text className="text-sm italic text-gray-600 ml-4">“{oi.instructions}”</Text>
              ) : null}
            </View>
          ))}

          {tax && (
            <View className="mt-2 p-2 border-t border-gray-200">
              <Row label="Subtotal" value={money(tax.subTotal)} />
              {tax.discount && tax.discount.discountAmount > 0 ? (
                <>
                  <Row
                    label={
                      tax.discount.discountType === DiscountType.Percent
                        ? `Discount (${tax.discount.discountValue}%)`
                        : `Discount (${money(tax.discount.discountValue)})`
                    }
                    value={`-${money(tax.discount.discountAmount)}`}
                  />
                  <Row label="Taxable Subtotal" value={money(tax.discount.taxableSubtotal)} />
                </>
              ) : null}
              {tax.pst > 0 && <Row label="PST" value={money(tax.pst)} />}
              {tax.gst > 0 && <Row label="GST" value={money(tax.gst)} />}
              <Row label="Total" value={money(tax.total)} bold />
            </View>
          )}

          <Text className="mt-2 text-center text-xs text-gray-500">
            Online order — manage it in the Orders app.
          </Text>
        </View>
      )}
    </View>
  );
});

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between mb-1">
      <Text className={`text-base ${bold ? "font-semibold text-gray-800" : "text-gray-700"}`}>{label}</Text>
      <Text className={`text-base ${bold ? "font-bold text-gray-900" : "text-gray-700"}`}>{value}</Text>
    </View>
  );
}
