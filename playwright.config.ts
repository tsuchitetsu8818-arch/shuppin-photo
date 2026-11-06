import { existsSync } from 'node:fs';
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/shuppin-photo/",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/shuppin-photo/",
    reuseExistingServer: true,
  },
  reporter: "list",
});
