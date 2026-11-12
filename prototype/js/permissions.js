// Pure role/permission rules (no DOM). Constitution principle IV.

export const ROLES = ['county', 'readonly', 'operator'];

const ALLOWED = {
  // editData：縣府可直接修改業者已送出的月報數字（存成新版本）。
  // uploadTicket：上傳票證資料檔案（每月，只有業者本身；幸福巴士暫不納入）。
  // comment：在任務留言板留言／回覆（業者只能在自己的月報）；resolveThread：把任務標為已解決或重新開啟（只有縣府）。
  county: ['view', 'export', 'markNeedsUpdate', 'markCompleted', 'reopen', 'reject', 'approve', 'comment', 'resolveThread', 'editData'],
  readonly: ['view', 'export'],
  operator: ['view', 'submit', 'requestChange', 'comment', 'uploadTicket'],
};

function assertRole(role) {
  if (!ROLES.includes(role)) throw new Error(`unknown role: ${role}`);
}

/**
 * Can `role` perform `action`?
 * Operators may only act on their own operator id: ctx = { operatorId, ownOperatorId }.
 */
export function can(role, action, ctx = {}) {
  assertRole(role);
  if (!ALLOWED[role].includes(action)) return false;
  if (role === 'operator') {
    return ctx.operatorId !== undefined && ctx.operatorId === ctx.ownOperatorId;
  }
  return true;
}

/** Service mode is maintained by the system / county, never by operators (FR-024). */
export function canChangeServiceMode(role) {
  assertRole(role);
  return role === 'county';
}
