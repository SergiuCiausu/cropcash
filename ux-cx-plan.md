# UX & CX Improvement Plan: CropCash (`web/`)

**Date:** 2026-11-08 · **Scope:** the whole Next.js app in `web/`: landing, login, onboarding, the farmer's pages, Ion's farm, assistant, notifications, offline states · **Goal:** none was stated, so this assumes activation (a new farmer sees a salary they believe) and retention (they come back before deadlines and money events).

**Evidence used:** full read of the screens and frame code in `web/components/` and `web/lib/`; `docs/01-product.md`, `docs/06-features-mvp.md`, `docs/use-cases.md`; a 360 px walkthrough of Ion's farm on the static build (`web/out`), with measured font sizes, tap targets and page heights.

**Not available:**
- No signed-in session was walked live, because that needs a new account on the real Supabase. Login, onboarding, money moves and the assistant are judged from code, so check those findings once on a real phone.
- No analytics, support tickets or user interviews exist. Impact scores are judgment, and "current" metrics are unknown.

## Summary

The engineering around failure is unusually good: offline handling, idempotent money moves, honest error text. The experience gaps are elsewhere. Three things can silently damage a farmer's numbers or lock them out: amounts typed with a space are misread (`35 000` saves as 35 lei), "Schimbă ferma" opens blank and can zero the balance, and there is no password reset.

The two changes most likely to move the goal are showing the **salary** at the end of onboarding (today it shows only the APIA sum and never links to Acasă) and building **real reminders**. The bell in the header is a test panel, so nothing reaches a farmer who doesn't open the app, and missed deadlines are the costliest failure for this persona. For a 55+ user on a cheap phone, 42–78% of text on each page is under 15 px, which conflicts with the product's own "Cifre mari" rule.

No dark patterns were found. The closest is the lack of any way to delete an account (F-05).

| Bucket | Findings | Est. effort |
| --- | --- | --- |
| Fix now | 5 | S–M |
| Quick wins | 19 | S each |
| Next | 8 | M |
| Strategic | 4 | L |

## Journey map

| Stage | Screens / code | Health | Top issue |
| --- | --- | --- | --- |
| Discover | `web/app/page.tsx`, `/ferma-lui-ion` | Good | F-09, F-22 |
| Sign up / log in | `components/pages/Login.tsx`, `lib/live/auth.ts` | Poor | F-03 |
| Onboard | `components/pages/Onboarding.tsx` | Mixed | F-01, F-06, F-14, F-28 |
| First value | Onboarding result, `Acasa.tsx` | Mixed | F-06, F-27 |
| Core task: "câți bani am?" | `Acasa.tsx`, `Salariu.tsx`, `Prognoza.tsx` | Good | F-16, F-26, F-29 |
| Core task: noting sales and costs | `Recolte.tsx` | Mixed | F-01, F-13, F-20 |
| Money moves and pension | `Bani.tsx`, `Pensie.tsx` | Mixed | F-02, F-08, F-32 |
| Deadlines and calendar | `Calendar.tsx` | Mixed | F-23, F-29, F-33 |
| Notifications | `Notifications.tsx`, `lib/ui/messages.ts` | Poor | F-07, F-33 |
| Assistant | `Assistant.tsx` | Good | F-22, F-17 |
| Errors and offline | `NetBanner.tsx`, `fail-text.ts`, `PageFailed.tsx` | Good | F-24 |
| Support | none | Poor | F-35 |
| Leaving | sign-out link only | Poor | F-05, F-10 |

## What works well

Protect these when changing anything nearby.

