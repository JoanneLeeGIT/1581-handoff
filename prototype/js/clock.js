// "Simulated today" so overdue / open states can be demonstrated on any day.

const KEY = 'huabus-proto-today';

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function realToday() {
  return toISO(new Date());
}

export function getToday() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  } catch { /* storage unavailable: fall back to the real date */ }
  return realToday();
}

/** Pass a falsy value to go back to the real date. */
export function setToday(iso) {
  try {
    if (iso) localStorage.setItem(KEY, iso);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
