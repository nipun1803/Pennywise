module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/tests/components/**/*.test.jsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
