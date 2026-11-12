// 任務留言板（取代檔案備註／檢核備註）：像 Word／Figma 的註解，標在表格的格子或整列上。
// - 右側面板：未解決／已解決（封存）／提及我 三個分頁；每則任務可回覆，也可針對串裡某一則留言回覆。
// - 留言為純文字，可輸入 @ 標記帳號、表情符號回應；不提供附件或連結工具（見 composer.js、../richtext.js）。
// - 縣府可標為已解決、重新開啟。
// - 表格上：有留言的格子右上角出現小三角（未解決＝橘、已解決＝灰），點一下開啟該任務。
// 檢視頁與填報頁共用；只重畫自己和格子標記，不會讓表格捲動位置跑掉。
import { getReport, addThread, replyToThread, setThreadState, reactToMessage, mentionPeople, myMentionName, userName, lastSaveOk } from '../store.js';
import { threadsOf, openThreads, resolvedThreads, threadsMentioning, comments, canComment, canResolve, REACTIONS } from '../threads.js';
import { renderRich, plainText } from '../richtext.js';
import { anchorLabel } from './fields.js';
import { esc, fmtDate, toast } from './common.js';
import { composerHtml, bindComposer, newDraft } from './composer.js';

const PANEL_KEY = 'huabus-threads-open';
/** 換頁重畫時保留分頁、選取中的任務與還沒送出的草稿（同一份月報）。 */
const memo = new Map();

export function threadPanelOpen() {
  try { return localStorage.getItem(PANEL_KEY) !== '0'; } catch { return true; }
}
function savePanelOpen(open) {
  try { localStorage.setItem(PANEL_KEY, open ? '1' : '0'); } catch { /* ignore */ }
}

/** 頁首的「任務留言」開關按鈕（數字＝未解決則數，由 onCount 更新）。 */
export const threadToggle = (open) =>
  `<button type="button" class="hb-btn hb-btn-sm hb-btn-white" data-threads-toggle aria-expanded="${open}" aria-controls="threads">
    <i class="bi bi-chat-left-text"></i>任務留言<span class="hb-count" data-threads-count hidden>0</span></button>`;

const ROLE_TAG = { county: '縣府', operator: '業者' };
const avatar = (m) => `<span class="hb-avatar is-${m.role}" aria-hidden="true">${m.role === 'county' ? '縣' : '業'}</span>`;

/**
 * host：面板容器；sheets：.report-sheets（加標記、點選格子用）。
 * 回傳 { setOpen(bool), isOpen(), refresh() }。onCount(openCount) 在數量變動時呼叫（頁首按鈕、檢核列用）。
 */
