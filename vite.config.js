import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const singleFile = process.env.SINGLE_FILE === '1';

// Data da fotografia dos dados oficiais embutidos neste build.
// O aviso de atualizacao nao pode depender so de pkg.version: os dados do
// ROTAER/GeoAISWEB mudam quase toda semana e a versao do app quase nunca,
// entao quem baixou o HTML offline ficava com dado velho sem nunca ser avisado.
function readDataDate() {
  try {
    const meta = JSON.parse(
      readFileSync(new URL('./src/data/metadata.json', import.meta.url), 'utf8')
    );
    return meta.generated_at || null;
  } catch {
    return null;
  }
}

const dataDate = readDataDate();

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
          JSON.stringify(
            {
              version: pkg.version,
              released: new Date().toISOString(),
              data_generated_at: dataDate,
            },
            null,
            2
          )
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
    __DATA_GENERATED_AT__: JSON.stringify(dataDate),
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
