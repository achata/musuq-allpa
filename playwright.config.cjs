const { defineConfig, devices } = require('@playwright/test');
const fs = require('node:fs');
const cached = '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome';
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs', fullyParallel: false, workers: 2, timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure', trace: 'retain-on-failure', actionTimeout: 12000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync(cached) ? cached : undefined), args: ['--enable-unsafe-swiftshader'] }
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: process.env.BASE_URL ? undefined : { command: 'node tests/serve-e2e.cjs', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false }
});
