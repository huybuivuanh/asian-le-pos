# Asian Le POS

A cross-platform (iOS, Android, Web) Point-of-Sale system designed specifically for Asian Le Restaurant with additional features that most POS don't have. Handles dine-in table orders, take-out orders, online (website) orders, Asian Le Rewards, kitchen routing, a customer-facing display, and payment tracking.

Built with **Expo** (React Native) and **Firebase** (Firestore + Auth + Cloud Functions), in the shared `asianlepos` project used by the KDS, pos-admin, Orders app, website, website-admin and the rewards app.

---

## Tech Stack

- **Frontend:** Expo SDK 58, React 19.3, React Native 0.88, Expo Router (file-based routing)
- **Styling:** NativeWind 4.x (Tailwind for React Native)
- **State:** Zustand 5
- **Backend:** Firebase 12 — Firestore, Auth, Cloud Functions (codebase `pos`)
- **Crash reports:** Sentry
- **Language:** TypeScript

---

## Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- EAS CLI for native builds (`npm install -g eas-cli`)
- Android Studio or Xcode for native simulators

---

## Setup

1. **Install dependencies**

   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Configure environment**

   Create a `.env` file in the project root with the **`asianlepos`** web app config:

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   EXPO_PUBLIC_FIREBASE_APP_ID=
   ```

3. **Get a staff login.** Accounts need custom claims `{ businessId, role: "staff" | "admin" }`.
   Create them in pos-admin (Users), or with `scripts/set-claims.mjs` in `asian-le-firebase`.

4. **Start the dev server**
   ```bash
   npx expo start
   ```

---

## Commands

### Expo App

| Command           | Description             |
| ----------------- | ----------------------- |
| `npx expo start`  | Start dev server        |
| `npm run android` | Run on Android emulator |
| `npm run ios`     | Run on iOS simulator    |
| `npm run web`     | Run web build           |
| `npm run lint`    | Run ESLint              |

### Firebase Cloud Functions (`/functions`)

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `npm run build`  | Compile TypeScript → `lib/index.js`      |
| `npm run serve`  | Build + start Firebase emulators locally |
| `npm run deploy` | Deploy functions to Firebase             |

### Web hosting

The web build is a single-page export to `dist/` (`npx expo export --platform web`), deployed
with `firebase deploy --only hosting`.

---

## Project Structure

```
app/                    # Expo Router screens (file-based routing)
  (login)/              # Login
  (tabs)/               # Main 5-tab UI
  dinein/               # Dine-in flows (table, take-order, edit, review)
  takeout/              # Take-out flows (review-order)
  take-out-orders/      # Take-out order management screens
  item/                 # Menu item detail + customization
  rewards/member.tsx    # Rewards member: balance, earn / redeem
  customer-display.tsx  # Customer-facing bill display (second window)
  credits.tsx, menu-changes.tsx, add-extras.tsx
src/
  features/             # UI features grouped by domain
    dinein/             # Dine-in components and hooks
    takeout/            # Take-out components and hooks
    order/              # Shared order editing UI
  stores/               # Zustand stores (menu, orders, tables, cart, online orders, etc.)
  services/             # Firestore writes (order, print, table, conversion, cash drawer) and rewards calls
  domain/               # Pure business logic (tax calc, item grouping, sorting, online order mapping)
  lib/                  # business.ts (bizCol / bizDoc), customer display channel
  hooks/                # Shared hooks (useAsyncAction, useDisclosure, etc.)
  ui/                   # Shared UI components (Header, overlays, banners)
  providers/            # AuthProvider
  utils/                # Helpers, formatters, cache utilities
functions/
  src/index.ts          # Cloud Functions (scheduled purge jobs)
docs/
  customer-display-kiosk-setup.md   # Till PC setup for the customer display
