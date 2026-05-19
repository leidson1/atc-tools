import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const singleFile = process.env.SINGLE_FILE === '1';

function versionJsonPlugin() {
  return {
    name: 'atc-version-json',
    closeBundle() {
      if (singleFile) return;
      const outDir = resolve(process.cwd(), 'dist');
      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
          resolve(outDir, 'version.json'),
          JSON.stringify({ version: pkg.version, released: new Date().toISOString() }, null, 2)
        );
      } catch (e) {
        console.warn('Failed to write version.json:', e);
      }
    },
  };
}

export default defineConfig({
  base: singleFile ? './' : '/atc-tools/',
  plugins: singleFile ? [viteSingleFile()] : [versionJsonPlugin()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: false,
  },
  build: {
    target: ['es2021', 'chrome100', 'safari15'],
    minify: 'esbuild',
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
    cssCodeSplit: !singleFile,
    rollupOptions: singleFile
      ? {
          output: {
            inlineDynamicImports: true,
          },
        }
      : undefined,
  },
});
