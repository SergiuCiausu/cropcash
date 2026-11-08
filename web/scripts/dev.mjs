// Starts `next dev` on the first free port in the range the API's CORS allows
// (CORS_ORIGINS in .env). Next only falls back on its own when no port is given,
// and then it starts from 3000, which the API would refuse.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';

const FIRST_PORT = 5173;
const LAST_PORT = 5178;

/** Resolves false only if something is listening; a missing IPv6 stack is not "busy". */
function canBind(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (err) => resolve(err.code !== 'EADDRINUSE' && err.code !== 'EACCES'));
    probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(true)));
  });
}

// Both families: a listener on 0.0.0.0 and one on :: can hold the same port separately.
async function isFree(port) {
  return (await canBind(port, '0.0.0.0')) && (await canBind(port, '::'));
}

async function findPort() {
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    if (await isFree(port)) return port;
    console.log(`Port ${port} is in use, trying the next one.`);
  }
  return null;
}

const port = await findPort();
if (port === null) {
  console.error(`No free port between ${FIRST_PORT} and ${LAST_PORT}. Stop one of the running dev servers.`);
  process.exit(1);
}

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
// Next allows one dev server per build folder, so a second server needs its own.
const env = port === FIRST_PORT ? process.env : { ...process.env, NEXT_DIST_DIR: `.next/port-${port}` };
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], { stdio: 'inherit', env });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
