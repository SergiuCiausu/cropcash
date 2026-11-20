/* Not in the package root: it bundles every data file. Import from '@cropcash/shared/verify' (the admin page and its API only). */
export * from './levels';
export * from './scan';
export * from './questions';
export * from './answers';
export { VERIFY_FILES } from './files';
import questionsJson from './questions.gen.json';
import type { OpenQuestion } from './questions';
/** docs/11-open-questions.md, parsed at build time (npm run verify:questions). */
export const OPEN_QUESTIONS = questionsJson as OpenQuestion[];
