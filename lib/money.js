// Amounts are integer paise. Parsing happens once, at the edge; nothing
// downstream ever sees a float, because 1/3 of a rupee cannot be represented
// in binary floating point and the error compounds across a group's ledger.

const MAX_PAISE = 1_000_000_00; // ₹1,000,000 per expense — a sane upper bound.

export function parseAmount(input) {
  const cleaned = String(input ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw badRequest('Enter an amount like 1200 or 1200.50');
  }
  const [rupees, paise = ''] = cleaned.split('.');
  const total = Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
  if (total <= 0) throw badRequest('Amount must be greater than zero');
  if (total > MAX_PAISE) throw badRequest('That amount is implausibly large');
  return total;
}

export function formatAmount(paise, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : '';
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toLocaleString('en-IN');
  return `${sign}${symbol}${rupees}.${String(abs % 100).padStart(2, '0')}`;
}

// Splits `total` across `weights` so the parts sum to exactly `total`.
// Largest-remainder: everyone gets the floor, then the leftover paise go one
// each to whoever was rounded down hardest. Ties break on index so the same
// input always produces the same split.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum <= 0) throw badRequest('Nothing to split across');

  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let leftover = total - parts.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; leftover > 0; i++, leftover--) parts[order[i % order.length].index] += 1;
  return parts;
}

export const splitEqually = (total, count) => allocate(total, Array(count).fill(1));

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
