/** Whole years between date of birth and today (UTC calendar). */
export function ageYearsFromDateOfBirth(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}
