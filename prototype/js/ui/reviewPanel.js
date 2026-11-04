// 檢核狀態列（US2）：放在檢視頁上方、表格之前。顯示目前狀態要做什麼，縣府的檢核動作也在這裡
// （退回待更新／檢核完成；變更申請：駁回／退回待更新／同意更正，FR-008, FR-018）。給業者的說明改用任務留言板（threadBoard.js）。
import { reviewAction } from '../store.js';
import { openThreads } from '../threads.js';
import { STATUS } from '../status.js';
import { toast, esc, fmtDate, msg } from './common.js';

const KIND = { reviewing: 'info', needsUpdate: 'warn', completed: 'success', changeRequested: 'warn' };

function statusText(session, status, report, openCount) {
  const open = openCount ? `目前有 <strong>${openCount}</strong> 則未解決留言。` : '';
  const pending = report?.changeRequests?.find((c) => c.outcome === 'pending');
  if (session.role === 'county') {
    switch (status) {
      case 'reviewing': return `業者已送出第 ${report.currentVersion} 版，請檢核。有問題的格子可直接在表格上留言。${open}`;
      case 'needsUpdate': return `已退回「待更新」，等待業者更正後重新送出。${open}`;
      case 'completed': return '此月份已檢核完成。';
      case 'changeRequested': return pending
        ? `業者已直接修改並送出變更（第 ${pending.versionNo} 版，原為第 ${pending.baseVersion} 版，${fmtDate(pending.updatedAt ?? pending.requestedAt)}）：<strong>${esc(pending.reason)}</strong><br>標色的格子是與第 ${pending.baseVersion} 版不同之處。`
        : '業者申請變更。';
      default: return '此月份尚未送出資料，不能檢核。';
    }
  }
  if (session.role === 'operator') {
    switch (status) {
      case 'reviewing': return `已送出，縣府檢核中。${open}`;
      case 'needsUpdate': return `縣府已退回，請依留言更正後重新送出。${open}`;
      case 'completed': return '此月份已檢核完成。資料有誤可按右上「申請變更」直接修改後送出。';
      case 'changeRequested': return pending
        ? `已送出變更（第 ${pending.versionNo} 版），等待縣府處理；縣府同意前，仍以第 ${pending.baseVersion} 版為準。`
        : '已提出變更申請，等待縣府處理。';
      default: return `目前狀態：${STATUS[status]}`;
    }
  }
  return `目前狀態：${STATUS[status]}。${open}`;
}

/** 縣府可做的動作；confirm 表示按下後先在狀態列展開確認區。 */
function actionsFor(session, status) {
  if (session.role !== 'county') return [];
  if (status === 'reviewing') return [
    { act: 'markNeedsUpdate', label: '退回待更新', icon: 'bi-exclamation-circle', white: true },
    { act: 'markCompleted', label: '檢核完成', icon: 'bi-check-circle' },
  ];
  if (status === 'changeRequested') return [
    { act: 'reject', label: '駁回，維持已完成', icon: 'bi-x-circle', white: true },
    { act: 'reopen', label: '退回待更新', icon: 'bi-arrow-counterclockwise', white: true },
    { act: 'approve', label: '同意更正', icon: 'bi-check-circle' },
  ];
  return [];
}

