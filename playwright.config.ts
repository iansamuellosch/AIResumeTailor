import { defineConfig, devices } from "@playwright/test";
const production = process.env.PLAYWRIGHT_SERVER_MODE === "production";
const baseURL = production ? "http://localhost:3100" : "http://localhost:3000";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  webServer: { command: production ? "npm run start -- --hostname localhost --port 3100" : "npm run dev -- --hostname localhost", url: baseURL, reuseExistingServer: !process.env.CI && !production },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});
