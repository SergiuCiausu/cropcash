# Screens (draft)

DRAFT: derived from the build plan; confirm and adjust before building. Every screen lists the data it reads
(operation IDs from `data/bank-api.md` = B*, `data/app-api.md` = A*).

## Navigation

Phone: bottom tabs **Home · Money · Goals · Chat · More**. Desktop: left sidebar with the same five items; Chat shows the
live projection panel pinned on the right.

## Screen list

| # | Screen | Purpose | Reads | Key actions |
| --- | --- | --- | --- | --- |
| 1 | Welcome | Explain the promise; offer sample data or connect | — | Explore sample data, Connect my bank |
| 2 | Sample data preview | Let users explore Ana's data before connecting | fixtures | Connect my bank |
| 3 | Bank picker | Choose a bank (one simulated bank in the demo) | B1 | Select bank |
| 4 | Mock bank approval | Looks like a bank consent page; clearly marked simulated | B3 | Approve, Cancel |
| 5 | Connecting | Progress while data loads | B4, B5 | — |
| 6 | Starting plan | Pick Safety first / Travel / Home and family / Early retirement / Balanced | — | Choose, switch later |
| 7 | Home | Estimated balance, what you can do today, on-track status, demo banner | A6, A3, A8, A11 | Open suggestion, One-tap save |
| 8 | Transactions | List by date with category, search, filters | B7, B8 | Correct category (A4) |
| 9 | Spending insights | Monthly cash flow by category, one-off items | A5 | Change month |
| 10 | Subscriptions and bills | Recurring payments with Keep / Cancel, bill calendar | A3 | Keep, Cancel, One-tap save |
| 11 | Goals list | All goals with progress bars | A8 | New goal |
| 12 | Goal detail | Progress, projected finish, contributions, pause | A8, A9, A10 | Save now, Pause, Edit |
| 13 | New goal | Template, amount slider, date picker, one-sentence setup | A8 | Create |
| 14 | Chat | Ask the app; plan cards with Sync to projection | A12, A13 | Ask, Sync, Undo |
| 15 | Projection panel | Live forecast charts (desktop side panel, phone slim bar → sheet) | A11 | Switch chart, scenario, sliders |
| 16 | Retirement | Sliders, lifestyle picker, fork-in-the-road comparison | A11 | Adjust, compare |
| 17 | Quests and progress | Quests, challenges, progress points with proof | A3, A9 | Start quest |
| 18 | Shopping search | Balanced results, filters, store result with map and Directions | search fixtures | Filter, Directions |
| 19 | Receipt scan | Camera/upload, extracted items | — | Confirm items |
| 20 | Simulated investing | Payday rule with cap, simulated portfolio | A14 | Create rule, pause |
| 21 | Premium | Plan benefits, upgrade through Stripe Checkout | Stripe | Upgrade, Manage (portal) |
| 22 | Settings | Bank connections (reconnect, disconnect), manual items, data, location, notifications | B5, B11, B13, A7 | Reconnect, Disconnect, Add pension |

## States every data screen needs

- **Loading:** skeleton rows; never a blank screen.
- **Empty:** explain what will appear and offer the next step (connect, add a goal).
- **Connection failed:** plain message + Try again (B3 fail callback).
- **Consent expired:** banner "Reconnect your bank" (B10 → B11); keep showing last data with its date.
- **Estimated values:** label "Estimated balance" with "Last updated" time.
- **Simulated:** any simulated money movement or portfolio carries a "Simulated" label.
- **Demo banner:** "Demo data, no real bank connected" while `BANK_DATA_SOURCE=mock`.

## Demo controls (hidden menu, demo only)

Buttons that trigger story events on stage: send consent-expired callback, add next day's transactions (refresh),
apply the car repair setback, reset Ana's data.
