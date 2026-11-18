import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const list = Array.from({ length: 60 }, (_, i) => i + 1);

describe('paginate', () => {
  it('cuts a list into pages', () => {
    expect(paginate(list, 1, 25)).toMatchObject({ page: 1, pages: 3, from: 1, to: 25, total: 60 });
    expect(paginate(list, 1, 25).rows).toHaveLength(25);
  });

  it('shows what is left on the last page', () => {
    const last = paginate(list, 3, 25);
    expect(last.rows).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(last).toMatchObject({ from: 51, to: 60 });
  });

  it('keeps an exact fit on one page', () => {
    expect(paginate(list.slice(0, 25), 1, 25).pages).toBe(1);
  });

  it('moves back to a real page when the list got shorter', () => {
    expect(paginate(list, 9, 25).page).toBe(3);
    expect(paginate(list, 0, 25).page).toBe(1);
    expect(paginate(list, Number.NaN, 25).page).toBe(1);
  });

  it('handles an empty list', () => {
    expect(paginate([], 1, 25)).toEqual({ rows: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});
