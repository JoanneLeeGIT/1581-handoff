// Pure export aggregation (no DOM). FR-011, FR-023. Only completed reports of the chosen month are exported.
// entries = [{ operator, report }]; operator carries routes/vehicles, report carries versions.

import { GROUPS, STAT_KEYS, normalizeRouteStats } from './serviceMode.js';
import { getOfficialVersion } from './versions.js';
import { fuelOf, vehicleDaysOf } from './reportLayout.js';

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const dash = (n) => (n === 0 ? '-' : n);

export const STAT_LABELS = {
  avgSeats: '平均座位數',
  trips: '營業行車次數小計',
  lowFloorTrips: '低地板或具升降設備公車次數',
  emptyTrips: '未載客班次',
  operatingKm: '營業行駛里程',
  passengers: '客運人數',
  passengerKm: '延人公里',
  revenue: '客運收入',
  eTicketPassengers: '電子票證人數',
  eTicketRevenue: '電子票證收入',
};
export const GROUP_PREFIX = { fixed: '固定班次', reserved: '預約班次' };

const OPERATOR_HEADER = [
  '項目', '業者家數', '核定路線數', '其中幸福巴士路線數', '其中幸福小黃路線數', '營業里程',
  '營業行車次數', '其中幸福巴士營業行車次數', '其中幸福小黃營業行車次數', '營業行駛里程',
  '客運人數', '其中幸福巴士客運人數', '其中幸福小黃客運人數', '延人公里', '客運收入',
  '行動支付客運人數', '行動支付客運收入', '電子票證客運人數', '電子票證客運收入',
];
const VEHICLE_HEADER = [
  '項目', '營業車輛數合計', '營業車輛數大客車', '營業車輛數小客車', '電動車輛數', '無障礙車輛數合計',
  '無障礙車輛數低地板', '行駛延日車數', '燃料柴油', '燃料汽油', '燃料液化石油氣',
  '包車出租客運人數', '包車出租行駛延日車數',
];
const ROUTE_HEADER = [
  '序號', '業者', '路線編號', '起站', '訖站', '月底營業里程', '免收費', '公路轉市區', '幸福巴士', '幸福小黃', '台灣好行',
  ...GROUPS.flatMap((g) => STAT_KEYS.map((k) => `${GROUP_PREFIX[g]}-${STAT_LABELS[k]}`)),
  '備註',
];

const rocPeriod = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `中華民國 ${y - 1911} 年 ${m} 月`;
};
const statPeriod = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `統計期:${y - 1911}${String(m).padStart(2, '0')}  縣市別:花蓮縣`;
};

function completedOf(entries, yearMonth) {
  return entries
    .filter((e) => e.report?.yearMonth === yearMonth && ['completed', 'changeRequested'].includes(e.report.reviewState))
    .map((e) => ({ operator: e.operator, version: getOfficialVersion(e.report) }))
    .filter((e) => e.version);
}

function routeStats(operator, version, route) {
  const snap = version.serviceModes?.[route.routeNo] ?? route.serviceModes;
  const r = { ...route, serviceModes: snap };
  return { route: r, stats: normalizeRouteStats(r, version.fields?.routes?.[route.routeNo]) };
}

const add = (a, b) => a + b;

function operatorRow(operator, version) {
  const t = { routes: 0, bus: 0, taxi: 0, mileage: 0, trips: 0, tripsBus: 0, tripsTaxi: 0, km: 0, pax: 0, paxBus: 0, paxTaxi: 0, pkm: 0, rev: 0, ep: 0, er: 0 };
  for (const route of operator.routes) {
    const { stats } = routeStats(operator, version, route);
    const sum = (k) => GROUPS.map((g) => stats[g][k]).reduce(add, 0);
    const isBus = route.attrs?.happyBus === 1;
    const isTaxi = route.attrs?.happyTaxi === 1;
    t.routes += 1;
    if (isBus) t.bus += 1;
    if (isTaxi) t.taxi += 1;
    t.mileage += route.monthEndMileage;
    t.trips += sum('trips');
    t.km += sum('operatingKm');
    t.pax += sum('passengers');
    t.pkm += sum('passengerKm');
    t.rev += sum('revenue');
    t.ep += sum('eTicketPassengers');
    t.er += sum('eTicketRevenue');
    if (isBus) { t.tripsBus += sum('trips'); t.paxBus += sum('passengers'); }
    if (isTaxi) { t.tripsTaxi += sum('trips'); t.paxTaxi += sum('passengers'); }
  }
  return t;
}

