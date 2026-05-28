# Tauri legado

Esta pasta foi preservada como legado do app desktop Tauri.

O produto principal do ATC Tools agora e a versao web publicada via GitHub Pages. Nao trate esta pasta como fonte ativa de release sem uma revisao previa.

Checklist para reativar no futuro:

- alinhar versoes com o app web;
- instalar e validar a toolchain Rust/Tauri;
- atualizar `data_*.json` a partir dos dados principais em `src/data/`;
- revisar `tauri.conf.json`, updater e assinatura;
- rodar `cargo check` e um build Tauri completo.
