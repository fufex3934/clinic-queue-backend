export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  app: {
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    publicApiUrl: process.env.API_PUBLIC_URL ?? 'http://localhost:4000',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'noreply@clinic-queue.local',
    secure: process.env.SMTP_SECURE === 'true',
  },
  sms: {
    enabled: process.env.SMS_ENABLED === 'true',
    apiUrl: process.env.SMS_API_URL ?? '',
    apiKey: process.env.SMS_API_KEY ?? '',
    /** Message language: en | am | om (default am for Ethiopia). */
    locale: process.env.SMS_LOCALE ?? 'am',
  },
  storage: {
    provider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 's3',
    localDir: process.env.LOCAL_UPLOAD_DIR ?? 'uploads',
    s3: {
      bucket: process.env.S3_BUCKET ?? '',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '',
    },
  },
});
