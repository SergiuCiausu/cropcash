/** Vite's `?raw` import (Vitest only): a file's text. Used by tests that read a doc, since this package has no Node types. */
declare module '*?raw' {
  const text: string;
  export default text;
}
