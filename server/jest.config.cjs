module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/.test-dist/tests/**/*.test.js'],
  maxWorkers: 1,
  watchman: false,
  testTimeout: 120000,
  clearMocks: true,
};
