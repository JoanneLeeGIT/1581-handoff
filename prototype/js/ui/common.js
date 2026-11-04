// Small shared UI helpers. 樣式一律用 huabus-theme.css 的元件（樣張：styleguide.html）。
import { STATUS } from '../status.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const qs = (name) => new URLSearchParams(location.search).get(name);

const ASSET = 'assets/figma/';

/** 狀態圖示（Figma ic-light-2 系列），月報總覽、狀態標籤共用。申請變更不在設計稿，沿用原本的圖示。 */
export function statusGlyph(status, { legend = false } = {}) {
  switch (status) {
    case 'notStarted': return '<span class="hb-ic-st hb-ic-empty" aria-hidden="true"></span>';
    case 'open': return `<span class="hb-ic-st hb-ic-open" aria-hidden="true"><img src="${ASSET}st-open.svg" width="22.0011" height="22" alt=""></span>`;
    case 'changeRequested': return '<span class="hb-ic-st hb-ic-change" aria-hidden="true"><i class="bi bi-arrow-repeat"></i></span>';
    default: {
      const file = legend && status === 'needsUpdate' ? 'st-needsUpdate-legend.svg' : `st-${status}.svg`;
      return `<img class="hb-ic-st" src="${ASSET}${file}" width="24" height="24" alt="">`;
    }
  }
}

/** 狀態標籤：圖示＋文字＋淡底。 */
export const statusBadge = (status) => `<span class="hb-status st-${status}">${statusGlyph(status, { legend: true })}${STATUS[status]}</span>`;

/**
 * 返回按鈕：照線上系統（營運計畫頁）——16px 左箭頭＋「返回」，字級同頁面標題 23.04px／500；
 * 另加滑過底色與箭頭微移，箭頭與文字上下置中。
 */
export const backLink = (href = 'index.html', text = '返回', label = '返回月報總覽') =>
  `<a class="hb-back" href="${esc(href)}" title="${esc(label)}" aria-label="${esc(label)}">
    <svg class="hb-back-ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg><span>${esc(text)}</span></a>`;

/** 頁內訊息。kind：info／warn／danger／success。 */
const MSG_ICON = { info: 'bi-info-circle', warn: 'bi-bell', danger: 'bi-exclamation-circle', success: 'bi-check-circle' };
export const msg = (html, kind = 'info', action = '') =>
  `<div class="hb-msg${kind === 'info' ? '' : ` hb-msg-${kind}`}"><i class="bi ${MSG_ICON[kind]}"></i><div class="hb-msg-body">${html}</div>${action}</div>`;

/**
 * 列內操作圖示：用系統導覽列同一套 Material 圖示（outlined, 24 格線），顏色跟著文字色。
 */
const MATERIAL = {
  edit: 'M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z',
  visibility: 'M12 6c3.79 0 7.17 2.13 8.82 5.5C19.17 14.87 15.79 17 12 17s-7.17-2.13-8.82-5.5C4.83 8.13 8.21 6 12 6m0-2C7 4 2.730 7.11 1 11.5 2.73 15.89 7 19 12 19s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4zm0 5c1.38 0 2.5 1.12 2.5 2.5S13.38 14 12 14s-2.5-1.12-2.5-2.5S10.62 9 12 9m0-2c-2.48 0-4.5 2.02-4.5 4.5S9.52 16 12 16s4.5-2.02 4.5-4.5S14.48 7 12 7z',
};
export const micon = (name, size = 20) =>
  `<svg class="hb-micon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${MATERIAL[name]}"/></svg>`;

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : esc(n));

/** 右上角短暫通知（深色泡泡，同線上提示樣式）。 */
export function toast(text, kind = 'success') {
  const el = document.createElement('div');
  el.className = 'hb-toast';
  el.setAttribute('role', 'status');
  const icon = kind === 'success' || kind === 'info' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
  el.innerHTML = `<i class="bi ${icon}"${kind === 'success' || kind === 'info' ? '' : ' style="color:var(--hb-danger)"'}></i>${esc(text)}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/** Show a Bootstrap modal built from html; returns the root element. */
export function showModal({ title, body, footer = '' }) {
  const host = document.getElementById('modals') ?? document.body;
  const el = document.createElement('div');
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${title}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</div></div>`;
  host.appendChild(el);
  const modal = new window.bootstrap.Modal(el);
  el.addEventListener('hidden.bs.modal', () => el.remove());
  modal.show();
  el.hide = () => modal.hide();
  return el;
}
