# Firebase merge plan: POS + Website + Rewards → one project

Status (2026-11-08):
- [x] Phase 1: `asianlepos` console ready (Blaze, budget alert, Google sign-in). Website confirmed on Vercel.
- [x] Phase 2: `D:\Projects\asian-le-firebase` created: `firestore.rules`, `storage.rules`,
      `firestore.indexes.json`, 39 rules tests passing in the emulators, `set-claims` and
      `seed-demo` scripts tested against the emulators. **Nothing deployed yet. Not committed yet.**
- [~] Phase 3: **POS done** on branch `firebase-merge` (not committed yet): `src/lib/business.ts`
      (`bizCol` / `bizDoc` / `bizKey`), all 53 Firestore paths moved under the business, claim
      check at login (staff + admin), caches keyed per business, `appConfig/posVersion`, website
      `orders` read directly (`onlineOrderMapper.ts`), rewards device login + second Firebase app
      removed, the old `demo` named database and demo-email switch removed, purge functions use
      collection groups, functions `codebase: "pos"`. Type-check and lint pass.
      Next: rewards functions, KDS, Orders app, pos-admin, print servers, website, website-admin.
- [ ] Phase 4 onward.

**Found during Phase 3:**
- The POS had a separate **`demo` Firestore database** (named database in `asianlepos`) used when
  `demo@asianle.ca` / `test@asianle.ca` signed in. Replaced by the Demo business. Delete that
  database and those two accounts in Phase 7 (or give them Demo claims).
- **Functions codebase rename:** the POS functions were in codebase `default`; they're now `pos`
  with the same names. A function name can only exist once in a project, so at switch-over
  delete the old ones first (`firebase functions:delete purgeStaleOrders purgeStalePrintQueue`),
  then deploy. Same for the rewards functions moving in from `asian-le-rewards`.
- Old unscoped cache keys (e.g. `@menu_cache`) stay on devices unused; harmless.

## Goal

1. Move `asianlewebsite` and `asian-le-rewards` into **`asianlepos`**: one Firestore, one Auth,
   one set of functions.
2. Put all data under **`businesses/{businessId}`**, so each business's data is kept apart.
   Today that means **Asian Le** plus a **Demo** business for App Store review.
3. Roles use **custom claims**.

Not a goal: selling the apps, onboarding other restaurants, or splitting billing.

Out of scope: `asianlegiftcard`, `asianlestaff`, `cash-register-e51cd`. `asianleexhibition` is an old
POS and will be deleted, not migrated.

### Why keep `asianlepos`
- It has the most day-to-day data and the most devices in the restaurant (POS tablets, KDS,
  print servers).
- Rewards Google sign-in isn't set up yet, so it can be set up once, directly on `asianlepos`.

## Data layout

Business IDs are Firestore auto IDs. A business doc holds basic info (name, etc.).

```
businesses/{businessId}
  ── POS ──
  dineInOrders/          takeOutOrders/        tables/
  categories/            menuItems/            optionGroups/        options/
  menuVersion/           menuChanges/          addExtras/
  customers/             customersVersion/     credits/
  printQueue/            cashDrawer/           users/ (staff list, display only)
  ── Website ──
  orders/                settings/             hours/               gallery/
  dailySpecials/         dailySpecialItems/    updates/
  webCategories/         webMenuItems/         webOptionGroups/     webOptions/
  onlinePrintQueue/
  ── Rewards ──
  members/{uid}                 name, email, phone, points, firstOrderId
  members/{uid}/transactions/   earn_<orderId>, redeem_<orderId>, welcome_<orderId>, reverse…
  phoneNumbers/{phone}          uid  (one phone per member, per business)

appConfig/                (top level, one doc per app, not business data)
  posVersion              was appConfig/version in asianlepos (force update)
  ordersVersion           was appConfig/version in asianlewebsite (Orders app force update)
  kdsVersion, rewardsVersion, …   one per app as needed
```

**No `onlineOrders` mirror.** The POS reads `businesses/{bid}/orders` directly. The mapping in
`asian-le-website-admin/functions/src/onlineOrderMirror.ts` (website order → card fields, status,
loyalty) moves into the POS (`useOnlineOrdersStore`). `mirrorOnlineOrder` is not migrated.

Notes:
- The website's menu clashes with the POS menu, so it's renamed with a `web` prefix. Sharing one
  menu is a separate project for later.
