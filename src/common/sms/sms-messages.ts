export type SmsLocale = 'en' | 'am' | 'om';

const QUEUE_TOKEN: Record<SmsLocale, (clinic: string, token: number) => string> = {
  en: (clinic, token) =>
    `${clinic}: Your queue number is #${token}. Please wait in the waiting area.`,
  am: (clinic, token) =>
    `${clinic}: የእርስዎ የወረፋ ቁጥር #${token} ነው። በጥቁት ክፍል ይጠብቁ።`,
  om: (clinic, token) =>
    `${clinic}: Lakkoofsi tarree keessan #${token}. Kutaa eegaa keessatti eegaa.`,
};

const NOW_SERVING: Record<SmsLocale, (clinic: string, token: number) => string> = {
  en: (clinic, token) =>
    `${clinic}: Token #${token} — please proceed to the consultation room now.`,
  am: (clinic, token) =>
    `${clinic}: ቁጥር #${token} — እባክዎ አሁን ወደ ክፍል ይግቡ።`,
  om: (clinic, token) =>
    `${clinic}: Lakkoofsi #${token} — amma gara kutaa tajaajilaatti ce'aa.`,
};

export function parseSmsLocale(value: string | undefined): SmsLocale {
  if (value === 'am' || value === 'om') return value;
  return 'en';
}

export function buildQueueTokenSms(
  locale: SmsLocale,
  clinicName: string,
  tokenNumber: number,
): string {
  return QUEUE_TOKEN[locale](clinicName, tokenNumber);
}

export function buildNowServingSms(
  locale: SmsLocale,
  clinicName: string,
  tokenNumber: number,
): string {
  return NOW_SERVING[locale](clinicName, tokenNumber);
}
