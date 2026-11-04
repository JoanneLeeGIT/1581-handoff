// 留言編輯器：新增任務與回覆共用。
// 格式工具列（粗體、斜體、清單、編號、程式碼）、@ 提及選單、附件（圖片／PDF／文件）、雲端連結。
// draft 物件由呼叫端保存（{ text, attachments, replyTo, linkOpen }），面板重畫時內容不會不見。
import { esc } from './common.js';
import { plainText } from '../richtext.js';

const MAX_FILE = 1.5 * 1024 * 1024; // 原型存在瀏覽器裡，單檔 1.5 MB 為上限
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ods,.odt,.csv,.zip';

export const newDraft = (extra = {}) => ({ text: '', attachments: [], replyTo: null, linkOpen: false, ...extra });

export const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** 附件的圖示（依類型）。 */
export function attIcon(a) {
  if (a.kind === 'link') return /drive\.google|docs\.google/.test(a.url) ? 'bi-google' : /figma\.com/.test(a.url) ? 'bi-vector-pen' : 'bi-link-45deg';
  if (a.type?.startsWith('image/')) return 'bi-file-earmark-image';
  if (a.type === 'application/pdf' || /\.pdf$/i.test(a.name)) return 'bi-file-earmark-pdf';
  if (/\.(xlsx?|ods|csv)$/i.test(a.name)) return 'bi-file-earmark-spreadsheet';
  if (/\.(docx?|odt)$/i.test(a.name)) return 'bi-file-earmark-word';
  return 'bi-file-earmark';
}

const TOOLS = [
  { act: 'bold', icon: 'bi-type-bold', label: '粗體（Ctrl＋B）' },
  { act: 'italic', icon: 'bi-type-italic', label: '斜體（Ctrl＋I）' },
  { sep: true },
  { act: 'ul', icon: 'bi-list-ul', label: '項目清單' },
  { act: 'ol', icon: 'bi-list-ol', label: '編號清單' },
  { act: 'code', icon: 'bi-code-slash', label: '程式碼' },
  { sep: true },
  { act: 'mention', icon: 'bi-at', label: '提及成員（輸入 @）' },
  { act: 'file', icon: 'bi-paperclip', label: '附加檔案（圖片、PDF、文件）' },
  { act: 'link', icon: 'bi-link-45deg', label: '附加雲端硬碟或設計稿連結' },
];

/**
 * 編輯器 HTML。quote：{ author, text } 正在針對哪一則留言回覆；top：上方額外內容（例如留言位置）。
 */
export function composerHtml({ draft, placeholder, submitLabel = '送出', compact = false, cancel = true, quote = null, top = '' }) {
  const tools = TOOLS.map((t) => (t.sep ? '<span class="hb-tool-sep" aria-hidden="true"></span>'
    : `<button type="button" class="hb-tool" data-tool="${t.act}" title="${t.label}" aria-label="${t.label}"><i class="bi ${t.icon}"></i></button>`)).join('');
  return `<form class="hb-composer${compact ? ' is-compact' : ''}" novalidate>
    ${top}
    ${quote ? `<div class="hb-quote is-draft"><i class="bi bi-reply"></i><span>回覆 <b>${esc(quote.author)}</b>：${esc(plainText(quote.text).slice(0, 40))}</span>
      <button type="button" class="hb-iconbtn is-xs" data-quote-x aria-label="取消針對這則回覆"><i class="bi bi-x"></i></button></div>` : ''}
    <div class="hb-editor">
      <div class="hb-toolbar" role="toolbar" aria-label="留言格式">${tools}</div>
      <textarea class="hb-editor-input" rows="${compact ? 2 : 3}" placeholder="${esc(placeholder)}" aria-label="留言內容">${esc(draft.text)}</textarea>
      <ul class="hb-mention-pop" role="listbox" aria-label="選擇要提及的成員" hidden></ul>
    </div>
    <div class="hb-linkrow"${draft.linkOpen ? '' : ' hidden'}>
      <input class="hb-input" type="url" placeholder="貼上雲端硬碟、Figma 等連結 https://…" aria-label="連結網址">
      <input class="hb-input hb-linkrow-name" type="text" placeholder="顯示名稱（選填）" aria-label="連結名稱">
      <button type="button" class="hb-btn hb-btn-sm hb-btn-white" data-link-add>加入</button>
    </div>
    <ul class="hb-att-pending"></ul>
    <div class="hb-composer-actions">
      <span class="hb-composer-hint">Ctrl＋Enter 送出</span>
      ${cancel ? '<button type="button" class="hb-btn hb-btn-sm hb-btn-white" data-cancel>取消</button>' : ''}
      <button type="submit" class="hb-btn hb-btn-sm"><i class="bi bi-send"></i>${submitLabel}</button>
    </div>
    <input type="file" class="visually-hidden" multiple accept="${ACCEPT}" tabindex="-1" aria-hidden="true">
  </form>`;
}

// ---------- 文字操作 ----------
function wrap(ta, before, after, sample) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e) || sample;
  ta.setRangeText(`${before}${sel}${after}`, s, e, 'end');
  ta.setSelectionRange(s + before.length, s + before.length + sel.length);
}

