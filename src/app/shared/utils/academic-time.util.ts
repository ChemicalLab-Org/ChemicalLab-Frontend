/** Offset-less API values and datetime-local inputs are academic wall times in Lima. */
export function academicTimestamp(value: string): number {
  return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}-05:00`);
}

export function academicDate(value: string): Date {
  return new Date(academicTimestamp(value));
}
