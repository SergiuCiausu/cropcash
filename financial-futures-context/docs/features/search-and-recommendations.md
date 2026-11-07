# Search recommendations and trip planning

**Every search uses one shared recommendation service, with Balanced as the default.** It works for groceries, mobile
services, and other searches. The app explains why each result appears, and partner commissions must never affect the order.

Flow: identify the topic → decide whether a visit is needed (shop product, online, delivered, hybrid, in person) →
filter out options that fail the user's needs → rank with the active mode → show primary results + alternatives.

Food and other shop products need a visit unless delivery is available. Online services skip distance, while hybrid
services use distance only for the required visit.

| Mode | When used | Order |
| --- | --- | --- |
| Balanced | Default for shop products | Blend price, quality, and proximity |
| Price-first | User filter | Cheap and near, cheap and far, expensive and near, expensive and far |
| Quality-first | User filter | Highest quality first, then lower price, then shorter trip |
| Distance-first | User filter, with location | Shortest trip first, then lower price |
| No location | Location denied | Cheapest first; Distance-first is unavailable |

## App-wide recommendation rule

Based on the user's prompt, identify what most people asking this would want first. Show one primary recommendation
when the choice is clear, or the top 3 when the best option depends on personal priorities. List the remaining valid
options as alternatives. Remove anything that doesn't meet the user's stated needs, and briefly explain why each primary
option was chosen.

| Subject | Primary results | Most people want first |
| --- | --- | --- |
| Same product at different shops | 1 | Best balance of price and trip |
| Food or household products | 3 | Best balance, cheapest suitable, and highest quality |
| Mobile plans and online services | 3 | Best fit, cheapest suitable, and best value |
| Loans | 3 | Lowest total repayment that fits the user's budget |
| Car parts | 3 | Confirmed-fit options, with original and aftermarket labeled |
| Search with one exact requirement | 1 | Best match for that requirement |
| Too few valid options | 1-2 | Only the valid results, with no padding |

- **User's words:** A request such as "cheapest" or "closest" overrides the default.
- **AI's role:** AI identifies the request, while fixed rules choose the result count and ranking.
- **Alternatives:** Show only options that passed the same filters.
- **Commissions:** They can't affect primary placement.

## Chat topic detection and dynamic filters

AI reads the latest message and recent chat, then returns structured details such as topic, amount, term, purpose, and
confidence. It chooses only from approved topics (`../reference/chat-topics.md`) and filters. Fixed code then shows the
matching controls, while calculators and rankings stay outside the AI.

| Chat topic | Controls to enable |
| --- | --- |
| Food and household | Balanced, cheapest, closest, best quality, store, brand |
| Mobile services | Monthly cost, data, minutes, contract length, coverage, eSIM |
| Loans | Amount, years, interest type, DAE, monthly payment, full simulation |
| Car parts | Saved car, confirmed fit, part type, original or aftermarket, delivery |
| Unclear | Normal chat, with no special filters yet |

- **Current topic:** Keep it for follow-ups such as "Show me cheaper ones", and switch it for "What about groceries?"
- **Prefill:** Enter details the user already gave, such as 50,000 lei and 5 years.
- **Low confidence:** Ask a short question instead of guessing.
- **User control:** Show active filters clearly, and let the user change or remove them.
- **Demo:** Move from a Greece goal to a loan question, and switch the screen from savings controls to the loan simulation.

## Scoring details

- **Balanced score:** Hide products that are worse on price, quality, and proximity than another comparable product. Then start with 40% price, 35% quality, and 25% proximity, and let users adjust the weights (a "Cheapest to Best quality" slider).
- **Price-first details:** Use the median comparable price to split cheap from expensive, and treat routes up to 3 km as near by default. Sort each group by lowest price, then shortest distance.
- **Comparable prices:** Filter poor matches first. Use lei/kg or lei/l for groceries, and total monthly cost for plans. Mark quality as "limited data" when evidence is missing.

| Service type | Example | Distance |
| --- | --- | --- |
| Fully online | eSIM, streaming, online insurance | Not used |
| Delivered | Router or SIM by courier | Not used; include delivery cost and time |
| Hybrid | Plan with ID check or pickup | Used for the required visit |
| In person | Car repair, dentist | Used |

AI extracts service facts from approved sources, such as signup steps, coverage, contract length, and whether a visit is
required. Fixed rules then choose the service type and remove options that fail the user's needs. If evidence is weak,
mark the service "needs checking" or ask the user. For suitable services, show the best fit and the cheapest option when
they differ.

**Transport preference:** The user sets a preferred method in the app: walking, public transport, car, bike, or no
preference. Google route data then returns the available methods and durations. The preferred method appears first, and
the others appear as alternatives. Balanced and Distance-first use the preferred method's extra time or distance. If that
method is unavailable, show the fastest option and label it clearly.

**SGR label:** Show "SGR not included" on all product results. Don't detect or calculate the deposit in the first release.

## Store result

Show the store name, full address, price, price date, travel times, static map image, and Directions button.

- **Map image:** Use Google's Maps Static API, not a literal screenshot. It returns a still image, so the app has no interactive map UI.
- **Pins:** Show the store pin, plus the user's pin only when location is allowed.
- **Directions:** Open the route in Google Maps instead of building navigation in the app.
- **Coordinates:** Use Monitorul store addresses and coordinates if reuse is approved. For other stores, use retailer store lists or Google Places.
- **Cost control:** Use straight-line distance to shortlist stores. Then load route times and map images only for the top results or when a user opens a store.
- **Privacy:** Use location only during a search, don't store location history, and don't log map URLs with user coordinates.

**Deferred from launch:** Detailed fuel cost is not part of the first release (no bank-based transport guessing, fuel
receipts, WLTP calculations, odometer scans, connected cars, OBD devices, or trip tracking). If it returns, use WLTP as a
starting estimate, then replace it with real consumption from fuel and distance data. Show transit fares only when a
reliable source provides them.

**Demo:** Use saved Monitorul responses, simulated plans, a location on/off toggle, and a preferred-method setting. Ana
should see the ranking, address, route times, Directions button, and static map change as those settings change.
