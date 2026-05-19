#!/usr/bin/env node
// Run both syncs sequentially.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('node', [resolve(__dirname, script)], { stdio: 'inherit' });
    child.on('exit', (code) => {
      code === 0 ? resolveP() : rejectP(new Error(`${script} exited with code ${code}`));
    });
  });
}

(async () => {
  await run('sync-aerodromes.mjs');
  console.log('');
  await run('sync-waypoints.mjs');
  console.log('\nSync completo. Use `git diff src/data/` pra ver as mudanças.');
})().catch((e) => { console.error(e); process.exit(1); });
