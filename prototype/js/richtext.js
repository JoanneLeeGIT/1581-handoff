// 留言顯示：純文字。純函式，輸入純文字、輸出安全的 HTML（先全部跳脫）。
// 不支援粗體、斜體、清單、程式碼等格式，輸入什麼就顯示什麼；
// 只保留：換行、空行分段、網址自動成連結、@提及標色。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** 一行文字。text 已跳脫；mentions＝這則留言提到的名稱（已知的人才會標色）。 */
function inline(text, mentions) {
  let s = text.replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)）。，]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  for (const name of [...mentions].sort((a, b) => b.length - a.length)) {
    const n = esc(name);
    s = s.split(`@${n}`).join(`<span class="hb-mention">@${n}</span>`);
  }
  return s;
}

/** 文字 → HTML。空行分段，段內換行用 <br>。 */
export function renderRich(raw, mentions = []) {
  const text = esc(String(raw ?? '').replace(/\r\n?/g, '\n'));
  return text.split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.split('\n').map((l) => inline(l, mentions)).join('<br>')}</p>`)
    .join('');
}

/** 一行摘要（月報總覽、引用回覆用）：把換行與多餘空白壓成一個空格。 */
export function plainText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}
