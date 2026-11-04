import test from 'node:test';
import assert from 'node:assert/strict';
import { getEditableGroups, isGroupLocked, normalizeRouteStats, zeroGroup, MODES, STAT_KEYS } from '../js/serviceMode.js';

const route = m => ({ routeNo: 'X1', serviceModes: m });

test('fixed route: only the fixed group is editable', () => {
  assert.deepEqual(getEditableGroups(route('fixed')), ['fixed']);
  assert.equal(isGroupLocked(route('fixed'), 'fixed'), false);
  assert.equal(isGroupLocked(route('fixed'), 'reserved'), true);
});

test('reserved route: only the reserved group is editable', () => {
  assert.deepEqual(getEditableGroups(route('reserved')), ['reserved']);
  assert.equal(isGroupLocked(route('reserved'), 'fixed'), true);
});

test('both: both groups are editable', () => {
  assert.deepEqual(getEditableGroups(route('both')), ['fixed', 'reserved']);
  assert.equal(isGroupLocked(route('both'), 'fixed'), false);
  assert.equal(isGroupLocked(route('both'), 'reserved'), false);
});

test('service mode must be fixed, reserved or both', () => {
  assert.deepEqual([...MODES], ['fixed', 'reserved', 'both']);
  assert.throws(() => getEditableGroups(route('other')));
  assert.throws(() => getEditableGroups({ routeNo: 'X' }));
  assert.throws(() => isGroupLocked(route('fixed'), 'nope'));
});

test('locked groups are exported as zero even if stale data exists', () => {
  const stats = { fixed: { ...zeroGroup(), passengers: 50 }, reserved: { ...zeroGroup(), passengers: 77 } };
  const n = normalizeRouteStats(route('fixed'), stats);
  assert.equal(n.fixed.passengers, 50);
  assert.equal(n.reserved.passengers, 0);
  for (const k of STAT_KEYS) assert.equal(n.reserved[k], 0, k);
});

test('missing stats of an editable group fall back to zeros', () => {
  const n = normalizeRouteStats(route('both'), {});
  for (const k of STAT_KEYS) assert.equal(n.fixed[k], 0);
});
