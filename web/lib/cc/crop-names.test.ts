import { describe, expect, it } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';

describe('the crops in docs/data', () => {
  it('each say how they read in a sentence', () => {
    for (const crop of loadData().crops.crops) expect(crop.name_ro_art, crop.id).toBeTruthy();
  });
});