- The website's `printQueue` → `onlinePrintQueue`. The POS keeps `printQueue`.
- The website's `appConfig` docs other than `version` need checking during Phase 3.
- Only the Auth login is global. Everything else is under a business.
- A person who joins rewards at two businesses has two member docs with separate points. That's intended.

## Roles (custom claims)

```js
{ businessId: "<autoId>", role: "admin" | "staff" }   // staff accounts
// customers: no claims
```

Each staff account belongs to one business. To work in Demo, use a separate account.
Accounts: 1 admin (owner); everyone else is staff (POS, KDS, Orders app) or a customer.

**Business ID on the device:** after sign-in, read `businessId` from the claim and save it in
AsyncStorage (`localStorage` on web), so the app can start and load the right caches before auth
finishes. The claim always wins: if they differ, replace the saved one and clear the caches.
Clear it on logout. The saved value is only a convenience; the rules enforce access.

| App | Who can sign in | Which business |
|---|---|---|
| POS, KDS, Orders app | `staff`, `admin` | from the claim |
| pos-admin, website-admin | `admin` | from the claim |
| Rewards app, website customer sign-in | anyone | from env (`…_BUSINESS_ID`), or a `businessId` claim on the account if set (used for the review account) |
| Print servers | service account | `businessId` in their config |

Each staff app checks the claim right after sign-in and signs out anyone without a valid role.
The **rules** are what actually enforce it.

### Rules outline

```
match /businesses/{bid}/{document=**} {
  allow read, write: if request.auth.token.businessId == bid
                     && request.auth.token.role in ['admin', 'staff'];
}
match /businesses/{bid}/members/{uid} {
  allow read: if request.auth.uid == uid;
  allow create: if request.auth.uid == uid
                && /* field checks as today; points == 0 */
                && getAfter(/databases/$(database)/documents/businesses/$(bid)/phoneNumbers/$(request.resource.data.phone)).data.uid == uid;
  allow update: if request.auth.uid == uid && /* only name changes */;
}
match /businesses/{bid}/members/{uid}/transactions/{id} {
  allow read: if request.auth.uid == uid;      // written by functions only
}
match /businesses/{bid}/phoneNumbers/{phone} {
  allow create: if request.auth.uid == request.resource.data.uid
                && existsAfter(/databases/$(database)/documents/businesses/$(bid)/members/$(request.auth.uid));
  // no read for customers; never overwrite
}
// Website customers: rules for placing orders, same as today's website rules, with the businesses/{bid} prefix
// appConfig: anyone can read, nobody writes (set in the console)
```

Rules are OR'd, so the customer rules add to the staff rule and don't replace it. Staff can't
change `points` or transactions, because only functions (Admin SDK) write those. Every rule
that lets staff write `members` must block `points`.

### Functions must check the business

The Admin SDK skips rules, so:
- POS rewards functions (`lookupMember`, `earnPoints`, `redeemPoints`, `reverseOrder`) take the
  business **from the caller's claim**, never from the request, and only touch
  `businesses/{thatId}/…`. This also keeps the Demo POS away from real members.
- `deleteAccount` finds the caller's member docs in every business
  (`collectionGroup("members")` where `id == uid`) and deletes each one with its phone reservation.
- Triggers use wildcards: `businesses/{bid}/orders/{orderId}` (order emails / SMS).
- Daily purges use collection group queries (`dineInOrders`, `takeOutOrders`, `orders`) and clear
  every business's `printQueue` and `onlinePrintQueue`.

## Demo business (App Store review)

- `businesses/{demoId}` with a sample menu, tables and a few customers.
- Reviewer staff account: `{ businessId: demoId, role: "staff" }` for POS / Orders app review.
- Reviewer customer account: `businesses/{demoId}/members/{uid}` with a very large balance
  (e.g. 100,000 points), plus a `businessId: demoId` claim so the rewards app opens the Demo
  business. The reviewer shows its QR in the rewards app, or the Demo POS finds it by phone.
- No reset script: the balance won't run out, and demo orders are purged after 30 days like any
  others. Top up in the console if ever needed.

## Code changes

There are about 170 Firestore path calls across the apps (POS about 50, pos-admin 42,
website-admin 32, Orders app 20, website 19, rewards 5).

- **Every app:** add a helper (`bizCol("tables")`, `bizDoc("tables", id)`) that adds
  `businesses/{currentBusinessId}`. The business comes from the claim (staff apps), from env or
  the claim (customer apps), or from config (print servers).
