// 留言的簡單富文本：純函式，輸入純文字、輸出安全的 HTML（先全部跳脫，再套格式）。
// 支援：**粗體**、*斜體*、`行內程式碼`、```程式碼區塊```、「- 」或「* 」清單、「1. 」編號清單、網址自動成連結、@提及。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** 行內格式。text 已跳脫；mentions＝這則留言提到的名稱（已知的人才會標色）。 */
function inline(text, mentions) {
  const codes = [];
  let s = text.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)）。，]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  for (const name of [...mentions].sort((a, b) => b.length - a.length)) {
    const n = esc(name);
    s = s.split(`@${n}`).join(`<span class="hb-mention">@${n}</span>`);
  }
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function blocks(text, mentions) {
  const out = [];
  let list = null; // { tag, items }
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`); list = null; } };
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  for (const line of text.split('\n')) {
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list?.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(inline((ul ?? ol)[1], mentions));
    } else if (!line.trim()) {
      flush(); flushPara();
    } else {
      flush();
      para.push(inline(line, mentions));
    }
  }
  flush(); flushPara();
  return out.join('');
}

/** 文字 → HTML。 */
export function renderRich(raw, mentions = []) {
  const text = esc(String(raw ?? '').replace(/\r\n?/g, '\n'));
  const parts = text.split('```');
  // 奇數段是程式碼區塊（沒有收尾的 ``` 時，最後一段當一般文字）
  return parts.map((part, i) => {
    const isCode = i % 2 === 1 && i < parts.length - 1;
    if (isCode) return `<pre><code>${part.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>`;
    const prefix = i % 2 === 1 ? '```' : '';
    return blocks(prefix + part, mentions);
  }).join('');
}

/** 一行摘要（月報總覽、引用回覆用）：去掉標記符號。 */
export function plainText(raw) {
  return String(raw ?? '')
    .replace(/```/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ').trim();
}
