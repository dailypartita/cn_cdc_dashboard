/** Monday-start week: Sunday is six days later. */
export function addUtcDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Calendar month YYYY-MM → first and last day. */
export function monthRange(month: string): { reference_date: string; target_end_date: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return {
    reference_date: `${month}-01`,
    target_end_date: last.toISOString().slice(0, 10),
  };
}

/** Monday-start ISO week → Monday and Sunday. */
export function weekRange(monday: string): { reference_date: string; target_end_date: string } {
  return { reference_date: monday, target_end_date: addUtcDays(monday, 6) };
}
