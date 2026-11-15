import { describe, expect, it } from 'vitest';
import cropsJson from '../../../../docs/data/crops-reference.json';
import { CropsFileSchema, loadData } from './index';

describe('APIA crop codes', () => {
  const crops = loadData().crops.crops;
  const codesOf = (id: string) => crops.find((c) => c.id === id)?.apia_codes;

  it('every reference crop has the codes from Tabel nr. 1 (MO 193 bis/2026), one crop per code', () => {
    const family = (id: string) => crops.filter((c) => (c.family ?? c.id) === id).flatMap((c) => c.apia_codes ?? []);
    expect(family('grau')).toEqual([101, 1010, 102, 1020]);
    expect(family('porumb')).toEqual([108, 115, 116, 117, 118]);
    expect(family('floarea-soarelui')).toEqual([201, 123, 124, 125, 126]);
    expect(codesOf('grau')).toEqual([101]);
    expect(codesOf('apia-1020')).toEqual([1020]);
    expect(codesOf('teren-necultivat')).toEqual([970]);
  });

  it('leaves out the codes that are a different crop on the money side', () => {
    const all = new Set(crops.flatMap((c) => c.apia_codes ?? []));
    for (const code of [132, 109, 110, 131, 1317, 133]) expect(all.has(code)).toBe(false);
  });

  it('refuses a code that belongs to two crops', () => {
    const twice = JSON.parse(JSON.stringify(cropsJson)) as { crops: { id: string; apia_codes?: number[] }[] };
    twice.crops.find((c) => c.id === 'porumb')!.apia_codes!.push(101);
    const r = CropsFileSchema.safeParse(twice);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('APIA code 101 belongs to both grau and porumb');
  });
});
