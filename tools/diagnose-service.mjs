// Diagnóstico sem ID: imprime somente metadados, nunca o corpo da resposta.
import { CONFIG } from "../assets/js/config.js";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { startServer } from "./serve.mjs";

let address = CONFIG.endpoint;
for (let i = 0; i < 6; i++) {
  const response = await fetch(address, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const location = response.headers.get("location");
  const next = location ? new URL(location, address) : null;
  console.log(
    JSON.stringify({
      step: i + 1,
      host: new URL(address).hostname,
      status: response.status,
      contentType: response.headers.get("content-type"),
      allowOrigin: response.headers.get("access-control-allow-origin"),
      redirectHost: next?.hostname || null,
    }),
  );
  if (!next) {
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      /* HTML não é registrado. */
    }
    console.log(
      JSON.stringify({
        isJSON: Boolean(payload),
        expectedEmptyIdError:
          payload?.ok === false && payload?.erro === "Informe o ID.",
        unavailableDocument:
          /not found|does not exist|não existe|unable to open|não foi possível abrir/i.test(
            body,
          ),
      }),
    );
    break;
  }
  await response.body?.cancel();
  address = next.href;
}

const server = await startServer(0);
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let browser;
try {
  browser = await chromium.launch(
    existsSync(chrome) ? { executablePath: chrome } : {},
  );
  const page = await browser.newPage();
  const cors = {
    missingAllowOrigin: false,
    preflightFailure: false,
    redirectFailure: false,
  };
  page.on("console", (message) => {
    const text = message.text();
    if (/No 'Access-Control-Allow-Origin' header/i.test(text))
      cors.missingAllowOrigin = true;
    if (/preflight/i.test(text)) cors.preflightFailure = true;
    if (/redirect.*not allowed|cors.*redirect/i.test(text))
      cors.redirectFailure = true;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const fetchResult = await page.evaluate(async (endpoint) => {
    try {
      const response = await fetch(endpoint, {
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        cache: "no-store",
      });
      return { readable: true, status: response.status };
    } catch {
      return { readable: false };
    }
  }, CONFIG.endpoint);
  console.log(JSON.stringify({ browserCrossOrigin: fetchResult, ...cors }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
