import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // TypeScript already reports undefined identifiers and unused locals.
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      // Optional props are already type-checked; runtime defaults add noise in TS SFCs.
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Must stay last: switches off stylistic rules that Prettier owns.
  prettier,
)
