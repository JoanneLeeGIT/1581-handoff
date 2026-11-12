import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeHeaderRows, routeGuideRows, vehicleHeaderRows, vehicleGuideRows, checkGrid,
  ROUTE_SHEET_COLS, VEHICLE_SHEET_COLS, STAT_COLS, rocStatPeriod, routeSheetTitle,
  parseCell, groupTotals, moveTarget, routeSheetCols, fuelOf, FUEL_KEYS, VEHICLE_KEYS, vehicleDaysOf, shiftVehicleDays,
} from '../js/reportLayout.js';
import { STAT_KEYS, zeroGroup, visibleGroups } from '../js/serviceMode.js';

// 以下資料皆為測試用假資料（憲章原則 I）。

test('工作表 1：完整版共 31 欄（A–J、固定 10、預約 10、備註）', () => {
  assert.equal(ROUTE_SHEET_COLS, 31);
});

test('工作表 1：三層表頭的合併儲存格剛好填滿 31 欄、無重疊', () => {
  const r = checkGrid(routeHeaderRows(), ROUTE_SHEET_COLS);
  assert.deepEqual(r.rowWidths, [31, 31, 31]);
  assert.equal(r.ok, true);
});

test('工作表 1：說明列（第 6、7 列）各 31 欄', () => {
  for (const row of routeGuideRows()) assert.equal(checkGrid([row], ROUTE_SHEET_COLS).ok, true);
});

test('工作表 1：欄名與順序同原表', () => {
  const [r3, r4, r5] = routeHeaderRows();
  assert.deepEqual(r3.map((c) => c.text), ['路線別', '起訖站名稱', '月底營業里程', '免收費', '公路轉市區', '幸福巴士', '幸福小黃', '台灣好行', '固定班次部份', '預約班次部份', '備註']);
  assert.deepEqual(r4.slice(0, 9).map((c) => c.text), ['平均座位數', '營業行車次數(班次)', '未載客', '營業行駛里程', '客運人數', '延人公里', '客運收入', '電子票證人數', '電子票證收入']);
  assert.equal(r4[1].colspan, 2);
  assert.deepEqual(r5.slice(0, 12).map((c) => c.text), ['起站', '訖站', '(個)', '小計', '低地板公車或具升降設備公車', '(班次)', '(車公里)', '(人次)', '(人公里)', '(新台幣元)', '(人次)', '(新台幣元)']);
  // 固定與預約兩組欄位相同
  assert.deepEqual(r5.slice(2, 12), r5.slice(12, 22).map((c) => ({ ...c, key: c.key.replace('reserved', 'fixed') })));
  assert.deepEqual(Object.keys(STAT_COLS), STAT_KEYS);
});

test('工作表 1：只顯示一組時，表頭與說明列剛好 21 欄', () => {
  for (const groups of [['fixed'], ['reserved']]) {
    const w = routeSheetCols(groups);
    assert.equal(w, 21);
    assert.equal(checkGrid(routeHeaderRows(groups), w).ok, true);
    for (const row of routeGuideRows(groups)) assert.equal(checkGrid([row], w).ok, true);
    assert.deepEqual(routeHeaderRows(groups)[0].filter((c) => c.kind === 'group').map((c) => c.key), groups);
  }
});

test('visibleGroups：沒有路線用到的組別不顯示', () => {
  const r = (routeNo, serviceModes) => ({ routeNo, serviceModes });
  assert.deepEqual(visibleGroups([r('A', 'reserved'), r('B', 'reserved')]), ['reserved']);
  assert.deepEqual(visibleGroups([r('A', 'fixed')]), ['fixed']);
  assert.deepEqual(visibleGroups([r('A', 'fixed'), r('B', 'reserved')]), ['fixed', 'reserved']);
  assert.deepEqual(visibleGroups([r('A', 'both')]), ['fixed', 'reserved']);
  assert.deepEqual(visibleGroups([]), ['fixed', 'reserved']);
});

test('工作表 2：A–N 共 14 欄，表頭與說明列填滿', () => {
  assert.equal(checkGrid(vehicleHeaderRows(), VEHICLE_SHEET_COLS).ok, true);
  for (const row of vehicleGuideRows()) assert.equal(checkGrid([row], VEHICLE_SHEET_COLS).ok, true);
});

test('工作表 2：燃料消耗量改由業者填寫', () => {
  const [r1, r2, r3, r5] = vehicleHeaderRows();
  assert.equal(r2.find((c) => c.text === '燃料消耗量').kind, 'op');
  assert.deepEqual(r3.filter((c) => ['柴油', '汽油', '液化石油氣'].includes(c.text)).map((c) => c.kind), ['op', 'op', 'op']);
  const [who] = vehicleGuideRows();
  assert.deepEqual(who.map((c) => [c.text, c.colspan ?? 1]), [['誰填', 1], ['系統帶入', 6], ['業者填寫，或從班次明細帶入', 1], ['業者填寫', 3], ['業者填寫', 3]]);
  assert.equal(VEHICLE_KEYS.length + 1 + FUEL_KEYS.length, 10);
  assert.equal(r1.length, 3);
  assert.deepEqual(r5.slice(3, 6).map((c) => c.kind), ['op', 'op', 'op']);
});

test('fuelOf：有填報用填報值、舊版本沿用系統值、尚未填報為空', () => {
  const op = { vehicles: { diesel: 50, gasoline: 2, lpg: 0 } };
  assert.deepEqual(fuelOf({ fuel: { diesel: 9, gasoline: 0, lpg: 1 } }, op), { diesel: 9, gasoline: 0, lpg: 1 });
  assert.deepEqual(fuelOf({ routes: {} }, op), { diesel: 50, gasoline: 2, lpg: 0 });
  assert.deepEqual(fuelOf(undefined, op), {});
});

