// Customer-facing display — open this route in a second browser window and
// drag it to the extended monitor. Mirrors the cashier's live cart over
// BroadcastChannel (see src/lib/customerDisplay.ts): same browser, same
// origin, no network/Firestore involved. Not auth-gated — this route sits
// outside the (tabs) group on purpose so this window never needs a staff
// login.
import {
  createCustomerDisplayChannel,
  type CustomerDisplayMessage,
  type RewardsDisplayView,
} from "@/lib/customerDisplay";
import { DiscountType, OrderType } from "@/types/enums";
import { formatPhone } from "@/utils/helpers";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, View, type ScrollViewInstance } from "react-native";

type BillView = {
  items: OrderItem[];
  taxBreakDown?: TaxBreakDown;
  tableNumber?: string;
  customerName?: string;
  phoneNumber?: string;
  staff?: string;
  orderNumber?: string;
};

export default function CustomerDisplayScreen() {
  const [order, setOrder] = useState<OrderDraft | undefined>(undefined);
  const [billView, setBillView] = useState<BillView | null>(null);
  // Rewards: the cashier asked the customer to scan their QR here, and/or
  // the member page is open (name + points).
  const [scanning, setScanning] = useState(false);
  const [rewardsView, setRewardsView] = useState<RewardsDisplayView | null>(null);

  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const handleRewardsScanned = useCallback((memberId: string) => {
    const message: CustomerDisplayMessage = { type: "rewardsScanned", memberId };
    channelRef.current?.postMessage(message);
    setScanning(false);
  }, []);

  useEffect(() => {
    const channel = createCustomerDisplayChannel();
    if (!channel) return;
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      const message = event.data;
      if (message?.type === "cart") setOrder(message.order);
      else if (message?.type === "bill")
        setBillView({
          items: message.items,
          taxBreakDown: message.taxBreakDown,
          tableNumber: message.tableNumber,
          customerName: message.customerName,
          phoneNumber: message.phoneNumber,
          staff: message.staff,
          orderNumber: message.orderNumber,
        });
      else if (message?.type === "clear") setBillView(null);
      else if (message?.type === "rewardsScan") {
        setScanning(true);
        const started: CustomerDisplayMessage = { type: "rewardsScanStarted" };
        channel.postMessage(started);
      } else if (message?.type === "rewardsScanEnd") setScanning(false);
      else if (message?.type === "rewards") setRewardsView(message.view);
      else if (message?.type === "rewardsEnd") setRewardsView(null);
    };
    // Ask the cashier window for the current cart — BroadcastChannel only
    // delivers messages sent after a listener attaches, so a fresh/reloaded
    // display otherwise starts blank until the next cart change.
    const message: CustomerDisplayMessage = { type: "hello" };
    channel.postMessage(message);

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Dine-in carts are built table-side, out of view of this counter display —
  // only take-out orders (built at the register, in front of the customer)
  // should ever show here. Anything else just falls through to the idle
  // "Welcome" state below.
  const isTakeOut = order?.orderType === OrderType.TakeOut;
  const cartItems = isTakeOut ? (order?.orderItems ?? []) : [];
  const cartTaxBreakDown = isTakeOut ? order?.taxBreakDown : undefined;

  // An active payment review (dine-in table, or a take-out order being
  // settled) takes priority over whatever take-out cart happens to be
  // mid-build — it's the thing actually happening at the counter right now.
  const items = billView ? billView.items : cartItems;
  const taxBreakDown = billView ? billView.taxBreakDown : cartTaxBreakDown;
  // Table/name/phone/staff only ever show for a submitted order being
  // reviewed for payment — never for a cart still being built.
  const tableNumber = billView?.tableNumber;
  const customerName = billView?.customerName;
  const phoneNumber = billView?.phoneNumber;
  const staff = billView?.staff;
  const orderNumber = billView?.orderNumber;

  // Default to showing the bottom of the list, so the item the cashier just
  // added is always in view without anyone touching the screen. Scrolling
  // up to review earlier items is a manual, staff-only action from here
  // (mouse wheel on the till PC) — nothing auto-scrolls back down once they
  // do, until the list changes again.
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, [items]);

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 items-center justify-center bg-stone-900 px-8">
        <Text className="text-center text-xl text-stone-300">
          The customer display only works in a browser window on the till
          PC&apos;s extended monitor.
        </Text>
      </View>
    );
  }

  if (scanning) {
    return <RewardsScanScreen onScanned={handleRewardsScanned} />;
  }

  if (items.length === 0) {
    if (rewardsView) {
      return (
        <View className="flex-1 items-center justify-center bg-stone-900 px-8">
          <RewardsPanel view={rewardsView} />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center bg-stone-900 px-8">
        <Text className="text-center text-6xl font-bold text-white">
          Welcome To Asian Le Restaurant!
        </Text>
        <Text className="mt-4 text-center text-2xl text-stone-400">
          Your order will appear here
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-stone-900 px-10 py-10">
      {rewardsView && (
        <View className="mb-6">
          <RewardsPanel view={rewardsView} />
        </View>
      )}

      {Boolean(tableNumber || customerName || phoneNumber || staff || orderNumber) && (
        <View className="mb-6 border-b border-stone-700 pb-4">
          {Boolean(tableNumber) && (
            <Text className="text-3xl font-bold text-white">
              Table: {tableNumber}
            </Text>
          )}
          {(() => {
            const metaFields = [
              customerName && { label: "Name", value: customerName },
              phoneNumber && { label: "Phone", value: formatPhone(phoneNumber) },
              staff && { label: "Staff", value: staff },
              orderNumber && { label: "Order", value: `#${orderNumber}` },
            ].filter(Boolean) as { label: string; value: string }[];

            if (metaFields.length === 0) return null;

            return (
              <View className="mt-1 flex-row flex-wrap items-center gap-3">
                {metaFields.map((field, index) => (
                  <Fragment key={field.label}>
                    {index > 0 && <View className="h-5 w-px bg-stone-600" />}
                    <Text className="text-xl font-semibold text-white">
                      <Text className="text-stone-400">{field.label}: </Text>
                      {field.value}
                    </Text>
                  </Fragment>
                ))}
              </View>
            );
          })()}
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, index) => (
          <View
            key={item.id ?? index}
            className="mb-4 border-b border-stone-700 pb-4"
          >
            <View className="flex-row items-baseline justify-between gap-4">
              <Text
                className="flex-1 text-2xl font-semibold text-white"
                numberOfLines={2}
              >
                <Text className="font-bold text-stone-400">
                  {item.quantity}
                </Text>
                <Text className="text-stone-500"> × </Text>
                {item.name}
              </Text>
              <Text className="text-2xl font-bold text-white">
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>

            {item.options && item.options.length > 0 && (
              <View className="mt-1.5 pl-1">
                {item.options.map((option, optIndex) => (
                  <Text key={optIndex} className="text-lg text-stone-400">
                    · {option.quantity > 1 ? `${option.quantity}× ` : ""}
                    {option.name}
                  </Text>
                ))}
              </View>
            )}

            {item.extras && item.extras.length > 0 && (
              <View className="mt-1.5 pl-1">
                {item.extras.map((extra, extraIndex) => (
                  <Text key={extraIndex} className="text-lg text-stone-400">
                    · Add {extra.description}
                  </Text>
                ))}
              </View>
            )}

            {item.changes && item.changes.length > 0 && (
              <View className="mt-1.5 pl-1">
                {item.changes.map((change, changeIndex) => (
                  <Text key={changeIndex} className="text-lg text-stone-400">
                    · {change.from} → {change.to}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {taxBreakDown && (
        <View className="border-t-2 border-stone-600 pt-4">
          <View className="flex-row justify-between">
            <Text className="text-xl text-stone-300">Subtotal</Text>
            <Text className="text-xl text-stone-300">
              ${taxBreakDown.subTotal.toFixed(2)}
            </Text>
          </View>

          {taxBreakDown.discount &&
            taxBreakDown.discount.discountAmount > 0 && (
              <View className="flex-row justify-between">
                <Text className="text-xl text-stone-300">
                  {taxBreakDown.discount.discountType === DiscountType.Percent
                    ? `Discount (${taxBreakDown.discount.discountValue}%)`
                    : `Discount ($${taxBreakDown.discount.discountValue.toFixed(2)})`}
                </Text>
                <Text className="text-xl text-stone-300">
                  -${taxBreakDown.discount.discountAmount.toFixed(2)}
                </Text>
              </View>
            )}

          {taxBreakDown.rewards && (
            <View className="flex-row justify-between">
              <Text className="text-xl text-stone-300">
                {`Rewards (${taxBreakDown.rewards.points} pts)`}
              </Text>
              <Text className="text-xl text-stone-300">
                -${taxBreakDown.rewards.amount.toFixed(2)}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between">
            <Text className="text-xl text-stone-300">PST (6%)</Text>
            <Text className="text-xl text-stone-300">
              ${taxBreakDown.pst.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xl text-stone-300">GST (5%)</Text>
            <Text className="text-xl text-stone-300">
              ${taxBreakDown.gst.toFixed(2)}
            </Text>
          </View>

          <View className="mt-2 flex-row justify-between border-t border-stone-700 pt-3">
            <Text className="text-3xl font-bold text-white">Total</Text>
            <Text className="text-3xl font-bold text-white">
              ${taxBreakDown.total.toFixed(2)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function RewardsPanel({ view }: { view: RewardsDisplayView }) {
  return (
    <View className="w-full flex-row items-center justify-between rounded-2xl bg-red-700 px-8 py-6">
      <View className="flex-1 mr-6">
        <Text className="text-3xl font-bold text-white" numberOfLines={1}>
          {view.name ? `Hi ${view.name}!` : "Hi!"}
        </Text>
        {view.message ? (
          <Text className="mt-1 text-2xl font-semibold text-red-100">{view.message}</Text>
        ) : (
          <Text className="mt-1 text-xl text-red-100">Asian Le Rewards</Text>
        )}
      </View>
      <View className="items-end">
        <Text className="text-5xl font-extrabold text-white">{view.points}</Text>
        <Text className="text-xl text-red-100">points</Text>
      </View>
    </View>
  );
}

/** Webcam faces the customer: they hold their rewards QR up to it. */
function RewardsScanScreen({ onScanned }: { onScanned: (memberId: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  // Ref, not state: the camera can fire several events before a re-render.
  const scannedRef = useRef(false);

  // Ask for the camera right away — nobody taps this screen. The browser
  // remembers the answer for this site (shared with the cashier window).
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scannedRef.current) return;
      const id = data.trim().split("/").pop();
      if (!id) return;
      scannedRef.current = true;
      onScanned(id);
    },
    [onScanned],
  );

  return (
    <View className="flex-1 items-center justify-center bg-stone-900 px-8 py-8">
      <Text className="text-center text-5xl font-bold text-white">
        Scan your rewards QR code
      </Text>
      <Text className="mt-3 text-center text-2xl text-stone-400">
        Open the Asian Le Rewards app and hold your code up to the camera
      </Text>

      <View
        className="mt-8 overflow-hidden rounded-3xl border-4 border-white bg-black"
        style={{ width: "60%", maxWidth: 640, aspectRatio: 4 / 3 }}
      >
        {permission?.granted ? (
          // Mirrored like a mirror, so moving the phone left moves it left.
          <View style={{ flex: 1, transform: [{ scaleX: -1 }] }}>
            <CameraView
              style={{ flex: 1 }}
              onBarcodeScanned={handleBarcode}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-xl text-stone-300">
              {permission && !permission.canAskAgain
                ? "Camera is blocked for this site. Staff: allow the camera in the browser settings."
                : "Starting camera…"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
