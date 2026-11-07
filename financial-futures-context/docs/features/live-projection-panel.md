# Live projection panel

The app keeps one live projection, with graphs and charts, beside the chat. Plans discussed with AI change it only when
the user taps **Sync to projection**, so exploring an idea never changes the real plan. API: A11, A12, A13.

## Plans from chat

1. When the chat reaches a complete plan, AI turns it into a structured change, such as a 50,000 lei loan over 5 years. If details are missing, it asks a short question and shows no card.
2. The forecast engine calculates the estimated impact, so AI never produces the numbers.
3. Chat shows a plan card with the details, the impact, a tiny before-and-after chart, and a Sync to projection button. An example impact is "Retirement savings: −7.5%".
4. Nothing changes in the panel until the user taps the button. The card then shows Synced and Undo.
5. If the user later changes that plan in chat, a new card shows Update projection. It replaces the synced version instead of adding a second loan.

The panel lists every synced plan, so the user can see what's affecting the numbers and remove any of them. Rules for
what needs approval stay the same as under Automation levels (`../product.md`).

| Screen | Behavior |
| --- | --- |
| Desktop | Panel stays pinned beside the chat, and the user can collapse it |
| Phone | A slim bar shows one key result with a tiny trend line, and tapping it opens the full panel |

## Projection charts

The panel opens on the first chart and has a simple switcher for the others. Fixed code draws every chart from the
forecast engine, and AI only explains the results.

| Question | Chart | Phase |
| --- | --- | --- |
| Where am I heading? | Line chart with a shaded range for cautious, expected, and optimistic paths | 1 |
| What does this plan change? | Two lines comparing the current plan with the plan after the change | 1 |
| When will I reach my goal? | Goal progress bar with the projected finish date | 1 |
| What makes up my net worth? | Stacked area chart of savings, investments, and debts over time | 1 |
| How long will my money last? | Retirement balance line falling over time, with the year it runs out | 1 |
| What are my chances? | Monte Carlo range chart with a chance-of-success figure | 4 |

## Projection states

Tapping Sync creates a state. Tapping a synced card shows that state in the panel, with a Back to latest button.
The panel doesn't change while the user scrolls, because that would feel jumpy.

- **Sync only:** Questions, slider movements, and unsynced plan cards don't create states.
- **One state per plan:** Update projection replaces the earlier version, so a loan changed from 5 to 7 to 10 years stays one plan.
- **Short list:** Show the live projection, its synced plans, and up to 3 saved scenarios. Older states stay reachable through their chat cards.
- **Light storage:** Save the plan changes and assumption date, then recalculate when opened. Label the view if assumptions have changed.
- **Undo:** Undone plans leave the panel, and their cards stay as a short record in the chat.

## When the user asks for a projection in chat

Chat and the panel have different jobs, so the same live chart never appears twice.

| Part of the app | Job | Updates? |
| --- | --- | --- |
| Panel | Shows the live projection | Yes |
| Chat card | Records the result at that moment | No, it stays dated |

- **Desktop:** The panel switches to the requested chart. Chat shows a short summary card with the key result and no large chart.
- **Phone:** Chat shows a small chart card, because the panel is hidden.
- **Asked for "here":** Show a larger dated chart in chat when the user explicitly asks to see it there.
- **Older cards:** Show View current on any card that no longer matches the live projection.

**Limits:** State limits are starting values to test. Show ranges rather than promises, and label simulated investing clearly.

**Phase 1 demo:** Ana asks about a car loan. The plan card shows its impact on her Greece and retirement plans, and she
chooses not to sync it, so her projection stays unchanged.
