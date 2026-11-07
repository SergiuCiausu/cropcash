import ro from './ro.json';

type Dict = { [key: string]: string | Dict };

/**
 * Looks up a UI string by dotted path (e.g. "app.tagline") and fills {placeholders}.
 * All UI text lives in ro.json; components never hardcode Romanian strings.
 */
export function t(path: string, vars: Record<string, string | number> = {}): string {
  let node: string | Dict | undefined = ro as Dict;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) break;
    node = node[part];
  }
  if (typeof node !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${path}`);
    return path;
  }
  return node.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}
