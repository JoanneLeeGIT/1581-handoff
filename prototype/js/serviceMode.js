// Pure route service-mode rules (no DOM). FR-024: the system decides which statistics group is editable.

export const MODES = ['fixed', 'reserved', 'both'];
export const GROUPS = ['fixed', 'reserved'];

/** The ten statistics each group carries (same in the fixed and the reserved block). */
export const STAT_KEYS = [
  'avgSeats', 'trips', 'lowFloorTrips', 'emptyTrips', 'operatingKm',
  'passengers', 'passengerKm', 'revenue', 'eTicketPassengers', 'eTicketRevenue',
];

function assertMode(route) {
  if (!MODES.includes(route?.serviceModes)) {
    throw new Error(`invalid serviceModes for route ${route?.routeNo}: ${route?.serviceModes}`);
  }
}

export function getEditableGroups(route) {
  assertMode(route);
  return route.serviceModes === 'both' ? [...GROUPS] : [route.serviceModes];
}

export function isGroupLocked(route, group) {
  if (!GROUPS.includes(group)) throw new Error(`invalid group: ${group}`);
  return !getEditableGroups(route).includes(group);
}

/**
 * 畫面要顯示哪幾組欄位：只有當某組至少有一條路線用到時才顯示。
 * 全部路線都只有預約班次 → 只顯示預約；有任一路線兩種都有，或固定、預約路線並存 → 兩組都顯示。
 */
export function visibleGroups(routes) {
  const used = GROUPS.filter((g) => (routes ?? []).some((r) => !isGroupLocked(r, g)));
  return used.length ? used : [...GROUPS];
}

export function zeroGroup() {
  const g = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  g.passengerKmSource = 'manual';
  return g;
}

/** Locked groups are forced to zero; missing stats of editable groups fall back to zeros. */
export function normalizeRouteStats(route, stats = {}) {
  const out = {};
  for (const g of GROUPS) {
    out[g] = isGroupLocked(route, g) ? zeroGroup() : { ...zeroGroup(), ...(stats?.[g] ?? {}) };
  }
  return out;
}
