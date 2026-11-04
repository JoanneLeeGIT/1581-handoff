// Passenger-km rules (no DOM). The formula is provisional until the county confirms it:
// change it here only, the UI reads label / coefficient / confirmed from FORMULA.

export const FORMULA = {
  coefficient: 0.35,
  label: '客運人數 × 月底營業里程 × 0.35',
  confirmed: false,
};

export const SOURCES = ['manual', 'computed'];

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const isNonNeg = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** @returns {{ok:true,value:number}|{ok:false,error:string}} */
export function computePassengerKm({ source, passengers, monthEndMileage, manualValue } = {}) {
  if (!SOURCES.includes(source)) return { ok: false, error: `invalid source: ${source}` };
  if (source === 'manual') {
    return isNonNeg(manualValue) ? { ok: true, value: manualValue } : { ok: false, error: 'manual value must be a non-negative number' };
  }
  if (!isNonNeg(passengers)) return { ok: false, error: 'passengers must be a non-negative number' };
  if (!isNonNeg(monthEndMileage)) return { ok: false, error: 'monthEndMileage must be a non-negative number' };
  return { ok: true, value: round2(passengers * monthEndMileage * FORMULA.coefficient) };
}

export function sumValues(values) {
  return round2(values.reduce((a, b) => a + b, 0));
}
