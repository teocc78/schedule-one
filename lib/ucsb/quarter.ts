/**
 * Quarter codes are YYYYQ. 1 = Winter and 2 = Spring are confirmed
 * (Winter 2027 = "20271", doc example "20192" = Spring 2019).
 * TODO: Summer and Fall digits are UNVERIFIED. Keep the mapping here only.
 */
export const QUARTER_DIGIT = {
  Winter: 1,
  Spring: 2,
  Summer: 3, // UNVERIFIED
  Fall: 4, // UNVERIFIED
} as const;

export type QuarterName = keyof typeof QUARTER_DIGIT;

export function toQuarterCode(name: QuarterName, year: number): string {
  return `${year}${QUARTER_DIGIT[name]}`;
}

export function fromQuarterCode(code: string): { name: QuarterName; year: number } {
  if (!/^\d{5}$/.test(code)) throw new Error(`Invalid quarter code "${code}" (expected YYYYQ)`);
  const year = Number(code.slice(0, 4));
  const digit = Number(code[4]);
  const name = (Object.keys(QUARTER_DIGIT) as QuarterName[]).find((k) => QUARTER_DIGIT[k] === digit);
  if (!name) throw new Error(`Unknown quarter digit in "${code}"`);
  return { name, year };
}

export function quarterLabel(code: string): string {
  const { name, year } = fromQuarterCode(code);
  return `${name} ${year}`;
}
