import L from 'leaflet';

// Fonte única dos basemaps. Antes as URLs viviam duplicadas em map.js e
// sim-main.js; quando o CARTO passou a exigir chave (09/2026) havia dois
// lugares para corrigir e nenhum fallback.
//
// IMPORTANTE sobre o Esri: a ordem das coordenadas é {z}/{y}/{x}, invertida
// em relação ao XYZ padrão. Errar isso não gera erro — carrega a região
// errada silenciosamente. Também não há subdomínios ({s}) nem sufixo retina
// ({r}); mantê-los daria 404 em toda tile.

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

const ATTR_ESRI =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ATTR_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Filtros aplicados só ao painel de tiles — nunca aos overlays.
const F_GRAY = 'grayscale(1) brightness(1.06) contrast(0.9)';
const F_DARK = 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.95) saturate(0.55)';

export const PROVIDERS = {
  light: [
    {
      id: 'esri-gray',
      nome: 'Esri Cinza Claro',
      url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      // zoom nativo do serviço para em 16; maxZoom 18 deixa o Leaflet
      // esticar as tiles em vez de travar a aproximação.
      opts: { maxZoom: 18, maxNativeZoom: 16, attribution: ATTR_ESRI },
      filter: null,
    },
    {
      id: 'osm',
      nome: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: ATTR_OSM },
      filter: F_GRAY,
    },
    {
      id: 'esri-street',
      nome: 'Esri Ruas',
      url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
      opts: { maxZoom: 18, maxNativeZoom: 17, attribution: ATTR_ESRI },
      filter: F_GRAY,
    },
  ],
  dark: [
    {
      id: 'esri-dark',
      nome: 'Esri Cinza Escuro',
      url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      opts: { maxZoom: 18, maxNativeZoom: 16, attribution: ATTR_ESRI },
      filter: null,
    },
    {
      // Plano B sem depender de outro serviço: o mesmo tile claro, invertido.
      id: 'esri-gray-inv',
      nome: 'Esri Cinza (invertido)',
      url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      opts: { maxZoom: 18, maxNativeZoom: 16, attribution: ATTR_ESRI },
      filter: F_DARK,
    },
    {
      id: 'osm-inv',
      nome: 'OpenStreetMap (invertido)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: ATTR_OSM },
      filter: F_DARK,
    },
  ],
};

const STORAGE_KEY = 'atc-basemap';

const JANELA_MS = 12000; // janela deslizante de avaliação
const LIMIAR_ERRO = 8; // nunca troca por uma tile isolada
const COOLDOWN_MS = 20000; // silêncio após uma troca, evita cascata
const GRACA_MS = 1500; // camada antiga sobrevive até a nova pintar
const RETENTATIVA_MS = 60000; // volta ao primário depois de esgotar a lista

