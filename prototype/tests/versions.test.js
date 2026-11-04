import test from 'node:test';
import assert from 'node:assert/strict';
import { addVersion, diffVersions, getCurrentVersion } from '../js/versions.js';

const f1 = { routes: { R1: { fixed: { passengers: 100, passengerKmSource: 'computed' } } }, charter: { passengers: 0 } };

test('each submit creates a new version with increasing number', () => {
  let r = addVersion({ operatorId: 'a', yearMonth: '2026-10' }, f1, { now: '2026-10-05T00:00:00Z' });
  assert.equal(r.versions.length, 1);
  assert.equal(r.versions[0].versionNo, 1);
  assert.equal(r.currentVersion, 1);
  r = addVersion(r, { ...f1, charter: { passengers: 5 } }, { now: '2026-10-06T00:00:00Z' });
  assert.equal(r.versions.map(v => v.versionNo).join(), '1,2');
  assert.equal(r.currentVersion, 2);
});

test('older versions are preserved untouched (FR-020)', () => {
  const r1 = addVersion({}, f1, { now: 'a' });
  const r2 = addVersion(r1, { ...f1, charter: { passengers: 9 } }, { now: 'b' });
  assert.equal(r1.versions.length, 1, 'input not mutated');
  assert.deepEqual(r2.versions[0].fields, f1);
  assert.equal(getCurrentVersion(r2).fields.charter.passengers, 9);
});

test('last submit is the current version (FR-020)', () => {
  let r = addVersion({}, f1, { now: 'a' });
  r = addVersion(r, f1, { now: 'b' });
  r = addVersion(r, { ...f1, charter: { passengers: 1 } }, { now: 'c' });
  assert.equal(r.currentVersion, 3);
  assert.equal(getCurrentVersion(r).versionNo, 3);
});

test('stored fields are a copy, later edits to the input do not leak in', () => {
  const src = structuredClone(f1);
  const r = addVersion({}, src, { now: 'a' });
  src.routes.R1.fixed.passengers = 999;
  assert.equal(r.versions[0].fields.routes.R1.fixed.passengers, 100);
});

test('diff returns only changed field paths', () => {
  const f2 = structuredClone(f1);
  f2.routes.R1.fixed.passengers = 120;
  f2.routes.R1.fixed.passengerKmSource = 'manual';
  assert.deepEqual(diffVersions(f1, f2).sort(), ['routes.R1.fixed.passengerKmSource', 'routes.R1.fixed.passengers']);
  assert.deepEqual(diffVersions(f1, structuredClone(f1)), []);
});

test('diff treats a missing note and an empty note as the same', () => {
  const a = { routeNotes: {} };
  const b = { routeNotes: { R1: '' } };
  assert.deepEqual(diffVersions(a, b), []);
  assert.deepEqual(diffVersions(a, { routeNotes: { R1: '停駛' } }), ['routeNotes.R1']);
});

test('version records who saved it', () => {
  const r = addVersion({}, f1, { now: 'a', savedBy: '縣府甲', savedByRole: 'county' });
  assert.equal(r.versions[0].savedBy, '縣府甲');
  assert.equal(r.versions[0].savedByRole, 'county');
});

test('diff with no previous version reports nothing', () => {
  assert.deepEqual(diffVersions(null, f1), []);
});

test('diff also reports newly added paths', () => {
  const f2 = structuredClone(f1);
  f2.routes.R2 = { fixed: { passengers: 1 } };
  assert.deepEqual(diffVersions(f1, f2), ['routes.R2.fixed.passengers']);
});

test('change request: official version stays the base until approved; diff compares to the base', async () => {
  const { getOfficialVersion, compareBase, pendingChange } = await import('../js/versions.js');
  const r = {
    currentVersion: 3,
    versions: [{ versionNo: 1 }, { versionNo: 2 }, { versionNo: 3 }],
    changeRequests: [{ outcome: 'pending', baseVersion: 1, versionNo: 3 }],
  };
  assert.equal(pendingChange(r).versionNo, 3);
  assert.equal(getOfficialVersion(r).versionNo, 1);
  assert.equal(compareBase(r, 3), 1);
  assert.equal(compareBase(r, 2), 1);
  const done = { ...r, changeRequests: [{ outcome: 'approved', baseVersion: 1, versionNo: 3 }] };
  assert.equal(getOfficialVersion(done).versionNo, 3);
});
