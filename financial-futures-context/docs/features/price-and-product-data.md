# Price and product data

The AI should use current data rather than memory, and it should show how reliable each price is.
None of this comes from bank data; it is a separate set of sources.

| Source | Gives you | Limit |
| --- | --- | --- |
| Monitorul Prețurilor | Official food price comparison; about 30,000 products and 1,700+ stores | Prices can lag, and no public API was found |
| Weekly catalogs | Current promotions from major chains | Covers offers, not the full range |
| Supermarket websites and apps | Prices, deals, and personalized discounts | Online and in-store prices may differ |
| Comparison sites, such as RadarPrețuri | Cross-retailer comparisons | Reusing data needs permission or a partnership |
| User receipts | Real store prices and exact purchased items | Coverage starts small |
| Affiliate feeds, such as 2Performant or Profitshare | Product names, prices, links, and stock from participating stores | Doesn't cover every store |
| Open Food Facts | Barcode lookup, ingredients, allergens, nutrition, Nutri-Score, and NOVA | Crowd-sourced, so coverage varies |

**Weekly catalogs:** Find them on supermarket websites and apps, or through Blix, Ofertelecatalog.ro, Listiq, and
Kaufino. Use the supermarket's own site to verify prices.

**Monitoring catalogs:** Run a scheduled check, detect changes, extract products with AI, validate the results, and
notify users. Check each site's terms and `robots.txt`, and keep request rates low.

## Choosing the best alternative

1. Match products using barcodes first, then model numbers and descriptions.
2. Compare price per kg, liter, or year, plus delivery and fees.
3. Score value using calculated rules, not an AI guess.
4. Filter by diet, allergies, stores, and brand preferences.
5. Compare the full basket, not one item.
6. Let the AI explain the recommendation and show its data date.

**Value score:** Use the Balanced score from `search-and-recommendations.md`: 40% price, 35% quality, and 25% proximity.
Users adjust it with a "Cheapest to Best quality" slider.

**Limits:** Prices vary by store, region, format, and loyalty status. The app can't always guarantee the cheapest
option, and users should check allergen labels themselves.

**Demo data:** a basket of about 20 common products across three supermarkets (Lidl, Kaufland, Mega Image), from saved responses.
