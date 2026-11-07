// Some government servers send their own certificate but not the intermediate
// that links it to a trusted root. Browsers and Windows fetch it themselves;
// Node doesn't. Trusting those intermediates keeps verification fully on.
// `pnpm update-certs` refreshes the file.
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { Agent, setGlobalDispatcher } from 'undici';
import { ROOT } from './config.ts';

export const CERTS_PATH = path.join(ROOT, 'certs', 'intermediates.pem');

export function installCertificates(): void {
  if (!fs.existsSync(CERTS_PATH)) return;
  const extra = fs.readFileSync(CERTS_PATH, 'utf8');
  setGlobalDispatcher(new Agent({ connect: { ca: [...tls.rootCertificates, extra] } }));
}
