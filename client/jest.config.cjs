module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.cjs'],
  testMatch: ['**/tests/components/**/*.test.jsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
