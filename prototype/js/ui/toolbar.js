// Prototype-only toolbar: role switch (instead of login), simulated date, demo reset.
import { getOperators, setSession, sessionValue, resetDemo } from '../store.js';
import { getToday, setToday, realToday } from '../clock.js';
import { esc } from './common.js';

export function mountToolbar(el, onChange) {
  const val = sessionValue();
  const opt = (v, t) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`;
  el.innerHTML = `
    <div class="proto-toolbar px-3 py-2 d-flex flex-wrap align-items-center gap-3">
      <strong class="text-warning-emphasis"><i class="bi bi-tools"></i> 原型工具列</strong>
      <label class="d-flex align-items-center gap-2">角色
        <select id="tb-role" class="form-select form-select-sm w-auto">
          ${opt('county', '縣府交通科（可檢核）')}
          ${opt('readonly', '唯讀單位（監理站／區研中心）')}
          <optgroup label="業者（僅自己單位）">
            ${getOperators().map((o) => opt(`operator:${o.id}`, `${o.name}${o.type === 'happybus' ? `（幸福巴士 ${o.happybusVersion}）` : ''}`)).join('')}
          </optgroup>
        </select>
      </label>
      <label class="d-flex align-items-center gap-2">模擬今天
        <input id="tb-today" type="date" class="form-control form-control-sm w-auto" value="${getToday()}">
      </label>
      <button id="tb-real" class="btn btn-sm btn-outline-secondary" title="回到真實日期（${realToday()}）">真實日期</button>
      <button id="tb-reset" class="btn btn-sm btn-outline-danger ms-auto"><i class="bi bi-arrow-counterclockwise"></i> 重設示範資料</button>
    </div>`;
  el.querySelector('#tb-role').addEventListener('change', (e) => { setSession(e.target.value); onChange(); });
  el.querySelector('#tb-today').addEventListener('change', (e) => { setToday(e.target.value); onChange(); });
  el.querySelector('#tb-real').addEventListener('click', () => { setToday(null); onChange(); });
  el.querySelector('#tb-reset').addEventListener('click', async () => {
    if (!confirm('要重設所有示範資料嗎？（業者填報、檢核、備註都會回到初始狀態）')) return;
    await resetDemo();
    setSession('county');
    setToday(null);
    onChange();
  });
}