export function renderReviewBar(el, { operator, yearMonth, session, status, report, onDone }) {
  const openCount = openThreads(report).length;
  const actions = actionsFor(session, status);
  const btns = actions.map((a) => `<button type="button" class="hb-btn hb-btn-sm${a.white ? ' hb-btn-white' : ''}" data-act="${a.act}"><i class="bi ${a.icon}"></i>${a.label}</button>`).join('');
  el.innerHTML = `<div class="rpt-reviewbar">
    ${msg(statusText(session, status, report, openCount), KIND[status] ?? 'info', btns ? `<div class="rpt-reviewbar-actions">${btns}</div>` : '')}
    <div id="rv-confirm"></div></div>`;

  const box = el.querySelector('#rv-confirm');
  const run = (act, note, opts) => {
    const res = reviewAction(operator.id, yearMonth, act, note, session, opts);
    if (!res.ok) {
      box.querySelector('.rv-err').innerHTML = msg(res.error === 'note is required'
        ? '退回「待更新」需要說明原因：請填寫說明，或先在表格上留言標出問題。' : `無法執行：${esc(res.error)}`, 'danger');
      return;
    }
    toast('已更新狀態');
    onDone();
  };

  // 展開確認區：說明欄＋按鈕。說明會成為一則「整份月報」的留言。
  const confirmBox = ({ title, hint, note = true, buttons }) => {
    box.innerHTML = `<div class="rpt-confirm hb-box">
      <h3 class="hb-subtitle">${title}</h3>
      ${hint ? `<p class="rpt-confirm-hint">${hint}</p>` : ''}
      ${note ? '<div><label class="hb-label" for="rv-note">給業者的說明</label><textarea class="hb-textarea" id="rv-note" rows="2"></textarea></div>' : ''}
      <div class="rv-err"></div>
      <div class="rpt-actions"><button type="button" class="hb-btn hb-btn-white" data-x>取消</button>${buttons}</div></div>`;
    box.querySelector('[data-x]').onclick = () => { box.innerHTML = ''; };
    box.querySelector('#rv-note')?.focus();
    return (sel, fn) => { box.querySelector(sel).onclick = () => fn(box.querySelector('#rv-note')?.value ?? ''); };
  };

  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'markNeedsUpdate') {
        const countyOpen = openThreads(report).filter((t) => t.messages[0]?.role === 'county').length;
        const on = confirmBox({
          title: '退回待更新',
          hint: countyOpen ? `你開的 ${countyOpen} 則未解決留言會一併讓業者看到；說明可不填。` : '請說明需要業者更正的地方（必填），或先取消、在表格上針對格子留言。',
          buttons: '<button type="button" class="hb-btn" id="rv-go"><i class="bi bi-exclamation-circle"></i>確認退回</button>',
        });
        on('#rv-go', (note) => run(act, note));
      } else if (act === 'markCompleted') {
        if (!openCount) { run(act, ''); return; }
        const on = confirmBox({
          title: '檢核完成',
          hint: `還有 ${openCount} 則未解決留言。可以一併標為已解決（之後仍可在「已解決」分頁重新開啟），或保留不動。`,
          note: false,
          buttons: '<button type="button" class="hb-btn hb-btn-white" id="rv-keep">保留留言，標為已完成</button><button type="button" class="hb-btn" id="rv-all"><i class="bi bi-check2-all"></i>全部標為已解決並完成</button>',
        });
        on('#rv-keep', () => run(act, ''));
        on('#rv-all', () => run(act, '', { resolveOpen: true }));
      } else {
        const p = report?.changeRequests?.find((c) => c.outcome === 'pending');
        const v = p?.versionNo ? { now: `第 ${p.versionNo} 版`, base: `第 ${p.baseVersion} 版` } : { now: '新版本', base: '原版本' };
        const CHANGE = {
          reject: ['駁回，維持已完成', `${v.now}保留在版本紀錄，現行版本回到${v.base}，狀態維持已完成。說明可不填。`],
          reopen: ['退回待更新', `狀態改為待更新，業者需依說明再修改後重新送出。說明可不填，或先在表格上留言標出問題。`],
          approve: ['同意更正', `${v.now}成為現行版本，狀態回到已完成。說明可不填。`],
        }[act];
        const on = confirmBox({
          title: CHANGE[0],
          hint: CHANGE[1],
          buttons: `<button type="button" class="hb-btn" id="rv-go">確認</button>`,
        });
        on('#rv-go', (note) => run(act, note));
      }
    };
  });
}
