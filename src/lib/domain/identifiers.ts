/**
 * Security identifier helpers: ISIN validation and URL slugs.
 */

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * Validate an ISIN using the ISO 6166 Luhn check digit.
 * Letters are expanded to two digits (A=10 ... Z=35) before applying Luhn.
 */
export function isValidIsin(raw: string): boolean {
  const isin = raw.trim().toUpperCase();
  if (!ISIN_RE.test(isin)) return false;
  const digits = isin
    .slice(0, 11)
    .split("")
    .map((c) => (c >= "0" && c <= "9" ? c : String(c.charCodeAt(0) - 55)))
    .join("");
  let sum = 0;
  // Luhn: double every second digit starting from the rightmost digit of the payload.
  for (let i = digits.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isin[11]);
}

/** Indian equity ISINs start with "INE" (companies). "INF" (funds) etc. are excluded. */
export function isIndianEquityIsin(isin: string): boolean {
  return isValidIsin(isin) && isin.toUpperCase().startsWith("INE");
}

const SUFFIXES = /\b(limited|ltd\.?|ltd)\s*$/i;

/** URL slug for a company page, e.g. "Reliance Industries Limited" → "reliance-industries". */
export function companySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(SUFFIXES, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";
}

/** Make a slug unique against an existing set by appending a short ISIN-derived suffix. */
export function uniqueSlug(base: string, isin: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  const withIsin = `${base}-${isin.slice(-6).toLowerCase()}`;
  if (!taken.has(withIsin)) return withIsin;
  return `${base}-${isin.toLowerCase()}`;
}
