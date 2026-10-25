/**
 * Deadline parsing: turn what a client types into a calendar date the reminder job can compare.
 * Dates are plain calendar days ('YYYY-MM-DD'), no time of day and no timezone — a deadline
 * is "the 25th", not "the 25th at 00:00 UTC".
 */

const UNIT_DAYS = { day: 1, days: 1, week: 7, weeks: 7 };

/** Format a Date (its UTC calendar day) as 'YYYY-MM-DD'. */
function toIsoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' if year/month/day form a real date, else null (31.02 must not become 03.03). */
function validDay(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return toIsoDay(d);
}

/**
 * Parse a deadline typed by a person.
 * Understands: 2026-12-25 · 25.12.2026 · 25/12/2026 · tomorrow · [in] N day(s)/week(s)/month(s).
 * @param {string | undefined} text
 * @param {Date} [now] - injectable "today" for tests
 * @returns {string | null} 'YYYY-MM-DD' or null if the text is not a recognisable date
 */
export function parseDeadline(text, now = new Date()) {
  const s = (text ?? '').trim().toLowerCase();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));

  // Day first, like the owner and most of Europe write it.
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return validDay(Number(m[3]), Number(m[2]), Number(m[1]));

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (s === 'tomorrow') {
    today.setUTCDate(today.getUTCDate() + 1);
    return toIsoDay(today);
  }

  m = s.match(/^(?:in\s+)?(\d{1,3})\s+(days?|weeks?|months?)$/);
  if (m) {
    const n = Number(m[1]);
    if (m[2].startsWith('month')) today.setUTCMonth(today.getUTCMonth() + n);
    else today.setUTCDate(today.getUTCDate() + n * UNIT_DAYS[m[2]]);
    return toIsoDay(today);
  }
  return null;
}

/**
 * Today's calendar day as 'YYYY-MM-DD'.
 * @param {Date} [now]
 */
export function todayIso(now = new Date()) {
  return toIsoDay(now);
}
