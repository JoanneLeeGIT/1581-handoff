// 系統資訊 → 每月任務：總覽＋各單位分頁（有業者的單位再分業者子分頁），依月份列出應辦事項，可勾選完成。
// 樣式只用 huabus-theme.css／app.css 既有元件（分頁 .hb-tab、分段 .hb-seg、訊息 .hb-msg、表格 .tk-table、連結 .hb-anchor）。
import {
  PAGES, pageHref, FREQ, ROLES, RHYTHM, PAGE_MAP, COMMON_TIPS,
  applies, tasksForMonth, hasPending, doneKey,
} from '../monthlyTasks.js';
import { esc, msg } from './common.js';

// 原型：勾選紀錄存在瀏覽器；正式版改存系統（待確認 #20）
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 只影響勾選記憶 */ } },
};

const EXT = '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>';
// 站內新頁面在同一分頁開；線上既有頁面另開分頁
const pageLink = (k) => (PAGES[k][3]?.internal
  ? `<a class="hb-anchor mt-link" href="${pageHref(k)}">${esc(PAGES[k][0])}</a>`
  : `<a class="hb-anchor mt-link" href="${pageHref(k)}" target="_blank" rel="noopener">${esc(PAGES[k][0])}${EXT}</a>`);
const freqTag = (f) => `<span class="mt-freq f-${f}">${FREQ[f]}</span>`;

