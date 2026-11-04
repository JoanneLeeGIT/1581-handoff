import test from 'node:test';
import assert from 'node:assert/strict';
import { computePassengerKm, FORMULA, SOURCES, sumValues } from '../js/passengerKm.js';

test('formula constants live in one place', () => {
  assert.equal(FORMULA.coefficient, 0.35);
  assert.equal(FORMULA.label, '客運人數 × 月底營業里程 × 0.35');
  assert.equal(FORMULA.confirmed, false);
});

test('computed: 1,000 passengers x 20 km x 0.35 = 7,000', () => {
  const r = computePassengerKm({ source: 'computed', passengers: 1000, monthEndMileage: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.value, 7000);
});

test('computed result is rounded to two decimals', () => {
  const r = computePassengerKm({ source: 'computed', passengers: 3, monthEndMileage: 18.35 });
  assert.equal(r.value, 19.27);
});

test('manual: operator value is returned untouched', () => {
  const r = computePassengerKm({ source: 'manual', passengers: 1000, monthEndMileage: 20, manualValue: 123.4 });
  assert.equal(r.ok, true);
  assert.equal(r.value, 123.4);
});

test('computed with missing or negative passengers is an error', () => {
  assert.equal(computePassengerKm({ source: 'computed', monthEndMileage: 20 }).ok, false);
  assert.equal(computePassengerKm({ source: 'computed', passengers: -1, monthEndMileage: 20 }).ok, false);
  assert.equal(computePassengerKm({ source: 'computed', passengers: 5 }).ok, false);
});

test('manual with a missing or negative value is an error', () => {
  assert.equal(computePassengerKm({ source: 'manual' }).ok, false);
  assert.equal(computePassengerKm({ source: 'manual', manualValue: -2 }).ok, false);
});

test('source must be manual or computed', () => {
  assert.deepEqual([...SOURCES], ['manual', 'computed']);
  assert.equal(computePassengerKm({ source: 'auto', passengers: 1, monthEndMileage: 1 }).ok, false);
});

test('totals are the sum of the route values', () => {
  assert.equal(sumValues([1.5, 2.25, 3]), 6.75);
  assert.equal(sumValues([]), 0);
});