- **POS:** paths via the helper. **Device caches** (menu, customers, credits, menu changes, order
  tabs) are keyed by business ID. Remove `src/lib/rewardsFirebase.ts`, `useRewardsAuthStore` and
  `RewardsDeviceCard`; `rewardsService` calls functions on the main app. Claim check at login.
  Business ID saved in AsyncStorage. `useForceUpdate` reads `appConfig/posVersion`.
  `useOnlineOrdersStore` reads `orders` directly (mapping moved from the mirror function).
  Remove `onlineOrders` from the purge function. Functions `codebase: "pos"`.
- **KDS:** paths; claim check on its existing staff login; `appConfig/kdsVersion` if it has a force update.
- **pos-admin:** paths; drop the `NEXT_PUBLIC_REWARDS_*` connection; admin check.
- **print-server:** `businessId` in config; read `businesses/{id}/printQueue`.
- **print-server-orders:** new service account key from `asianlepos`; `businessId` in config;
  read `businesses/{id}/onlinePrintQueue`.
- **website:** env → `asianlepos` + `NEXT_PUBLIC_BUSINESS_ID`; paths; `web*` menu names; drop the
  second rewards Firebase app (`lib/rewardsFirebase.ts`, `lib/server/rewards/*` use the main app).
- **website-admin:** env; paths; `web*` names; functions `codebase: "website"`; rename its
  `purgeStaleOrders` → `purgeStaleWebOrders`; delete `mirrorOnlineOrder` / `onlineOrderMirror.ts`
  (and the `POS_PROJECT_ID` app); `onlinePrintQueue`; remove `firestore` from `firebase.json`; admin check.
- **Orders app:** env; paths; drop `rewardsFirebase.ts` + `RewardsDeviceCard`; claim check;
  `useForceUpdate` reads `appConfig/ordersVersion`.
- **Rewards app:** env + business ID (claim overrides env); paths; functions `codebase: "rewards"`;
  POS functions check `staff`/`admin` + business from the claim (was `role: pos`);
  `deleteAccount` across businesses; remove `firestore` from `firebase.json`; hosting target.

### Deploy setup
- **Functions:** each repo gets its own `codebase` in `firebase.json` (`pos`, `website`,
  `rewards`). Without it, deploying from one repo offers to delete the others' functions.
- **Rules / indexes / storage rules:** one new repo, `asian-le-firebase`. It holds
  `firestore.rules`, `firestore.indexes.json` (including the collection group indexes),
  `storage.rules`, rules tests, and the `set-claims` / `seed-demo` scripts.
  Remove `firestore` / `storage` from every other `firebase.json`, otherwise the last deploy
  overwrites the others' rules.

## Phases

### Phase 1: Prepare `asianlepos` (no app changes)
- Confirm Blaze is on and set a budget alert.
- Recreate the Twilio and Resend secrets (`firebase functions:secrets:set`).
- Auth: enable Google sign-in. Add authorized domains (website, rewards web, Orders web).
- Hosting: one project can host many sites (up to 36), each with its own URL and custom domain.
  Add sites for rewards web and Orders web next to the POS web site; pos-admin keeps its App
  Hosting backend. Custom domains get re-added later at cutover.
- Find out where the website is hosted (no `firebase.json`, maybe Vercel).
- List what the website stores in Storage (images) and where the image URLs are saved.
- Create the `asian-le-firebase` repo.

### Phase 2: Rules + scripts (in `asian-le-firebase`, tested in emulators)
- Write the full rules from the outline above.
- Rules tests with **two businesses** (Asian Le + Demo), proving:
  - staff of one business can't read or write the other business;
  - customers can't read orders, `phoneNumbers` or other members;
  - nobody but functions can change `points` or transactions;
  - one phone per business; the same phone works in two businesses;
  - accounts with no role can't touch business data.
- Scripts: `set-claims <email> <businessId> <role>`, `seed-demo`, and
  `copy-data` (old paths → new paths; see Phase 5).
- Emulators need **Java 21+** (this machine has Java 17). Install Temurin 21 first.
  Claude can write and run these tests locally.

### Phase 3: Code changes (branches, not deployed)
All the app changes listed above. Keep old paths working on `main` until cutover.

### Phase 4: Full test in emulators
- Seed both businesses. Run POS, KDS, Orders app, website and rewards against the emulators.
- Online order → shows in the Orders app → prints from `onlinePrintQueue` → shows on the POS
  (read straight from `orders`), with the same card colours and rewards badge as before.
