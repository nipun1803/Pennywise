# Pennywise client

Android-first Expo SDK 58 / React Native 0.88 app, with iOS and web compatibility. Shared expenses only: no personal budgeting, income tracking, or money transfers. Backend contracts: [API reference](../docs/api.md).

## Run

Use Node.js 22.13+ and npm. Inside `client/`:

```bash
npm ci
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `client/.env`. It is public configuration, not a place for secrets. Defaults without the variable are `http://10.0.2.2:3000` on Android and `http://localhost:3000` on iOS/web. The example uses localhost; **change it for Android/physical phones**.

- Android emulator: `http://10.0.2.2:3000`.
- iOS simulator / web on this Mac: `http://localhost:3000`.
- Physical phone: the Mac's reachable LAN address, such as `http://192.168.1.20:3000`; same trusted network. `localhost` is the phone itself.
- Production: deployed **HTTPS** API URL. Browser CORS must include the exact web origin.

Run the persistent backend using [backend setup](../docs/backend-setup.md). For a disposable preview, run `npm run dev:preview` inside `server/` in another terminal. That script ignores real database configuration, creates a temporary standalone MongoDB, and binds the API on port 3000. Do not use it in production; accounts/data disappear on shutdown.

`npm run web` starts the browser preview. For native testing use a development build; never hand-edit generated `android/` or `ios/` directories. Follow [development builds](https://docs.expo.dev/develop/development-builds/introduction.md) and the installed SDK's documentation. Adding native libraries requires rebuilding the development client. No store submission, signing, or cloud build has been performed.

### Android startup: missing ExpoCrypto

Mutation keys use Expo's built-in `uuid.v4()`, so they do not require the separate `ExpoCrypto` native module. After updating the client, stop Metro, run `npx expo start --clear` from `client/`, and reopen the app to replace the old bundle. The associated route-default-export warnings came from the failed import; the screens already export their components. If a different native module is missing, use an SDK 58-compatible Expo Go app or rebuild your development app; clearing Metro cannot install native modules.

## Screens and behavior

- Welcome → Login / Signup / Join. A validated six-character code survives switching between auth screens and joins after authentication. Clipboard is read only after tapping **Paste code**.
- Home · Groups · Profile. Home requests `/groups?page=1&limit=5`, newest-created first, without card balances. Add Expense uses the server's total: zero explains Create/Join; one skips selection; multiple show a paginated picker.
- Group overview: invite Copy/Share, own balance, Expenses · Balances · Payments, Members, Settings, and Activity & Statements.
- Equal splitting: Everyone with searchable exclusions or selected members; at least one participant; payer may be excluded. Category and description required. Shares appear from the server after saving.
- Payments are unverified external records, including partial/overpayments and entries on someone else's behalf. Overpayment and correction confirmations do not initiate or reverse transfers.
- Creator-only group photo/preset changes, metadata/code rotation, and category rename/archive. Any member may create categories or record/correct/delete payments. Expense changes require author/creator permission. Category icon/color choices remain available.
- Group Records: activity with actor/time and before/after details, corrected member account (self by default), and group spending excluding repayments. History starts with the feature rollout; earlier actions are not reconstructed.
- Profile: name, photo or built-in avatar with colored initials fallback, System/Light/Dark emerald theme, Logout.

## Session, cache, and retries

Native sessions use SecureStore. Web credentials are deliberately **memory-only** and are lost on page reload; there is no persistent web login. Theme is local and survives Logout. Account/page caches contain loaded API data only; credentials are never put into AsyncStorage. Logout/expiry clears account caches and credentials and cancels in-flight requests; late old-session responses are rejected.

Protected 401 and local token expiry return to Welcome with “Please log in again.” Invalid login stays on Login. JWTs last seven days, without refresh or server revocation. A copied JWT remains valid after local Logout until expiry/secret rotation.

Offline shows saved pages with a saved-data banner. Writes are disabled, with an explanation; there is **no offline queue**. Unloaded pages/search results cannot be invented. Focus, reconnect, pull-to-refresh, and successful mutations refetch current data. Unavailable balances are never shown as zero.

Expense/payment POSTs generate a UUID `Idempotency-Key`. Network/5xx uncertainty retains that key and the exact intended payload for an unchanged retry; edited retries are blocked with instructions to check the group first. The retry intent lives in the mounted form, not an offline queue. Do not navigate away/restart and blindly create another record after an uncertain save. The server retains original creation responses even after corrections/deletion.

Money uses safe integer paise with exact Indian grouping through shared `formatINR`; inputs accept positive amounts with at most two decimal places. API field names keep their historical `Cents` suffix.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Core tests run with Node's test runner and TypeScript transpilation in a sandbox with mocked native modules. They check exact INR/input parsing, join-code/JWT handling, protected/public 401 behavior, stale-session responses, secure storage, and account-cache isolation. They do not substitute for native-device tests.

Production web export: `npx expo export --platform web`. Android/iOS bundle exports check compilation, not native signing, OS behavior, keyboard/safe areas, or device networking. Native clipboard/share sheets and SecureStore must still be exercised on a development build before release.

## Structure

- `src/app/`: Expo Router screens/navigators only.
- `src/components/ui/app-ui.tsx`, `src/theme/`: emerald UI primitives/presets.
- `src/providers/app-provider.tsx`: session, connectivity, theme, messages, retained join code.
- `src/lib/`: API, safe integer formatting, types, secure session/account cache storage.
- `src/hooks/`: focus-aware cached resources and idempotent mutations.
- `src/screens/`: reusable auth, group forms, and category manager; retained starter examples are not routes.

Read `AGENTS.md` before Expo/React Native changes. Public launch also needs backend rate limits and a review of dependency advisories and retained audit-document sizes; see the backend deployment checklist.
## Photos and component tests

Tap the profile/group avatar to open **Take photo / Choose from gallery / Remove photo**. Only the group creator can change/remove a group photo or preset; other members see a read-only avatar, and direct group-update API requests are forbidden. Profile photos remain editable by their owner. The crop screen supports dragging and pinch-to-zoom, with a pinned **Done** button. Done uploads and saves existing photos immediately, separately from name/description edits. Removal saves immediately too. Failed uploads or updates keep the previous photo and offer **Retry**; a successful upload URL is reused when retrying a failed record update. Profile initials/Leaf/Sun/Sparkles/Coffee and group Friends/Trip/Home/Food/Work/Family presets are available alongside photos and save immediately without uploads. Selecting a profile avatar clears its photo. A new group's photo or preset stays local until **Create group**. The profile color picker remains removed; existing avatar colors are preserved.

Photo uploads use `/media/images`. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `server/.env`, then restart the API. Never place these secrets in an `EXPO_PUBLIC_*` variable or commit `.env`. Selected images are normalized to JPEG, cropped, and resized to at most 768 × 768; uploads are limited to 5 MB and stored as public URLs. Installed native apps need a rebuild if they do not yet include `expo-image-manipulator` and the image-picker permission plugin. SDK 58 Expo Go includes both modules.

If Cloudinary returns `Invalid cloud_name` or `cloud_name mismatch`, check that the cloud name and API key/secret come from the same product environment in the Cloudinary dashboard. This is a storage configuration rejection, not a crop/image problem. The backend now reports this separately from invalid images, network failures, and timeouts. The backend launched with `npm start` runs compiled `dist/` code: rebuild and restart after backend code or `.env` changes.

Run `npm run test:components` for React Native Testing Library tests (Jest/Expo). Existing pure unit tests remain available with `npm test`. Home and Reports now use `/dashboard`; Activity uses the globally paginated `/activity` endpoint. Restart the backend alongside the client update.