function toOperatorRow(name, households, t) {
  return [
    name, households, t.routes, dash(t.bus), dash(t.taxi), round2(t.mileage),
    t.trips, dash(t.tripsBus), dash(t.tripsTaxi), round2(t.km),
    t.pax, dash(t.paxBus), dash(t.paxTaxi), round2(t.pkm), t.rev,
    '-', '-', t.ep, t.er,
  ];
}

function sumKeys(list) {
  const out = {};
  for (const o of list) for (const [k, v] of Object.entries(o)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Operator-wise export in the Ministry monthly format (table 20622-01-11-2), two sheets. */
export function buildOperatorSheets(entries, yearMonth) {
  const done = completedOf(entries, yearMonth);
  const per = done.map((e) => ({ e, t: operatorRow(e.operator, e.version) }));
  const total = sumKeys(per.map((p) => p.t));

  const rows1 = [toOperatorRow('總計', per.length, total), ...per.map((p) => toOperatorRow(p.e.operator.name, 1, p.t))];

  const vRows = done.map((e) => {
    const v = e.operator.vehicles ?? {};
    const c = e.version.fields?.charter ?? {};
    const f = fuelOf(e.version.fields, e.operator);
    return [e.operator.name, v.total ?? 0, v.bus ?? 0, v.minibus ?? 0, v.electric ?? 0, v.accessible ?? 0, v.lowFloor ?? 0,
      vehicleDaysOf(e.version.fields, e.operator) ?? 0, f.diesel ?? 0, f.gasoline ?? 0, f.lpg ?? 0, c.passengers ?? 0, c.vehicleDays ?? 0];
  });
  const vTotal = ['總計', ...VEHICLE_HEADER.slice(1).map((_, i) => round2(vRows.map((r) => r[i + 1]).reduce(add, 0)))];
  const rows2 = [vTotal, ...vRows];

  const title = (name) => [['花蓮縣市區汽車客運業營運概況' + name], [rocPeriod(yearMonth)]];
  return {
    sheet1: { name: '2522-02-01-2', header: OPERATOR_HEADER, rows: rows1, aoa: [...title(''), OPERATOR_HEADER, ...rows1] },
    sheet2: { name: '2522-02-01-2(續)', header: VEHICLE_HEADER, rows: rows2, aoa: [...title('(續)'), VEHICLE_HEADER, ...rows2] },
  };
}

/** Route-wise export (full version: fixed and reserved groups), optional single-operator filter. */
export function buildRouteSheet(entries, yearMonth, operatorId) {
  const done = completedOf(entries, yearMonth).filter((e) => !operatorId || e.operator.id === operatorId);
  const rows = [];
  let seq = 0;
  for (const e of done) {
    for (const route of e.operator.routes) {
      const { stats } = routeStats(e.operator, e.version, route);
      const a = route.attrs ?? {};
      seq += 1;
      rows.push([
        seq, e.operator.name, route.routeNo, route.origin, route.destination, route.monthEndMileage,
        a.freeFare ?? 0, a.ruralToUrban ?? 0, a.happyBus ?? 0, a.happyTaxi ?? 0, a.taiwanTrip ?? 0,
        ...GROUPS.flatMap((g) => STAT_KEYS.map((k) => stats[g][k])),
        e.version.fields?.routeNotes?.[route.routeNo] ?? '',
      ]);
    }
  }
  const firstStat = 11;
  const total = ['總計', '', '', '', '', '', '', '', '', '', ''];
  for (let i = firstStat; i < firstStat + GROUPS.length * STAT_KEYS.length; i += 1) {
    total.push(round2(rows.map((r) => r[i]).reduce(add, 0)));
  }
  total.push('');
  const all = [...rows, total];
  return {
    name: '路線別營運概況',
    header: ROUTE_HEADER,
    rows: all,
    aoa: [['市區汽車客運路線別營運概況'], [statPeriod(yearMonth)], ROUTE_HEADER, ...all],
  };
}
