import { describe, expect, it } from 'vitest';
import pricesJson from '../../../../docs/data/arenda-prices-2026.json';
import countiesJson from '../../../../docs/data/counties.json';
import { ArendaPricesSchema, inKindPriceBani, rentTax } from './prices';

const file = ArendaPricesSchema.parse(pricesJson);

describe('arenda-prices-2026.json', () => {
  it('has every county, and a decision with a link behind each price', () => {
    expect(Object.keys(file.county_prices).sort()).toEqual(countiesJson.counties.map((c) => c.code).sort());
    for (const c of Object.values(file.county_prices)) if (c.prices_bani_per_kg) expect(c.url).toBeTruthy();
  });

  it('refuses a price for a product it doesn’t know, or one without a decision', () => {
    const copy = JSON.parse(JSON.stringify(pricesJson));
    copy.county_prices.TR.prices_bani_per_kg.ovaz = 70;
    expect(ArendaPricesSchema.safeParse(copy).error?.issues[0]?.message).toBe('TR: unknown product ovaz');
    const bare = JSON.parse(JSON.stringify(pricesJson));
    delete bare.county_prices.OT.decision;
    expect(ArendaPricesSchema.safeParse(bare).success).toBe(false);
  });
});

describe('rent in kind at the county price', () => {
  it('Teleorman wheat is 0,69 lei/kg (HCJ 1/2026), by the crop’s genus', () => {
    expect(inKindPriceBani(file, 'TR', 'Triticum', '2026-08-10')).toBe(69);
    expect(inKindPriceBani(file, 'TR', 'Zea', '2026-08-10')).toBe(72);
  });

  it('is null where nothing is known: a crop the county doesn’t list, a county not read, before a decision starts', () => {
    expect(inKindPriceBani(file, 'TR', 'Brassica', '2026-08-10')).toBeNull();
    expect(inKindPriceBani(file, 'GR', 'Triticum', '2026-08-10')).toBeNull();
    expect(inKindPriceBani(file, 'IL', 'Triticum', '2026-07-31')).toBeNull();
    expect(inKindPriceBani(file, 'IL', 'Triticum', '2026-08-01')).toBe(80);
  });
});

describe('the tax withheld on rent (Codul fiscal art. 84)', () => {
  it('takes 20% off as expenses, withholds 10% of the rest, due on the 25th of the next month', () => {
    // 800 kg of wheat in Teleorman: 800 × 0,69 = 552 lei.
    expect(rentTax(55_200, '2026-08-20', file.tax)).toEqual({
      grossBani: 55_200, expensesBani: 11_040, netBani: 44_160, taxBani: 4_416, paidBani: 50_784, dueOn: '2026-09-25',
    });
  });

  it('a December payment is due in January', () => {
    expect(rentTax(100_000, '2026-12-03', file.tax).dueOn).toBe('2027-01-25');
  });
});
