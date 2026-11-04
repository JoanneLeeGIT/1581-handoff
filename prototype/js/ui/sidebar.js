// 導覽列：照線上系統（ds.thigov.com/HauBus）的結構與樣式；圖示沿用 Figma 匯出的檔案。
// 目前頁面由 mountSidebar 的 active 決定（月報及票證上傳、每月任務）。左上角選單按鈕可收合成只剩圖示，並記住使用者的選擇。
import { getSession, getOperator, COUNTY_USER } from '../store.js';
import { esc } from './common.js';

const A = 'assets/figma/';
const KEY = 'huabus-sb-collapsed';

function userInfo() {
  const s = getSession();
  if (s.role === 'operator') return { role: '業者', name: getOperator(s.operatorId)?.name ?? '' };
  if (s.role === 'readonly') return { role: '唯讀單位', name: '監理站／區研中心' };
  return { role: '系統管理員', name: COUNTY_USER };
}

const icon = (file) => `<span class="hb-ic"><img src="${A}${file}" width="24" height="24" alt=""></span>`;
const arrow = `<img class="hb-arr" src="${A}ic-chevron-down.svg" width="18" height="18" alt="">`;
const item = (ic, text, { sub = false, open = false } = {}) =>
  `<div class="hb-ni${open ? ' hb-open' : ''}" title="${esc(text)}">${ic}<span class="hb-lbl">${text}</span>${sub ? arrow : ''}</div>`;
const subItem = (text, { active = false, href = '#' } = {}) =>
  `<a class="hb-si${active ? ' hb-act' : ''}" href="${href}"${active ? ' aria-current="page"' : href === '#' ? ' onclick="return false"' : ''}>${text}</a>`;

function readCollapsed() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
function setCollapsed(el, on) {
  document.body.classList.toggle('sb-collapsed', on);
  const btn = el.querySelector('.hb-tog');
  btn.setAttribute('aria-expanded', String(!on));
  btn.setAttribute('aria-label', on ? '展開選單' : '收合選單');
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 只影響記憶，不影響操作 */ }
}

// 有子頁面的群組。原型裡有實作的子頁面才給 href，其他是線上既有頁面（不可點）。
const GROUPS = {
  opsData: { subs: [['業者基本資料'], ['DRTS通阻回報'], ['月報及票證上傳', 'upload', 'index.html']] },
  sysInfo: { subs: [['每月任務', 'tasks', 'tasks.html']] },
};
function groupHTML(id, ic, text, active) {
  const g = GROUPS[id];
  const open = g.subs.some((s) => s[1] === active);
  return `<div class="hb-ni${open ? ' hb-open' : ''}" title="${esc(text)}" data-group="${id}" role="button" tabindex="0" aria-expanded="${open}">${ic}<span class="hb-lbl">${text}</span>${arrow}</div>
      <div class="hb-sub" data-sub="${id}"${open ? '' : ' hidden'}>
        ${g.subs.map(([t, key, href]) => subItem(t, { active: key === active, href: href ?? '#' })).join('')}
      </div>`;
}

/** active：目前頁面（'upload' 月報及票證上傳、'tasks' 每月任務） */
export function mountSidebar(el, { active = 'upload' } = {}) {
  const u = userInfo();
  el.innerHTML = `
    <div class="hb-sh">
      <button type="button" class="hb-tog" aria-label="收合選單" aria-expanded="true"><img src="${A}ic-menu.svg" width="28" height="28" alt=""></button>
      <div class="hb-logo" aria-label="HUABUS">
        <div class="hb-logo-mark">
          <span class="lv"><img src="${A}logo-vector.svg" width="52.897" height="36" alt=""></span>
          <img class="d1" src="${A}logo-dot1.svg" width="11.437" height="11.4373" alt="">
          <img class="d2" src="${A}logo-dot2.svg" width="8.07611" height="8.07633" alt="">
          <img class="d3" src="${A}logo-dot3.svg" width="8.37431" height="8.37453" alt="">
          <img class="d4" src="${A}logo-dot4.svg" width="8.3178" height="8.31803" alt="">
        </div>
        <div class="hb-logo-text"><img src="${A}logo-text.png" alt=""></div>
      </div>
    </div>
    <nav class="hb-nav">
      ${item(icon('ic-home.svg'), '首頁')}
      ${item(icon('ic-performance.svg'), '營運績效', { sub: true })}
      ${item(icon('ic-conversion-path.svg'), '空間運量分析', { sub: true })}
      ${groupHTML('opsData', icon('ic-bus.svg'), '營運資料管理', active)}
      ${item(icon('ic-article.svg'), '營運補貼', { sub: true })}
      ${item(`<span class="hb-ic hb-ic-chat"><img src="${A}ic-chat.svg" width="18.5001" height="18.4999" alt=""></span>`, '稽核評鑑', { sub: true })}
      ${item(icon('ic-dashboard.svg'), '其他分析', { sub: true })}
      ${groupHTML('sysInfo', `<span class="hb-ic"><img src="assets/icons/ic-info.svg" width="24" height="24" alt=""></span>`, '系統資訊', active)}
    </nav>
    <div class="hb-usr" title="${esc(u.role)}｜${esc(u.name)}">
      <img class="hb-av" src="${A}avatar.png" width="42" height="42" alt="">
      <div class="hb-ui"><span class="hb-ur">${esc(u.role)}</span><span class="hb-un">${esc(u.name)}</span></div>
      <img class="hb-ua" src="${A}ic-chevron-user.svg" width="18" height="18" alt="">
    </div>`;
  setCollapsed(el, readCollapsed());
  el.querySelector('.hb-tog').addEventListener('click', () => setCollapsed(el, !document.body.classList.contains('sb-collapsed')));
  // 點群組名稱展開／收合子頁面
  el.querySelectorAll('[data-group]').forEach((g) => {
    const toggle = () => {
      const sub = el.querySelector(`[data-sub="${g.dataset.group}"]`);
      const open = sub.hidden;
      sub.hidden = !open;
      g.classList.toggle('hb-open', open);
      g.setAttribute('aria-expanded', String(open));
    };
    g.addEventListener('click', toggle);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
}