/* ---------- 總覽 ---------- */
export function renderOverview(root) {
  root.innerHTML = `
    ${msg('本頁彙整各單位於花蓮公車客運智慧管理系統中應定期辦理的事項。請點選上方所屬單位分頁，依月份查看應辦事項；每項均附對應功能頁面連結，完成後可勾選記錄。標示「必做」的項目尚未完成時，月份上會顯示橘色圓點提醒。')}
    <section>
      <h2 class="hb-subtitle">資料維運時程</h2>
      <div class="tk-tablewrap"><table class="tk-table mt-rhythm">
        <thead><tr><th>項目</th><th>週期</th><th>辦理時程</th><th>辦理單位</th></tr></thead>
        <tbody>${RHYTHM.map(([name, f, when, who]) => `<tr><td>${esc(name)}</td><td>${freqTag(f)}</td><td>${esc(when)}</td><td>${esc(who)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    <section>
      <h2 class="hb-subtitle">系統功能頁面</h2>
      <div class="mt-map">${PAGE_MAP.map(([group, keys]) => `
        <div class="mt-map-card">
          <h3>${esc(group)}</h3>
          <ul>${keys.map((k) => `<li>${pageLink(k)}${PAGES[k][2] ? `<span class="mt-manual">手冊 ${esc(PAGES[k][2])}</span>` : '<span class="mt-manual">本期新增</span>'}</li>`).join('')}</ul>
        </div>`).join('')}
      </div>
    </section>
    <section>
      <h2 class="hb-subtitle">共通操作說明</h2>
      <ul class="mt-tips">${COMMON_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>`;
}

/* ---------- 單位分頁 ---------- */
function itemHTML(role, item, index, year, month, opId) {
  const k = doneKey(year, month, role.id, index, opId);
  const done = store.get(k) === '1';
  const id = `mt-${role.id}-${index}`;
  const tags = [
    item.req ? '<span class="mt-req">必做</span>' : '<span class="mt-opt">選做</span>',
    item.scope ? `<span class="hb-tag">${esc(item.scope)}</span>` : '',
    item.m && item.m[month] ? `<span class="hb-tag hb-tag-warn">${esc(item.m[month])}</span>` : '',
  ].join('');
  return `<li class="mt-item${done ? ' is-done' : ''}${item.req ? ' is-req' : ''}">
    <input type="checkbox" id="${id}" data-k="${esc(k)}" ${done ? 'checked' : ''}>
    <div class="mt-item-body">
      <label class="mt-item-title" for="${id}"><span>${esc(item.t)}</span>${tags}</label>
      <ol class="mt-steps">${item.d.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${item.p.length ? `<div class="mt-links">${item.p.map(pageLink).join('')}</div>` : ''}
    </div>
  </li>`;
}

function yearTable(role, month) {
  const months = [...Array(12)].map((_, i) => i + 1);
  const rows = role.items.map((it) => `<tr><td>${esc(it.t)}${it.req ? '' : '<span class="mt-opt">選做</span>'}</td>${months.map((m) => {
    const on = applies(it, m);
    const mark = !on ? '' : it.m ? '<span class="mt-mk is-key" aria-label="特定月份">◆</span>' : '<span class="mt-mk" aria-label="每月">●</span>';
    const tip = on && it.m ? ` title="${esc(it.m[m])}"` : '';
    return `<td class="mt-m${m === month ? ' is-now' : ''}"${tip}>${mark}</td>`;
  }).join('')}</tr>`).join('');
  return `<section>
    <div class="mt-sec-head">
      <h2 class="hb-subtitle">全年辦理時程</h2>
      <span class="mt-hint"><span class="mt-mk">●</span> 每月辦理　<span class="mt-mk is-key">◆</span> 特定月份辦理（游標移至符號上可查看時程）</span>
    </div>
    <div class="tk-tablewrap"><table class="tk-table mt-year">
      <thead><tr><th>項目</th>${months.map((m) => `<th class="mt-m${m === month ? ' is-now' : ''}">${m} 月</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

/** 業者子分頁：顯示該月有沒有必做事項未完成（橘點），只有一家業者（業者本人登入）時不顯示切換列 */
function opTabsHTML(ops, opId, pendingFor) {
  if (ops.length < 2) return '';
  return `<div class="mt-ops" role="tablist" aria-label="業者">${ops.map((o) => {
    const p = pendingFor(o.id);
    const label = `${o.name}${p ? '（有必做事項尚未完成）' : ''}`;
    return `<button type="button" class="hb-tab mt-op${o.id === opId ? ' active' : ''}" role="tab" aria-selected="${o.id === opId}" data-op="${esc(o.id)}" aria-label="${esc(label)}" title="${esc(label)}">${esc(o.name)}${p ? '<span class="mt-dot" aria-hidden="true"></span>' : ''}</button>`;
  }).join('')}</div>`;
}

/**
 * 單位分頁。year／currentMonth 來自模擬今天；month 是目前選看的月份（onMonth 切換）。
 * ops：這個單位可看的業者（沒有就是空陣列）；opId 目前選看的業者（onOp 切換），勾選紀錄依業者分開。
 */
export function renderRole(root, { roleId, year, month, currentMonth, onMonth, ops = [], opId = null, onOp }) {
  const role = ROLES.find((r) => r.id === roleId);
  const groups = tasksForMonth(role, month);
  const pendingOf = (m, op) => hasPending(role, m, currentMonth, (i) => store.get(doneKey(year, m, role.id, i, op)) === '1');
  const pending = (m) => pendingOf(m, opId);
  const op = ops.find((o) => o.id === opId);

  root.innerHTML = `
    ${msg(esc(role.intro))}
    ${opTabsHTML(ops, opId, (id) => pendingOf(month, id))}
    ${op ? `<h2 class="mt-op-name">${esc(op.name)}</h2>` : ''}
    <div class="mt-bar">
      <div class="mt-months">
        <span class="hb-label mt-months-label" id="mt-months-label">${year} 年</span>
        <div class="hb-seg" role="tablist" aria-labelledby="mt-months-label">${[...Array(12)].map((_, i) => {
          const m = i + 1;
          const p = pending(m);
          const label = `${m} 月${p ? '（有必做事項尚未完成）' : ''}`;
          return `<button type="button" role="tab" aria-selected="${m === month}" data-m="${m}" aria-label="${label}" title="${label}">${m}月${p ? '<span class="mt-dot" aria-hidden="true"></span>' : ''}</button>`;
        }).join('')}</div>
      </div>
      <div class="rpt-progress" id="mt-prog">
        <span class="rpt-progress-label">${month} 月必做事項</span>
        <span class="rpt-progress-track"><span class="rpt-progress-fill"></span></span>
        <span class="rpt-progress-num"></span>
      </div>
    </div>
    <p class="hb-desc mt-note">每月 1 日發出資料收集通知；營運月報、票證資料 15 日截止，車輛資料 10 日截止（幸福巴士 1.0、市區公車建議同時確認班次明細）。月報於當月月底上架，票證資料每季於 2、5、8、11 月底上架。黃色標籤為該月份的辦理時點；橘色圓點表示該月尚有必做事項未完成。</p>
    ${groups.map((g) => `<section class="mt-group">
      <h2 class="mt-group-head">${freqTag(g.f)}<span>${g.list.length} 項</span></h2>
      <ul class="mt-list">${g.list.map((x) => itemHTML(role, x.item, x.index, year, month, opId)).join('')}</ul>
    </section>`).join('') || '<div class="hb-empty">本月無應辦事項。</div>'}
    ${yearTable(role, month)}`;

  root.querySelectorAll('.hb-seg button').forEach((b) => { b.onclick = () => onMonth(Number(b.dataset.m)); });
  root.querySelectorAll('.mt-op').forEach((b) => { b.onclick = () => onOp(b.dataset.op); });
  root.querySelectorAll('.mt-item input').forEach((c) => {
    c.onchange = () => {
      store.set(c.dataset.k, c.checked ? '1' : '0');
      c.closest('.mt-item').classList.toggle('is-done', c.checked);
      updateProgress(root);
      // 更新目前月份的橘點
      const btn = root.querySelector(`.hb-seg button[data-m="${month}"]`);
      const p = pending(month);
      btn.querySelector('.mt-dot')?.remove();
      if (p) btn.insertAdjacentHTML('beforeend', '<span class="mt-dot" aria-hidden="true"></span>');
      const label = `${month} 月${p ? '（有必做事項尚未完成）' : ''}`;
      btn.setAttribute('aria-label', label);
      btn.title = label;
      // 更新目前業者子分頁的橘點
      const ob = root.querySelector(`.mt-op[data-op="${opId}"]`);
      if (ob) {
        ob.querySelector('.mt-dot')?.remove();
        if (p) ob.insertAdjacentHTML('beforeend', '<span class="mt-dot" aria-hidden="true"></span>');
        const ol = `${op.name}${p ? '（有必做事項尚未完成）' : ''}`;
        ob.setAttribute('aria-label', ol);
        ob.title = ol;
      }
    };
  });
  updateProgress(root);
}

function updateProgress(root) {
  const boxes = [...root.querySelectorAll('.mt-item.is-req input')];
  const done = boxes.filter((c) => c.checked).length;
  const el = root.querySelector('#mt-prog');
  if (!el) return;
  el.hidden = !boxes.length;
  el.classList.toggle('is-done', boxes.length > 0 && done === boxes.length);
  el.querySelector('.rpt-progress-fill').style.width = boxes.length ? `${(done / boxes.length) * 100}%` : '0';
  el.querySelector('.rpt-progress-num').innerHTML = `已完成 <b>${done}</b> / ${boxes.length}`;
}
