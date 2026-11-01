# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Asian Le POS** — a cross-platform (iOS, Android, Web) Point-of-Sale system for a restaurant, built with Expo. It handles dine-in table orders, take-out orders, menu management, kitchen routing, and payment tracking. Backend is entirely Firebase (Firestore + Auth + Cloud Functions).

## Commands

### Expo App (root)
```bash
npx expo start          # Start dev server
npm run android         # Run on Android emulator
npm run ios             # Run on iOS simulator
npm run web             # Run web build
npm run lint            # Run ESLint
```

### Firebase Cloud Functions (`/functions`)
```bash
npm run build           # Compile TypeScript → lib/index.js
npm run serve           # Build + start Firebase emulators locally
npm run deploy          # Deploy functions to Firebase
```

### Firebase Hosting
Deploy triggers `npm --prefix functions run build` automatically before upload. The web export goes to `dist/`.

## Architecture

### Routing & Screens
Expo Router (file-based) under `/app`. Typed routes and React Compiler are enabled via `app.json`.

**Root**
- `_layout.tsx` — Root layout: loads fonts, initializes AuthProvider, loads menu cache, sets up GestureHandler + BottomSheet providers, offline banner

**Auth**
- `(login)/login.tsx` — Email/password login screen

**Tabs** (`(tabs)/`) — 5-tab main UI; store subscriptions (menu, orders, tables, customers, credits, menuChanges) started/stopped in `_layout.tsx`
- `index.tsx` — Take-out menu picker (browse + search)
- `tables.tsx` — Dine-in table grid (Open/Occupied status)
- `dine-in-orders.tsx` — Active dine-in orders list with pagination
- `take-out-orders.tsx` — Take-out orders list with status and actions
- `profile.tsx` — User profile + logout

**Dine-In flows** (`dinein/`)
- `table/[tableNumber].tsx` — Table detail: order items, payment, cash modal, all table actions
- `take-order/[tableNumber]/index.tsx` — Menu picker for new dine-in order
- `review-order/[tableNumber].tsx` — Review + submit new dine-in order
- `edit-order/[tableNumber].tsx` — Edit existing dine-in order
- `change-table/[tableNumber].tsx` — Move order to a different table
- `change-to-takeout/[tableNumber].tsx` — Convert dine-in order to take-out

**Take-Out flows** (`take-out-orders/`, `takeout/`)
- `take-out-orders/add-item/index.tsx` — Add items to existing take-out order
- `take-out-orders/edit-order.tsx` — Edit existing take-out order
- `take-out-orders/change-to-dinein/[orderId].tsx` — Convert take-out order to dine-in
- `takeout/review-order.tsx` — Review + submit new take-out order

**Item**
- `item/[itemId].tsx` — Menu item detail + customization (options, extras, changes, special flags); used in both add and edit modes across all order flows

**Admin/Support**
- `menu-changes.tsx` — Reference list of item name substitutions/changes
- `credits.tsx` — Store credit records list

### Dine-In Navigation Stack Rules
`router.replace()` on dine-in screens causes significant slowness — avoid it. Use `router.dismiss(n)` or `router.back()` to pop back to the already-mounted table page (which refreshes via its Firestore listener automatically).

Dine-in order flows and their stacks:
- **New order**: `tabs → table/[T] → take-order/[T] → review-order/[T]` — after submit, use `router.dismiss(2)` to pop back to table
- **Edit order**: `tabs → table/[T] → edit-order/[T]` — after submit, use `router.back()` to pop back to table

Never push or replace to `table/[T]` after a dine-in submit — the table page is already in the stack and will show the updated order via its live Firestore listener.

### State Management
11 Zustand stores in `src/stores/`:

| Store | Responsibility |
|---|---|
| `useCartStore` | In-memory order draft (items, discounts, tax calculation) — not persisted |
| `useOrderStore` | Order operations: submit, update, cancel, complete, mark paid, print queue, order type conversion |
| `useMenuStore` | Menu items, categories, option groups — Firestore sync + AsyncStorage cache with version tracking |
| `useTableStore` | Table status (Open/Occupied) — real-time Firestore sync |
| `useDineInOrdersStore` | Dine-in orders list with pagination (25 cached, 30 displayed) — real-time Firestore sync |
| `useActiveDineInOrdersStore` | Derived view of dine-in orders filtered to InProgress status (uses same subscription as above) |
| `useTakeOutOrdersStore` | Take-out orders list with pagination (30 cached, 40 displayed with load-more) — real-time Firestore sync |
| `useCustomersStore` | Customer list (name, phone) — cache-first, write-through |
| `useCreditsStore` | Store credits/refunds — cache-first, lazy loaded |
| `useMenuChangesStore` | Item name substitution reference (from→to) — cache-first |
| `useNetworkStore` | Network connectivity status via NetInfo |
| `useOnlineOrdersStore` | Read-only online (website) orders from `onlineOrders` — cache-first + live; merged into the Out Orders list by `useTakeOutHistoryList` |

