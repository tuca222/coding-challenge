// Money is stored in integer cents; dollars only in DTOs and the report.
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}
