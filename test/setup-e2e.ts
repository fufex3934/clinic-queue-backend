process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests-min-32-chars';
process.env.JWT_EXPIRES_IN = '1d';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/clinic-queue-test';
