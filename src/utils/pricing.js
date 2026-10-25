/**
 * Price and timeline estimate for a map, from the size the client typed.
 *
 * The formula is the site's (FirstTry/src/lib/pricing.ts) — keep the numbers in sync with it
 * and with docs/SPEC.md → "Price". It is a guide shown to the client and freelancers; the real
 * price is whatever the freelancer quotes.
 */

/** € per block of the map's side (owner's decision 2026-10-02 on the site). */
export const BASE_RATE = 1.5;

/** [side in blocks, days] — the owner's own examples: 150 → 1 week, 400 → 2 weeks, 600 → 3–4 weeks. */
export const DEADLINE_ANCHORS = [
  [150, 7],
  [400, 14],
  [600, 24.5],
];

/** Below this a number is more likely "5 floors" than a map side. */
const MIN_SIDE = 16;

/**
 * Read a map size: "150x150", "150 x 150", "200×100", "300*300 blocks", or a single side "about 400".
 * @param {string} text
 * @returns {{ width: number, height: number } | null}
 */
export function parseSize(text) {
  const s = (text ?? '').toLowerCase();
  const pair = s.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/);
  const [width, height] = pair ? [Number(pair[1]), Number(pair[2])] : (() => {
    const one = s.match(/\b(\d{2,5})\b/);
    return one ? [Number(one[1]), Number(one[1])] : [0, 0];
  })();
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  return { width, height };
}

const interpolate = ([x1, y1], [x2, y2], x) => y1 + ((y2 - y1) / (x2 - x1)) * (x - x1);

/** Days for a side, linear between anchors, extended past both ends by the nearest segment. */
function estimateDays(side) {
  const a = DEADLINE_ANCHORS;
  if (side <= a[0][0]) return interpolate(a[0], a[1], side);
  if (side >= a[a.length - 1][0]) return interpolate(a[a.length - 2], a[a.length - 1], side);
  const i = a.findIndex(([x], idx) => side >= x && side <= a[idx + 1][0]);
  return interpolate(a[i], a[i + 1], side);
}

/**
 * @param {string} sizeText - the order's "size" answer
 * @returns {{ width: number, height: number, price: number, days: number } | null}
 */
export function estimateOrder(sizeText) {
  const size = parseSize(sizeText);
  if (!size) return null;
  // Non-square maps: the side of the square with the same area (sqrt(w*h)) — fair for rectangles,
  // exact for squares.
  const side = Math.sqrt(size.width * size.height);
  return { ...size, price: Math.round(side * BASE_RATE), days: Math.max(1, Math.round(estimateDays(side))) };
}

/**
 * Human text for an estimate, e.g. "~€225 · ~1 week".
 * @param {{ price: number, days: number }} estimate
 */
export function formatEstimate({ price, days }) {
  const time = days >= 7 ? `~${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}` : `~${days} days`;
  return `~€${price} · ${time}`;
}
