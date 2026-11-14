/**
 * Growth = (current - base) / base, as a percentage.
 * Not meaningful (null) when either figure is missing, the base is zero or negative, or the sign
 * changes (profit to loss), matching the Methodology page.
 */
export function pctChange(cur: number | undefined, base: number | undefined): number | null {
  if (cur === undefined || base === undefined || base <= 0 || cur < 0) return null;
  return ((cur - base) / base) * 100;
}
