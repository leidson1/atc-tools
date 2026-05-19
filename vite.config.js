import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  base: singleFile ? './' : '/atc-tools/',
  plugins: singleFile ? [viteSingleFile()] : [],
  clearScreen: false,
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
