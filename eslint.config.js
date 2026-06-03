import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.wrangler', 'node_modules', 'gateway-worker', 'workers', 'zapier-app', 'empty-warmchats']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // ── React Compiler / react-hooks v7 strict rules ─────────────────────
      // These new rules are overly strict for async fetch-in-effect patterns
      // that are correct and intentional throughout this codebase.
      'react-hooks/set-state-in-effect': 'off',
      // Downgrade to warn so real violations surface without blocking the build
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      // Manual memoization is intentional here - compiler hint noise is not useful
      'react-hooks/preserve-manual-memoization': 'off',
      // Caught errors that only feed generic error toasts don't need a cause chain
      'preserve-caught-error': 'off',

      // ── TypeScript ────────────────────────────────────────────────────────
      // Downgrade any-type to warn; it's pervasive and being addressed gradually
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow _ prefix convention for intentionally unused vars/args/catches
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── General ──────────────────────────────────────────────────────────
      'no-useless-assignment': 'warn',

      // ── Fast refresh ─────────────────────────────────────────────────────
      'react-refresh/only-export-components': 'warn',
    },
  },
])
