/// List of Brazilian ICAO codes organized by FIR.
/// Used for bulk ROTAER sync to enable offline operation.
/// Source: DECEA AIP Brasil

/// FIR Brasília (SBBS) - includes Tocantins, Goiás, DF, parts of MG/MT/BA
pub const FIR_SBBS: &[&str] = &[
    "SBPJ", "SBBR", "SBBW", "SBCN", "SBGO", "SBGM", "SBBQ",
    "SWLC", "SWGI", "SWPI", "SDNC", "SWNV", "SWNS",
    "SWLB", "SWKN", "SWEI", "SWJN", "SWTU",
    "SBBH", "SBUL", "SBUR", "SBMK", "SBPR", "SBVG", "SBIP",
    "SNBR", "SNPD", "SNDV", "SNQG",
];

/// FIR Curitiba (SBCW) - PR, SC, RS, parts of SP
pub const FIR_SBCW: &[&str] = &[
    "SBCT", "SBFI", "SBJV", "SBLO", "SBMG", "SBNF", "SBFL",
    "SBCH", "SBCM", "SBBI", "SBPA", "SBPK", "SBSM", "SBUG",
    "SBPF", "SBNM", "SSGG", "SSCN", "SSCP", "SSCE", "SSJA",
    "SBTD", "SSSC",
];

/// FIR Recife (SBRE) - Northeast Brazil
pub const FIR_SBRE: &[&str] = &[
    "SBRF", "SBSV", "SBIL", "SBAR", "SBMO", "SBJU", "SBFZ",
    "SBTE", "SBJP", "SBSG", "SBPL", "SBPB", "SBTB",
    "SBMA", "SBSL", "SBIZ", "SBCI", "SBJE", "SNTS",
    "SBJD", "SBQQ", "SNHS", "SNVB", "SNRU", "SNNF",
];

/// FIR Amazônica (SBAZ) - Amazon region
pub const FIR_SBAZ: &[&str] = &[
    "SBEG", "SBMN", "SBTT", "SBBE", "SBHT", "SBMQ", "SBSN",
    "SBMY", "SBBV", "SBCJ", "SBIH", "SBJI", "SBCC", "SBAT",
    "SBUA", "SBTF", "SBPV", "SWFN", "SWTP", "SWBC",
    "SWCA", "SBMA", "SNDC", "SBAA", "SWEI",
];

/// FIR Atlântico (SBAO) - São Paulo area + Atlantic
pub const FIR_SBAO: &[&str] = &[
    "SBGR", "SBSP", "SBKP", "SBSJ", "SBMT", "SBRJ", "SBGL",
    "SBRP", "SBDN", "SBAE", "SBBP", "SBBU", "SBCF", "SBVT",
    "SBJR", "SBME", "SBCP", "SBTK", "SDUM", "SDCO",
    "SBST", "SBZM", "SBRJ", "SDRS",
];

/// Returns all Brazilian ICAO codes for bulk sync
pub fn all_icao_codes() -> Vec<&'static str> {
    let mut all = Vec::with_capacity(200);
    all.extend_from_slice(FIR_SBBS);
    all.extend_from_slice(FIR_SBCW);
    all.extend_from_slice(FIR_SBRE);
    all.extend_from_slice(FIR_SBAZ);
    all.extend_from_slice(FIR_SBAO);

    // Remove duplicates
    all.sort();
    all.dedup();
    all
}

/// Returns ICAO codes for a specific FIR
pub fn icao_codes_by_fir(fir: &str) -> Vec<&'static str> {
    match fir.to_uppercase().as_str() {
        "SBBS" => FIR_SBBS.to_vec(),
        "SBCW" => FIR_SBCW.to_vec(),
        "SBRE" => FIR_SBRE.to_vec(),
        "SBAZ" => FIR_SBAZ.to_vec(),
        "SBAO" => FIR_SBAO.to_vec(),
        _ => Vec::new(),
    }
}
