# F4 screens plan

HTML prototypes for the F4 functions, then the move into the React app. The functions already exist (`docs/functions.md`), but they have no buttons.

Nothing here is built yet.

## Where the files go

The team designs in `farm-app/` and ports to `apps/web`. These prototypes follow the same path, so a form can be reviewed in a browser with no login or database.

```text
farm-app/forms/
  index.html        every screen and state on one page, for review
  forms.css         uses the tokens from farm-app/mobile/shared.css
  forms.js          state switcher and fake data, for prototypes only
  sale.html
  expense.html
  activity.html
  tasks.html
  farm-edit.html
```

- **Design:** the chosen look, Field, Violet & Gold, with flat colour and off-black text.
- **Layouts:** each file shows both, the phone (`c-deck`) and the laptop (`2-rail`).
- **Language:** real Romanian text from the start, so the wording gets reviewed too. It moves to `ro.json` when ported.
- **States:** every file has a switcher at the top for its states, listed below.
- **No extra libraries.** The prototypes are plain HTML, CSS and JS, and only `forms.js` holds fake data.

## How the farmer reaches them

Navigation stays at 4 tabs: Acasă, Prognoză, Culturi, Rezerve.

| Screen | Opens from | Shown as |
|---|---|---|
| Vânzare | New "Am vândut" tile on Acasă | Sheet |
| Cheltuială | New "Am cheltuit" tile on Acasă | Sheet |
| Activitate | New card on Acasă with the last 3 records, plus "Vezi tot" | Card, then sheet |
| De făcut | New card on Acasă with the next 3 tasks, plus "Vezi tot" | Card, then sheet |
| Ferma ta | New "Schimbă datele fermei" link in the account sheet | Sheet |

The sheets match "Iau un credit", so nothing new has to be learned.

## Screens

### 1. Vânzare (`sale.html`)

Uses `record_sale`, then `propose_split` and `save_envelopes`.

| Part | Detail |
|---|---|
| Crop | Large buttons for the farm's crops |
| Amount | Switch between "Știu totalul" and "Știu tonele și prețul" |
| Total preview | With tonnes and price, the total updates as the farmer types |
| Date | Today by default. Future dates aren't allowed |
| Note | Optional |
| Button | "Salvează vânzarea" |
| After saving | "Au intrat {amount} lei. Îți propunem așa:" with the split, then "Bine așa" or "Mai târziu" |

**States:** empty, filling in, wrong input, saving, saved with split, saved offline, could not send.

### 2. Cheltuială (`expense.html`)

Uses `add_expense`.

| Part | Detail |
|---|---|
| What for | Large tiles: Semințe, Îngrășăminte, Tratamente, Motorină, Lucrări, Reparații, Arendă, Altceva |
| Amount | Number keyboard, in lei |
| Crop | Optional, only for the first five tiles |
| Paid from | Optional, a list of envelopes with their balances |
| Date | Today by default |
| Button | "Salvează cheltuiala" |
| After saving | The new monthly salary, and "Anulează" for a few seconds |

**States:** empty, filling in, wrong input, saving, saved, envelope holds less than the expense, saved offline, could not send.

### 3. Activitate (`activity.html`)

Uses `list_transactions` and `undo_transaction`.

- Newest first, grouped by month, with sales and expenses marked by colour and icon, never colour alone.
- Filter: Toate, Vânzări, Cheltuieli.
- Each row can be removed, after a short confirmation.

**States:** empty, list, filtered with no results, waiting to send, confirm removal.

### 4. De făcut (`tasks.html`)

Uses `list_tasks`, `complete_task` and `reopen_task`.

- Soonest first, each with its title, its date and "Am făcut".
- Estimated dates and unverified items carry a clear label.
- Finished tasks sit in a collapsed "Făcute" section, and "Nu am făcut încă" reverses one.
- Each task links to its official source when it has one.

**States:** tasks waiting, all done, nothing in the next 12 months, waiting to send.

### 5. Ferma ta (`farm-edit.html`)

Uses `update_farm`, with `what_if_subsidy` for the preview.

- Name, county, age, crops with hectares, and the money the farmer started with.
- As hectares change, a line shows the new subsidy and any scheme gained or lost. This is calculated on the phone, so it works offline.
- A confirmation step shows old and new values before saving.

**States:** unchanged, changed, scheme lost, wrong input, envelopes bigger than the money, saved, saved offline.

## Text rules

- Plain Romanian with diacritics, and none of the banned words.
- All these forms take amounts in lei and say so, even when the currency toggle is on another currency.
- Large tap targets of at least 44 px, and the number keyboard for amounts.
- Error messages say how to fix the problem, such as "Scrie suma ca număr, de exemplu 42000."

## Offline

Decision from 2026-11-07: **recording a sale or expense works offline.** Recording only notes something that already happened, while moving money still needs internet.

| Action | Offline |
|---|---|
| Record a sale or expense | Yes, through the outbox |
| Remove a record not sent yet | Yes, it just leaves the outbox |
| Remove a record already sent | Yes, through the outbox |
| Mark a task done or not done | Yes, through the outbox |
| Change the farm details | Yes, through the outbox |
| "Bine așa" on the split | No: "Pornește internetul ca să muți banii." |

**What has to be built for this:**

1. **The outbox from step 9b**, in `apps/web/src/offline/`.
2. **Protection against duplicates.** Each sale and expense gets an ID on the phone. A new migration stores it with a unique rule, so a repeated send saves nothing twice. Without this, a dropped connection could record a sale twice.
3. **Local plan updates.** Waiting records are added to the farm before `buildFarmPlan` runs, so the balance and salary change at once. The salary shows "provizoriu" until they're sent.
4. **Failed sends stay visible.** If the server refuses a record, it stays on the phone marked "Nu s-a putut trimite", with options to change or delete it. Nothing disappears silently.
5. **A warning at logout.** Logout clears the phone's data, so with unsent records it first says how many would be lost.
6. **Date checks on the phone.** The server's check that a date isn't in the future can't help offline, so the form checks too.

## Build order

| # | Work | Done when |
|---|---|---|
| S1 | `index.html`, `forms.css`, `forms.js` | The page opens with no server, and the switcher works |
| S2 | `sale.html` and `expense.html` | All states work on both layouts |
| S3 | `activity.html`, `tasks.html`, `farm-edit.html` | All states work on both layouts |
| S4 | Your review of the prototypes | You've approved the screens and wording |
| S5 | Port to React, texts into `ro.json` | The screens call the real functions, and all tests pass |
| S6 | Outbox, offline records and the duplicate protection | With the phone in airplane mode, a sale is saved, the salary changes, and it reaches Supabase once when back online |

**Before S5:** migration 010 has to be on Supabase, or saving will fail.

**S6 overlaps with step 9b.** They should be built together, because 9b already creates the outbox.