```

---

## Features

### Ordering
- **Dine-in orders** — browse menu by category or search, customize items (options, extras, substitutions, special flags, instructions), review and submit
- **Take-out orders** — same item picker with customer name/phone capture, immediate (with ready-time estimate) or scheduled fulfillment
- **Item customization** — option groups, add-ons, item changes/substitutions, togo/appetizer flags, free-text instructions
- **Discounts** — flat amount or percentage, applied before tax (blocked on an order that already used rewards points)
- **Edit orders** — modify items, quantities, and discount on any in-progress order
- **Add items** — append items to an existing take-out order without re-editing the whole order

### Online orders (website)
- Website orders show live in the **Out Orders** list next to take-out orders, with the same card colours, a "New" badge, and rewards badges
- Read-only here: they're accepted, completed and printed from the Asian Le Orders app

### Asian Le Rewards
- **Find a member** by scanning their QR code or by phone number
- **Earn and redeem points** on an order, with a confirmation step (Cloud Functions in the `asian-le-rewards` repo, called with the staff login)
- Live points balance; points a member has promised on an open online order are held back
- Welcome bonus details, rewards badges/labels on order cards; cancelling reverses points

### Table Management (Dine-In)
- **Table grid** — real-time Open/Occupied status for all tables
- **Guest count** — set and update number of guests per table
- **Change table** — move an active order to a different table
- **Convert to take-out** — transfer a dine-in order to take-out with customer info
- **Dine-in history** — cancel, complete, or take cash payment from history

### Take-Out Management
- **Order list** — paginated, real-time list of take-out and online orders with status badges
- **Scheduled orders** — preorder support with date/time picker (orange card highlight)
- **Convert to dine-in** — move a take-out order to a table

### Payment
- **Mark order paid/unpaid** — toggle payment status on the whole order
- **Split billing** — toggle individual line items paid/unpaid (dine-in)
- **Mark selected paid** — bulk-mark a selection of items as paid
- **Cash payment modal** — calculates change from cash tendered; an **Open drawer** button pops the cash drawer (via the print server)
- **Store credits** — view and reference credit records

### Customer display
- A second browser window (`/customer-display`) on the till PC's customer-facing monitor shows the live bill, items, and customer info, synced from the cashier window with `BroadcastChannel`
- Kiosk setup for the till PC (Edge, fullscreen, second monitor, on boot): `docs/customer-display-kiosk-setup.md`

### Kitchen & Printing
- **Print to kitchen** — send full orders to the print queue, routed by kitchen type (deep fry, stir fry, drinks, etc.)
- **Print selected items** — send only chosen items (useful for reprints or partial orders)
- **Order grouping** — items with identical options/extras/changes are grouped for cleaner kitchen tickets
- A reprint replaces the queued print job instead of merging into it

### Operations
- **Complete / cancel orders** — with status cycling (In Progress → Completed → In Progress)
- **Auto-refresh** — Firestore real-time listeners keep all screens up to date without manual refresh
- **Background reset** — after 5 minutes in the background, navigation resets to home and network reconnects
- **Offline banner** — visible indicator when network is unavailable
- **Force update** — `appConfig/posVersion` can require a newer app version
- **Auto data purge** — orders older than 30 days are automatically deleted by Cloud Functions

### Menu
- **Versioned menu cache** — menu data cached in AsyncStorage, invalidated only when the menu version changes; loads in parallel with auth so there's no flash on login
- **Search** — debounced full-menu search across all categories
- **Browse** — default view shows first-category items for fast access
- **Menu changes reference** — lookup list of item name substitutions

### Staff & Auth
- **Email/password login** — Firebase Auth with persistent session on native
- **Staff/admin only** — the account's custom claims decide its business; customers and accounts without a role are signed out with a message
- **Staff name on orders** — logged-in user's name recorded on every order
- **Customer auto-complete** — phone/name saved to a customers collection for repeat lookups

---

## Key Concepts

### Order Types

- **Dine-In** — tied to a table, grouped item display, split billing per line item
- **Take-Out** — customer name/phone, immediate or scheduled fulfillment
- **Online** — the website's orders (`orders`), shown read-only

### Tax (SK, Canada)

- PST 6% + GST 5%, applied after discounts

### Navigation (Dine-In)

Use `router.dismiss(n)` or `router.back()` to return to the table page — never `router.replace()` into the table screen, as it causes slowness. The table page stays mounted and updates via its live Firestore listener.

### Menu Cache

Menu data is cached in AsyncStorage with version-based invalidation. The cache loads in parallel with Firebase Auth on app start so there's no menu flash on login. Device caches are kept per business.

### Background Reset

After 5 minutes in the background (lock screen or switched apps), the navigation resets to the home screen and Firestore network is re-enabled.

---

## Firestore Collections

Everything is under `businesses/{businessId}/` (build paths with `bizCol` / `bizDoc` from
`src/lib/business.ts`). The only top-level doc the POS reads is `appConfig/posVersion`.
Security rules and indexes are deployed from the `asian-le-firebase` repo; the App Store
review Demo is just another business.

| Collection                 | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `dineInOrders`             | Active and historical dine-in orders              |
| `takeOutOrders`            | Active and historical take-out orders             |
| `orders`                   | Website orders (read-only in the POS)             |
| `tables`                   | Table status (Open/Occupied) and current order ID |
| `menuItems`                | Menu items with pricing and kitchen routing       |
| `categories`               | Menu categories with sort order                   |
| `optionGroups` / `options` | Item option groups and their options              |
| `menuVersion`              | Version doc for cache invalidation                |
| `customers`                | Customer name/phone records                       |
| `printQueue`               | Orders queued for kitchen printing                |
| `cashDrawer`               | "Open the drawer" requests for the print server   |
| `credits`                  | Store credit records                              |
| `menuChanges`              | Item name substitution reference                  |
| `addExtras`                | Add-extra items                                   |
| `users`                    | Staff list                                        |
| `members`, `phoneNumbers`  | Rewards members (read via the rewards functions)  |

---

## Cloud Functions

Two scheduled functions in `functions/src/index.ts` (codebase `pos`), covering every business:

- **`purgeStaleOrders`** — Daily at 4 AM UTC: deletes dine-in and take-out orders older than ~30 days (website `orders` are purged by website-admin's own function)
- **`purgeStalePrintQueue`** — Daily at midnight (America/Regina): clears every business's print queue
