import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'*.spec.ts',fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure'},
  reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]],
  webServer:[
    {command:'node e2e/fixture-api.mjs',url:'http://127.0.0.1:4400/api/v1/listings/reviews',reuseExistingServer:!process.env.CI},
    {command:process.env.CH_TEST_PRODUCTION ? 'API_INTERNAL_URL=http://127.0.0.1:4400 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4400 pnpm start --port 3100 --hostname 127.0.0.1' : 'API_INTERNAL_URL=http://127.0.0.1:4400 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4400 pnpm dev --port 3100 --hostname 127.0.0.1',url:'http://127.0.0.1:3100',reuseExistingServer:!process.env.CI,timeout:120000},
  ],
});
