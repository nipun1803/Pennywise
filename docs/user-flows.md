# Pennywise user flows

What a person does in the app, screen by screen. Screen paths are files under `client/src/app/`. The API calls behind each step are in [api.md](api.md); the server side is in [architecture.md](architecture.md).

## Screen map

```mermaid
flowchart TD
  subgraph Public["Signed out"]
    W["/ (welcome slides)"]
    SU["/signup"]
    LI["/login"]
  end
  subgraph Shared["Either state"]
    J["/join"]
    SC["/scan (QR)"]
  end
  subgraph Tabs["Signed in · bottom tabs"]
    H["home"]
    G["groups"]
    AC["activity"]
    RP["reports"]
  end
  subgraph Group["/group/[id]"]
    GI["index (expenses · balances · payments)"]
    OP["options sheet"]
    EX["expense (add/edit)"]
    ED["expense-detail"]
    PA["payment (record/correct)"]
    IN["invite (code + QR)"]
    ST["settings (edit group)"]
    RE["records (activity & statements)"]
    CA["categories"]
    ME["members"]
  end
  PR["/profile"]
  CG["/create-group"]
  CH["/choose-group"]

  W --> SU
  SU <--> LI
  H --> PR
  H --> CG
  H --> J
  H --> CH --> EX
  G --> CG
  G --> GI
  AC --> GI
  GI --> EX
  GI --> ED --> EX
  GI --> PA
  GI --> OP
  OP --> ST
  OP --> IN
  OP --> RE
  OP --> CA
  J --> SC --> J
  GI -.->|"not linked yet"| ME
```

> `members.tsx` (search members and see their balances) exists, but no screen links to it yet. Only a direct route opens it.

## 1. App launch and routing

`client/src/app/_layout.tsx` uses `Stack.Protected` guards, so a user can never land on a screen that doesn't match their sign-in state.

```mermaid
flowchart TD
  Start(["App opens"]) --> Load["Restore session from SecureStore<br/>load fonts, keep splash visible"]
  Load --> HasSession{"Session found?"}
  HasSession -- no --> Welcome["Welcome slides"]
  HasSession -- yes --> Pending{"Pending join code?"}
  Pending -- yes --> Join["/join (auto-submits the code)"]
  Pending -- no --> Home["/home"]
  Home --> Push["Register for push notifications"]
  Tap(["User taps a notification"]) --> ValidId{"data.groupId is a valid id?"}
  ValidId -- yes --> GroupScreen["/group/[id]"]
  ValidId -- no --> Ignore["Stay on current screen"]
  Expired(["Any API call returns 401"]) --> Logout["Clear session → welcome"]
```

## 2. Onboarding (sign up / log in)

```mermaid
flowchart TD
  W["Welcome: 3 slides<br/>(auto-advance, Skip, Back)"] -->|"Get started / Skip"| SU["Sign up form<br/>name · email · password"]
  SU -->|"Already have an account?"| LI["Log in form"]
  LI -->|"Create one"| SU
  SU --> V{"Valid?<br/>password ≥ 8 chars"}
  V -- no --> SU
  V -- yes --> Off{"Online?"}
  Off -- no --> Err["You're offline. Connect to sign in."]
  Off -- yes --> API["POST /auth/signup or /auth/login"]
  API -->|"409 EMAIL_IN_USE / 401 INVALID_CREDENTIALS"| SU
  API -->|"OK: token saved"| Next{"Pending join code?"}
  Next -- yes --> J["/join"]
  Next -- no --> H["/home"]
```

## 3. Create a group and invite people

```mermaid
flowchart TD
  H["Home or Groups tab"] -->|"Create a group"| CG["/create-group<br/>name, description, photo or preset"]
  CG -->|"Photo chosen"| Crop["Crop → upload via POST /media/images"]
  Crop --> CG
  CG -->|"Save"| API["POST /groups<br/>creator becomes first member"]
  API --> GI["/group/[id]"]
  GI -->|"Only member? Add members"| IN["Invite sheet<br/>6-char join code + QR + share"]
  IN -->|"Creator only"| Rot["Regenerate code<br/>(old code stops working)"]
```

## 4. Join a group

Codes can arrive four ways: typed, pasted, a QR scan, or an invite link (`/join?code=…`). If the user isn't signed in yet, the code is **remembered** through signup or login and used automatically afterwards.

