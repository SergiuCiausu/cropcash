# Design (draft)

DRAFT: principles come from the build plan; visual choices marked **Decide** are open.

## Principles (from the build plan)

- The home screen stays simple: what you have, what you can do today, whether you're on track.
- Explain why: every suggestion and ranking says why it appears; "Explain this" shows the calculation.
- Ranges, not promises: forecasts show cautious / expected / optimistic paths in today's money.
- Calm about setbacks: pausing is "using the plan, not failing it". No red failure states for life events.
- No leaderboards and no game artwork: quests and progress use plain lists, checkmarks, progress bars.
- Honest labels: "Estimated balance", "Simulated", "Demo data", "Limited data" for weak quality evidence,
  "SGR not included" on product results, price date on every price.
- The user stays in control: active filters are visible and removable; automatic changes have Undo.

## Language and formats

- **Decide:** UI language. Romanian first (target market) with English for the hackathon judges is a reasonable default.
- Money: Romanian locale, e.g. `4.280,55 lei`; EUR as `210,00 €`. Totals from fixtures, never re-rounded in the UI.
- Dates: `7 nov. 2026` in Romanian, ISO `2026-11-07` in data.
- Percentages in forecasts: one decimal at most ("−7,5%").

## Visual system

- **Decide:** brand colors, typeface, icon set, light/dark support.
- Use one accent color for the primary action and progress; status colors only for meaning (good / warning / critical).
- Charts: line with shaded range for scenarios, two lines for before/after a plan, progress bar for goals,
  stacked area for net worth parts, falling line for retirement drawdown (see `features/live-projection-panel.md`).

## Tone

Short, plain, friendly. Talk to the user ("You could save 199 lei a month"), never blame
("You wasted money" → "Three subscriptions you haven't used").
