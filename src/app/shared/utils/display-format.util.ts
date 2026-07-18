export interface UserDisplayFields {
  readonly names?: string | null;
  readonly lastNames?: string | null;
  readonly username?: string | null;
}

export function firstNameAndLastName(
  user: UserDisplayFields | null | undefined,
  fallback: string
): string {
  const firstName = firstToken(user?.names);
  const firstLastName = firstToken(user?.lastNames);

  if (firstName !== null && firstLastName !== null) {
    return `${firstName} ${firstLastName}`;
  }
  if (firstName !== null) {
    return firstName;
  }
  return fallback;
}

export function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatNumberWithoutTrailingZero(
  value: number | null | undefined,
  fractionDigits = 1
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return value
    .toFixed(fractionDigits)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
}

function firstToken(value: string | null | undefined): string | null {
  const token = (value ?? '').trim().split(/\s+/).find((part) => part.length > 0);
  return token ?? null;
}
