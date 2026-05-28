#!/usr/bin/env node
// Cross-platform wrapper for the single-file Vite build.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = resolve(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : viteBin;
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', viteBin, 'build', '--outDir', 'dist-single']
  : ['build', '--outDir', 'dist-single'];

let child;
try {
  child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SINGLE_FILE: '1' },
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
