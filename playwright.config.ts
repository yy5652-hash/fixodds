import { defineConfig, devices } from '@playwright/test';
// The e2e run serves the production build with `vite preview`, so it tests the same files that ship.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4391', trace: 'off', serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4391 --strictPort', url: 'http://127.0.0.1:4391', reuseExistingServer: false, timeout: 180_000 },
});
