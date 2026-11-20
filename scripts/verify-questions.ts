/* Writes docs/11-open-questions.md, parsed, next to the parser (docs/admin-verificari-plan.md, step 2), so the
   web bundles it like docs/data. Run by `npm run build:web` and by hand after editing the doc; a test fails
   while the copy is behind the doc. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOpenQuestions } from '../packages/shared/src/verify/questions';

const root = join(import.meta.dirname, '..');
const questions = parseOpenQuestions(readFileSync(join(root, 'docs', '11-open-questions.md'), 'utf8'));
writeFileSync(join(root, 'packages', 'shared', 'src', 'verify', 'questions.gen.json'), `${JSON.stringify(questions, null, 1)}\n`);
console.log(`open questions: ${questions.length} (${questions.filter((q) => !q.closed).length} open)`);
