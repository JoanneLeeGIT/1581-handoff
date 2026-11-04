// 自訂下拉選單：取代瀏覽器預設的 <select> 外觀與選單面板（樣式見 huabus-theme.css 的 .hb-dd）。
// 原本的 <select> 保留在畫面外，負責值與 change 事件，所以既有程式不用改。
// 鍵盤：Enter／空白鍵／↓ 打開，↑↓ 移動，Enter 選定，Esc 或點外面關閉，輸入字首可跳到該項。
import { esc } from './common.js';

let uid = 0;
const CHEVRON = '<svg class="hb-dd-chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg class="hb-dd-check" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const optHtml = (o, { inButton = false } = {}) => {
  const badge = o.dataset.badge ? `<span class="hb-dd-badge">${esc(o.dataset.badge)}</span>` : '';
  const sub = o.dataset.sub ? `<span class="hb-dd-sub">${esc(o.dataset.sub)}</span>` : '';
  return `<span class="hb-dd-text"><span class="hb-dd-main">${esc(o.textContent)}${badge}</span>${sub}</span>${inButton ? '' : CHECK}`;
};

export function enhanceSelect(select, { label = '' } = {}) {
  if (!select || select.dataset.enhanced) return null;
  select.dataset.enhanced = '1';
  const id = `hbdd-${uid += 1}`;
  const wrap = document.createElement('div');
  wrap.className = 'hb-dd';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('hb-dd-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hb-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', `${id}-list`);
  if (label) btn.setAttribute('aria-label', label);
  const list = document.createElement('ul');
  list.className = 'hb-dd-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.hidden = true;
  wrap.append(btn, list);

  const opts = () => [...select.options];
  let active = select.selectedIndex;

  const paintButton = () => {
    const o = select.options[select.selectedIndex];
    btn.innerHTML = `${o ? optHtml(o, { inButton: true }) : ''}${CHEVRON}`;
  };
  const paintList = () => {
    list.innerHTML = opts().map((o, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" class="${i === active ? 'is-active' : ''}" aria-selected="${i === select.selectedIndex}">${optHtml(o)}</li>`).join('');
    list.setAttribute('aria-activedescendant', `${id}-o${active}`);
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    if (!list.hidden) return;
    active = Math.max(0, select.selectedIndex);
    paintList();
    list.hidden = false;
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    btn.setAttribute('aria-expanded', 'true');
    list.focus();
    document.addEventListener('pointerdown', onOutside, true);
  };
  const close = (focusBtn = true) => {
    if (list.hidden) return;
    wrap.classList.remove('is-open');
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (focusBtn) btn.focus();
  };
  const choose = (i) => {
    const changed = i !== select.selectedIndex;
    select.selectedIndex = i;
    paintButton();
    close();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  function onOutside(e) { if (!wrap.contains(e.target)) close(false); }

  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) choose(Number(li.dataset.i));
  });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || Number(li.dataset.i) === active) return;
    active = Number(li.dataset.i);
    list.querySelectorAll('li').forEach((x) => x.classList.toggle('is-active', x === li));
    list.setAttribute('aria-activedescendant', li.id);
  });
  list.addEventListener('keydown', (e) => {
    const n = select.options.length;
    if (e.key === 'ArrowDown') active = Math.min(n - 1, active + 1);
    else if (e.key === 'ArrowUp') active = Math.max(0, active - 1);
    else if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = n - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); return; }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(e.key === 'Escape'); return; }
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const hit = opts().findIndex((o, i) => i > active && o.textContent.trim().toLowerCase().startsWith(k));
      const first = opts().findIndex((o) => o.textContent.trim().toLowerCase().startsWith(k));
      if (hit >= 0) active = hit; else if (first >= 0) active = first; else return;
    } else return;
    e.preventDefault();
    paintList();
  });
  select.addEventListener('change', paintButton);
  paintButton();
  return wrap;
}

/** 把 root 底下所有 select.hb-select 換成自訂下拉選單。 */
export function enhanceSelects(root = document) {
  root.querySelectorAll('select.hb-select').forEach((s) => enhanceSelect(s, { label: s.getAttribute('aria-label') ?? '' }));
}