export function mountThreadBoard({ host, sheets, operator, yearMonth, session, onCount = () => {} }) {
  const key = `${operator.id}|${yearMonth}`;
  const st = memo.get(key) ?? { tab: 'open', active: null, draft: null, replies: {}, picking: false, picker: null };
  memo.set(key, st);
  const ctx = { operatorId: operator.id, ownOperatorId: session.operatorId };
  const mayComment = canComment(session.role, ctx);
  const mayResolve = canResolve(session.role);
  const me = userName(session);
  const myName = myMentionName(session);
  const people = mentionPeople(operator.id);

  const report = () => getReport(operator.id, yearMonth);
  const cellOf = (path) => (path ? sheets.querySelector(`[data-anchor="${CSS.escape(path)}"]`) : null);
  const mentionsMe = (t) => Boolean(myName) && comments(t).some((m) => m.mentions?.includes(myName));
  const listFor = (tab) => (tab === 'open' ? openThreads : tab === 'resolved' ? resolvedThreads : (r) => (myName ? threadsMentioning(r, myName) : []))(report());

  // ---------- 表格上的標記 ----------
  function paintMarkers() {
    sheets.querySelectorAll('.hb-pin').forEach((p) => p.remove());
    sheets.querySelectorAll('.has-thread, .is-thread-active, .is-thread-resolved').forEach((c) => c.classList.remove('has-thread', 'is-thread-active', 'is-thread-resolved'));
    const byPath = new Map();
    for (const t of listFor(st.tab)) if (t.anchor?.path) byPath.set(t.anchor.path, [...(byPath.get(t.anchor.path) ?? []), t]);
    for (const [path, ts] of byPath) {
      const cell = cellOf(path);
      if (!cell) continue;
      const allResolved = ts.every((t) => t.status === 'resolved');
      cell.classList.add('has-thread');
      if (allResolved) cell.classList.add('is-thread-resolved');
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'hb-pin';
      pin.dataset.thread = ts[0].id;
      pin.title = `${anchorLabel(path)}：${ts.length} 則${allResolved ? '已解決' : '未解決'}留言`;
      pin.setAttribute('aria-label', pin.title);
      cell.appendChild(pin);
    }
    const activePath = st.draft ? st.draft.path : threadsOf(report()).find((t) => t.id === st.active)?.anchor?.path;
    cellOf(activePath)?.classList.add('is-thread-active');
  }

  // ---------- 一則留言 ----------
  function messageHtml(t, m, { full }) {
    if (m.kind !== 'comment') {
      const resolved = m.kind === 'resolved';
      return `<li class="hb-thread-event"><i class="bi ${resolved ? 'bi-check2-circle' : 'bi-arrow-counterclockwise'}"></i>
        <span>${esc(m.author)} ${resolved ? '標為已解決' : '重新開啟'}・${fmtDate(m.at)}</span></li>`;
    }
    const open = t.status === 'open';
    const interactive = full && open && mayComment;
    const target = m.replyTo ? t.messages.find((x) => x.id === m.replyTo) : null;
    const quote = target ? `<button type="button" class="hb-quote" data-jump="${esc(target.id)}" title="跳到被回覆的留言"><i class="bi bi-reply"></i><span><b>${esc(target.author)}</b>：${esc(plainText(target.text).slice(0, 40))}</span></button>` : '';
    const reactions = Object.entries(m.reactions ?? {}).filter(([, who]) => who.length);
    const pills = reactions.map(([emo, who]) => `<button type="button" class="hb-react${who.includes(me) ? ' is-mine' : ''}" data-react="${emo}" data-mid="${esc(m.id)}"
      title="${esc(who.join('、'))}" aria-label="${emo} ${who.length} 人：${esc(who.join('、'))}"${open && mayComment ? '' : ' disabled'}>${emo}<span>${who.length}</span></button>`).join('');
    const picker = st.picker === m.id
      ? `<div class="hb-react-pick" role="menu">${REACTIONS.map((e) => `<button type="button" role="menuitem" data-react="${e}" data-mid="${esc(m.id)}" aria-label="回應 ${e}">${e}</button>`).join('')}</div>` : '';
    const actions = interactive
      ? `<div class="hb-msg-actions">
          <button type="button" class="hb-iconbtn is-xs" data-picker="${esc(m.id)}" title="表情回應" aria-label="表情回應" aria-expanded="${st.picker === m.id}"><i class="bi bi-emoji-smile"></i></button>
          <button type="button" class="hb-iconbtn is-xs" data-reply-to="${esc(m.id)}" title="針對這則回覆" aria-label="針對這則回覆"><i class="bi bi-reply"></i></button>
        </div>` : '';
    const mine = myName && m.mentions?.includes(myName);
    return `<li class="hb-thread-msg${mine ? ' is-mentioned' : ''}" id="msg-${esc(m.id)}">
      <div class="hb-thread-meta">${avatar(m)}<b>${esc(m.author)}</b><span class="hb-role is-${m.role}">${ROLE_TAG[m.role] ?? ''}</span><time>${fmtDate(m.at)}</time>${actions}</div>
      <div class="hb-thread-body">${quote}${m.text ? `<div class="hb-rich${full ? '' : ' is-clamped'}">${renderRich(m.text, m.mentions ?? [])}</div>` : ''}
        ${pills || picker ? `<div class="hb-reacts">${pills}${picker}</div>` : ''}</div>
    </li>`;
  }

  // ---------- 一則任務 ----------
  function cardHtml(t) {
    const open = t.status === 'open';
    const isActive = t.id === st.active;
    const cs = comments(t);
    const anchor = t.anchor?.path
      ? `<button type="button" class="hb-anchor" data-goto="${esc(t.id)}" title="在表格中顯示"><i class="bi bi-geo-alt"></i>${esc(anchorLabel(t.anchor.path))}</button>`
      : `<span class="hb-anchor is-general"><i class="bi bi-file-earmark-text"></i>整份月報</span>`;
    const resolveBtn = mayResolve && open
      ? `<button type="button" class="hb-iconbtn" data-resolve="${esc(t.id)}" title="標為已解決" aria-label="標為已解決"><i class="bi bi-check2-circle"></i></button>` : '';
    const reopenBtn = mayResolve && !open
      ? `<button type="button" class="hb-btn hb-btn-sm hb-btn-white" data-reopen="${esc(t.id)}"><i class="bi bi-arrow-counterclockwise"></i>重新開啟</button>` : '';
    const badges = [
      mentionsMe(t) ? '<span class="hb-badge is-mention">@提及你</span>' : '',
      st.tab === 'mine' && !open ? '<span class="hb-badge">已解決</span>' : '',
    ].join('');
    const body = isActive
      ? `<ol class="hb-thread-msgs">${t.messages.map((m) => messageHtml(t, m, { full: true })).join('')}</ol>`
      : `<ol class="hb-thread-msgs">${cs[0] ? messageHtml(t, cs[0], { full: false }) : ''}</ol>${cs.length > 1 ? `<div class="hb-thread-more">${cs.length - 1} 則回覆・最新 ${fmtDate(cs.at(-1).at)}</div>` : ''}`;
    let reply = '';
    if (isActive && open && mayComment) {
      const d = (st.replies[t.id] ??= newDraft());
      const q = d.replyTo ? t.messages.find((m) => m.id === d.replyTo) : null;
      reply = `<div class="hb-reply" data-reply="${esc(t.id)}">${composerHtml({ draft: d, placeholder: '回覆…（輸入 @ 提及成員）', submitLabel: '回覆', compact: true, cancel: false, quote: q })}</div>`;
    }
    const foot = [
      t.versionNo ? `於第 ${t.versionNo} 版提出` : '',
      !open && t.resolvedAt ? `${esc(t.resolvedBy ?? '')} ${fmtDate(t.resolvedAt)} 標為已解決` : '',
    ].filter(Boolean).join('｜');
    return `<li class="hb-thread${isActive ? ' is-active' : ''}${open ? '' : ' is-resolved'}" id="thread-${esc(t.id)}" data-id="${esc(t.id)}" tabindex="0">
      <div class="hb-thread-top">${anchor}${badges}${resolveBtn}</div>
      ${body}${reply}
      ${foot || reopenBtn ? `<div class="hb-thread-foot"><span>${foot}</span>${reopenBtn}</div>` : ''}
    </li>`;
  }

  function render() {
    const rep = report();
    const open = openThreads(rep);
    const done = resolvedThreads(rep);
    const mine = myName ? threadsMentioning(rep, myName) : [];
    if (st.tab === 'mine' && !myName) st.tab = 'open';
    const list = listFor(st.tab).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const empty = {
      open: mayComment ? '目前沒有未解決的留言。<br>按「新增留言」後點表格中的格子，就能針對那一格留言。' : '目前沒有未解決的留言。',
      resolved: '沒有已解決的留言。',
      mine: '還沒有人在留言中 @ 你。',
    }[st.tab];
    const mineOpen = mine.filter((t) => t.status === 'open').length;
    const draftTop = st.draft
      ? `<div class="hb-thread-top"><span class="hb-anchor${st.draft.path ? '' : ' is-general'}"><i class="bi ${st.draft.path ? 'bi-geo-alt' : 'bi-file-earmark-text'}"></i>${esc(anchorLabel(st.draft.path))}</span></div>` : '';
    host.innerHTML = `
      <div class="hb-threads-head">
        <h2 class="hb-subtitle">任務留言</h2>
        ${mayComment ? `<button type="button" class="hb-btn hb-btn-sm${st.picking ? ' is-on' : ''}" id="thr-new" aria-pressed="${st.picking}"><i class="bi bi-chat-left-dots"></i>新增留言</button>` : ''}
        <button type="button" class="hb-iconbtn" id="thr-close" title="收合留言面板" aria-label="收合留言面板"><i class="bi bi-layout-sidebar-inset-reverse"></i></button>
      </div>
      <div class="hb-seg" role="tablist" aria-label="留言分類">
        <button type="button" role="tab" data-tab="open" aria-selected="${st.tab === 'open'}">未解決<span class="hb-count">${open.length}</span></button>
        <button type="button" role="tab" data-tab="resolved" aria-selected="${st.tab === 'resolved'}">已解決<span class="hb-count is-muted">${done.length}</span></button>
        ${myName ? `<button type="button" role="tab" data-tab="mine" aria-selected="${st.tab === 'mine'}">提及我${mineOpen ? `<span class="hb-count">${mineOpen}</span>` : ''}</button>` : ''}
      </div>
      ${st.picking ? `<div class="hb-pickhint"><i class="bi bi-cursor"></i><div>點選表格中要留言的格子或路線列<div class="hb-pickhint-alt">或 <button type="button" class="hb-linkbtn" id="thr-general">針對整份月報留言</button>・<button type="button" class="hb-linkbtn" id="thr-cancel">取消</button></div></div></div>` : ''}
      ${st.draft ? `<div id="thr-composer">${composerHtml({ draft: st.draft, top: draftTop, submitLabel: '送出留言',
        placeholder: session.role === 'county' ? '說明需要業者確認或更正的地方，輸入 @ 可提及成員' : '說明這格的情況，輸入 @ 可提及縣府承辦' })}</div>` : ''}
      ${list.length ? `<ol class="hb-threads-list">${list.map(cardHtml).join('')}</ol>` : `<p class="hb-threads-empty">${empty}</p>`}`;
    sheets.classList.toggle('is-picking', st.picking);
    paintMarkers();
    onCount(open.length);
    bindPanel();
  }

  function startDraft(path) {
    st.picking = false;
    st.draft = newDraft({ path });
    st.active = null;
    st.tab = 'open';
    render();
    host.querySelector('#thr-composer textarea')?.focus();
  }

  function activate(id, { scrollCell = true, scrollCard = true } = {}) {
    const t = threadsOf(report()).find((x) => x.id === id);
    if (!t) return;
    st.active = id;
    st.draft = null;
    st.picker = null;
    if (st.tab !== 'mine' || !mentionsMe(t)) st.tab = t.status === 'open' ? 'open' : 'resolved';
    setOpen(true);
    render();
    if (scrollCard) host.querySelector(`#thread-${CSS.escape(id)}`)?.scrollIntoView({ block: 'nearest' });
    const cell = cellOf(t.anchor?.path);
    if (scrollCell && cell) {
      cell.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      cell.classList.remove('is-flash'); void cell.offsetWidth; cell.classList.add('is-flash');
    }
  }

  const warn = (text) => toast(text, 'warning');
  const fail = (res) => warn(res.error === 'empty' ? '請輸入留言內容' : res.error === 'not allowed' ? '沒有權限' : `無法儲存：${res.error}`);
  /** 送出後：有 @ 人時提示已通知（原型只在系統內標示，不寄信）。 */
  function afterSave(msg, okText) {
    if (!lastSaveOk()) warn('已送出，但瀏覽器存不下，重新整理後這則留言會不見。');
    else toast(msg.mentions?.length ? `${okText}，已通知 ${msg.mentions.map((n) => `@${n}`).join('、')}` : okText);
  }

  function bindPanel() {
    host.querySelector('#thr-new')?.addEventListener('click', () => { st.picking = !st.picking; st.draft = null; render(); });
    host.querySelector('#thr-cancel')?.addEventListener('click', () => { st.picking = false; render(); });
    host.querySelector('#thr-general')?.addEventListener('click', () => startDraft(null));
    host.querySelector('#thr-close').addEventListener('click', () => setOpen(false));
    host.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.active = null; st.picker = null; render(); }));

    const newForm = host.querySelector('#thr-composer form');
    if (newForm) {
      bindComposer(newForm, {
        draft: st.draft, people,
        onCancel: () => { st.draft = null; render(); },
        onSubmit: (d) => {
          const res = addThread(operator.id, yearMonth, { anchor: d.path ? { path: d.path } : null, text: d.text }, session);
          if (!res.ok) return fail(res);
          st.draft = null;
          st.active = res.thread.id;
          afterSave(res.thread.messages[0], '已新增留言');
          render();
        },
      });
    }

    host.querySelectorAll('[data-reply]').forEach((wrap) => {
      const id = wrap.dataset.reply;
      const d = st.replies[id];
      const c = bindComposer(wrap.querySelector('form'), {
        draft: d, people,
        onQuoteClear: () => { d.replyTo = null; render(); },
        onSubmit: () => {
          const res = replyToThread(operator.id, yearMonth, id, { text: d.text, replyTo: d.replyTo }, session);
          if (!res.ok) return fail(res);
          st.replies[id] = newDraft();
          afterSave(res.thread.messages.at(-1), '已回覆');
          render();
          host.querySelector(`[data-reply="${CSS.escape(id)}"] textarea`)?.focus();
        },
      });
      if (st.focusReply === id) { st.focusReply = null; c.focus(); }
    });

    host.querySelectorAll('.hb-thread').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button, form, a, .hb-reply')) return;
        if (st.active !== card.dataset.id) activate(card.dataset.id, { scrollCard: false });
      });
      card.addEventListener('keydown', (e) => {
        if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(card.dataset.id, { scrollCard: false }); }
      });
    });
    host.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => activate(b.dataset.goto, { scrollCard: false })));
    host.querySelectorAll('[data-resolve], [data-reopen]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.resolve ?? b.dataset.reopen;
      const res = setThreadState(operator.id, yearMonth, id, b.dataset.resolve ? 'resolved' : 'open', session);
      if (!res.ok) return fail(res);
      toast(b.dataset.resolve ? '已標為已解決，可在「已解決」分頁查看' : '已重新開啟');
      if (b.dataset.resolve) st.active = null; else { st.tab = 'open'; st.active = id; }
      render();
    }));

    // 表情回應
    host.querySelectorAll('[data-picker]').forEach((b) => b.addEventListener('click', () => { st.picker = st.picker === b.dataset.picker ? null : b.dataset.picker; render(); }));
    host.querySelectorAll('[data-react]').forEach((b) => b.addEventListener('click', () => {
      const card = b.closest('.hb-thread');
      const res = reactToMessage(operator.id, yearMonth, card.dataset.id, b.dataset.mid, b.dataset.react, session);
      if (!res.ok) return fail(res);
      st.picker = null;
      render();
    }));
    // 針對某一則留言回覆
    host.querySelectorAll('[data-reply-to]').forEach((b) => b.addEventListener('click', () => {
      const id = b.closest('.hb-thread').dataset.id;
      (st.replies[id] ??= newDraft()).replyTo = b.dataset.replyTo;
      st.focusReply = id;
      render();
    }));
    host.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
      const el = host.querySelector(`#msg-${CSS.escape(b.dataset.jump)}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el?.classList.remove('is-flash'); void el?.offsetWidth; el?.classList.add('is-flash');
    }));
  }

  // ---------- 表格互動：選格子留言、點標記開啟任務 ----------
  const anchorFrom = (target) => target.closest('[data-anchor]') ?? target.closest('tr')?.querySelector('th[data-anchor]') ?? null;

  sheets.addEventListener('click', (e) => {
    if (st.picking) {
      const cell = anchorFrom(e.target);
      if (!cell || !sheets.contains(cell)) return;
      e.preventDefault();
      e.stopPropagation();
      startDraft(cell.dataset.anchor);
      return;
    }
    const pin = e.target.closest('.hb-pin');
    const cell = pin ? null : e.target.closest('.has-thread');
    // 填報頁的格子本身要能輸入，只有點小三角才開啟留言；檢視頁點整格即可
    if (pin) { e.preventDefault(); e.stopPropagation(); activate(pin.dataset.thread, { scrollCell: false }); return; }
    if (cell && !cell.querySelector('input')) activate(cell.querySelector('.hb-pin')?.dataset.thread, { scrollCell: false });
  }, true);
  // 選格子時，滑鼠按下就攔下來，避免游標跑進輸入框
  sheets.addEventListener('mousedown', (e) => { if (st.picking && anchorFrom(e.target)) e.preventDefault(); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.body.contains(host)) return;
    if (st.picker) { st.picker = null; render(); } else if (st.picking) { st.picking = false; render(); }
  });

  // ---------- 面板開關 ----------
  const shell = host.closest('.rpt-body');
  function setOpen(open) {
    shell?.classList.toggle('is-threads-open', open);
    host.hidden = !open;
    savePanelOpen(open);
    document.querySelectorAll('[data-threads-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
    if (!open && st.picking) { st.picking = false; render(); }
  }
  const isOpen = () => !host.hidden;

  setOpen(threadPanelOpen());
  render();

  // 從月報總覽的連結進來：#threads 開啟面板，#thread-<id> 直接開該則任務
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'threads') { setOpen(true); host.scrollIntoView({ block: 'start' }); }
  else if (hash.startsWith('thread-')) activate(hash.slice(7));

  return { setOpen, isOpen, refresh: render };
}
