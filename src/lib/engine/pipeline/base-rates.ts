// The spec's BASE RATES tables, verbatim. Keyed by the `baseRateKey` normalize.ts
// assigns to each fixture (see the league-id mapping and its documented fallbacks
// for leagues the spec didn't give a dedicated row for, e.g. Belgian Pro League).

interface DomesticRates {
  O1_5: number;
  O2_5: number;
  O3_5: number;
  BTTS: number;
  HW: number;
  Draw: number;
  O9_5C: number;
}

const DOMESTIC_BASE_RATES: Record<string, DomesticRates> = {
  BUN: { O1_5: 80, O2_5: 58, O3_5: 30, BTTS: 54, HW: 44, Draw: 27, O9_5C: 54 },
  LAL: { O1_5: 78, O2_5: 55, O3_5: 28, BTTS: 52, HW: 46, Draw: 26, O9_5C: 52 },
  L1: { O1_5: 76, O2_5: 53, O3_5: 27, BTTS: 50, HW: 45, Draw: 27, O9_5C: 50 },
  SA: { O1_5: 75, O2_5: 52, O3_5: 26, BTTS: 50, HW: 46, Draw: 27, O9_5C: 51 },
  ERE: { O1_5: 84, O2_5: 65, O3_5: 38, BTTS: 58, HW: 47, Draw: 26, O9_5C: 53 },
  LPT: { O1_5: 74, O2_5: 51, O3_5: 25, BTTS: 49, HW: 46, Draw: 27, O9_5C: 49 },
  SPL: { O1_5: 73, O2_5: 49, O3_5: 24, BTTS: 47, HW: 46, Draw: 28, O9_5C: 48 },
};

interface EuropeanRates {
  O1_5: number;
  O2_5: number;
  BTTS: number;
  HW: number;
}

const EUROPEAN_BASE_RATES: Record<string, EuropeanRates> = {
  UCL_GS: { O1_5: 76, O2_5: 54, BTTS: 52, HW: 48 },
  UCL_KO: { O1_5: 72, O2_5: 48, BTTS: 46, HW: 50 },
  UEL_GS: { O1_5: 74, O2_5: 52, BTTS: 50, HW: 47 },
  UEL_KO: { O1_5: 70, O2_5: 46, BTTS: 44, HW: 49 },
  UECL: { O1_5: 71, O2_5: 49, BTTS: 47, HW: 46 },
};

export type BaseRateMarketKey = 'O1_5' | 'O2_5' | 'O3_5' | 'BTTS' | 'HW' | 'Draw' | 'O9_5C';

// `europeanStage` distinguishes group stage from knockout for UCL/UEL, since the
// spec gives them different rows; pass undefined for domestic leagues or UECL
// (which the spec doesn't split by stage).
export function getBaseRatePct(
  baseRateKey: string,
  market: BaseRateMarketKey,
  europeanStage?: 'GS' | 'KO'
): number | null {
  if (baseRateKey === 'UCL' || baseRateKey === 'UEL' || baseRateKey === 'UECL') {
    const table =
      baseRateKey === 'UECL' ? EUROPEAN_BASE_RATES.UECL : EUROPEAN_BASE_RATES[`${baseRateKey}_${europeanStage ?? 'GS'}`];
    if (!table) return null;
    // The European tables only have four rows (O1_5/O2_5/BTTS/HW) - anything else
    // (O3_5/Draw/O9_5C) simply has no published European base rate.
    if (market !== 'O1_5' && market !== 'O2_5' && market !== 'BTTS' && market !== 'HW') return null;
    return table[market];
  }
  const table = DOMESTIC_BASE_RATES[baseRateKey];
  return table ? table[market] : null;
}
