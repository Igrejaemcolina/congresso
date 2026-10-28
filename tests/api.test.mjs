import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createQueryClient,
  validateId,
  receiptUrl,
  validatePayload,
} from "../assets/js/api.js";
import { CONFIG } from "../assets/js/config.js";
import { success } from "./fixtures.mjs";

const options = { ...CONFIG, timeoutMs: 1000 };
const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
const rejectsKind = (promise, kind) =>
  assert.rejects(promise, (error) => error.kind === kind);

test("sucesso: consulta apenas o endpoint configurado e respeita o contrato", async () => {
  const client = createQueryClient(options, async (address, init) => {
    const url = new URL(address);
    assert.equal(url.origin + url.pathname, CONFIG.endpoint);
    assert.equal(url.searchParams.get("id"), "TESTE-001");
    assert.equal(init.mode, "cors");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "follow");
    return json(success());
  });
  const result = await client.query("TESTE-001");
  assert.equal(result.parcelas.length, 6);
  assert.equal(result.valorPago, 200);
});

test("ID é texto: mantém zeros, aceita letras e codifica parâmetros", async () => {
  for (const id of ["000012", "AB-009", "A&B+#?=009"]) {
    const client = createQueryClient(options, async (address) => {
      const url = new URL(address);
      assert.deepEqual([...url.searchParams], [["id", id]]);
      return json(success(id));
    });
    assert.equal((await client.query(id)).participante.id, id);
  }
});

test("ID vazio, excessivo, caracteres de controle e invisíveis não fazem consulta", async () => {
  let calls = 0;
  const client = createQueryClient(options, async () => {
    calls++;
    return json(success());
  });
  for (const id of [
    "",
    "   ",
    "A".repeat(129),
    "A\nB",
    "\tTESTE",
    "ABC\u007f",
    "ABC\u202e",
    "\u200b",
  ]) {
    await rejectsKind(client.query(id), "validation");
  }
  assert.equal(calls, 0);
  assert.equal(validateId("  001A  "), "001A");
});

test("erros do script, incluindo participante não encontrada, são preservados", async () => {
  const client = createQueryClient(options, async () =>
    json({ ok: false, erro: "Participante não encontrado." }),
  );
  await assert.rejects(client.query("TESTE-404"), {
    kind: "script",
    message: "Participante não encontrado.",
  });
});

test("comprovantes vazios, inválidos ou inseguros não geram URL", () => {
  for (const value of [
    "",
    " ",
    "http://example.com",
    "javascript:alert(1)",
    "//example.com",
    "https://",
    "https:example.com",
    "https://user:password@example.com",
    "https://example.com/\npath",
    "/arquivo",
    null,
  ])
    assert.equal(receiptUrl(value), null);
  assert.equal(
    receiptUrl("https://example.com/a?x=1"),
    "https://example.com/a?x=1",
  );
});

test("falha de rede e HTTP são distintas", async () => {
  await rejectsKind(
    createQueryClient(options, async () => {
      throw new TypeError("network");
    }).query("TESTE"),
    "network",
  );
  await rejectsKind(
    createQueryClient(
      options,
      async () => new Response("", { status: 503 }),
    ).query("TESTE"),
    "http",
  );
});

test("timeout abrange requisição e leitura do corpo, mesmo com fetch ignorando abort", async () => {
  const config = { ...options, timeoutMs: 15 };
  await rejectsKind(
    createQueryClient(config, () => new Promise(() => {})).query("TESTE"),
    "timeout",
  );
  await rejectsKind(
    createQueryClient(config, async () => ({
      ok: true,
      headers: new Headers(),
      text: () => new Promise(() => {}),
    })).query("TESTE"),
    "timeout",
  );
});

test("HTML, JSON inválido e estrutura inesperada são recusados", async () => {
  await rejectsKind(
    createQueryClient(
      options,
      async () => new Response("<!doctype html><p>Login</p>"),
    ).query("TESTE"),
    "html",
  );
  await rejectsKind(
    createQueryClient(options, async () => new Response("{invalido")).query(
      "TESTE",
    ),
    "json",
  );
  for (const invalid of [
    null,
    {},
    [],
    { ok: true },
    { ok: false },
    { ...success(), parcelas: [] },
  ]) {
    await rejectsKind(
      createQueryClient(options, async () => json(invalid)).query("TESTE-001"),
      "unexpected",
    );
  }
});

test("booleano pago e totais precisam ser coerentes; comprovante não define pagamento", () => {
  const data = success();
  data.parcelas[2].comprovante = "https://example.com/teste";
  assert.equal(validatePayload(data, "TESTE-001").parcelas[2].pago, false);
  for (const change of [
    (d) => {
      d.parcelas[0].pago = "true";
    },
    (d) => {
      d.parcelas[1].mes = d.parcelas[0].mes;
    },
    (d) => {
      d.parcelas[0].valor = 99;
    },
    (d) => {
      d.valorPago = 300;
    },
    (d) => {
      d.saldo = -1;
    },
    (d) => {
      d.parcelasPagas = 6;
    },
    (d) => {
      d.participante.id = "OUTRO";
    },
  ]) {
    const invalid = success();
    change(invalid);
    assert.throws(() => validatePayload(invalid, "TESTE-001"), {
      kind: "unexpected",
    });
  }
});

test("duas consultas concorrentes: somente a mais recente termina com sucesso", async () => {
  let finishFirst;
  let firstSignal;
  const client = createQueryClient(options, async (address, init) => {
    if (new URL(address).searchParams.get("id") === "PRIMEIRO") {
      firstSignal = init.signal;
      return new Promise((resolve) => {
        finishFirst = resolve;
      });
    }
    return json(success("SEGUNDO"));
  });
  const first = rejectsKind(client.query("PRIMEIRO"), "cancelled");
  const second = await client.query("SEGUNDO");
  finishFirst(json(success("PRIMEIRO")));
  await first;
  assert.equal(firstSignal.aborted, true);
  assert.equal(second.participante.id, "SEGUNDO");
});

test("cancelamento manual e novo ID inválido encerram consulta anterior", async () => {
  const client = createQueryClient(options, () => new Promise(() => {}));
  const first = rejectsKind(client.query("PRIMEIRO"), "cancelled");
  client.cancel();
  await first;
  const second = rejectsKind(client.query("SEGUNDO"), "cancelled");
  await rejectsKind(client.query(""), "validation");
  await second;
});

test("configuração fora do Apps Script é recusada sem tráfego", async () => {
  for (const endpoint of [
    "https://example.com/exec",
    "http://script.google.com/macros/s/TEST/exec",
    CONFIG.endpoint + "?id=outro",
  ]) {
    const client = createQueryClient({ ...options, endpoint }, () =>
      assert.fail("não deveria consultar"),
    );
    await rejectsKind(client.query("TESTE"), "configuration");
  }
});
