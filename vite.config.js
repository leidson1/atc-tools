import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const singleFile = process.env.SINGLE_FILE === '1';

// Dados oficiais sincronizados do DECEA e embutidos no build, com as camadas
// correspondentes no metadata.json.
const DATA_FILES = [
  'src/data/aerodromes.json',
  'src/data/waypoints.json',
  'src/tma-boundaries.json',
  'src/ctr-boundaries.json',
  'src/fir-boundaries.json',
];
const DATA_LAYERS = ['ICA:airport_heliport', 'ICA:waypoint_aisweb', 'ICA:TMA', 'ICA:CTR', 'ICA:fir'];

// Identifica os dados embutidos neste build, para o aviso de atualizacao da
// copia offline. Nao pode ser o generated_at do metadata: ele muda a cada
// checagem diaria, inclusive quando so o ETag do PDF do ROTAER mudou, e o
// aviso disparava todo dia sem nenhum dado novo. O hash muda so quando o
// conteudo muda; a emenda AIRAC e a data que faz sentido mostrar.
function readDataInfo() {
  let hash = null;
  try {
    const h = createHash('sha1');
    for (const f of DATA_FILES) h.update(readFileSync(new URL(`./${f}`, import.meta.url)));
    hash = h.digest('hex').slice(0, 12);
  } catch {
    hash = null;
  }

  let amendment = null;
  try {
    const meta = JSON.parse(
      readFileSync(new URL('./src/data/metadata.json', import.meta.url), 'utf8')
    );
    // Campo no formato "2026-09-03Z (6077)", ou varias emendas separadas por
    // virgula quando a camada esta mista. Fica a mais recente.
    const datas = DATA_LAYERS.flatMap(
      (l) => meta.layers?.[l]?.amendment?.match(/\d{4}-\d{2}-\d{2}/g) || []
    ).sort();
    amendment = datas.at(-1) || null;
  } catch {
    amendment = null;
  }

  return { hash, amendment };
}

const dataInfo = readDataInfo();

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
              data_hash: dataInfo.hash,
              data_amendment: dataInfo.amendment,
              // Lido por copias offline da 0.11.7, que comparam esta data com
              // a embutida e avisam se a remota for mais nova. Antes era o
              // horario da checagem diaria; agora e a emenda, que so avanca
              // quando o DECEA publica dado novo. Meio-dia UTC porque aquelas
              // copias formatam com toLocaleDateString: meia-noite UTC seria
              // exibida como o dia anterior no fuso de Brasilia.
              data_generated_at: dataInfo.amendment ? `${dataInfo.amendment}T12:00:00.000Z` : null,
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
    __DATA_HASH__: JSON.stringify(dataInfo.hash),
    __DATA_AMENDMENT__: JSON.stringify(dataInfo.amendment),
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
