export type ParseResult =
  | { ok: true; amount: number; note: string }
  | { ok: false; reason: 'empty' | 'no_amount' | 'invalid_amount' };

/** Upper bound for a single entry, in NTD. Guards against typos like an extra digit run. */
export const MAX_AMOUNT = 10_000_000;

// Optional sign, then either plain digits or properly grouped thousands, then optional "元".
const AMOUNT_TOKEN = /^([+-]?)(\d+|\d{1,3}(?:,\d{3})+)元?$/;

interface AmountToken {
  index: number;
  sign: string;
  value: number;
}

function normalize(input: string): string {
  // NFKC folds full-width digits, "－", "，" and ideographic spaces to ASCII.
  return input.normalize('NFKC').replace(/−/g, '-').trim();
}

function matchAmount(token: string, index: number): AmountToken | null {
  const match = AMOUNT_TOKEN.exec(token);
  if (!match) return null;
  return { index, sign: match[1] ?? '', value: Number((match[2] ?? '').replace(/,/g, '')) };
}

/**
 * Parse free-form input such as "-120 午餐", "午餐 -120" or "-1,200 耳機".
 * The amount must be the first or last token; everything else becomes the note.
 */
export function parseEntry(input: string): ParseResult {
  const text = normalize(input);
  if (text === '') return { ok: false, reason: 'empty' };

  const tokens = text.split(/\s+/);
  const first = matchAmount(tokens[0] ?? '', 0);
  const last = tokens.length > 1 ? matchAmount(tokens.at(-1) ?? '', tokens.length - 1) : null;

  // When both ends look like amounts, prefer the explicitly signed one, then the first.
  const candidates = [first, last].filter((c): c is AmountToken => c !== null);
  const picked = candidates.find((c) => c.sign === '-') ?? candidates[0];
  if (!picked) return { ok: false, reason: 'no_amount' };

  // Income ("+") is out of MVP scope.
  if (picked.sign === '+') return { ok: false, reason: 'invalid_amount' };
  if (picked.value <= 0 || picked.value > MAX_AMOUNT) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const note = tokens.filter((_, i) => i !== picked.index).join(' ');
  return { ok: true, amount: picked.value, note };
}