- Rewards: sign up → POS lookup by QR and phone → earn → redeem → cancel order → reverse.
- Demo POS can't find a real member; Asian Le POS can't find the demo member.
- Switch-business cache test: Demo account and Asian Le account on the same device show
  different menus.

### Phase 5: Switch over (restaurant closed for relocation)

The restaurant is closed, so there's no live traffic: no single cutover night, no pausing
orders, and the steps can be spread over days. The POS data still moves (top-level →
`businesses/{asianLeId}/…`), so every device must be on the new version **before reopening**.

1. Create the Asian Le and Demo business docs. Create the admin account and the staff accounts
   in `asianlepos` (only 1 admin + a few staff, so recreating is simpler than `auth:import`).
   Set claims on all of them.
2. Deploy the new rules from `asian-le-firebase`. They deny writes to the **old** top-level
   paths, so any device still on the old version fails loudly instead of writing to the wrong place.
3. Run `copy-data`:
   - POS top-level collections → `businesses/{asianLeId}/…`. Old orders can be skipped
     (purged after 30 days anyway). Tables, menu, customers, credits, menu changes, add-extras,
     cash drawer, menuVersion, customersVersion must come across.
   - Website (`asianlewebsite`) → `businesses/{asianLeId}/…`, with the menu as `web*`.
   - `appConfig/version` (both projects) → `appConfig/posVersion` and `appConfig/ordersVersion`.
   - Rewards: nothing to copy (0 customers).
4. Copy Storage files to the `asianlepos` bucket and rewrite the image URLs saved in Firestore
   (they contain the old bucket name).
5. Deploy functions (`pos`, `website`, `rewards`) and hosting sites. Re-add custom domains.
6. **Delete the functions in `asianlewebsite` and `asian-le-rewards`**, so the old triggers and
   SMS / email don't run twice.
7. Switch every app:
   - Web: redeploy website, website-admin, pos-admin, POS web, rewards web.
   - Native: install the POS build on each tablet. Publish the Orders app and KDS EAS Updates.
   - Print servers: new config, restart.
   - Staff sign out and in so the claims load.
8. Seed the Demo business (`seed-demo`).
9. Test end to end at the new location before opening: a dine-in order and a take-out order print
   in the kitchen; an online order shows in the Orders app, prints and appears on the POS; a
   rewards sign-up, earn and redeem. Then delete the test orders.

**Rollback:** the old data stays untouched in the old paths and projects until Phase 7, so any
step can be redone, or the apps pointed back.

### Phase 6: Native builds and stores
- POS store release (same build as the switch-over).
- Rewards app: first real builds on `asianlepos` (Google sign-in client IDs, Android SHA-1s).
  Submit with the Demo reviewer accounts.
- Add `EXPO_PUBLIC_*` values (including the business ID) to the EAS environment variables.

### Phase 7: Cleanup (2–4 weeks later)
- Delete the old POS top-level collections, then the `asianlewebsite` and `asian-le-rewards` projects.
- Delete `asianleexhibition` (and decide what to do with the `print-server-exhibition` folder).
- Remove old env vars. Point the `.firebaserc` of `asian-le-orders`, `asian-le-website-admin` and
  `asian-le-rewards` at `asianlepos`.
- Update `CLAUDE.md` and `PLAN.md` in each repo.
- Later, optional: share one menu between the POS and the website.

## Risks

| Risk | Guard |
|---|---|
| POS shows online orders wrong without the mirror | Mapping moved into the POS and tested in Phase 4 against real website order docs |
| Customers can sign up in the POS project | Role-based rules deployed before anything else switches; rules tests |
| One business sees another's data | `businessId` claim in every rule; functions take the business from the claim; two-business tests |
| Old device writes to old paths after cutover | New rules deny the old paths; `appConfig` force update |
| Wrong menu or customers from device cache | Caches keyed by business ID; cache test in Phase 4 |
| One repo's deploy deletes another's functions or rules | Function `codebase` per repo; rules only in `asian-le-firebase` |
| Double SMS / email | Delete old functions at cutover |
| Broken website images | Copy Storage and rewrite URLs; spot-check the menu and gallery |

## Open questions
- The website looks like it's on Vercel (`.vercel` in `.gitignore`, Vercel analytics). Confirm it,
  so its env vars get changed there at switch-over.
- ~~Which `appConfig` docs does the website use?~~ None. Only the POS and the Orders app use
  `appConfig/version`.
