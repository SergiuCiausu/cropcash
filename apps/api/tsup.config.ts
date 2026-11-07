import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the shared workspace package (TS source) so dist/ runs standalone on the VPS.
  noExternal: ['@cropcash/shared', 'subventii-monitor'],
  // The monitor's source is bundled, but its libraries load from node_modules at run time.
  external: ['cheerio', 'defuddle', 'diff', 'linkedom', 'p-queue', 'robots-parser', 'undici', 'unpdf'],
});
