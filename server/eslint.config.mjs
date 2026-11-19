import js from '@eslint/js';
import globals from 'globals';

// TypeScript 7 is checked by tsc; lint its emitted JavaScript without an
// incompatible TypeScript parser dependency.
export default [
  js.configs.recommended,
  {
    files: ['dist/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