function prefixLines(ta, numbered) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  const endIdx = v.indexOf('\n', e);
  const end = endIdx < 0 ? v.length : endIdx;
  const lines = v.slice(start, end).split('\n');
  const out = lines.map((l, i) => `${numbered ? `${i + 1}. ` : '- '}${l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')}`).join('\n');
  ta.setRangeText(out, start, end, 'end');
}

function applyTool(ta, act) {
  ta.focus();
  if (act === 'bold') wrap(ta, '**', '**', '粗體文字');
  else if (act === 'italic') wrap(ta, '*', '*', '斜體文字');
  else if (act === 'ul') prefixLines(ta, false);
  else if (act === 'ol') prefixLines(ta, true);
  else if (act === 'code') {
    const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n');
    if (multi) wrap(ta, '```\n', '\n```', ''); else wrap(ta, '`', '`', '程式碼');
  } else if (act === 'mention') {
    const before = ta.value.slice(0, ta.selectionStart);
    ta.setRangeText(/(^|\s)$/.test(before) ? '@' : ' @', ta.selectionStart, ta.selectionEnd, 'end');
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 綁定編輯器互動。people：可提及的成員 [{ name, title, role }]。
 * onSubmit(draft) 回傳 true 表示送出成功。onCancel、onQuoteClear 可省略。
 */
export function bindComposer(form, { draft, people = [], onSubmit, onCancel, onQuoteClear, onError = () => {} }) {
  const ta = form.querySelector('.hb-editor-input');
  const pop = form.querySelector('.hb-mention-pop');
  const fileIn = form.querySelector('input[type="file"]');
  const linkRow = form.querySelector('.hb-linkrow');
  const pending = form.querySelector('.hb-att-pending');

  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 260)}px`; };

  const paintPending = () => {
    pending.innerHTML = draft.attachments.map((a, i) => `<li class="hb-att is-pending">
      ${a.kind === 'file' && a.type?.startsWith('image/') ? `<img src="${esc(a.url)}" alt="">` : `<i class="bi ${attIcon(a)}"></i>`}
      <span class="hb-att-name">${esc(a.name)}</span>${a.size ? `<span class="hb-att-size">${fmtSize(a.size)}</span>` : ''}
      <button type="button" class="hb-iconbtn is-xs" data-rm="${i}" aria-label="移除 ${esc(a.name)}"><i class="bi bi-x"></i></button></li>`).join('');
    pending.hidden = !draft.attachments.length;
    pending.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { draft.attachments.splice(Number(b.dataset.rm), 1); paintPending(); }));
  };

  // ---- @ 提及選單 ----
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); applyTool(ta, e.key === 'b' ? 'bold' : 'italic'); }
  });

  // ---- 工具列 ----
  form.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.tool;
    if (act === 'file') { fileIn.click(); return; }
    if (act === 'link') {
      draft.linkOpen = linkRow.hidden;
      linkRow.hidden = !draft.linkOpen;
      if (draft.linkOpen) linkRow.querySelector('input').focus();
      return;
    }
    applyTool(ta, act);
    if (act === 'mention') updatePop();
  }));

  // ---- 附件 ----
  fileIn.addEventListener('change', () => {
    for (const f of fileIn.files) {
      if (f.size > MAX_FILE) { onError(`「${f.name}」超過 ${fmtSize(MAX_FILE)}，原型只能放小檔案；大檔請改用雲端連結。`); continue; }
      const reader = new FileReader();
      reader.onload = () => { draft.attachments.push({ kind: 'file', name: f.name, type: f.type, size: f.size, url: reader.result }); paintPending(); };
      reader.readAsDataURL(f);
    }
    fileIn.value = '';
  });
  // 也可以直接把圖片貼進來
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    fileIn.files = dt.files;
    fileIn.dispatchEvent(new Event('change'));
  });

  const addLink = () => {
    const [urlIn, nameIn] = linkRow.querySelectorAll('input');
    const url = urlIn.value.trim();
    if (!/^https?:\/\/\S+$/.test(url)) { onError('請貼上 http:// 或 https:// 開頭的連結'); urlIn.focus(); return; }
    let name = nameIn.value.trim();
    if (!name) { try { name = new URL(url).hostname; } catch { name = url; } }
    draft.attachments.push({ kind: 'link', name, url });
    urlIn.value = ''; nameIn.value = '';
    draft.linkOpen = false; linkRow.hidden = true;
    paintPending();
    ta.focus();
  };
  linkRow.querySelector('[data-link-add]').addEventListener('click', addLink);
  linkRow.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });

  form.querySelector('[data-cancel]')?.addEventListener('click', () => onCancel?.());
  form.querySelector('[data-quote-x]')?.addEventListener('click', () => onQuoteClear?.());
  form.addEventListener('submit', (e) => { e.preventDefault(); draft.text = ta.value; onSubmit(draft); });

  paintPending();
  autosize();
  return { focus: () => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } };
}
