const { defineConfig } = require('@playwright/test');

// Serve the static app over http://localhost so localStorage and the
// clipboard API run in a secure context (file:// does not qualify).
module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.js',
  // Tests are isolated (own browser context, own localStorage), so run them
  // in parallel within the single spec file rather than one-at-a-time.
  fullyParallel: true,
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    baseURL: 'http://localhost:4173',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: 'npx http-server . -p 4173 -c-1 --silent',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
