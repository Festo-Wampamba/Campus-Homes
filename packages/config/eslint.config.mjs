import tseslint from 'typescript-eslint';

export default tseslint.config(tseslint.configs.recommended, {
  rules: {
    // The build brief bans `any` as a shortcut — make it an error, not a warning.
    '@typescript-eslint/no-explicit-any': 'error',
  },
});
