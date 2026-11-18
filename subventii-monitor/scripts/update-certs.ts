// Finds hosts whose certificate chain is incomplete and saves the missing
// intermediates. A certificate is kept only if a real TLS connection then
// verifies up to a root Node already trusts, so a bad download can't add trust.
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tls, { type PeerCertificate } from 'node:tls';
import { SPEC_PATH } from '../src/config.ts';
import { parseSpec } from '../src/seed.ts';
import { CERTS_PATH } from '../src/tls-setup.ts';

interface Probe {
  authorized: boolean;
  error?: string;
  caIssuers?: string;
}

function connect(host: string, ca?: string[]): Promise<Probe> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000, ...(ca ? { ca } : {}) },
      () => {
        const cert = socket.getPeerCertificate() as PeerCertificate & { infoAccess?: Record<string, string[]> };
        resolve({
          authorized: socket.authorized,
          error: socket.authorizationError?.toString(),
          caIssuers: cert.infoAccess?.['CA Issuers - URI']?.[0],
        });
        socket.end();
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ authorized: false, error: 'timeout' });
    });
    socket.on('error', (err) => resolve({ authorized: false, error: err.message }));
  });
}

const hosts = [...new Set(
  parseSpec(fs.readFileSync(SPEC_PATH, 'utf8')).map((s) => new URL(s.url))
    .filter((u) => u.protocol === 'https:').map((u) => u.hostname),
)];

const saved = new Map<string, string>();
const bundle = () => [...tls.rootCertificates, ...saved.values()];

for (const host of hosts) {
  const probe = await connect(host, bundle());
  if (probe.authorized) continue;
  if (probe.error !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || !probe.caIssuers) {
    console.log(`${host}: left as is (${probe.error})`);
    continue;
  }

  const res = await fetch(probe.caIssuers, { signal: AbortSignal.timeout(15_000) });
  const candidate = new X509Certificate(Buffer.from(await res.arrayBuffer()));
  const check = await connect(host, [...bundle(), candidate.toString()]);
  if (check.authorized) {
    saved.set(candidate.fingerprint256, candidate.toString());
    console.log(`${host}: added ${candidate.subject.split('\n').find((l) => l.startsWith('CN='))}`);
  } else {
    console.log(`${host}: rejected the certificate from ${probe.caIssuers} (${check.error})`);
  }
}

fs.mkdirSync(path.dirname(CERTS_PATH), { recursive: true });
fs.writeFileSync(CERTS_PATH, [...saved.values()].join(''));
console.log(`Saved ${saved.size} intermediate certificates`);
