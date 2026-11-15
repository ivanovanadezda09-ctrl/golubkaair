import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests', testMatch:'*.e2e.ts', workers:1,
  use:{baseURL:process.env.BASE_URL ?? 'http://127.0.0.1:8000', channel:process.env.CHROME_CHANNEL || undefined},
})
