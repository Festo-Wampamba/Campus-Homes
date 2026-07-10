import config from './packages/config/eslint.config.mjs';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/api/migrations/**'] },
  ...config,
];
