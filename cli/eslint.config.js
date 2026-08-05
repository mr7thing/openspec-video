// ESLint flat config — T10 lint baseline (F12).
// Pragmatic baseline: typescript-eslint recommended, with the project's
// established patterns (any-heavy provider payloads, console CLI output,
// CJS requires in scripts) explicitly accommodated. Tighten over time —
// do not loosen without a task note.
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'review-ui/', 'coverage/'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Provider payloads and pack contracts are deliberately any/unknown-heavy.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
);
