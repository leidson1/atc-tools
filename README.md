# ATC Tools

ATC Tools e um app web para consultas de radial, rota, FIR/TMA/CTR e aerodromos, com dados locais para uso online ou em bundle offline.

## Alvo principal

O produto principal deste repositorio e a versao web publicada pelo GitHub Pages:

- Online: https://leidson1.github.io/atc-tools/
- Download offline: https://leidson1.github.io/atc-tools/offline/
- Workflow principal: `.github/workflows/deploy-pages.yml`

A pasta `src-tauri/` esta preservada apenas como legado. Ela nao e o caminho principal de build ou release hoje.

## Desenvolvimento

```bash
npm ci
npm run dev
```

O Vite sobe em `http://localhost:1420` por padrao.

## Build web

```bash
npm run build
```

Esse comando gera `dist/`, usado pelo GitHub Pages.

Para gerar a versao offline em arquivo unico:

```bash
npm run build:single
```

Esse comando gera `dist-single/index.html`.

## Dados

Os dados usados pelo frontend ficam em `src/data/` e nos arquivos GeoJSON em `src/`.

Fonte principal:

- GeoAISWEB/DECEA WFS para aerodromos, helipontos, fixos, FIR, TMA e CTR.
- ROTAER/AISWEB e consultado pelo `data:check` para acompanhar D-AMDT, vigencia e metadata do PDF oficial.

Scripts disponiveis:

```bash
npm run data:check
npm run data:sync
npm run sync-data
npm run sync-aerodromes
npm run sync-waypoints
npm run sync-airspace
```

Observacao: os dados duplicados em `src-tauri/data_*.json` pertencem ao legado Tauri e nao sao a fonte principal da versao web.

## Tauri legado

O projeto Tauri foi mantido em `src-tauri/` para reaproveitamento futuro, mas esta fora do fluxo normal. O workflow de release desktop tambem foi marcado como legado e roda apenas manualmente.

Antes de reativar o desktop, revisar:

- versoes em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`;
- sincronizacao dos dados entre `src/data/` e `src-tauri/data_*.json`;
- toolchain Rust/Tauri;
- assinatura e updater.

## Monitoramento

O workflow `.github/workflows/check-data.yml` roda diariamente e executa:

```bash
node scripts/check-data.mjs --fail-on-change
```

Quando a fonte oficial divergir da fotografia gravada em `src/data/metadata.json`, o workflow falha para servir como alerta de atualizacao.

O workflow `.github/workflows/update-data.yml` roda logo depois. Quando encontra mudanca oficial, ele executa `npm run data:sync`, valida build web/offline, cria a branch `data/update-official-sources` e abre um PR draft automatico para revisao humana antes da publicacao.
