# Pennywise client

Android-first Expo SDK 58 / React Native 0.88 app (React 19, Expo Router, TypeScript, React Compiler), with iOS and web compatibility. It tracks **shared-group expenses in INR**: equal or custom splits, balances, suggested repayments and records of payments made outside the app. It does not move money and has no personal budgeting or income tracking.

Related docs: [API reference](../docs/api.md) · [User flows](../docs/user-flows.md) · [Architecture](../docs/architecture.md) · [Balances & settle-up](../docs/balances-and-settlement.md) · [Testing](../docs/testing.md) · [Backend setup](../docs/backend-setup.md)

## Contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [Features and screens](#features-and-screens)
4. [Session, cache and retries](#session-cache-and-retries)
5. [Push notifications](#push-notifications)
6. [Photos](#photos)
7. [Folder structure](#folder-structure)
8. [Tests and checks](#tests-and-checks)
9. [Building and releasing](#building-and-releasing)
10. [Troubleshooting](#troubleshooting)

## Quick start

Requires Node.js 22.13+ and npm. A backend must be reachable; see [backend setup](../docs/backend-setup.md).

```bash
cd client
npm ci
cp .env.example .env     # then set EXPO_PUBLIC_API_URL (see below)
npx expo start
```

| Script | What it does |
| --- | --- |
| `npm start` | Expo dev server (scan the QR in a development build) |
| `npm run android` / `npm run ios` | Build and run a native development app (`expo run:*`) |
| `npm run web` | Browser preview |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` (ESLint with `eslint-config-expo`) |
| `npm test` | Core logic tests (Node's test runner) |
| `npm run test:components` | Component and hook tests (Jest + React Native Testing Library) |

For a throw-away backend, run `npm run dev:preview` inside `server/`. It starts an isolated in-memory MongoDB and the API on port 3000, ignores your real database settings, and loses all data on shutdown. Never deploy it.

Push notifications, camera and photo features need a **development build** (or Expo Go on SDK 58 where noted), never hand-edit the generated `android/` or `ios/` directories (they are git-ignored). Adding a native library means rebuilding the development client.

## Configuration

### `EXPO_PUBLIC_API_URL`

Set in `client/.env` (git-ignored). It is public configuration baked into the bundle, so **never put secrets in any `EXPO_PUBLIC_*` variable**.

| Where the app runs | Value |
| --- | --- |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator / web on the same Mac | `http://localhost:3000` |
| Physical phone | Your computer's LAN address, e.g. `http://192.168.1.20:3000` (same Wi-Fi; `localhost` would be the phone itself) |
| Production / preview builds | The deployed **HTTPS** API URL |

Resolution order in `src/lib/api.ts`: the variable if set; otherwise, when running through Expo, the Metro host's LAN IP on port 3000; otherwise `10.0.2.2` on Android or `localhost` elsewhere. Browser builds also need the web origin in the server's `CORS_ORIGINS`.

### App config files

| File | Purpose |
| --- | --- |
| `app.json` | Name, slug, `pennywise` URL scheme, Android package `com.nipun_appdev.pennywise`, adaptive icon, camera permission, plugins (`expo-router`, splash screen, `expo-secure-store`, `expo-notifications`, `expo-image-picker`, `expo-camera`), typed routes, React Compiler, EAS project id |
| `eas.json` | EAS Build profiles (see [Building](#building-and-releasing)) |
| `google-services.json` | Firebase client config for Android push (FCM). It contains public identifiers only, not server secrets |
| `.env` / `.env.example` | `EXPO_PUBLIC_API_URL` |
| `tsconfig.json` | Strict TypeScript; `@/*` maps to `src/*` |
| `eslint.config.js`, `jest.config.cjs` | Lint and component-test setup |

## Features and screens

**Entry and auth**
- Welcome (3 auto-advancing slides with an interactive split/settle demo) → Sign up / Log in, or Join with a code. A validated six-character code survives switching between auth screens and is used right after authentication.
- Passwords need at least 8 characters (at most 72 bytes). Wrong credentials stay on the login screen; an expired or rejected session returns to Welcome with "Please log in again."

**Tabs** (floating tab bar): **Home** (greeting, totals, recent groups, Add expense), **Groups**, **Activity** (global expense and payment feed, filterable, tap to open the group), **Reports** (spending and your balance per group). Home and Reports use one `/dashboard` request; Activity uses the paginated `/activity` endpoint.

**Groups**
- Create a group with a name, description, built-in preset or cropped photo. The creator becomes its first member.
- Group screen: spending, your balance, and tabs for Expenses, Settlements and Members. Pull to refresh; paginated lists.
- Invite sheet: six-character code (tap to copy), QR code, system Share with a `pennywise://join?code=…` link. Joining works by typing, pasting (clipboard is read only when you tap **Paste code**), scanning the QR in-app, or opening the link.
- Options sheet: Edit group, Invite people, Activity & statements, Categories.
- Creator only: change name, description, photo or preset, and regenerate the invite code (the old code and QR stop working; members stay).

**Expenses**
- Add from Home (zero groups explains Create/Join; one group skips selection; several show a paginated picker) or from a group.
- Description, amount (₹, at most two decimals), required category, and payer (any member).
- Split modes: **Evenly** (everyone, with optional exclusions), **Selected people**, **Custom amounts** (must add up exactly to the total). A live preview shows each share; the server remains the source of truth and assigns remainder paise deterministically.
- Expense detail shows payer, author, category and every share. The author or the group creator can edit (re-split equally among the original people, or change the mode) and soft-delete. Everyone else sees it read-only.

**Payments and settling up**
- Settlements tab lists suggested repayments (greedy, at most n-1 payments) with a one-tap **Record payment** that prefills sender, receiver and amount.
- Payments are **records of money moved outside Pennywise**. Any member can record, correct or delete one, including on someone else's behalf. Amounts above the suggestion, or when suggestions cannot load, require an explicit confirmation. Deleted payments stay visible, marked as deleted.

**Categories**: ten standard (read-only) plus custom categories. Any member can add a custom one; only the group creator can rename, archive or restore it. Existing expenses keep the category they were saved with.

**Records**: per-group audit history (who, when, before/after) with filters, a corrected member statement with running balance (yourself by default), and a group-spending statement that ignores repayments. History starts when the feature shipped; nothing is back-filled.

**Profile**: display name, photo or built-in avatar (initials, Leaf, Sun, Sparkles, Coffee), appearance (System / Light / Dark emerald theme, stored on the device), notification switches, and Log out.

Money is handled as safe integer paise and formatted with Indian digit grouping by `formatINR`; API field names keep their historical `Cents` suffix.

## Session, cache and retries

- **Session storage.** Native apps keep the JWT in `expo-secure-store`. On web it is deliberately **memory-only**, so a page reload logs you out. Credentials never go to AsyncStorage.
- **Expiry.** JWTs last seven days (no refresh or server-side revocation). The app logs out locally at expiry, and any protected `401` clears the session, caches and in-flight requests. Late responses from an old session are discarded. A copied token stays valid server-side until it expires, even after logging out.
- **Caching.** `useResource` shows the last cached page for the signed-in account while it refetches, with a "Showing saved data" banner when offline. 403/404/410 responses delete the stale cache entry. Caches are per account and cleared on logout.
- **Offline.** Reads fall back to cache; every write button is disabled with an explanation. There is **no offline write queue**. Balances that cannot be loaded are never shown as zero.
- **Idempotent creates.** Expense and payment creation sends a UUID `Idempotency-Key`. The key and exact payload are stored (per account, for 24 hours) before the request, so retrying after a lost response or an app restart reuses the same key and cannot create a duplicate. Changing the details while a save is unresolved is blocked with instructions to check the group first. 4xx errors discard the intent.
- **Requests** time out after 15 seconds. A free-tier host waking from sleep can exceed that; just retry.

## Push notifications

The server sends pushes through Expo's push service when someone adds, edits or deletes an expense or payment you are part of, or joins your group. You are never notified of your own actions, and each type can be switched off in **Profile → Notifications**. Tapping a notification opens that group.

Client side (`src/lib/push.ts`, `src/hooks/use-push-notifications.ts`):
- Registration is **Android-only, real devices only**, after sign-in. It creates the `default` channel, asks permission (Android 13+), gets an Expo push token for the EAS project id in `app.json`, and registers it with `PUT /me/push-token`. Logging out removes it with `DELETE`. A token belongs to whoever signed in last on that device.
- Registration is best-effort and silent: Expo Go, emulators, denied permission or a build without Firebase config simply skip push.
- Notifications shown while the app is open refresh the current screens.

To enable push in your own project: create a Firebase project and Android app with package `com.nipun_appdev.pennywise`, put its `google-services.json` in `client/`, upload an FCM service account key to your EAS project (`eas credentials`), and build a development or preview build. Optionally set `EXPO_ACCESS_TOKEN` on the server if you enable Expo's enhanced push security.

## Photos

Tap the profile or group avatar for **Take photo / Choose from gallery / Remove photo**. The crop screen supports drag and pinch-to-zoom; **Done** normalizes the image to JPEG (at most 768 × 768), uploads it through `POST /media/images` (5 MB limit, public URL) and saves immediately. Failed uploads keep the previous photo and offer **Retry**, reusing an already uploaded URL where possible. Only the group creator can change a group photo; members see it read-only.

Built-in presets (profile avatars, group Friends/Trip/Home/Food/Work/Family icons) save without any upload. A new group's photo stays local until **Create group**.

The server needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`; without them uploads return 503 and presets still work. Installed native apps need a rebuild if they predate `expo-image-manipulator` or the image-picker plugin (Expo Go on SDK 58 already includes both).

## Folder structure

```text
client/
├── app.json                  Expo config (name, scheme, plugins, permissions)
├── eas.json                  EAS Build/Submit profiles
├── google-services.json      Firebase config for Android push
├── package.json              Dependencies and scripts
├── tsconfig.json             Strict TS, "@/*" → src/*
├── eslint.config.js          Lint rules (eslint-config-expo)
├── jest.config.cjs           Component-test config (jest-expo)
├── AGENTS.md / CLAUDE.md     Rules for AI coding agents (read before Expo/RN changes)
├── .env.example              EXPO_PUBLIC_API_URL template (copy to .env)
├── assets/
│   └── images/               App icon, adaptive icons, splash, favicon
│       └── illustrations/    Onboarding and group artwork
├── src/
│   ├── app/                  Expo Router: file = route, screens and navigators only
│   │   ├── _layout.tsx       Providers, fonts, splash, auth-guarded Stack, push hook
│   │   ├── index.tsx         Welcome slides (signed-out entry)
│   │   ├── login.tsx · signup.tsx   Thin wrappers around screens/auth-screen
│   │   ├── join.tsx          Join by code, link or QR (also auto-joins a pending code)
│   │   ├── scan.tsx          Camera QR scanner for invite codes
│   │   └── (app)/            Signed-in area
│   │       ├── (tabs)/       home · groups · activity · reports (+ floating tab bar)
│   │       ├── choose-group.tsx   Picker used by Home's Add expense
│   │       ├── create-group.tsx   New group form
│   │       ├── profile.tsx        Profile, theme, notifications, logout
│   │       └── group/[id]/        index (overview) · expense · expense-detail ·
│   │                              payment · members · categories · records ·
│   │                              settings · options (sheet) · invite (sheet)
│   ├── components/
│   │   ├── ui/app-ui.tsx     Design-system primitives: Screen, Header, Button, Card, Field, Avatar, Tabs, Notice, Pager, Skeletons…
│   │   ├── floating-tab-bar.tsx   Custom bottom tab bar
│   │   ├── sheet.tsx         Bottom-sheet container used by Options and Invite
│   │   ├── member-picker.tsx Searchable single/multi member selector
│   │   ├── split-preview.tsx Live per-person share preview and custom-amount inputs
│   │   ├── qr-code.tsx       Renders the invite QR (qrcode-generator)
│   │   ├── image-choice.tsx  Photo/avatar chooser and uploader
│   │   ├── photo-crop.tsx    Drag/pinch square crop
│   │   └── notification-settings.tsx   Per-type push switches
│   ├── screens/              Reusable screen bodies
│   │   ├── auth-screen.tsx   Shared login/signup form
│   │   ├── group-details-form.tsx   Name, description, photo/preset form
│   │   └── category-manager.tsx     Category list, editor and picker
│   ├── hooks/
│   │   ├── use-resource.ts   GET with focus refetch, per-account cache, offline fallback
│   │   ├── use-mutation.ts   Writes, double-submit lock, persisted idempotency keys
│   │   ├── use-dashboard.ts  /dashboard wrapper for Home and Reports
│   │   └── use-push-notifications.ts   Registration, foreground refresh, tap routing
│   ├── lib/
│   │   ├── api.ts            Base URL, fetch wrapper, ApiError, session and 401 handling
│   │   ├── storage.ts        SecureStore session, AsyncStorage caches and retry intents
│   │   ├── format.ts         INR formatting/parsing, dates, join-code and JWT-expiry helpers
│   │   ├── invite.ts         Invite link, share sheet, QR payload parsing
│   │   ├── photos.ts         Crop maths and upload helper
│   │   ├── push.ts           Expo push registration and notification routing
│   │   └── types.ts          API response types
│   ├── providers/app-provider.tsx   Session, connectivity, theme, toasts, pending join code
│   └── theme/                palette.ts (emerald light/dark colours), illustrations.ts
└── tests/
    ├── core.test.cjs         INR parsing/formatting, JWT/session, storage, 401 handling
    ├── invite.test.cjs       Join codes, links and QR parsing
    └── components/           Jest + RNTL: flows, forms, photos, push, use-mutation,
                              use-resource, category-manager
```

Generated and ignored: `node_modules/`, `.expo/`, `android/`, `ios/`, `.env`, `expo-env.d.ts`.

## Tests and checks

```bash
npm run typecheck
npm run lint
npm test                  # 17 core tests, no native modules needed
npm run test:components   # 69 component/hook tests
npx expo-doctor           # SDK/dependency health
npx expo export --platform android   # confirms the bundle compiles
```

Core tests run under Node's test runner with mocked native modules and cover INR parsing and formatting, join-code and JWT handling, protected vs public 401 behavior, stale-session rejection, secure storage and account-cache isolation. Component tests cover the main flows, forms, photo upload and retry, push registration and routing, mutation locking and idempotency, and cached resources. None of them replace testing on a real device: camera and QR scanning, clipboard, share sheets, SecureStore, push delivery and keyboard/safe-area behavior need a development build.

## Building and releasing

`eas.json` defines three EAS Build profiles:

| Profile | Use | Notes |
| --- | --- | --- |
| `development` | Development client, internal distribution | Needs a rebuild when native libraries change |
| `preview` | Internal-distribution Android **APK** | Sets `EXPO_PUBLIC_API_URL` to the hosted Render API |
| `production` | Store build | Version auto-increments (`appVersionSource: remote`) |

```bash
npx eas-cli@latest build --profile preview --platform android
```

Before a public release: point `EXPO_PUBLIC_API_URL` at an HTTPS API, make sure the server has `TRUST_PROXY`, `CORS_ORIGINS` (for web) and Cloudinary settings, check dependency advisories, and exercise the app on a real device. `npm audit` currently reports only moderate `glob`/`minimatch` advisories reached through Jest and Expo tooling (development-only). No store submission or signing has been done. Web export (`npx expo export --platform web`) uses `web.output: "server"`, so it needs a Node host rather than static hosting.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Could not reach Pennywise" on a phone | `EXPO_PUBLIC_API_URL` must be a LAN IP or HTTPS URL, not `localhost`; phone and computer on the same network; the backend running and not firewalled |
| Works on emulator, not on device | Emulators use `10.0.2.2`; a physical phone cannot |
| First request after idle is slow or times out | A free Render instance was asleep. Wait and retry (the client times out at 15 s) |
| Browser shows a CORS error | Add the exact web origin to the server's `CORS_ORIGINS` |
| Changed `.env` but nothing changed | Restart with `npx expo start --clear`; `EXPO_PUBLIC_*` values are inlined at bundle time |
| "429 Too many requests" | Server rate limits (sign-in, join, uploads, global). Wait a few minutes; see [api.md](../docs/api.md#rate-limits) |
| Missing native module (for example `ExpoCrypto`) | Use an SDK 58 Expo Go or rebuild the development app; clearing Metro cannot install native modules |
| Photo upload says storage is not configured, or `Invalid cloud_name` | Server Cloudinary name, key and secret must come from the same environment; restart the API (`npm start` runs compiled `dist/`) |
| No push notifications | Real Android device only; allow notifications; the build needs `google-services.json` and FCM credentials; check the switches in Profile |
| Logged out after a web reload | Expected: web sessions are memory-only |
| Debug build talks to the wrong API | `npm run android` installs a plain debug build (the project has no `expo-dev-client`), which always loads Metro on port **8081**. If another `expo start` already holds 8081, the app uses *that* Metro's `EXPO_PUBLIC_API_URL`, which is baked in at bundle time. Check `lsof -iTCP:8081 -sTCP:LISTEN` before testing, and start Metro with the API URL you intend to use. Expo Go and `exp+pennywise://` links open Expo Go, not this build |
