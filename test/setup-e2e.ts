process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-jwt-secret-for-e2e-tests-min-32-chars';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1d';

// MONGODB_URI is assigned in createE2eApp() from an in-memory replica set
// before AppModule connects. Do not point e2e tests at a standalone mongod.
