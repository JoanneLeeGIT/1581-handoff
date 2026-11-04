// Export (operator-wise / route-wise Excel) and upload help (FR-011).
// Excel files are produced with SheetJS (cdnjs, pinned in index.html).
import { buildOperatorSheets, buildRouteSheet } from '../export.js';
import { entriesFor, availableMonths, getOperators } from '../store.js';
import { esc, showModal, toast } from './common.js';
import { enhanceSelects } from './select.js';

function xlsxReady() {
  if (!window.XLSX) { toast('Excel 函式庫未載入（需要連線到網際網路）', 'danger'); return false; }
  return true;
}

function sheetFrom(s) {
  const ws = window.XLSX.utils.aoa_to_sheet(s.aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: s.header.length - 1 } }];
  ws['!cols'] = s.header.map((h, i) => ({ wch: i === 0 ? 16 : Math.max(10, Math.min(24, h.length * 1.6)) }));
  return ws;
}

export function openExportDialog() {
  const months = availableMonths();
  if (!months.length) { toast('目前沒有任何月報資料', 'warning'); return; }
  const el = showModal({
    title: '匯出營運概況',
    body: `
      <div class="mb-3"><label class="form-label">月份</label>
        <select id="ex-month" class="hb-select" aria-label="月份">${months.map((m) => `<option>${m}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">格式</label>
        <div class="form-check"><input class="form-check-input" type="radio" name="ex-fmt" id="ex-op" value="operator" checked>
          <label class="form-check-label" for="ex-op">業者別（交通部月報格式：花蓮縣市區汽車客運業營運概況，兩個工作表）</label></div>
        <div class="form-check"><input class="form-check-input" type="radio" name="ex-fmt" id="ex-rt" value="route">
          <label class="form-check-label" for="ex-rt">路線別（完整版，含固定班次與預約班次兩組統計）</label></div></div>
      <div class="mb-3" id="ex-op-wrap" hidden><label class="form-label">業者（路線別）</label>
        <select id="ex-operator" class="hb-select" aria-label="業者"><option value="">全部業者</option>${getOperators().map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></div>
      <div class="small text-muted">只會匯出狀態為「已完成」的月報。</div>`,
    footer: '<button class="btn btn-primary" id="ex-go"><i class="bi bi-download"></i> 匯出</button>',
  });
  enhanceSelects(el);
  const sync = () => { el.querySelector('#ex-op-wrap').hidden = el.querySelector('input[name="ex-fmt"]:checked').value !== 'route'; };
  el.querySelectorAll('input[name="ex-fmt"]').forEach((r) => r.addEventListener('change', sync));
  el.querySelector('#ex-go').onclick = () => {
    if (!xlsxReady()) return;
    const ym = el.querySelector('#ex-month').value;
    const fmt = el.querySelector('input[name="ex-fmt"]:checked').value;
    const entries = entriesFor(ym);
    const wb = window.XLSX.utils.book_new();
    let name;
    if (fmt === 'operator') {
      const { sheet1, sheet2 } = buildOperatorSheets(entries, ym);
      if (sheet1.rows.length <= 1) { toast(`${ym} 沒有已完成的月報可匯出`, 'warning'); return; }
      window.XLSX.utils.book_append_sheet(wb, sheetFrom(sheet1), sheet1.name);
      window.XLSX.utils.book_append_sheet(wb, sheetFrom(sheet2), sheet2.name);
      name = `${ym}_花蓮縣市區汽車客運業營運概況_業者別.xlsx`;
    } else {
      const s = buildRouteSheet(entries, ym, el.querySelector('#ex-operator').value || undefined);
      if (s.rows.length <= 1) { toast(`${ym} 沒有已完成的月報可匯出`, 'warning'); return; }
      window.XLSX.utils.book_append_sheet(wb, sheetFrom(s), s.name);
      name = `${ym}_花蓮縣市區汽車客運業營運概況_路線別.xlsx`;
    }
    window.XLSX.writeFile(wb, name);
    toast(`已匯出 ${name}`);
    el.hide();
  };
}

export function showUploadHelp() {
  showModal({
    title: '填報說明',
    body: `<ul>
      <li>營運月報改為<strong>系統線上填報</strong>，不再上傳檔案，也不提供檔案匯入。</li>
      <li>每月 1 日起開放填報，<strong>每月 10 日為截止日</strong>，11 日起顯示「逾期未繳」，仍可補傳。</li>
      <li>路線、起訖站、月底營業里程、服務模式與車輛情形由系統自動填入；不適用的統計組別（固定班次／預約班次）由系統鎖定。</li>
      <li>延人公里可自行填寫，或選擇系統計算（客運人數 × 月底營業里程 × 0.35，公式待縣府確認）。</li>
      <li>送出後進入「檢核中」，縣府標為「待更新」時請依任務留言更正後重新送出。</li>
      <li>已完成的月份若發現錯誤，可在檢視頁按「申請變更」直接修改後送出（存成新版本）；縣府可駁回（維持原資料）、退回待更新或同意更正。</li></ul>`,
  });
}
