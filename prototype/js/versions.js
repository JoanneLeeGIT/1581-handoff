// Pure version history and diff helpers (no DOM). Old versions are never removed (FR-009, FR-020).

/** Append a new version; the last submit is always the current version. Returns a new report. */
export function addVersion(report, fields, meta = {}) {
  const versions = [...(report?.versions ?? [])];
  const versionNo = (versions.at(-1)?.versionNo ?? 0) + 1;
  versions.push({
    versionNo,
    submittedAt: meta.now ?? new Date().toISOString(),
    savedBy: meta.savedBy ?? null, // 儲存這一版的使用者名稱
    savedByRole: meta.savedByRole ?? null,
    serviceModes: meta.serviceModes ? structuredClone(meta.serviceModes) : undefined,
    fields: structuredClone(fields),
  });
  return { ...(report ?? {}), versions, currentVersion: versionNo };
}

export function getVersion(report, versionNo) {
  return (report?.versions ?? []).find((v) => v.versionNo === versionNo) ?? null;
}

export function getCurrentVersion(report) {
  return getVersion(report, report?.currentVersion);
}

/** 尚待縣府處理的變更申請（業者已直接送出新版本）。 */
export const pendingChange = (report) => (report?.changeRequests ?? []).find((c) => c.outcome === 'pending') ?? null;

/** 目前「正式」的版本：申請變更中、縣府還沒同意前，以申請前的版本為準（匯出用）。 */
export function getOfficialVersion(report) {
  const p = pendingChange(report);
  return p?.baseVersion ? getVersion(report, p.baseVersion) : getCurrentVersion(report);
}

/** 這一版要跟哪一版比對差異：變更申請的版本比對申請前的版本，其餘比對前一版。 */
export function compareBase(report, versionNo) {
  const c = (report?.changeRequests ?? []).find((x) => x.versionNo === versionNo && x.baseVersion);
  return c ? c.baseVersion : versionNo - 1;
}

function flatten(value, prefix, out) {
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = value;
  }
  return out;
}

/** Dotted paths whose value differs from the previous version (empty if there is no previous version). */
export function diffVersions(prevFields, currFields) {
  if (!prevFields) return [];
  const a = flatten(prevFields, '', {});
  const b = flatten(currFields, '', {});
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  // 沒填（undefined／null）和空字串視為相同，避免沒寫備註也被算成差異
  const norm = (v) => (v === undefined || v === null ? '' : v);
  return [...keys].filter((k) => norm(a[k]) !== norm(b[k]));
}
