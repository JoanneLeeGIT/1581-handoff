import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorSheets, buildRouteSheet } from '../js/export.js';
import { zeroGroup } from '../js/serviceMode.js';

// All data below is invented for the test (constitution principle I).
const g = (o) => ({ ...zeroGroup(), ...o });
const veh = (t, b, m) => ({ total: t, bus: b, minibus: m, electric: 1, accessible: 2, lowFloor: 2, vehicleDays: 30, diesel: 100, gasoline: 0, lpg: 0 });

const opA = {
  id: 'a', name: '甲客運', type: 'urban',
  routes: [
    { routeNo: 'A1', origin: 'x', destination: 'y', monthEndMileage: 10, serviceModes: 'fixed', attrs: { freeFare: 0, ruralToUrban: 0, happyBus: 0, happyTaxi: 0, taiwanTrip: 0 } },
    { routeNo: 'A2', origin: 'x', destination: 'z', monthEndMileage: 20.5, serviceModes: 'fixed', attrs: { freeFare: 0, ruralToUrban: 0, happyBus: 0, happyTaxi: 0, taiwanTrip: 1 } },
  ],
  vehicles: veh(5, 4, 1),
};
const opB = {
  id: 'b', name: '乙公所', type: 'happybus', happybusVersion: '1.0',
  routes: [
    { routeNo: 'B1', origin: 'p', destination: 'q', monthEndMileage: 5, serviceModes: 'both', attrs: { freeFare: 0, ruralToUrban: 0, happyBus: 1, happyTaxi: 0, taiwanTrip: 0 } },
    { routeNo: 'B2', origin: 'p', destination: 'r', monthEndMileage: 7, serviceModes: 'reserved', attrs: { freeFare: 0, ruralToUrban: 0, happyBus: 1, happyTaxi: 0, taiwanTrip: 0 } },
  ],
  vehicles: veh(3, 0, 3),
};
const opC = { ...opA, id: 'c', name: '丙客運' };

const fieldsA = {
  routes: {
    A1: { fixed: g({ avgSeats: 20, trips: 100, lowFloorTrips: 10, emptyTrips: 1, operatingKm: 1000.5, passengers: 500, passengerKm: 1750, revenue: 9000, eTicketPassengers: 400, eTicketRevenue: 7000 }), reserved: g({ passengers: 999 }) },
    A2: { fixed: g({ avgSeats: 30, trips: 50, lowFloorTrips: 5, emptyTrips: 0, operatingKm: 400, passengers: 200, passengerKm: 1435, revenue: 3000, eTicketPassengers: 100, eTicketRevenue: 2000 }) },
  },
  charter: { passengers: 7, vehicleDays: 2 },
};
const fieldsB = {
  routes: {
    B1: {
      fixed: g({ avgSeats: 9, trips: 20, lowFloorTrips: 0, emptyTrips: 2, operatingKm: 100, passengers: 30, passengerKm: 52.5, revenue: 0, eTicketPassengers: 0, eTicketRevenue: 0 }),
      reserved: g({ avgSeats: 9, trips: 10, lowFloorTrips: 0, emptyTrips: 1, operatingKm: 50, passengers: 12, passengerKm: 21, revenue: 0, eTicketPassengers: 0, eTicketRevenue: 0 }),
    },
    B2: { reserved: g({ avgSeats: 9, trips: 8, lowFloorTrips: 0, emptyTrips: 0, operatingKm: 40, passengers: 6, passengerKm: 14.7, revenue: 0, eTicketPassengers: 0, eTicketRevenue: 0 }) },
  },
  charter: { passengers: 0, vehicleDays: 0 },
};

const rep = (op, ym, state, fields) => ({
  operator: op,
  report: { operatorId: op.id, yearMonth: ym, reviewState: state, currentVersion: 1, versions: [{ versionNo: 1, fields, serviceModes: Object.fromEntries(op.routes.map(r => [r.routeNo, r.serviceModes])) }] },
});

const entries = [
  rep(opA, '2026-10', 'completed', fieldsA),
  rep(opB, '2026-10', 'completed', fieldsB),
  rep(opC, '2026-10', 'reviewing', fieldsA), // must be excluded
  rep(opA, '2026-09', 'completed', fieldsA), // other month, must be excluded
];

const col = (sheet, name) => { const i = sheet.header.indexOf(name); assert.ok(i >= 0, `column ${name}`); return i; };

test('operator sheet: only completed reports of the month, total row first', () => {
  const { sheet1 } = buildOperatorSheets(entries, '2026-10');
  assert.equal(sheet1.name, '2522-02-01-2');
  assert.equal(sheet1.rows.length, 3); // total + 2 operators
  assert.equal(sheet1.rows[0][0], '總計');
  assert.deepEqual(sheet1.rows.slice(1).map(r => r[0]), ['甲客運', '乙公所']);
});

