// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'eslint.config.js'],
  },
  {
    rules: {
      // `import fc from 'fast-check'` is the documented usage and works under
      // esModuleInterop, but the rule reads every `fc.integer()` as a mistaken
      // default-import of a named export. 36 false positives across the
      // property tests, and no true positive anywhere in this codebase.
      'import/no-named-as-default-member': 'off',
    },
  },
]);
