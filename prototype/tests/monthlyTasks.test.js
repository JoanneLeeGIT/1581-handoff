import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, PAGES, applies, tasksForMonth, hasPending, defaultRoleTab, visibleTabs, pageHref } from '../js/monthlyTasks.js';

const role = (id) => ROLES.find((r) => r.id === id);
const titles = (id) => role(id).items.map((x) => x.t);

test('每月項目每個月都出現；票證只在 1、4、7、10 月', () => {
  const city = role('t3');
  const tix = city.items.find((x) => x.t === '上傳票證資料');
  assert.equal(applies(city.items[0], 3), true);
  assert.deepEqual([1, 2, 4, 7, 10].map((m) => applies(tix, m)), [true, false, true, true, true]);
});

test('該月清單依週期分組，順序為每月→每季→每半年→每年→不定期', () => {
  assert.deepEqual(tasksForMonth(role('t3'), 11).map((g) => g.f), ['M', 'H', 'Y']);
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
