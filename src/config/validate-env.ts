const INSECURE_JWT_PLACEHOLDERS = [
  'change-me-in-production',
  'your-super-secret-jwt-key-change-in-production',
  'generate-a-long-random-secret-at-least-32-chars',
];

type EnvSource = Record<string, unknown> | NodeJS.ProcessEnv;

function readEnv(key: string, source: EnvSource): string {
  const value = source[key as keyof typeof source];
  return typeof value === 'string' ? value.trim() : '';
}

/** Validate required env vars from Nest config or process.env (after dotenv load). */
export function validateEnvironment(source: EnvSource = process.env): void {
  const jwtSecret = readEnv('JWT_SECRET', source);
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required. Set it in .env before starting the server.');
  }

  if (INSECURE_JWT_PLACEHOLDERS.includes(jwtSecret)) {
    throw new Error(
      'JWT_SECRET must be a real random secret, not the .env.example placeholder. Use: openssl rand -hex 32',
    );
  }

  const mongoUri = readEnv('MONGODB_URI', source);
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required. Set it in .env before starting the server.');
  }
}
