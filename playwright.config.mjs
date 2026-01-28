import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const VITE_PORT = process.env.VITE_PORT || '5173';
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${VITE_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PORT: process.env.PORT || '3001',
      VITE_PORT,
      DATABASE_PATH: process.env.DATABASE_PATH || path.join(process.cwd(), '.playwright', 'auth.db'),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
