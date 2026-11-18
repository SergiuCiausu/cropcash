export interface ListPage<T> {
  rows: T[];
  /** The page shown, always a real one, even if the list got shorter. */
  page: number;
  pages: number;
  /** First and last row shown, counted from 1. Both 0 for an empty list. */
  from: number;
  to: number;
  total: number;
}

/** One page of a list, counted from 1. */
export function paginate<T>(items: readonly T[], page: number, size: number): ListPage<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return { rows, page: current, pages, from: total ? start + 1 : 0, to: start + rows.length, total };
}
