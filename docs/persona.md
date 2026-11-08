# Persona

> **Note (2026-11-08):** voice was dropped from the product. Everything below that Ion says aloud he now types to the "Întreabă" assistant, with the same rules (a save is always a card he taps).

CropCash is built around one farmer, Ion, and one helper, his daughter. If a feature doesn't help Ion answer one of his questions, it waits.

Ion is a made-up composite, not a real person. His figures are demo data, and the money figures come from `docs/07-architecture.md` and `docs/11-open-questions.md`. If they change there, those files win.

## Ion at a glance

| | |
|---|---|
| **Age** | 55+ (55 in the demo) |
| **Farm** | 15 ha of cereals in Teleorman: 8 ha wheat, 7 ha maize |
| **Legal form** | Private individual, not a PFA (assumption P22) |
| **Technology** | Only a phone, a cheap one, often on a weak signal |
| **Help** | His daughter helps with apps and paperwork |
| **Money today** | 35.000 lei on 1 November 2026 (assumption P9) |
| **Wants** | To know each month how much he can spend, without doing sums |

## His money

Ion earns 2–3 times a year and spends every month.

| When | What happens |
|---|---|
| July | Sells the wheat |
| October | Sells the maize |
| 16 Oct – 30 Nov | APIA advance, 75% of the subsidy. His first big wave of money |
| 1 Dec – 30 Jun | The rest of the APIA money. He doesn't know which month it comes |
| March to May | Spring inputs and sowing, the heaviest spending |

The money from autumn runs out in spring, before the rest of the subsidy is certain. Today he covers that gap with a credit on his APIA certificate, then repeats the cycle: "bani mulți, apoi credit".

| In a typical year | |
|---|---|
| Wheat | 42.000 lei |
| Maize | 43.225 lei |
| APIA subsidy | About 16.900 lei, between about 15.200 and 17.100 |
| APIA advance | About 12.650 lei |
| Total income, normal year | About 102.000 lei |
| Total income, drought year | About 82.000 lei |
| Safe salary, no credit | 850 lei a month in the app |
| Salary with a credit | 2.700 lei a month, with 14.800 lei of credit in April |
| Bad-years fund target | About 33.100 lei |

He has no reserve for a bad year and no pension. Farm income doesn't come with compulsory pension contributions, so he has never paid in by default.

## What he worries about

- "Îmi ajung banii până la recoltă?"
- "Cât îmi dă APIA anul ăsta?"
- "Ce fac dacă e secetă?"
- "Din ce trăiesc la bătrânețe?"

## The four questions he asks

Every screen answers one of these:

1. "Câți bani am?"
2. "Când vin banii?"
3. "Îmi ajung?"
4. "Ce am de făcut?"

## How he uses the app

- **He talks rather than types.** 36 of the 50 use cases are spoken, so the mic button and read-aloud matter more than a chat window.
- **He won't go looking.** The app has to tell him first, such as a warning in November about April.
- **He decides.** The app shows what changes, and never says yes or no.
- **He reads plain Romanian.** No "lichiditate", "cash-flow", "portofoliu", "randament", "buget" or "venit net". We say "bani", "îți ajung", "pui deoparte", "salariu".
- **He wants big figures, little text and big buttons,** at 360 px wide on a cheap phone.
- **He hears ranges, not promises:** "între 15.200 și 17.100 lei", never a percentage or a guarantee.
- **He often has no signal.** Reading and calculating work offline, and anything needing internet says so plainly.

Some of these come from the docs, and the rest are product choices we made for him. None has been tested with a real farmer yet.

## His daughter

The secondary persona. She's about 30, lives in town, and doesn't run the farm.

- **What she does:** fills in the APIA application today, does the onboarding and uploads the PDFs.
- **What she needs:** to trust the app, because Ion will use it only if she thinks it's safe. That's why "where do these numbers come from?" exists.
- **How she stays involved:** Ion sends her things through the phone's share menu. She has no account of her own.
- **In the demo:** she's the one who completes onboarding in two minutes.

## Who he stands for

Small and medium farms of about 5–50 ha.

| Who | Why or why not |
|---|---|
| Under 5 ha, 90,3% of farms | Income is too small to plan |
| **5–50 ha** | **Enough money for planning to matter, and nobody to do it** |
| Large farms | They already have an accountant and software |

Context: 671.334 APIA applications in 2026, 44,3% of farm managers over 65 (2020), and 226 agricultural insolvencies in the first half of 2026, up 80%.

## What we don't know

- **Real research:** the persona comes from the brief and our own assumptions, not from interviews.
- **Income norms for Teleorman:** missing, so his tax estimate is `null` (open question 13).
- **His daughter's name, and Ion's family and rented land:** the docs don't say. Don't add them to demo data without deciding first.
- **Voice on his phone:** whether Romanian speech recognition works on a cheap phone with weak signal is still untested.

## Figures that disagree in the docs

| Topic | Versions | Used here |
|---|---|---|
| Salary | 650 lei and 2.400 lei with 14.000 lei of credit, in the pitch and worked example, which include a 200 lei pension. 850 lei and 2.700 lei with 14.800 lei of credit in the app, with no pension yet (P24) | The app's |
| Bad-years fund | About 33.100 lei in the code and `07-architecture.md`, about 20.000 lei in `10-plan.md` step 7 | 33.100 lei |
| The spring gap | February to May in the older docs. March to May in P23 and the demo script, lowest about 7.800 lei in May | March to May |
