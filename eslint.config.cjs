// eslint.config.cjs
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs', // This is the fix for require/module.exports
      globals: {
        // VS Code API
        vscode: 'readonly',

        // Node.js built-ins
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',

        // Mocha test globals (optional)
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      'no-const-assign': 'warn',
      'no-this-before-super': 'warn',
      'no-undef': 'warn',
      'no-unreachable': 'warn',
      'no-unused-vars': 'warn',
      'constructor-super': 'warn',
      'valid-typeof': 'warn',
    },
  },
];
