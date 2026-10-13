// Same rules as the bot (src/core/format.ts): ASCII signs, thousands separators.

const digits = (n: number) => Math.abs(n).toLocaleString('en-US');

export function formatMoney(amount: number): string {
  if (amount < 0) return `-$${digits(amount)}`;
  if (amount > 0) return `+$${digits(amount)}`;
  return '$0';
}

/** Short form for calendar cells: -350, -1.2k, -12k, +50k. Zero is empty. */
export function compactMoney(amount: number): string {
  if (amount === 0) return '';
  const sign = amount < 0 ? '-' : '+';
  const abs = Math.abs(amount);
  if (abs < 1000) return `${sign}${abs}`;
  const k = abs / 1000;
  return `${sign}${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}

/** "-120", "+500", "120" (expense), "1,200" → signed integer; null if invalid. */
export function parseSignedAmount(input: string): number | null {
  const m = /^\s*([+-]?)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*$/.exec(input.normalize('NFKC'));
  if (!m) return null;
  const value = Number(m[2]!.replace(/,/g, ''));
  if (value === 0 || value > 10_000_000) return null;
  return m[1] === '+' ? value : -value;
}
