// Teste real opt-in. Não cria trace, captura, fixture ou log de dados pessoais.
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { startServer } from "./serve.mjs";

const id = process.env.CONSULTA_TEST_ID;
delete process.env.CONSULTA_TEST_ID;
if (!id) {
  console.error(
    "Defina CONSULTA_TEST_ID somente na sessão para o teste real. Não salve o ID em arquivos.",
  );
  process.exitCode = 1;
} else {
  const server = await startServer(0);
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  let browser;
  const diagnostics = {
    corsReported: false,
    networkFailure: false,
    httpError: false,
    requestsToService: 0,
  };
  try {
    browser = await chromium.launch({
      ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    });
    const context = await browser.newContext({
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (/cors|access-control-allow-origin/i.test(message.text()))
        diagnostics.corsReported = true;
    });
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "script.google.com")
        diagnostics.requestsToService++;
    });
    page.on("requestfailed", (request) => {
      if (/^script\.google/.test(new URL(request.url()).hostname))
        diagnostics.networkFailure = true;
    });
    page.on("response", (response) => {
      if (
        /^script\.google/.test(new URL(response.url()).hostname) &&
        response.status() >= 400
      )
        diagnostics.httpError = true;
    });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/congresso-consulta/`,
    );
    await page.locator("#participant-id").fill(id);
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.getElementById("query-form").getAttribute("aria-busy") ===
        "false",
      null,
      { timeout: 25000 },
    );
    const verified = await page.evaluate(
      (requestedId) => ({
        success: !document.getElementById("results").hidden,
        sameId:
          document.getElementById("participant-code").textContent ===
          `ID: ${requestedId}`,
        sixInstallments: document.querySelectorAll(".installment").length === 6,
        errorState:
          document.getElementById("request-area").dataset.state === "error",
        // Apenas categorias fixas; nunca retornar mensagens do script ou conteúdo pessoal.
        errorCategory: (() => {
          const text = document.getElementById("status").textContent;
          if (text.includes("formato inesperado")) return "structure";
          if (text.includes("uma página")) return "html";
          if (text.includes("Não foi possível conectar")) return "network";
          if (text.includes("demorou mais")) return "timeout";
          if (text.includes("HTTP")) return "http";
          return "other-or-none";
        })(),
      }),
      id,
    );
    console.log(
      JSON.stringify({
        browser: "Chromium/Chrome",
        origin: "HTTP local, diferente do Apps Script",
        ...verified,
        ...diagnostics,
      }),
    );
    if (!(verified.success && verified.sameId && verified.sixInstallments))
      process.exitCode = 1;
    await page.goto("about:blank");
    await context.close();
  } catch {
    console.error(
      "Não foi possível concluir o teste real no navegador. Nenhum dado pessoal foi registrado.",
    );
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
