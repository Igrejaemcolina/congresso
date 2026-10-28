import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/congresso-consulta/",
    browserName: "chromium",
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: "off",
    screenshot: "off",
    video: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    {
      name: "celular",
      use: {
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "node tools/serve.mjs",
    url: "http://127.0.0.1:4173/congresso-consulta/",
    reuseExistingServer: !process.env.CI,
  },
});