All stores are cleared on logout to prevent data leaks.

### Menu Caching Strategy
`useMenuStore` checks a `menuVersion` doc in Firestore on load. If the version has changed since last fetch, it pulls all menu collections and writes to AsyncStorage. Otherwise it reads from cache. `loadCachedMenu()` is called from the root layout (`app/_layout.tsx`) immediately on app open — parallel to Firebase auth — so menu data is ready before auth resolves.

### Cache-First Pattern (customers, credits, menuChanges)
`useCustomersStore`, `useCreditsStore`, and `useMenuChangesStore` all follow the same pattern:
1. On subscribe/fetch: serve AsyncStorage cache immediately so UI is not blank
2. Fetch from Firestore in the background, update state + re-save cache on success
3. On writes: write-through to Firestore then update state + cache
4. `clearData()` wipes both in-memory state and AsyncStorage cache

### Features (`src/features/`)

**`order/`** — Shared order editing UI used across dine-in and take-out
- Components: `OrderItemsList`, `OrderItemCard`, `OrderLinesList`, `OrderSectionHeader`, `AddExtraEditor`, `ItemChangeEditor`, `ItemOptionGroupSelector`, `SpecialFlagsSelector`, `DiscountButtonModalAndSummary`, `OrderTaxBreakdown`
- Hooks: `useItemCustomizer` — manage customizing a single menu item (options, extras, changes, special flags, instructions)
- Utils: `orderItemSections` — group and sort order items for kitchen display

**`dinein/`** — Dine-in specific
- Components: `DineInOrderCard`, `TableInfoCard`, `EditTableForm`, `CashPaymentModal`
- Hooks: `useDineInTableActions` — cancel, complete, print, mark paid with loading overlays; `useLinePaidDebounce` — debounce individual line item paid toggles to avoid excessive Firestore writes

**`takeout/`** — Take-out specific
- Components: `TakeOutOrderCard`, `CustomerInfoForm`, `MenuPickerBody`, `SearchResults`, `OrderFooter`, `ReadyTimeSelector`, `WebScheduledDateTimeInput`
- Hooks: `useTakeOutOrderActions` — complete, cancel, mark paid, print with UI state; `useDebouncedMenuSearch` — debounced menu search query
- Utils: `itemRouteParams` — build route params for item detail navigation

### Menu Picker UX
When taking an order (all 3 flows: dine-in, take-out, add-item to existing order), the item picker screen:
- **Default view**: shows items from the first category only (sorted by category `order` field) — keeps the list short since staff use search
- **Search**: switches to all items across all categories, filtered by name (300ms debounce)
- **Keyboard**: auto-opens on every screen focus via `useFocusEffect` + a 100ms delay (lets the navigation transition settle)
- No category navigation level — items are shown directly

### Services (`src/services/`)
- `orderService.ts` — Core order submission: tax calculation, Firestore write, table/customer updates
- `printService.ts` — Submit orders or selected items to `printQueue` Firestore collection
- `conversionService.ts` — Convert dine-in ↔ take-out with validation and table status transitions
- `tableService.ts` — Change order's table assignment with guest validation
- `customerService.ts` — Sync customer info from cart orders into `customers` collection (deduplicate by phone)

### Domain (`src/domain/`)
Pure business logic with no side effects:
- `order/orderCalculations.ts` — PST (6%), GST (5%), discount, and total calculations
- `order/orderItemGrouping.ts` — Group items by signature (options, changes, extras, instructions) for kitchen printing; separate drinks by flavor
- `order/orderItemMapper.ts` — Map order items between formats
- `menu/menuSorting.ts` — Sort categories by `order` field, resolve option groups, append options to items

### Hooks (`src/hooks/`)
- `useAsyncAction.ts` — Wrap async functions with loading state + auto error alert (eliminates try/catch boilerplate)
- `useDebouncedValue.ts` — Debounce value changes (used for search queries)
- `useDisclosure.ts` — Boolean open/close state for modals and drawers