```mermaid
flowchart TD
  In(["Code from: typed · paste · QR scan · invite link"]) --> J["/join"]
  J --> Valid{"6 valid characters?"}
  Valid -- no --> E1["Enter a valid six-character group code."]
  Valid -- yes --> Signed{"Signed in?"}
  Signed -- no --> Keep["Remember code as pendingCode"] --> SU["/signup or /login"]
  SU -->|"after auth"| J
  Signed -- yes --> Online{"Online?"}
  Online -- no --> E2["You're offline. Connect to join a group."]
  Online -- yes --> API["POST /groups/join"]
  API -->|"404"| E3["Group not found"]
  API -->|"alreadyMember: true"| T1["Toast: You're already a member."]
  API -->|"joined"| T2["Toast: Joined ‹group›<br/>existing members get a push"]
  T1 --> GI["/group/[id]"]
  T2 --> GI
```

## 5. Add an expense

```mermaid
flowchart TD
  H["Home: Add expense"] --> CH["/choose-group"]
  CH -->|"exactly 1 group: skip"| EX
  CH -->|"pick a group"| EX
  GI["Group screen: Add expense"] --> EX["/group/[id]/expense<br/>description · amount · category · paid by"]
  EX --> Mode{"How should we split it?"}
  Mode -->|"Evenly"| All["Everyone in the group,<br/>optionally exclude some"]
  Mode -->|"Selected people"| Sel["Pick participants"]
  Mode -->|"Custom amounts"| Cus["Enter each share"]
  All --> Prev["Live split preview"]
  Sel --> Prev
  Cus --> Sum{"Shares add up to total?"}
  Sum -- no --> ErrSum["Custom shares must add up exactly"]
  Sum -- yes --> Prev
  Prev -->|"Save"| Key["Store intent + Idempotency-Key"]
  Key --> API["POST /groups/:id/expenses"]
  API -->|"201"| Done["Back to group, balances refresh<br/>participants get a push"]
  API -->|"network lost"| Retry["Retry reuses the same key<br/>(no duplicate)"]
  Retry --> API
```

## 6. View, edit or delete an expense

```mermaid
flowchart TD
  GI["Group: Expenses tab"] --> ED["expense-detail<br/>amount · payer · each share · category"]
  ED --> Can{"Author or group creator?"}
  Can -- no --> RO["Read only"]
  Can -- yes --> Edit["Edit"] --> EX["Expense form<br/>(opens in Custom mode, or 'keep original people')"]
  EX -->|"PUT"| Upd["Saved, balances recomputed<br/>payer + old and new participants notified"]
  Can -- yes --> Del["Delete"] --> D["DELETE (soft delete)"]
  D --> Toast["Expense deleted. Recorded payments remain unchanged."]
```

## 7. Settle up

```mermaid
flowchart TD
  GI["Group screen"] --> Bal["Balances tab<br/>who is up / down"]
  Bal --> Sug["Suggested repayments<br/>(greedy settle-up)"]
  Sug -->|"Record payment"| PA["/group/[id]/payment<br/>from · to · amount prefilled"]
  GI -->|"Record a payment"| PA
  PA --> Check{"Amount ≤ suggestion<br/>and suggestions loaded?"}
  Check -- no --> Warn["Confirm: may overpay or reverse a debt"]
  Warn -->|"Confirm"| Save
  Check -- yes --> Save["POST /groups/:id/settlements<br/>(idempotent)"]
  Save --> Upd["Balances refresh<br/>other party gets a push"]
  Upd -->|"Mistake?"| Fix["Edit / delete payment<br/>(any member, with confirmation)"]
```

See [balances-and-settlement.md](balances-and-settlement.md) for how the suggestions are calculated.

## 8. Records, reports and profile

| Where | What the user can do |
| --- | --- |
| **Activity tab** | Cross-group feed of expense and payment events, filterable. Tap an item to open its group. |
| **Reports tab** | Spending per group and the user's balance in each. |
| **Group → Options → Activity & statements** | The group's audit history (filter: expenses, payments, group, categories) and a running-balance statement per member or for total spending. |
| **Group → Options → Categories** | Any member can add a custom category. Only the group creator can rename, archive or restore one; standard categories are read-only. |
| **Group → Options → Edit group** | Name, description, photo. Creator only. |
| **Profile** | Display name, avatar or photo, theme (system/light/dark), per-type notification switches, log out (removes this device's push token). |

## Offline behaviour

- Screens show the last cached data for the signed-in account.
- Every write button is disabled, with a "You're offline" message.
- There's no offline queue. A create that was interrupted mid-request is retried with its original idempotency key once the user taps Save again.
