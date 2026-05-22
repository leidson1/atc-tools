import L from 'leaflet';

let compassLayer = null;

/**
 * Draws a compass rose SVG overlay centered on the aerodrome.
 * Shows magnetic north offset by rotating according to declination.
 */
export function drawCompassRose(map, lat, lon, magneticDeclination) {
  removeCompassRose(map);

  const size = 0.8; // degrees (approximate visual size)
  const bounds = [
    [lat - size, lon - size],
    [lat + size, lon + size],
  ];

  const svg = createCompassRoseSvg(magneticDeclination);
  compassLayer = L.svgOverlay(svg, bounds, {
    opacity: 0.4,
    interactive: false,
    className: 'compass-rose-container',
  }).addTo(map);

  return compassLayer;
}

export function removeCompassRose(map) {
  if (compassLayer && map) {
    map.removeLayer(compassLayer);
    compassLayer = null;
  }
}

function createCompassRoseSvg(declination) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '-120 -120 240 240');
  svg.setAttribute('xmlns', svgNS);

  const g = document.createElementNS(svgNS, 'g');
  // Rotate to show magnetic north (declination is negative for West)
  g.setAttribute('transform', `rotate(${declination})`);
  svg.appendChild(g);

  // Outer circle
  const outerCircle = document.createElementNS(svgNS, 'circle');
  outerCircle.setAttribute('cx', '0');
  outerCircle.setAttribute('cy', '0');
  outerCircle.setAttribute('r', '100');
  outerCircle.setAttribute('fill', 'none');
  outerCircle.setAttribute('stroke', '#0077b6');
  outerCircle.setAttribute('stroke-width', '0.5');
  outerCircle.setAttribute('opacity', '0.5');
  g.appendChild(outerCircle);

  // Draw tick marks (every 5°) and radial labels (every 10°)
  for (let i = 0; i < 360; i += 5) {
    const isCardinal = i % 90 === 0;
    const isMajor = i % 30 === 0;
    const isTen = i % 10 === 0;
    const tickLen = isCardinal ? 15 : isMajor ? 11 : isTen ? 7 : 4;
    const r1 = 100 - tickLen;
    const r2 = 100;

    const rad = ((i - 90) * Math.PI) / 180;
    const x1 = r1 * Math.cos(rad);
    const y1 = r1 * Math.sin(rad);
    const x2 = r2 * Math.cos(rad);
    const y2 = r2 * Math.sin(rad);

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    line.setAttribute('stroke', isCardinal ? '#1a1a2e' : '#0077b6');
    line.setAttribute('stroke-width', isCardinal ? '1.5' : isMajor ? '0.8' : '0.5');
    line.setAttribute('opacity', isCardinal ? '0.85' : isMajor ? '0.6' : isTen ? '0.45' : '0.3');
    g.appendChild(line);

    // Radial labels every 10° (cardinals as letters, others as 01..35)
    if (isTen) {
      const labelR = 110;
      const lx = labelR * Math.cos(rad);
      const ly = labelR * Math.sin(rad);

      const cardinalLabels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      const label = cardinalLabels[i] || String(i / 10).padStart(2, '0');

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', lx.toFixed(2));
      text.setAttribute('y', ly.toFixed(2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', isCardinal ? '11' : isMajor ? '8' : '6');
      text.setAttribute('font-weight', isCardinal || isMajor ? '700' : '400');
      text.setAttribute('font-family', 'Consolas, monospace');
      text.setAttribute('fill', isCardinal ? '#1a1a2e' : '#0077b6');
      text.setAttribute('opacity', isCardinal ? '0.85' : isMajor ? '0.7' : '0.6');
      // Counter-rotate text so it stays upright
      text.setAttribute(
        'transform',
        `rotate(${-declination}, ${lx.toFixed(2)}, ${ly.toFixed(2)})`
      );
      text.textContent = label;
      g.appendChild(text);
    }
  }

  // Center crosshair
  const cross1 = document.createElementNS(svgNS, 'line');
  cross1.setAttribute('x1', '-8');
  cross1.setAttribute('y1', '0');
  cross1.setAttribute('x2', '8');
  cross1.setAttribute('y2', '0');
  cross1.setAttribute('stroke', '#0077b6');
  cross1.setAttribute('stroke-width', '0.5');
  g.appendChild(cross1);

  const cross2 = document.createElementNS(svgNS, 'line');
  cross2.setAttribute('x1', '0');
  cross2.setAttribute('y1', '-8');
  cross2.setAttribute('x2', '0');
  cross2.setAttribute('y2', '8');
  cross2.setAttribute('stroke', '#0077b6');
  cross2.setAttribute('stroke-width', '0.5');
  g.appendChild(cross2);

  return svg;
}