test('operator sheet: aggregation across routes and both service groups', () => {
  const { sheet1 } = buildOperatorSheets(entries, '2026-10');
  const [, a, b] = sheet1.rows;
  const c = n => col(sheet1, n);
  assert.equal(a[c('核定路線數')], 2);
  assert.equal(a[c('營業里程')], 30.5); // 10 + 20.5
  assert.equal(a[c('營業行車次數')], 150);
  assert.equal(a[c('營業行駛里程')], 1400.5);
  assert.equal(a[c('客運人數')], 700);
  assert.equal(a[c('延人公里')], 3185);
  assert.equal(a[c('客運收入')], 12000);
  assert.equal(a[c('電子票證客運人數')], 500);
  assert.equal(a[c('電子票證客運收入')], 9000);
  // happy bus operator: fixed + reserved of B1 plus reserved of B2
  assert.equal(b[c('核定路線數')], 2);
  assert.equal(b[c('其中幸福巴士路線數')], 2);
  assert.equal(b[c('營業行車次數')], 38);
  assert.equal(b[c('其中幸福巴士營業行車次數')], 38);
  assert.equal(b[c('客運人數')], 48);
  assert.equal(b[c('延人公里')], 88.2);
  // the reserved stats of a fixed-only route are ignored (locked group)
  assert.equal(a[c('客運人數')], 700);
});

test('operator sheet: non-happy-bus operator shows dashes in breakdown columns, mobile payment is always dash', () => {
  const { sheet1 } = buildOperatorSheets(entries, '2026-10');
  const a = sheet1.rows[1];
  assert.equal(a[col(sheet1, '其中幸福巴士路線數')], '-');
  assert.equal(a[col(sheet1, '行動支付客運人數')], '-');
  assert.equal(a[col(sheet1, '行動支付客運收入')], '-');
});

test('operator sheet: total row is the sum of the operators', () => {
  const { sheet1 } = buildOperatorSheets(entries, '2026-10');
  const [t, a, b] = sheet1.rows;
  for (const n of ['核定路線數', '營業里程', '營業行車次數', '客運人數', '延人公里', '客運收入']) {
    const i = col(sheet1, n);
    assert.equal(Math.round((a[i] + b[i]) * 100) / 100, t[i], n);
  }
  assert.equal(t[col(sheet1, '業者家數')], 2);
});

test('operator sheet 2: vehicles and charter', () => {
  const { sheet2 } = buildOperatorSheets(entries, '2026-10');
  assert.equal(sheet2.name, '2522-02-01-2(續)');
  assert.equal(sheet2.rows.length, 3);
  const a = sheet2.rows[1];
  assert.equal(a[col(sheet2, '營業車輛數合計')], 5);
  assert.equal(a[col(sheet2, '包車出租客運人數')], 7);
  assert.equal(a[col(sheet2, '包車出租行駛延日車數')], 2);
  const t = sheet2.rows[0];
  assert.equal(t[col(sheet2, '營業車輛數合計')], 8);
});

test('route sheet: one row per route with both groups and a total row', () => {
  const s = buildRouteSheet(entries, '2026-10');
  assert.equal(s.rows.length, 5); // 4 routes + total
  const first = s.rows[0];
  assert.equal(first[col(s, '路線編號')], 'A1');
  assert.equal(first[col(s, '固定班次-客運人數')], 500);
  assert.equal(first[col(s, '預約班次-客運人數')], 0, 'locked reserved group exported as 0');
  const b1 = s.rows.find(r => r[col(s, '路線編號')] === 'B1');
  assert.equal(b1[col(s, '固定班次-客運人數')], 30);
  assert.equal(b1[col(s, '預約班次-客運人數')], 12);
  const b2 = s.rows.find(r => r[col(s, '路線編號')] === 'B2');
  assert.equal(b2[col(s, '固定班次-客運人數')], 0, 'locked fixed group exported as 0');
  assert.equal(b2[col(s, '預約班次-客運人數')], 6);
});

test('route sheet: totals per group', () => {
  const s = buildRouteSheet(entries, '2026-10');
  const t = s.rows.at(-1);
  assert.equal(t[0], '總計');
  assert.equal(t[col(s, '固定班次-客運人數')], 730);
  assert.equal(t[col(s, '預約班次-客運人數')], 18);
  assert.equal(t[col(s, '固定班次-營業行車次數小計')], 170);
});

test('route sheet can be limited to one operator', () => {
  const s = buildRouteSheet(entries, '2026-10', 'b');
  assert.equal(s.rows.length, 3);
  assert.deepEqual(s.rows.slice(0, 2).map(r => r[col(s, '路線編號')]), ['B1', 'B2']);
});

test('nothing is exported when no report is completed', () => {
  const none = [rep(opA, '2026-10', 'reviewing', fieldsA)];
  assert.equal(buildOperatorSheets(none, '2026-10').sheet1.rows.length, 1);
  assert.equal(buildRouteSheet(none, '2026-10').rows.length, 1);
});