- **Failure text that tells the truth about money.** `lib/live/fail-text.ts` separates "Nu știm încă dacă s-a făcut. Nu apăsa din nou." from "N-a mers. Nu s-au mutat bani." Few products do this (#42).
- **Offline is designed, not bolted on.** `NetBanner` shows how old the figures are, warns after a week, and counts queued records. `NetButton` says why it is off (#96).
- **The salary explains itself.** `Salariu.tsx` adds every line so the printed sum matches ("Cum am ajuns la…", "Ce am presupus"), and `DatePlan.tsx` previews the new salary before saving (#92, #70).
- **Assistant never saves alone.** Writes arrive as a card with exact values and a "Da, salvează" tap (`Assistant.tsx:52`), and failed questions go back in the box (#91).
- **Paper upload consent is plain and specific.** "Hârtia ajunge la serviciul care o citește și poate avea numele, CNP-ul sau contul tău" (`Papers.tsx:119`) (#94).
- **Ion's farm lets people try before signing up,** using the same screens as the real app (#71).
- **Honest ranges and sourcing.** APIA money is dated to the last possible day, and doubtful figures carry "de verificat".
- **No overflow at 360 px** on any of the 11 pages measured.

## Findings

Ordered by bucket, then roughly by priority. Priority = Impact × Confidence ÷ Effort. Any new button that needs internet follows the `data-needs-net` rule, and nothing that moves money goes in the offline queue.

### Fix now

### F-01 · Amounts with a space are saved wrong, silently · Fix now

- **Where:** Onboarding money step, `Onboarding.tsx:30,122`; sale and expense form, `Recolte.tsx:41,190`.
- **What happens:** `parseFloat` stops at the space, so a sale typed `12 500` saves as 12 lei and passes validation. In onboarding a space typed at the end is trimmed as you type, so the space only bites when pasted or inserted, but `35,000` becomes 35 lei.
- **Why it matters:** #39 Postel's law. Romanians commonly group thousands with a space or a dot. The salary is then calculated from a wrong figure with no warning.
- **Fix:** One shared amount parser in `packages/shared` with tests: strip spaces and dots used as thousand separators, then reject anything still ambiguous. Echo the reading under the field ("35.000 lei") before saving. Use it for every lei field.
- **Severity:** Critical · **Impact** 5 · **Confidence** 5 · **Effort** 1 · **Priority** 25

### F-02 · A money confirmation can be closed while the money is moving · Fix now

- **Where:** `Pensie.tsx:493-497` (`AskSheet`), split sheet in `Bani.tsx:330-333`, backdrop handling in `bits.tsx:62`.
- **What happens:** While the request runs, "Renunță", a tap on the backdrop and Escape all still close the sheet. The request continues, and its result or error has nowhere to appear. The careful "Nu apăsa din nou" message is lost with the sheet. In Bani the "Mai târziu" button does the same.
- **Why it matters:** #23 confirmation loops. A farmer can believe they cancelled a pension that did start.
- **Fix:** Give `Sheet` a `locked` prop. While busy, ignore backdrop and Escape and disable the secondary button. If the outcome is unknown, keep the sheet open on the message.
- **Severity:** Critical · **Impact** 4 · **Confidence** 4 · **Effort** 1 · **Priority** 16

### F-03 · No password reset, and no way to resend the confirmation email · Fix now

- **Where:** `Login.tsx`, `lib/live/auth.ts` (`AUTH_TEXT`, `AuthClient`).
- **What happens:** There is no "Am uitat parola" and no reset code. `email_not_confirmed` only says "Încă n-ai apăsat pe linkul din email". An expired link advises "fă-ți contul din nou", which then fails with "Există deja un cont". Sign-out also clears the phone's copy, so a farmer who forgets the password loses all access.
- **Why it matters:** #89 escalation path, #62 hot-cold empathy gap. The persona uses a phone and gets help from a daughter who is not always there.
- **Fix:** Add "Am uitat parola" (Supabase reset email, plus a new-password page), a "Trimite din nou emailul" button, and a show-password toggle. A new page goes in `SCREENS` with a skeleton if it uses that frame. Needs internet, and says so.
- **Severity:** Critical · **Impact** 5 · **Confidence** 5 · **Effort** 2 · **Priority** 12.5

### F-04 · "Schimbă ferma" opens blank and can reset the money to 0 · Fix now

- **Where:** Link at `Frame.tsx:116`; empty state at `Onboarding.tsx:66-72`; `Onboarding.tsx:128`.
- **What happens:** The form ignores the saved farm, so the farmer retypes name, age, county and every crop. If they tap "Nu știu, sar peste" the balance is saved as 0 over the real one, and crops left out disappear from the plan. The link is also hidden on phones (`rail.css:52`), so phone users cannot change county or age at all.
- **Why it matters:** #72 smart defaults, #26 forcing functions. A small correction can silently change the salary.
- **Fix:** Pre-fill every step from `farm.me`. On an edit, hide "sar peste" and keep the existing balance if the field is untouched. Add a phone entry under Contul tău.
- **Severity:** Critical · **Impact** 4 · **Confidence** 5 · **Effort** 2 · **Priority** 10

### F-05 · No way to delete an account or export data, and no privacy page · Fix now

- **Where:** No match for account deletion, "Confidențialitate" or "Termeni" in `web/components`, `web/app`, `web/legacy`.
- **What happens:** Signing up takes a minute. Leaving is impossible, and there is no statement of what is stored, though farm finances are kept and papers may contain a CNP.
- **Why it matters:** #49 roach motel, #90 graceful offboarding. Before real users this is also a likely GDPR gap (not legal advice). Not urgent for the hackathon demo, mandatory before anyone real signs up.
- **Fix:** A privacy page linked from sign-up. In Contul tău, "Descarcă datele mele" and "Șterge contul", with a summary of what goes, typed confirmation, and a stop of any running pension first.
- **Severity:** Critical (before launch) · **Impact** 3 · **Confidence** 5 · **Effort** 3 · **Priority** 5

### Quick wins

### F-06 · Onboarding ends without the salary or a way to Acasă · Quick win

- **Where:** `Onboarding.tsx:387-411`.
- **What happens:** The first screen promises "cât poți cheltui pe lună". The result shows only "De la APIA primești…", and its three links go to Prognoză, Recolte and Subvenții. None goes to Acasă.
- **Why it matters:** #80 aha moment, #1 peak-end. The product's main promise is missing at its most memorable moment.
- **Fix:** Lead the result with "Salariul tău: X lei pe lună", then the next money date, with the APIA sum beneath. Primary button "Mergi la ferma ta" → `/acasa`. Calculated on the phone, so the screen works offline once saved.
- **Severity:** High · **Impact** 5 · **Confidence** 4 · **Effort** 1 · **Priority** 20

### F-07 · The notification bell is a test panel, shown to real farmers · Quick win

- **Where:** `Frame.tsx:76`, `Notifications.tsx:142-146, 203-207`.
- **What happens:** The header bell is labelled "Notificări" and opens "Probează notificările", with "Trimite" and "Trimite toate" buttons that show the farmer toasts about themselves.
- **Why it matters:** #84 frontstage and backstage, #27 mode errors. It implies a reminder service that does not exist.
- **Fix:** Show the test panel only for Ion's farm and the demo account (`publicConfig().demo`). Everyone else gets a simple inbox of `panelRows`, sorted by date, until F-33 ships.
- **Severity:** High · **Impact** 4 · **Confidence** 5 · **Effort** 1 · **Priority** 20

### F-08 · Stopping a pension is confirmed with "Bine așa" · Quick win

- **Where:** `Pensie.tsx:160-163, 494`.
- **What happens:** Start, change and stop all end in the same dark "Bine așa" button.
- **Why it matters:** #70 feedforward, #19 habituation.
- **Fix:** Label by action and amount: "Da, pornesc cu 200 lei", "Da, opresc pensia". Give stop a distinct style.
- **Severity:** Medium · **Impact** 3 · **Confidence** 5 · **Effort** 1 · **Priority** 15

### F-09 · The demo strip and "Întreabă" fill the phone's first screen · Quick win

- **Where:** `Frame.tsx:164-179`, `.ask-fab`. Measured at 360 × 740: the strip with two 40 px buttons sits above the crop tabs and pushes the salary to about the middle of the screen, and the floating button covers the chart. On Recolte it covers text and "Schimbă culturile".
- **Why it matters:** #22 perceived performance, #18 inattentional blindness. This is the pitch's first impression.
- **Fix:** Collapse the strip to one line with a link after the first page, keeping "Pornește din nou" in the expanded state. Add bottom padding to `main` equal to the button height, and shrink the button to its icon while scrolling.
- **Severity:** Medium · **Impact** 3 · **Confidence** 5 · **Effort** 1 · **Priority** 15

### F-10 · One tap at the bottom of any page signs the farmer out · Quick win

- **Where:** `Frame.tsx:140-147`.
- **What happens:** "Ieși din cont" sits next to "Contul tău". It asks first only when unsent records exist, and it clears the phone's copy of the farm.
- **Why it matters:** #30 positive friction, compounded by F-03.
- **Fix:** Move it into Contul tău and always confirm: "Ca să intri din nou îți trebuie parola."
- **Severity:** Medium · **Impact** 3 · **Confidence** 4 · **Effort** 1 · **Priority** 12

### F-11 · Buttons are 40 px and links 17 px on the phone · Quick win

- **Where:** `.btn` at `desktop.css:67`, measured at 360 px: "Salvează" and "Fă-ți cont" 40 px; "Vezi tot calendarul" 17 px; "Schimbă" 17 px; crop-row buttons "Grâu", "Porumb" 23 px.
- **Why it matters:** #96 persona spectrum. The docs ask for "butoane mari", and this user may be outdoors, one-handed, with a cracked screen.
- **Fix:** Under 760 px, `.btn` at least 48 px. Give text links block padding to reach 44 px.
- **Severity:** High · **Impact** 4 · **Confidence** 5 · **Effort** 2 · **Priority** 10

### F-12 · Dead ends on the money pages · Quick win

- **Where:** `Pensie.tsx:212-216` (permanently disabled "Sar o lună"); `Bani.tsx:209` ("spune-ne întâi câți bani ai", no link); `Bani.tsx:188` ("Activează contul (test)").
- **Why it matters:** #29 signifiers, #28 gulf of execution.
- **Fix:** Remove the button until skipping exists. Link the sentence to Datele planului. Keep the honest "simulat" note in the page lead and drop "(test)" from the button.
- **Severity:** Low · **Impact** 2 · **Confidence** 5 · **Effort** 1 · **Priority** 10

### F-13 · Saving something gives no sign of what changed · Quick win

- **Where:** `Recolte.tsx:173,198`, `Pensie.tsx:476`, `Bani.tsx:330`, `DatePlan.tsx:133`. The only `notify(` caller is the test panel (`Notifications.tsx:195`).
- **What happens:** The form clears or the sheet closes, with no "saved" and no effect on the salary, though the toaster already exists. Queued records report only in the banner at the top, off-screen after a scroll.
- **Why it matters:** #23 confirmation loops, #17 change blindness.
- **Fix:** After every write, a toast with the effect: "Am notat vânzarea. Salariul: 850 → 900 lei" or "Se trimite când ai internet." Respect the no-"cam" copy rule.
- **Severity:** High · **Impact** 5 · **Confidence** 4 · **Effort** 2 · **Priority** 10

### F-14 · Android Back or a reload wipes onboarding · Quick win

- **Where:** `Onboarding.tsx:66-72, 98-102`.
- **What happens:** Steps live in `useState` with no history entry and no draft. Back leaves the flow and everything typed is gone. The same happens if the phone reloads the tab after the farmer goes to find a paper.
- **Why it matters:** #74 implicit save, #62 empathy gap.
- **Fix:** `pushState` per step, and keep a draft in `sessionStorage` through `storageKey`. Works offline up to the final save.
- **Severity:** High · **Impact** 4 · **Confidence** 5 · **Effort** 2 · **Priority** 10

### F-15 · Pension has no place in the phone navigation · Quick win

- **Where:** `lib/ui/nav.ts:13` (`railOnly`), `subsidies.css:470`.
- **What happens:** One of the product's two core promises is reachable on a phone only via a card on Acasă, or via links inside other pages.
- **Why it matters:** #20 information scent, #48 jobs to be done.
- **Fix:** Add a sub-navigation under the Salariu tab, the same pattern as Subvenții: Salariul · Pensie · Contul tău.
- **Severity:** High · **Impact** 4 · **Confidence** 4 · **Effort** 2 · **Priority** 8

### F-16 · Estimates are shown as certainties on the main screens · Quick win

- **Where:** `Salariu.tsx:122` ("poți scoate sigur"), `Acasa.tsx:45`. "Ce am presupus" is at the bottom of Salariu (`Salariu.tsx:204`).
- **What happens:** A new farmer's salary uses average yields and prices, but Acasă shows one big number with no signal of that, and "sigur" sits beside it.
- **Why it matters:** #91 automation bias, #92 explainability.
- **Fix:** While any figure is "media noastră", add one line under the salary: "Calculat cu mediile. Spune-ne ce ai strâns", linked to `/recolte#strans`. Replace "sigur" with "într-un an normal poți scoate".
- **Severity:** High · **Impact** 4 · **Confidence** 4 · **Effort** 2 · **Priority** 8

### F-17 · Assistant does not plainly say it is AI · Quick win

- **Where:** `Assistant.tsx:234-239, 330`.
- **What happens:** The footer says the figures come from the plan and nothing saves alone. It never says the answers come from an AI and can be wrong. The paper flow does say this.
- **Why it matters:** #93 disclosure, #91 automation bias.
- **Fix:** Add to the footer: "Răspunsurile vin de la un program AI și pot greși. Verifică înainte să hotărăști."
- **Severity:** Medium · **Impact** 2 · **Confidence** 4 · **Effort** 1 · **Priority** 8

### F-18 · "Ce urmează" and opportunities on Acasă look tappable but aren't · Quick win

- **Where:** `Acasa.tsx:329-343, 354-368`.
- **What happens:** Rows are plain list items. A farmer who sees a deadline cannot open it or tick "Am făcut".
- **Why it matters:** #29 signifiers, #44 effort.
- **Fix:** Each row opens the same detail sheet as Calendar, including "Am făcut". Ticking works offline through the existing path.
- **Severity:** Medium · **Impact** 3 · **Confidence** 5 · **Effort** 2 · **Priority** 7.5

### F-19 · Tapping outside a form sheet discards the typing · Quick win

- **Where:** `bits.tsx:62`, used by the gathered, planted and edit sheets in `Recolte.tsx`.
- **What happens:** A stray tap on the backdrop closes the form with no warning. Android Back leaves the page instead of closing the sheet.
- **Why it matters:** #74 implicit save, #96 persona spectrum.
- **Fix:** On sheets with inputs, ignore backdrop taps once something is typed. Push a history entry on open so Back closes only the sheet.
- **Severity:** Medium · **Impact** 3 · **Confidence** 5 · **Effort** 2 · **Priority** 7.5

### F-20 · "Șterge" removes a record at once, with no undo · Quick win

- **Where:** `Recolte.tsx:211-217, 421`.
- **What happens:** One tap deletes a sale or expense, and the salary changes.
- **Why it matters:** #25 undo over confirm.
- **Fix:** Delete, then show a toast with "Anulează" for 8 seconds, using the existing toaster, with a button in place of its link.
- **Severity:** Medium · **Impact** 3 · **Confidence** 5 · **Effort** 2 · **Priority** 7.5

### F-21 · No prompt to install the app · Quick win

- **Where:** No `beforeinstallprompt` in `web/`, though the PWA is installable.
- **What happens:** The farmer must find "Add to home screen" alone. Offline use and later push notifications both depend on this.
- **Why it matters:** #46 activation energy, #28 gulf of execution.
- **Fix:** After onboarding, a dismissible card: "Pune CropCash pe ecranul telefonului". On iPhone, show the manual steps. One "Nu acum" that stays dismissed (#100).
- **Severity:** Medium · **Impact** 4 · **Confidence** 3 · **Effort** 2 · **Priority** 6

### F-22 · Visitors can't see the assistant on Ion's farm · Quick win

- **Where:** `Assistant.tsx:128, 234-239`.
- **What happens:** "Întreabă" sits on every demo page, then opens a login wall. Its link goes to `/login`, while every other demo call to action goes to sign-up.
- **Why it matters:** #71 lazy registration, #45 time-to-value.
- **Fix:** Show two or three prepared questions with static answers and cards from `demo-ion.json`, with no API call, so it works offline. End with "Fă-ți cont". Figures come from the data file, not hardcoded copy.
- **Severity:** Medium · **Impact** 3 · **Confidence** 4 · **Effort** 2 · **Priority** 6

### F-23 · A deadline can't be put in the phone's own calendar · Quick win

- **Where:** `Calendar.tsx`, `ItemActions` (line 526 onward).
- **What happens:** The app has no export of any kind. Until push exists, the phone's calendar is the only reminder that can reach the farmer unprompted.
- **Why it matters:** #87 proactive support, #41 calm technology.
- **Fix:** "Pune în calendarul telefonului" on task details, generating an `.ics` with an alarm a few days before. Generated on the phone, so it works offline.
- **Severity:** Medium · **Impact** 4 · **Confidence** 3 · **Effort** 2 · **Priority** 6

### F-24 · Small inconsistencies in error display · Quick win

- **Where:** Native `confirm` and `alert` in `Surse.tsx:221-227`; `Frame.tsx:122-130` omits `NetBanner` on the closed-harvest view.
- **What happens:** Browser dialogs break the app's style, and "Am înțeles" notes about refused records don't show on that view.
- **Why it matters:** #42 service recovery.
- **Fix:** Use `Sheet` and inline errors. Render `NetBanner` above both branches.
- **Severity:** Low · **Impact** 1 · **Confidence** 5 · **Effort** 1 · **Priority** 5

### Next

### F-25 · Text is too small for the persona · Next

- **Where:** Measured at 360 px, share of text elements under 15 px: Subvenții 76%, Recolte 74%, Date plan 73%, Oportunități 71%, Calendar 63%, Salariu 56%, Acasă 51%, Pensie 49%, Prognoză 42%. Sizes down to 11 px exist in the CSS.
- **Why it matters:** #96 persona spectrum, #95 curb-cut. The persona is 55+ on a cheap phone, and `docs/01-product.md` requires "cifre mari".
- **Fix:** Raise body text to 16 px and secondary text to at least 14 px on phones. Add a "Scris mai mare" option in Contul tău, saved on the phone. Moving sizes to `rem` lets it scale everything.
- **Severity:** High · **Impact** 5 · **Confidence** 5 · **Effort** 3 · **Priority** 8.3

### F-26 · When the money runs out, the app stops at the bad news · Next

- **Where:** `Acasa.tsx:46`, `Salariu.tsx:68-69`. The credit form described in `docs/06-features-mvp.md` Î1b has no screen: `add_credit` is reachable only through the assistant.
- **What happens:** The farmer reads "În aprilie banii nu ajung", with no next step on the page.
- **Why it matters:** #43 moments of truth, #28 gulf of execution. This is fear number one for the persona.
- **Fix:** Under the deficit, list the options with their effect: note a planned credit (form, as in the doc, no bank named), sell earlier, lower or pause the pension. Show the numbers and leave the decision to the farmer, as the assistant does. Viewing works offline, and saving queues only if it records something rather than moving money.
- **Severity:** High · **Impact** 5 · **Confidence** 4 · **Effort** 3 · **Priority** 6.7

### F-27 · Skipping the money question is treated as having 0 lei · Next

- **Where:** `Onboarding.tsx:128, 369`; `Acasa.tsx:65`.
- **What happens:** "Nu știu, sar peste" stores 0. Acasă then says "Bani la tine acum: 0 lei" as fact, and the salary is built on it.
- **Why it matters:** #72 smart defaults, #92 explainability. "Don't know" and "nothing" are different answers.
- **Fix:** Store "unknown". Show a single prompt on Acasă ("Câți bani ai acum? Fără asta, salariul e mai mic decât poate fi") and an explicit label on the salary until it is answered. Requires a small schema change, so confirm against `docs/07-architecture.md` first.
- **Severity:** High · **Impact** 4 · **Confidence** 4 · **Effort** 3 · **Priority** 5.3

### F-28 · Only three crops are possible in onboarding · Next

- **Where:** `Onboarding.tsx:61`, `docs/data/crops-reference.json` (grâu, porumb, floarea-soarelui).
- **What happens:** A farmer who grows only rapeseed or barley cannot pass the crops step. `Recolte.tsx` already supports custom crops, but only after onboarding.
- **Why it matters:** #46 activation energy, #48 jobs to be done.
- **Fix:** Add "Altă cultură" using the existing custom-crop form and say plainly that it uses the farmer's own figures. Add new reference crops only with sourced numbers, otherwise `null` + `DE-VERIFICAT`.
- **Severity:** High · **Impact** 4 · **Confidence** 4 · **Effort** 3 · **Priority** 5.3

### F-29 · Pages are several phone-lengths long · Next

- **Where:** Measured at 360 px: Calendar 4455 px, Prognoză 3937, Subvenții 2910, Acasă 2712. On Acasă "Notează o vânzare" appears twice and three of four tiles repeat the bottom tabs (`Acasa.tsx:266-288`).
- **Why it matters:** #77 one thing per page, against the product rule "fiecare ecran răspunde la o singură întrebare".
- **Fix:** Acasă: salary, next money, next deadline, one action. Move weather and the crop table behind links. Calendar on phones: open on the list, with the month grid folded.
- **Severity:** Medium · **Impact** 4 · **Confidence** 4 · **Effort** 4 · **Priority** 4

### F-30 · Nothing can be sent to the daughter, the accountant or the bank · Next

- **Where:** No `navigator.share`, print or download anywhere in `web/`. Listed as a gap in `docs/06-features-mvp.md` (9b) and `docs/use-cases.md` (group I).
- **Why it matters:** #88 context continuity. `docs/01-product.md` names the daughter as a persona who must be convinced.
- **Fix:** "Trimite fiicei" on Salariu and Subvenții: a plain text summary with figures and assumptions through the share sheet, with print as the fallback. Built on the phone, so it works offline, and sharing itself needs whatever the target app needs.
- **Severity:** Medium · **Impact** 4 · **Confidence** 4 · **Effort** 3 · **Priority** 5.3

### F-31 · Empty-state wording never teaches the next step · Next

- **Where:** "Nimic notat încă." (`Recolte.tsx`), "Nimic planificat.", "Niciun salariu plătit încă." (`Bani.tsx`).
- **Why it matters:** #73 empty states.
- **Fix:** One sentence on what will appear, and the first action as a button.
- **Severity:** Low · **Impact** 2 · **Confidence** 5 · **Effort** 3 · **Priority** 3.3

### F-32 · The proposed split on envelopes can't be changed · Next

- **Where:** `Bani.tsx:320-336`. `docs/06-features-mvp.md` B3 specifies "Bine așa / Schimb" with sliders; only "Bine așa / Mai târziu" exist.
- **Why it matters:** #40 locus of control. It is also the demo's "money arrived" moment.
- **Fix:** Add "Schimb" with steppers that keep the total, and show the effect on the months covered. Needs internet and never queues.
- **Severity:** Medium · **Impact** 3 · **Confidence** 4 · **Effort** 3 · **Priority** 4

### Strategic

### F-33 · Nothing reaches a farmer who doesn't open the app · Strategic

- **Where:** `lib/ui/messages.ts:2` (Web Push is plan step 9f, still unchecked in `docs/10-plan.md`).
- **What happens:** All message content exists (weekly summary, November warning about April, deadlines), but only as test toasts. `docs/use-cases.md` itself notes the app must speak first for someone who "won't go looking".
- **Why it matters:** #87 proactive support, #41 calm technology, #4 Zeigarnik. A missed APIA deadline costs real money. iPhone push works only for installed apps, and many of these users may not install, so SMS needs evaluating.
- **Fix:** Build 9f with three tiers: urgent deadlines, money events, weekly summary. Add per-tier switches and a cap so it doesn't nag (#100). Decide push versus SMS with the research below.
- **Severity:** High · **Impact** 5 · **Confidence** 4 · **Effort** 4 · **Priority** 5

### F-34 · No product measurement exists · Strategic

- **Where:** No analytics or event calls anywhere in `web/`.
- **Why it matters:** #80, #78. No metric below can be measured, including onboarding drop-off.
- **Fix:** A small event list with a privacy-respecting tool, no amounts or names, disclosed in the F-05 privacy page: `signup_done`, `onboarding_step_N`, `result_seen`, `salary_seen`, `record_saved`, `paper_read_ok/failed`, `pension_started`, `deadline_done`, `assistant_asked`. Queue offline.
- **Severity:** Medium · **Impact** 4 · **Confidence** 5 · **Effort** 3 · **Priority** 6.7

### F-35 · There is no way to reach a person · Strategic

- **Where:** No help page, contact, `mailto:` or `tel:` anywhere. The assistant has no handoff.
- **Why it matters:** #89 escalation path, #44 effort. The app handles (simulated) salary and pension money, and `docs/use-cases.md` includes spotting fake SMS messages.
- **Fix:** A "Cere ajutor" page with a short FAQ, a phone or WhatsApp route, and a pre-filled message with page and app state. Needs a decision on who answers. Add "Nu cerem niciodată datele cardului prin SMS."
- **Severity:** High · **Impact** 4 · **Confidence** 4 · **Effort** 3 · **Priority** 5.3

### F-36 · The helper has no access of their own · Strategic

- **Where:** One email and password per farm (`auth.ts`). `docs/01-product.md`: the daughter runs onboarding and uploads PDFs.
- **What happens:** With one login per farm, the daughter has to use her father's email and password on her own phone. Sign-in on another device also means the two can collide ("Ferma s-a schimbat pe alt telefon").
- **Why it matters:** #96 persona spectrum, #88 context continuity.
- **Fix:** Invite a helper with their own login. Helpers can view and fill in, but only the farmer moves money. Requires an architecture decision, so ask before starting.
- **Severity:** Medium · **Impact** 4 · **Confidence** 3 · **Effort** 5 · **Priority** 2.4

## Roadmap: what to build

1. **Fix now:** F-01 shared amount parser · F-02 locked money sheets · F-03 password reset and resend email · F-04 pre-filled "Schimbă ferma" · F-05 privacy page, export and delete (before real users).
2. **Quick wins, before the demo if time allows:** F-06 salary on onboarding result · F-07 test panel only in demo · F-09 smaller demo strip · F-08 action-specific confirm labels · F-13 saved-with-effect toasts · F-11 48 px buttons · F-14 onboarding survives Back and reload.
3. **Quick wins, after:** F-15 Pension in phone navigation · F-16 labelled estimates · F-17 AI disclosure · F-10 safer sign-out · F-12 remove dead ends · F-18 tappable rows on Acasă · F-19 safe form sheets · F-20 undo on delete · F-21 install prompt · F-22 sample assistant on Ion's farm · F-23 add to phone calendar · F-24 consistent errors.
4. **Next:** F-25 larger text and "Scris mai mare" · F-26 options when money runs out · F-27 unknown balance · F-28 other crops · F-30 share with daughter · F-29 shorter pages · F-32 editable split · F-31 empty states.
5. **Strategic (needs research or a decision):** F-33 real reminders · F-34 measurement · F-35 human help · F-36 helper accounts.

## Success metrics

No baseline exists until F-34 ships, so targets should be set after two weeks of data. Numbers are deliberately left open.

| Metric | Current | Target | Guardrail (#78) | Linked findings |
| --- | --- | --- | --- | --- |
| Sign-up → salary seen, same session | unknown | set after baseline | Share of farmers who later correct their balance or hectares | F-01, F-06, F-14, F-27, F-28 |
| Onboarding step drop-off | unknown | set after baseline | Share using "sar peste" | F-14, F-27, F-28 |
| Farmers back in the 7 days before an APIA deadline | unknown | set after baseline | Notifications turned off, app uninstalls | F-21, F-23, F-33 |
| Deadlines ticked "Am făcut" before the date | unknown | set after baseline | Tasks ticked then unticked | F-18, F-23, F-33 |
| Records per active farmer per month | unknown | set after baseline | Records deleted within a day (bad entries) | F-01, F-13, F-20 |
| Failed logins that never succeed | unknown | set after baseline | Support contacts about access | F-03, F-10 |
| Pensions started | unknown | set after baseline | Pensions stopped within 3 months (a push metric alone would invite pressure) | F-02, F-08, F-16 |

## Experiments

Traffic will be too small for real A/B tests at first, so these are best run as before/after comparisons or with moderated sessions.

| Hypothesis | Change | Primary metric | Guardrail | Min. run length (#81) |
| --- | --- | --- | --- | --- |
| If the result leads with the salary, more farmers reach Acasă and return, because they see the promise kept | F-06 | Return within 7 days | Balance corrected later | 2 full weeks |
| If a deadline can go in the phone calendar, more are met, because the reminder reaches them unprompted | F-23 | Deadlines done before date | Reminders removed | 2 full weeks, across a real deadline |

## Research questions

Not yet proven. Test before funding.

- Do farmers aged 55+ have a working email and remember a password, or is SMS login needed? 5–8 moderated sessions with real farmers in Teleorman or similar (#35).
- Which reminder channel actually gets seen: push, SMS or WhatsApp? Offer a choice in a pilot and compare opens per channel.
- Who really runs the app, the farmer or the child? Ask at sign-up, then interview. The answer decides F-36 and how much F-25 matters.
- Do farmers trust a salary built on averages, or does it read as a promise? Show Salariu and ask them to say what "850 lei" means (#44).
- Can farmers find Pension and Oportunități on a phone? First-click test with the current tabs (#20).
- Does typing suit this user at all, given voice was removed and 36 of 50 use cases were spoken? Watch for dictation use with the phone keyboard's microphone.
