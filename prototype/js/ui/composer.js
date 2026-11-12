// 留言編輯器：新增任務與回覆共用。
// 純文字輸入框，不提供任何工具列（無文字格式、無附件、無連結）。
// 在文字中輸入 @ 會跳出成員選單，可標記帳號。
// draft 物件由呼叫端保存（{ text, replyTo }），面板重畫時內容不會不見。
import { esc } from './common.js';
import { plainText } from '../richtext.js';

export const newDraft = (extra = {}) => ({ text: '', replyTo: null, ...extra });

/**
 * 編輯器 HTML。quote：{ author, text } 正在針對哪一則留言回覆；top：上方額外內容（例如留言位置）。
 */
export function composerHtml({ draft, placeholder, submitLabel = '送出', compact = false, cancel = true, quote = null, top = '' }) {
  return `<form class="hb-composer${compact ? ' is-compact' : ''}" novalidate>
    ${top}
    ${quote ? `<div class="hb-quote is-draft"><i class="bi bi-reply"></i><span>回覆 <b>${esc(quote.author)}</b>：${esc(plainText(quote.text).slice(0, 40))}</span>
      <button type="button" class="hb-iconbtn is-xs" data-quote-x aria-label="取消針對這則回覆"><i class="bi bi-x"></i></button></div>` : ''}
    <div class="hb-editor">
      <textarea class="hb-editor-input" rows="${compact ? 2 : 3}" placeholder="${esc(placeholder)}" aria-label="留言內容">${esc(draft.text)}</textarea>
      <ul class="hb-mention-pop" role="listbox" aria-label="選擇要標記的帳號" hidden></ul>
    </div>
    <div class="hb-composer-actions">
      <span class="hb-composer-hint">輸入 @ 標記帳號・Ctrl＋Enter 送出</span>
      ${cancel ? '<button type="button" class="hb-btn hb-btn-sm hb-btn-white" data-cancel>取消</button>' : ''}
      <button type="submit" class="hb-btn hb-btn-sm"><i class="bi bi-send"></i>${submitLabel}</button>
    </div>
  </form>`;
}

/**
 * 綁定編輯器互動。people：可標記的帳號 [{ name, title, role }]。
 * onSubmit(draft) 回傳 true 表示送出成功。onCancel、onQuoteClear 可省略。
 */
export function bindComposer(form, { draft, people = [], onSubmit, onCancel, onQuoteClear }) {
  const ta = form.querySelector('.hb-editor-input');
  const pop = form.querySelector('.hb-mention-pop');

  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 260)}px`; };

  // ---- 輸入 @ 跳出帳號選單 ----
  let matches = [];
  let pick = 0;
  const queryAtCaret = () => ta.value.slice(0, ta.selectionStart).match(/(?:^|\s)@([^\s@]*)$/)?.[1] ?? null;
  const closePop = () => { pop.hidden = true; matches = []; };
  const paintPop = () => {
    pop.innerHTML = matches.map((p, i) => `<li role="option" aria-selected="${i === pick}" data-i="${i}">
      <span class="hb-avatar is-${p.role}" aria-hidden="true">${p.role === 'county' ? '縣' : '業'}</span>
      <b>${esc(p.name)}</b><span>${esc(p.title)}</span></li>`).join('');
    pop.querySelectorAll('li').forEach((li) => li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(Number(li.dataset.i)); }));
  };
  const updatePop = () => {
    const q = queryAtCaret();
    if (q === null) return closePop();
    matches = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (!matches.length) return closePop();
    pick = Math.min(pick, matches.length - 1);
    pop.hidden = false;
    paintPop();
  };
  function choose(i) {
    const p = matches[i];
    if (!p) return;
    const q = queryAtCaret() ?? '';
    const end = ta.selectionStart;
    ta.setRangeText(`@${p.name} `, end - q.length - 1, end, 'end');
    draft.text = ta.value;
    closePop();
    ta.focus();
  }

  ta.addEventListener('input', () => { draft.text = ta.value; autosize(); pick = 0; updatePop(); });
  ta.addEventListener('click', updatePop);
  ta.addEventListener('blur', () => setTimeout(closePop, 120));
  ta.addEventListener('keydown', (e) => {
    if (!pop.hidden && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick = (pick + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; paintPop(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(pick); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
  });

  form.querySelector('[data-cancel]')?.addEventListener('click', () => onCancel?.());
  form.querySelector('[data-quote-x]')?.addEventListener('click', () => onQuoteClear?.());
  form.addEventListener('submit', (e) => { e.preventDefault(); draft.text = ta.value; onSubmit(draft); });

  autosize();
  return { focus: () => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } };
}