function lerPreferencia() {
  try {
    const qs = new URLSearchParams(window.location.search).get('basemap');
    if (qs) return qs;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Liga um basemap resiliente ao mapa.
 *
 * O failover cobre queda dura (DNS, 4xx/5xx, timeout). NÃO cobre degradação
 * silenciosa — foi assim que o CARTO quebrou: HTTP 200 servindo um PNG com
 * "API KEY REQUIRED", que para o Leaflet é sucesso. Contra esse caso a defesa
 * é a troca manual (escolher/`?basemap=`), não a automática.
 */
export function attachBasemap(map, { theme = 'light', onChange } = {}) {
  const lista = PROVIDERS[theme] || PROVIDERS.light;
  const cont = map.getContainer();

  const preferido = lerPreferencia();
  const iPreferido = lista.findIndex((p) => p.id === preferido);

  // Sem nenhuma camada o Leaflet devolve maxZoom Infinity. Fixar no maior
  // valor da lista mantém o zoom estável mesmo se todos os provedores caírem.
  map.setMaxZoom(Math.max(...lista.map((p) => p.opts.maxZoom || 18)));

  let layer = null;
  let idx = -1;
  let erros = 0;
  let sucessos = 0;
  let abertura = 0;
  let trocando = false;
  let ultimaTroca = 0;
  let esgotado = false;
  let retentativa = null;
  let adiado = null;

  function aplicarFiltro(f) {
    // A var é lida por .leaflet-tile-pane, irmão dos painéis de overlay e
    // marcadores — o filtro não atinge FIR/TMA/CTR, radiais nem alvos.
    cont.style.setProperty('--bm-filter', f || 'none');
  }

  function zerarJanela() {
    erros = 0;
    sucessos = 0;
    abertura = Date.now();
  }

  function soltar(l) {
    // Desligar os handlers é essencial: durante o período de graça a camada
    // antiga continua emitindo tileerror/tileload nos mesmos contadores, o
    // que envenenaria a janela de avaliação da camada nova.
    l.off('tileerror', onErro);
    l.off('tileload', onSucesso);
    map.removeLayer(l);
  }

  function usar(i, porFalha = false) {
    if (i >= lista.length) return semBasemap();

    const p = lista[i];
    const nova = L.tileLayer(p.url, p.opts);
    nova.on('tileerror', onErro);
    nova.on('tileload', onSucesso);
    nova.addTo(map);

    // Só remove a anterior depois que a nova pintou, para não piscar branco.
    const antiga = layer;
    if (antiga) {
      let feito = false;
      const trocar = () => {
        if (feito) return;
        feito = true;
        soltar(antiga);
        // O filtro entra junto com a remoção: aplicado antes, valeria para a
        // camada antiga ainda visível durante a graça (ex.: inverteria um
        // tile claro por 1,5s ao cair para o fallback invertido).
        aplicarFiltro(p.filter);
      };
      nova.once('load', trocar);
      setTimeout(trocar, GRACA_MS);
    } else {
      aplicarFiltro(p.filter);
    }

    if (adiado) {
      clearTimeout(adiado);
      adiado = null;
    }
    layer = nova;
    idx = i;
    trocando = false;
    // O cooldown existe para a camada recém-instalada não derrubar a próxima
    // com os erros da própria montagem. Armá-lo na instalação INICIAL, porém,
    // bloquearia o primeiro failover por 20s — justamente quando o provedor
    // primário está fora, que é o caso para o qual isto existe.
    ultimaTroca = porFalha ? Date.now() : 0;
    zerarJanela();
    cont.classList.remove('bm-offline');
    if (onChange) onChange(p, i);
  }

  function semBasemap() {
    esgotado = true;
    if (adiado) {
      clearTimeout(adiado);
      adiado = null;
    }
    if (layer) {
      soltar(layer);
      layer = null;
    }
    idx = -1; // senão atual() segue devolvendo um provedor que não está no mapa
    aplicarFiltro(null);
    cont.classList.add('bm-offline');
    if (onChange) onChange(null, -1);
    console.error('[basemap] todos os provedores falharam; seguindo sem carta de fundo');

    // Queda de rede costuma ser passageira (túnel, Wi-Fi instável). Sem esta
    // retentativa o mapa ficaria sem carta de fundo até o próximo reload.
    if (!retentativa) {
      retentativa = setTimeout(() => {
        retentativa = null;
        esgotado = false;
        trocando = false;
        ultimaTroca = 0;
        console.warn('[basemap] retentando a partir do provedor primário');
        usar(0);
      }, RETENTATIVA_MS);
    }
  }

  function proximo(motivo) {
    if (trocando || esgotado) return;

    const resta = ultimaTroca ? COOLDOWN_MS - (Date.now() - ultimaTroca) : 0;
    if (resta > 0) {
      // O pedido precisa ser adiado, nunca descartado. O Leaflet nao repete
      // tiles que ja falharam, entao se o fallback tambem estiver fora seus
      // erros chegam todos dentro do cooldown e, descartados, nenhum evento
      // novo viria depois: a cascata travaria no segundo provedor morto.
      if (!adiado) {
        adiado = setTimeout(() => {
          adiado = null;
          // Se alguma tile carregou nesse meio tempo, o provedor se
          // recuperou sozinho e a troca deixa de fazer sentido.
          if (sucessos === 0 && erros >= LIMIAR_ERRO) proximo(motivo);
        }, resta + 50);
      }
      return;
    }

    trocando = true;
    console.warn(`[basemap] "${lista[idx]?.id}" falhou (${motivo}) → "${lista[idx + 1]?.id ?? 'nenhum'}"`);
    usar(idx + 1, true); // índice só cresce: impossível entrar em ciclo
  }

  function janela() {
    if (Date.now() - abertura > JANELA_MS) zerarJanela();
  }

  function onSucesso() {
    janela();
    sucessos++;
  }

  function onErro() {
    janela();
    erros++;
    // Exige muitos erros E nenhuma tile boa: uma tile faltando no oceano ou
    // acima do zoom nativo convive com dezenas de sucessos e não troca nada.
    if (erros >= LIMIAR_ERRO && sucessos === 0) {
      proximo(`${erros} erros sem nenhum sucesso em ${JANELA_MS / 1000}s`);
    }
  }

  usar(iPreferido >= 0 ? iPreferido : 0);

  return {
    atual: () => lista[idx] || null,
    lista: () => lista,
    escolher(id) {
      const i = lista.findIndex((p) => p.id === id);
      if (i < 0) return false;
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* modo privado: a escolha vale só nesta sessão */
      }
      // A escolha manual cancela a retentativa pendente: quem mandou foi o
      // operador, e o timer voltaria ao primário por cima da decisão dele.
      if (retentativa) {
        clearTimeout(retentativa);
        retentativa = null;
      }
      esgotado = false;
      trocando = false;
      ultimaTroca = 0;
      usar(i);
      return true;
    },
  };
}

const SVG_CAMADAS =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';

/**
 * Controle para trocar a carta de fundo sem redeploy.
 *
 * Existe por causa do incidente do CARTO: o provedor começou a servir tiles
 * com marca d'água "API KEY REQUIRED" respondendo HTTP 200, então nada no
 * app detectou a falha e o mapa ficou inutilizável até alguém publicar uma
 * correção. Com este seletor o controlador troca na hora, em campo.
 */
export function addBasemapControl(map, basemap) {
  const Controle = L.Control.extend({
    // Abaixo do zoom. O canto inferior esquerdo já é das coordenadas do
    // cursor (.map-overlay) e o direito, da atribuição.
    options: { position: 'topright' },

    onAdd() {
      const raiz = L.DomUtil.create('div', 'leaflet-bar bm-control');
      L.DomEvent.disableClickPropagation(raiz);
      L.DomEvent.disableScrollPropagation(raiz);

      const botao = L.DomUtil.create('a', 'bm-toggle', raiz);
      botao.href = '#';
      botao.title = 'Carta de fundo';
      botao.setAttribute('role', 'button');
      botao.innerHTML = SVG_CAMADAS;

      const menu = L.DomUtil.create('div', 'bm-menu', raiz);
      menu.hidden = true;

      const opcoes = basemap.lista().map((p) => {
        const item = L.DomUtil.create('button', 'bm-item', menu);
        item.type = 'button';
        item.textContent = p.nome;
        item.dataset.id = p.id;
        L.DomEvent.on(item, 'click', (e) => {
          L.DomEvent.stop(e);
          basemap.escolher(p.id);
          menu.hidden = true;
          marcarAtivo();
        });
        return item;
      });

      function marcarAtivo() {
        const atual = basemap.atual();
        opcoes.forEach((el) => {
          el.classList.toggle('active', !!atual && el.dataset.id === atual.id);
        });
      }

      L.DomEvent.on(botao, 'click', (e) => {
        L.DomEvent.stop(e);
        menu.hidden = !menu.hidden;
        if (!menu.hidden) marcarAtivo();
      });

      // Fecha ao clicar no mapa.
      map.on('click', () => {
        menu.hidden = true;
      });

      marcarAtivo();
      return raiz;
    },
  });

  const c = new Controle();
  c.addTo(map);
  return c;
}
