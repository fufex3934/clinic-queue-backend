/** Strip to digits only. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Normalize Ethiopian mobiles to E.164 (+2519XXXXXXXX).
 * Other formats are trimmed and left unchanged when not recognizable.
 */
export function normalizeEthiopianPhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  let digits = digitsOnly(trimmed);
  if (digits.startsWith('251')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 9 && /^9\d{8}$/.test(digits)) {
    return `+251${digits}`;
  }

  if (trimmed.startsWith('+')) {
    const intl = digitsOnly(trimmed);
    if (intl.length >= 7 && intl.length <= 15) {
      return `+${intl}`;
    }
  }

  return trimmed;
}

/** Variants for duplicate checks and patient search. */
export function phoneSearchVariants(phone: string): string[] {
  const trimmed = phone.trim();
  if (!trimmed) return [];

  const normalized = normalizeEthiopianPhone(trimmed);
  const variants = new Set<string>([trimmed, normalized]);

  const d = digitsOnly(normalized);
  if (d.startsWith('251') && d.length >= 12) {
    const local = d.slice(3);
    variants.add(`0${local}`);
    variants.add(local);
    variants.add(`+${d}`);
    variants.add(d);
  }

  return [...variants];
}

export function isValidPhoneAfterNormalize(phone: string): boolean {
  const n = normalizeEthiopianPhone(phone);
  if (/^\+2519\d{8}$/.test(n)) return true;
  return /^\+?[\d\s\-()]{7,20}$/.test(phone.trim());
}
