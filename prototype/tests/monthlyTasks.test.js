import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES, PAGES, applies, tasksForMonth, hasPending, defaultRoleTab, visibleTabs, pageHref, roleOperators, doneKey } from '../js/monthlyTasks.js';

const OPS = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8')).operators;
const opNames = (id, session = { role: 'county' }) => roleOperators(role(id), OPS, session).map((o) => o.name);

const role = (id) => ROLES.find((r) => r.id === id);
const titles = (id) => role(id).items.map((x) => x.t);

test('每月項目每個月都出現；票證改為每月上傳', () => {
  const city = role('t3');
  const tix = city.items.find((x) => x.t === '上傳票證資料');
  assert.equal(applies(city.items[0], 3), true);
  assert.equal(tix.f, 'M');
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((m) => applies(tix, m)));
  assert.equal(role('t4').items.find((x) => x.t === '上傳票證資料').f, 'M');
});

test('票證每季上架與準點率都在 2、5、8、11 月；幸福巴士沒有票證項目', () => {
  const pub = role('thi').items.find((x) => x.t === '票證資料上架（每季）');
  const punct = role('thi').items.find((x) => x.t === '計算準點率');
  for (const it of [pub, punct]) assert.deepEqual([1, 2, 4, 5, 8, 11].map((m) => applies(it, m)), [false, true, false, true, true, true]);
  for (const id of ['t1', 't2']) assert.ok(!titles(id).some((t) => t.includes('票證')), id);
});

test('該月清單依週期分組，順序為每月→每季→每半年→每年→不定期', () => {
  assert.deepEqual(tasksForMonth(role('t3'), 11).map((g) => g.f), ['M', 'H', 'Y']);
  assert.equal(tasksForMonth(role('thi'), 2).some((g) => g.f === 'Q'), true); // 票證、派車單上架
  assert.equal(tasksForMonth(role('t3'), 2).some((g) => g.f === 'Q'), false);
});

test('橘點：已到的月份有必做未勾才顯示；選做、未來月份不算', () => {
  const city = role('t3');
  const none = () => false;
  const all = () => true;
  const onlyReq = (i) => city.items[i].req;
  assert.equal(hasPending(city, 3, 11, none), true);
  assert.equal(hasPending(city, 3, 11, onlyReq), false); // 選做沒勾也不提醒
  assert.equal(hasPending(city, 12, 11, none), false); // 未來月份
  assert.equal(hasPending(city, 11, 11, all), false);
});

test('必做與選做：提供資料、補貼為必做；資料完整度、營運績效為選做', () => {
  for (const r of ROLES.filter((x) => /^t[1-5]$/.test(x.id))) {
    for (const it of r.items) {
      const optional = ['檢查資料完整度', '查看營運績效'].includes(it.t);
      assert.equal(it.req, !optional, `${r.name}／${it.t}`);
    }
  }
});

test('公路客運、市民小巴不需車輛資料；市民小巴票證限固定線、派車單限預約線', () => {
  assert.ok(!titles('t4').includes('更新車輛資料'));
  assert.ok(!titles('t5').includes('更新車輛資料'));
  assert.equal(role('t5').items.find((x) => x.t === '上傳票證資料').scope, '僅固定線');
  assert.equal(role('t5').items.find((x) => x.t === '提供派車單資料').scope, '僅預約線');
});

test('票證與準點率分開；縣府每月檢核營運概況月報；監理站沒有分頁', () => {
  assert.ok(ROLES.every((r) => r.items.every((x) => !x.t.includes('準點率資料'))));
  assert.ok(titles('thi').includes('計算準點率'));
  assert.equal(role('t6').items.find((x) => x.t === '檢核營運概況月報').f, 'M');
  assert.equal(role('t7'), undefined);
});

test('幸福巴士 1.0、市區公車每月確認班次明細（連到報表產製）；2.0 沒有', () => {
  for (const id of ['t1', 't3']) {
    const it = role(id).items.find((x) => x.t === '確認班次明細');
    assert.ok(it, id);
    assert.equal(it.f, 'M');
    assert.deepEqual(it.p, ['rpt']);
  }
  assert.ok(!titles('t2').includes('確認班次明細'));
});

test('預設分頁依登入角色', () => {
  assert.equal(defaultRoleTab({ role: 'county' }), 't6');
  assert.equal(defaultRoleTab({ role: 'readonly' }), 'ov');
  assert.equal(defaultRoleTab({ role: 'operator' }, { type: 'happybus', happybusVersion: '1.0' }), 't1');
  assert.equal(defaultRoleTab({ role: 'operator' }, { type: 'happybus', happybusVersion: '2.0' }), 't2');
  assert.equal(defaultRoleTab({ role: 'operator' }, { type: 'urban' }), 't3');
});

test('業者只看得到自己單位的分頁；縣府、唯讀單位看全部', () => {
  assert.deepEqual(visibleTabs({ role: 'operator' }, { type: 'urban' }), ['t3']);
  assert.deepEqual(visibleTabs({ role: 'operator' }, { type: 'happybus', happybusVersion: '2.0' }), ['t2']);
  assert.equal(visibleTabs({ role: 'county' }).length, ROLES.length + 1);
  assert.equal(visibleTabs({ role: 'readonly' }).length, ROLES.length + 1);
});

test('月報、票證連到本模組的月報及票證上傳（站內）', () => {
  assert.equal(pageHref('upload'), 'index.html');
  assert.equal(pageHref('uploadTicket'), 'index.html#ticket');
  assert.ok(pageHref('mo').startsWith('https://'));
});

test('每個項目的頁面代碼都存在', () => {
  for (const r of ROLES) for (const it of r.items) for (const p of it.p) assert.ok(PAGES[p], `${r.name}／${it.t}：${p}`);
});

test('業者子分頁：市區公車、幸福巴士 1.0／2.0 依正式業者名稱分開；其他單位沒有子分頁', () => {
  assert.deepEqual(opNames('t3').sort(), ['太魯閣客運', '統聯客運', '華聯客運', '興東客運'].sort());
  assert.equal(opNames('t1').length, 7); // 依縣府路線表，含吉安鄉公所
  assert.ok(opNames('t1').every((n) => n.endsWith('公所')));
  assert.deepEqual(opNames('t2').sort(), ['羅山社區發展協會', '花蓮縣卓溪鄉卓清社區發展協會', '花蓮縣萬榮鄉馬遠社區發展協會'].sort());
  for (const id of ['t4', 't5', 't6', 'thi']) assert.deepEqual(opNames(id), []);
});

test('業者登入只看到自己的子分頁；勾選紀錄依業者分開', () => {
  assert.deepEqual(opNames('t3', { role: 'operator', operatorId: 'op_demo_u1' }), ['華聯客運']);
  assert.notEqual(doneKey(2026, 11, 't3', 0, 'op_demo_u1'), doneKey(2026, 11, 't3', 0, 'op_demo_u2'));
  assert.equal(doneKey(2026, 11, 't6', 0), 'huabus-task|2026|11|t6|0');
});
