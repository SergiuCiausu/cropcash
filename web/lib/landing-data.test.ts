import { describe, expect, it } from 'vitest';
import { landingFigures } from './landing-data';

describe('landingFigures', () => {
  const f = landingFigures();
  it('is Ion, from docs/data', () => {
    expect(f.name).toBe('Ion');
    expect(f.ha).toBe(15);
    expect(f.start).toBe(3_500_000);
  });
  it('has twelve months on each path, in integer bani', () => {
    for (const path of ['poor', 'expected', 'good'] as const) {
      expect(f.series[path]).toHaveLength(12);
      expect(f.series[path].every(Number.isInteger)).toBe(true);
    }
    expect(f.months).toHaveLength(12);
  });
  it('fills every card from the plan', () => {
    expect(f.costs.length).toBeGreaterThan(0);
    expect(f.crops.length).toBe(2);
    expect(f.coming.length).toBeGreaterThan(0);
    expect(f.salary).toBeGreaterThan(0);
  });
});
