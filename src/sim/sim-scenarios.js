// Cenários de treino. Posições calculadas a partir do ARP de SBPJ.
// SBPJ ARP: -10.2914, -48.3569

export const SCENARIOS = [
  {
    id: 'sbpj-vetor-1',
    name: 'SBPJ — Vetoração básica (1 aeronave)',
    base: { icao: 'SBPJ', lat: -10.2914, lon: -48.3569 },
    aircraft: [
      {
        callsign: 'AZU4090',
        type: 'A20N',
        // ~20 NM a nordeste do ARP, descendo pra aproximação
        lat: -10.0557,
        lon: -48.1173,
        heading: 225,     // apontando de volta pro aeroporto
        altitude: 8000,
        speed: 280,
      },
    ],
  },
];