test('工作表 2：行駛延日車數改由業者填寫', () => {
  const [, r2, , r5] = vehicleHeaderRows();
  assert.equal(r2.find((c) => c.text === '行駛延日車數').kind, 'op');
  assert.equal(r5[2].kind, 'op');
  assert.equal(VEHICLE_KEYS.includes('vehicleDays'), false);
  const [, fmt] = vehicleGuideRows();
  assert.equal(fmt[2].text, '必填，整數');
});

test('vehicleDaysOf：有填報用填報值、舊版本沿用系統值、尚未填報為 undefined', () => {
  const op = { vehicles: { vehicleDays: 218 } };
  assert.equal(vehicleDaysOf({ vehicleDays: 200 }, op), 200);
  assert.equal(vehicleDaysOf({ vehicleDays: 0 }, op), 0);
  assert.equal(vehicleDaysOf({ routes: {} }, op), 218);
  assert.equal(vehicleDaysOf(undefined, op), undefined);
});

test('shiftVehicleDays：只有有班次明細的業者才能帶入', () => {
  assert.equal(shiftVehicleDays({ shiftDetailAvailable: true, vehicles: { vehicleDays: 218 } }), 218);
  assert.equal(shiftVehicleDays({ shiftDetailAvailable: false, vehicles: { vehicleDays: 218 } }), undefined);
});

test('checkGrid 會抓出欄數不符或重疊', () => {
  assert.equal(checkGrid([[{ text: 'a', colspan: 2 }]], 3).ok, false);
  assert.equal(checkGrid([[{ text: 'a', rowspan: 2 }, { text: 'b' }], [{ text: 'c' }, { text: 'd' }]], 2).ok, false);
  assert.equal(checkGrid([[{ text: 'a', rowspan: 2 }, { text: 'b' }], [{ text: 'c' }]], 2).ok, true);
});

test('統計期：西元年月轉民國年月', () => {
  assert.equal(rocStatPeriod('2026-09'), '11509');
  assert.equal(rocStatPeriod('2026-11'), '11511');
  assert.throws(() => rocStatPeriod('2026/9'));
  assert.equal(routeSheetTitle('2026-09', '示範客運').sub, '統計期:11509  縣市別:花蓮縣  客運別:示範客運  排序:依路線編號');
});

test('parseCell：整數欄', () => {
  assert.deepEqual(parseCell('int', ' 120 '), { ok: true, value: 120 });
  assert.deepEqual(parseCell('int', '1,234'), { ok: true, value: 1234 });
  assert.deepEqual(parseCell('int', '0'), { ok: true, value: 0 });
  assert.equal(parseCell('int', '1.5').error, '須為整數');
  assert.equal(parseCell('int', '-3').error, '不可為負數');
  assert.equal(parseCell('int', '').error, '必填');
  assert.equal(parseCell('int', 'abc').error, '須為數字');
  assert.equal(parseCell('int', '12,34').error, '須為數字');
});

test('parseCell：小數欄與文字欄', () => {
  assert.deepEqual(parseCell('dec', '3202.5'), { ok: true, value: 3202.5 });
  assert.deepEqual(parseCell('dec', '1,830.25'), { ok: true, value: 1830.25 });
  assert.equal(parseCell('dec', '-0.1').error, '不可為負數');
  assert.equal(parseCell('dec', '1.').ok, false);
  assert.deepEqual(parseCell('text', '  示範備註 '), { ok: true, value: '示範備註' });
  assert.deepEqual(parseCell('int', '', { required: false }), { ok: true, value: 0 });
});

test('groupTotals：兩組各自加總，鎖定組別不計', () => {
  const routes = [
    { routeNo: 'T1', serviceModes: 'fixed' },
    { routeNo: 'T2', serviceModes: 'both' },
    { routeNo: 'T3', serviceModes: 'reserved' },
  ];
  const g = (o) => ({ ...zeroGroup(), ...o });
  const fr = {
    T1: { fixed: g({ trips: 600, operatingKm: 9120.5 }), reserved: g({ trips: 999 }) }, // 預約被鎖定，不計
    T2: { fixed: g({ trips: 60, operatingKm: 1830.25 }), reserved: g({ trips: 10, passengers: 30 }) },
    T3: { reserved: g({ trips: 5, passengers: 12 }) },
  };
  const t = groupTotals(routes, fr);
  assert.equal(t.fixed.trips, 660);
  assert.equal(t.fixed.operatingKm, 10950.75);
  assert.equal(t.reserved.trips, 15);
  assert.equal(t.reserved.passengers, 42);
  assert.equal(groupTotals(routes, undefined).fixed.trips, 0);
});

test('moveTarget：Enter 往下、Shift+Enter 往上、超出範圍回 null', () => {
  assert.deepEqual(moveTarget(0, 3, 'Enter', false, 3), { row: 1, col: 3 });
  assert.deepEqual(moveTarget(1, 3, 'Enter', true, 3), { row: 0, col: 3 });
  assert.deepEqual(moveTarget(1, 3, 'ArrowUp', false, 3), { row: 0, col: 3 });
  assert.equal(moveTarget(2, 3, 'ArrowDown', false, 3), null);
  assert.equal(moveTarget(0, 3, 'Enter', true, 3), null);
  assert.equal(moveTarget(0, 3, 'Tab', false, 3), null);
});
