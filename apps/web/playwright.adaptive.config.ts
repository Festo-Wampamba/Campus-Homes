import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base, testMatch:'adaptive-layout.spec.ts',
  projects: ['chromium','firefox','webkit'].map(browserName => ({name:browserName,use:{browserName:browserName as 'chromium'|'firefox'|'webkit'}})),
});
