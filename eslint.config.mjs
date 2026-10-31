import { defineConfig, globalIgnores } from 'eslint/config';

import js from '@eslint/js';
import { parser as _parser, plugin } from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import prettierPlugin from 'eslint-plugin-prettier';

import jest from 'eslint-plugin-jest';
import globals from 'globals';

export default defineConfig([
  eslintConfigPrettier,
  {
    languageOptions: {
      parser: _parser,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jquery
      }
    },

    plugins: {
      '@typescript-eslint': plugin,
      jest,
      js,
      prettier: prettierPlugin
    },

    extends: [
      'js/recommended',
      '@typescript-eslint/recommended',
      '@typescript-eslint/eslint-recommended',
      'jest/recommended'
    ],

    rules: {
      'max-len': [
        'error',
        {
          code: 80
        }
      ],

      quotes: [
        'error',
        'single',
        {
          allowTemplateLiterals: true
        }
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/explicit-module-boundary-types': [
        'error',
        {
          allowArgumentsExplicitlyTypedAsAny: true
        }
      ],

      'jest/no-conditional-expect': 'off',

      'jest/expect-expect': [
        'warn',
        {
          assertFunctionNames: ['expect', 'expect*']
        }
      ]
    }
  },
  globalIgnores(['**/node_modules', '**/dist', '**/resources', '**/coverage'])
]);
