import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./deployment-tests",
  use: {
    baseURL: "http://127.0.0.1:4175/Number1/",
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run preview -- --base=/Number1/ --port 4175 --strictPort",
    url: "http://127.0.0.1:4175/Number1/",
    reuseExistingServer: false,
  },
});
