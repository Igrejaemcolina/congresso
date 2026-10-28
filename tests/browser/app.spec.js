import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { success } from "../fixtures.mjs";

const endpoint = "https://script.google.com/macros/s/**";
async function mock(page, data = success()) {
  await page.route(endpoint, (route) => route.fulfill({ json: data }));
}
async function query(page, id = "TESTE-001") {
  await page.getByLabel("ID da participante", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
}

test("inicial, ID vazio, Enter, zeros à esquerda e limpar consulta", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, (route) => {
    calls++;
    return route.fulfill({ json: success("000001") });
  });
  await page.goto("./");
  await expect(page.locator("#results")).toBeHidden();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.locator("#field-error")).toHaveText(
    "Informe o ID da participante.",
  );
  await expect(page.locator("#participant-id")).toBeFocused();
  expect(calls).toBe(0);
  await page.getByLabel("ID da participante", { exact: true }).fill("000001");
  await page.locator("#participant-id").press("Enter");
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#participant-code")).toHaveText("ID: 000001");
  await expect(page.locator(".installment")).toHaveCount(6);
  await expect(page.locator("#paid-value")).toHaveText(/R\$\s*200,00/);
  await expect(page.locator("#remaining-value")).toHaveText(/R\$\s*400,00/);
  await expect(page.locator("#paid-count")).toHaveText("2");
  await expect(page.locator("#remaining-count")).toHaveText("4");
  await expect(page.locator("#payment-progress")).toHaveAttribute(
    "value",
    "33",
  );
  await expect(page.locator("#consulted-at")).toHaveAttribute("datetime", /T/);
  await expect(page.getByText("Data do pagamento: 05/11/2026")).toBeVisible();
  await page
    .getByRole("button", { name: "Consultar outra participante" })
    .click();
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#participant-name")).toBeEmpty();
  await expect(page.locator("#installments")).toBeEmpty();
  await expect(page.locator("#participant-id")).toHaveValue("");
  await expect(page.locator("#participant-id")).toBeFocused();
});

test("comprovantes: HTTPS, nova aba, pago sem comprovante e pendente com link", async ({
  page,
}) => {
  const data = success();
  data.parcelas[2].comprovante = "https://example.com/teste-pendente";
  data.parcelas[3].comprovante = "javascript:alert(1)";
  data.parcelas[4].comprovante = "http://example.com/inseguro";
  await mock(page, data);
  await page.goto("./");
  await query(page);
  await expect(page.locator("#results")).toBeVisible();
  const links = page.locator("#installments a");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByText("Comprovante não disponível", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.locator(".installment").nth(2).locator(".badge"),
  ).toHaveText("◷ Pendente");
});

test("dados recebidos são texto e não executam HTML", async ({ page }) => {
  const data = success();
  data.participante.nome = '<img src=x onerror="alert(1)">';
  await mock(page, data);
  await page.goto("./");
  await query(page);
  await expect(page.locator("#participant-name")).toHaveText(
    data.participante.nome,
  );
  await expect(page.locator("#results img")).toHaveCount(0);
});

for (const [name, response, message] of [
  [
    "não encontrada",
    { json: { ok: false, erro: "Participante não encontrado." } },
    "Participante não encontrado.",
  ],
  [
    "HTML",
    { contentType: "text/html", body: "<html>Login</html>" },
    "O serviço retornou uma página",
  ],
  [
    "JSON inválido",
    { contentType: "application/json", body: "{invalido" },
    "O serviço retornou uma resposta inválida",
  ],
  ["estrutura inesperada", { json: { ok: true } }, "formato inesperado"],
  ["HTTP", { status: 503, body: "" }, "HTTP 503"],
]) {
  test(`erro de ${name} fica acessível e esconde resultados`, async ({
    page,
  }) => {
    await page.route(endpoint, (route) => route.fulfill(response));
    await page.goto("./");
    await query(page);
    await expect(page.getByRole("status")).toContainText(message);
    await expect(page.locator("#results")).toBeHidden();
  });
}

test("falha de rede permite tentar novamente", async ({ page }) => {
  await page.route(endpoint, (route) => route.abort("failed"));
  await page.goto("./");
  await query(page);
  await expect(page.getByRole("status")).toContainText(
    "Não foi possível conectar",
  );
  await page.unroute(endpoint);
  await mock(page);
  await query(page);
  await expect(page.locator("#results")).toBeVisible();
});

test("timeout e cancelamento manual limpam o estado de carregamento", async ({
  page,
}) => {
  await page.route(endpoint, () => {});
  await page.clock.install();
  await page.goto("./");
  await query(page);
  await expect(page.getByRole("status")).toContainText("Consultando");
  await page.clock.fastForward(21000);
  await expect(page.getByRole("status")).toContainText("demorou mais");
  await expect(page.locator("#cancel-query")).toBeHidden();
  await query(page);
  await page
    .getByRole("button", { name: "Cancelar consulta", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Consulta cancelada");
  await expect(page.locator("#query-form")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("nova consulta limpa dados imediatamente e a resposta mais recente prevalece", async ({
  page,
}) => {
  await mock(page);
  await page.goto("./");
  await query(page);
  await expect(page.locator("#results")).toBeVisible();
  await page.unroute(endpoint);
  let oldRoute;
  await page.route(endpoint, async (route) => {
    if (new URL(route.request().url()).searchParams.get("id") === "ANTIGO")
      oldRoute = route;
    else await route.fulfill({ json: success("RECENTE") });
  });
  await query(page, "ANTIGO");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#participant-name")).toBeEmpty();
  await expect.poll(() => Boolean(oldRoute)).toBe(true);
  await query(page, "RECENTE");
  await expect(page.locator("#participant-code")).toHaveText("ID: RECENTE");
  await oldRoute.fulfill({ json: success("ANTIGO") }).catch(() => {});
  await expect(page.locator("#participant-code")).toHaveText("ID: RECENTE");
});

test("acessibilidade WCAG, teclado, sem armazenamento e sem rolagem horizontal", async ({
  page,
}) => {
  await mock(page);
  await page.goto("./");
  await page.keyboard.press("Tab");
  await expect(
    page.getByText("Ir para a consulta", { exact: true }),
  ).toBeFocused();
  for (const state of ["initial", "error", "success"]) {
    if (state === "error")
      await page
        .getByRole("button", { name: "Consultar", exact: true })
        .click();
    if (state === "success") await query(page);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0);
});