### UI Components (`src/ui/`)
- `Header.tsx` — Standard header with back button and title
- `OfflineBanner.tsx` — Banner shown when network is unavailable
- `FullScreenLoadingOverlay.tsx` — Full-screen loading overlay for long-running operations

### Providers, Layout, Lib (`src/`)
- `providers/AuthProvider.tsx` — React context: authenticated user, loading state, logout via `onAuthStateChanged`
- `layout/SafeAreaViewWrapper.tsx` — Applies safe area insets + web layout adjustments
- `lib/firebaseConfig.ts` — Firebase init: Auth with AsyncStorage persistence (native) or default (web), Firestore with memory cache + GC, env var validation
- `utils/helpers.ts` — Date/time formatting, phone formatting, timestamp conversion, Firebase ID generation, alert helpers
- `utils/storeCache.ts` — Generic AsyncStorage cache wrapper used by stores
- `utils/orders-tab-cache.ts` — AsyncStorage cache management for dine-in and take-out order tabs

### Order Model
- **`OrderDraft`** = in-cart, not yet persisted
- **`Order`** = submitted Firestore document
- Orders have a `groupItems` boolean controlling whether items of the same type are collapsed (dine-in) or shown per-item (take-out default)
- Split billing: individual items have a `paid: boolean` field
- Discounts apply before tax (type: `Amount` or `Percent`)
- Tax rates are hardcoded: **PST 6%, GST 5%** (BC, Canada)

### Enums (`src/types/enums.ts`)
- `KitchenType`: `DeepFry | StirFry | Other | Both | Drink`
- `OrderStatus`: `InProgress | Completed | Cancelled`
- `OrderType`: `DineIn | TakeOut`
- `DiscountType`: `Amount | Percent | None`
- `TakeOutFulfillmentKind`: `Immediate | Scheduled`
- `TableStatus`: `Open | Occupied`

### Kitchen Routing
Each menu item carries a `kitchenType`. When an order is printed, items are filtered/routed to the appropriate kitchen print queue by `KitchenType`. Orders are grouped by kitchen destination for kitchen display.

### Firestore Collections
```
dineInOrders       takeOutOrders      categories
menuItems          optionGroups       options
menuVersion        tables             customers
credits            menuChanges        printQueue
onlineOrders
```

`onlineOrders` holds read-only copies of every website order, New ones included (same card colours as take-out orders; New has a "New" badge; rejected ones show as Cancelled). Each copy carries `loyalty.memberId` / `pointsToRedeem` / `pointsRedeemed`: points a member used online are only taken when the Orders app completes the order, so the Rewards member screen subtracts the held ones (`pendingOnlineRedeemPoints`) before showing the balance or allowing a redeem. The balance itself is live: `subscribeToMemberPoints` listens to `members/{id}` in the rewards project (rules allow the POS account a single-doc `get`), so changes made by the Orders app show up while the screen is open. They're written only by the `mirrorOnlineOrder` Cloud Function in the `asianlewebsite` project (`asian-le-website-admin/functions`). The POS never writes to it. Online orders are managed in the Orders app.

### Cloud Functions (`functions/src/index.ts`)
Two scheduled functions:
- `purgeStaleOrders` — Daily at 4 AM UTC: deletes `dineInOrders`, `takeOutOrders` and `onlineOrders` older than ~30 days in batches of 500
- `purgeStalePrintQueue` — Daily at midnight America/Regina: clears entire `printQueue` collection

### Auth
- **Web:** `getAuth()` (default session storage)
- **Native:** `initializeAuth()` with `getReactNativePersistence(ReactNativeAsyncStorage)` for persistent login

## Key Config
- **Path alias:** `@/*` maps to `./src/*` (tsconfig)
- **Styling:** NativeWind 4.x (Tailwind for React Native) — class names in JSX, configured via `tailwind.config.js` + `babel.config.js`
- **Global types:** declared in `src/types/global.d.ts` (no explicit imports needed for `DineInOrder`, `TakeOutOrder`, `OrderItem`, `MenuItem`, etc.)
- **Firebase project:** `asianlepos`
- **Environment:** Firebase config loaded from `.env` via `EXPO_PUBLIC_*` variables, validated in `src/lib/firebaseConfig.ts`
- **App version:** 1.0.11, bundle ID `com.buivuanhhuy.AsianLePOS`
- **Key deps:** Expo SDK 58, React 19.3, React Native 0.88, Firebase 12.3.0, Zustand 5.0.8, expo-router 58.x, react-native-gesture-handler 3.x, Sentry 8.x
