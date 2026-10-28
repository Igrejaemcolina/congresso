const CONTROL_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const MONTHS = [
  "Novembro/2026",
  "Dezembro/2026",
  "Janeiro/2027",
  "Fevereiro/2027",
  "Março/2027",
  "Abril/2027",
];

export class QueryError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "QueryError";
    this.kind = kind;
  }
}

export function validateId(value, maxLength = 128) {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
    throw new QueryError(
      "validation",
      "O ID contém caracteres de controle ou invisíveis. Digite-o novamente.",
    );
  }
  const id = value.trim();
  if (!id) throw new QueryError("validation", "Informe o ID da participante.");
  if (id.length > maxLength)
    throw new QueryError(
      "validation",
      `O ID deve ter no máximo ${maxLength} caracteres.`,
    );
  return id;
}

export function receiptUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    CONTROL_CHARACTERS.test(value)
  )
    return null;
  try {
    // Exige HTTPS explícito e host; não aceita caminhos relativos ou credenciais.
    if (!/^https:\/\//i.test(value.trim())) return null;
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

const isText = (value, limit) =>
  typeof value === "string" && value.length <= limit;
const isMoney = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  Number.isSafeInteger(Math.round(value * 100));
const cents = (value) => Math.round(value * 100);
const unexpected = () =>
  new QueryError(
    "unexpected",
    "A consulta retornou dados em um formato inesperado. Tente novamente ou avise a organização.",
  );

export function validatePayload(payload, requestedId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw unexpected();
  if (
    payload.ok === false &&
    isText(payload.erro, 500) &&
    payload.erro.trim()
  ) {
    throw new QueryError("script", payload.erro);
  }
  const person = payload.participante;
  if (
    payload.ok !== true ||
    !person ||
    !isText(person.id, 128) ||
    !person.id.trim() ||
    person.id !== requestedId ||
    !isText(person.nome, 500) ||
    !person.nome.trim() ||
    !Array.isArray(payload.parcelas) ||
    payload.parcelas.length !== MONTHS.length
  )
    throw unexpected();

  const byMonth = new Map();
  for (const item of payload.parcelas) {
    if (
      !item ||
      typeof item !== "object" ||
      !MONTHS.includes(item.mes) ||
      byMonth.has(item.mes) ||
      !isMoney(item.valor) ||
      cents(item.valor) !== 10000 ||
      typeof item.pago !== "boolean" ||
      !isText(item.data, 200) ||
      !isText(item.comprovante, 8192)
    )
      throw unexpected();
    byMonth.set(item.mes, {
      mes: item.mes,
      valor: item.valor,
      pago: item.pago,
      data: item.data,
      comprovante: item.comprovante,
    });
  }
  const installments = MONTHS.map((month) => byMonth.get(month));
  const paid = installments.filter((item) => item.pago);
  const totalPaid = paid.reduce((sum, item) => sum + cents(item.valor), 0);
  const total = installments.reduce((sum, item) => sum + cents(item.valor), 0);
  if (
    !Number.isInteger(payload.parcelasPagas) ||
    payload.parcelasPagas !== paid.length ||
    !Number.isInteger(payload.parcelasFaltantes) ||
    payload.parcelasFaltantes !== installments.length - paid.length ||
    !isMoney(payload.valorPago) ||
    cents(payload.valorPago) !== totalPaid ||
    !isMoney(payload.saldo) ||
    cents(payload.saldo) !== total - totalPaid
  )
    throw unexpected();

  // Somente os campos do contrato seguem para a interface.
  return {
    participante: { id: person.id, nome: person.nome },
    parcelas: installments,
    parcelasPagas: payload.parcelasPagas,
    parcelasFaltantes: payload.parcelasFaltantes,
    valorPago: payload.valorPago,
    saldo: payload.saldo,
  };
}

export function createQueryClient(
  config,
  fetcher = globalThis.fetch.bind(globalThis),
) {
  let active = null;
  let sequence = 0;

  function cancel() {
    sequence += 1;
    if (active) {
      active.controller.abort();
      clearTimeout(active.timer);
      active = null;
    }
  }

  async function query(value) {
    // Cancelar também quando o novo ID for inválido impede resultados anteriores.
    cancel();
    const requestNumber = sequence;
    const id = validateId(value, config.maxIdLength);
    let url;
    try {
      url = new URL(config.endpoint);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "script.google.com" ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new QueryError(
        "configuration",
        "O endereço de consulta está configurado incorretamente. Avise a organização.",
      );
    }
    url.search = new URLSearchParams({ id }).toString();
    const controller = new AbortController();
    let timedOut = false;
    let abortListener;
    const request = { controller, timer: null };
    active = request;
    // O timeout abrange a leitura do corpo. A corrida também encerra a consulta
    // se uma implementação de fetch ignorar AbortSignal.
    const aborted = new Promise((resolve, reject) => {
      abortListener = () =>
        reject(
          new QueryError(
            timedOut ? "timeout" : "cancelled",
            timedOut
              ? "A consulta demorou mais que o esperado. Tente novamente."
              : "Consulta cancelada.",
          ),
        );
      controller.signal.addEventListener("abort", abortListener, {
        once: true,
      });
    });
    request.timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);

    try {
      const operation = async () => {
        const response = await fetcher(url.href, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          redirect: "follow",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new QueryError(
            "http",
            `Não foi possível consultar agora (HTTP ${response.status}). Tente novamente mais tarde.`,
          );
        const contentType = response.headers.get("content-type") || "";
        const body = await response.text();
        if (/text\/html/i.test(contentType) || /^\s*</.test(body))
          throw new QueryError(
            "html",
            "O serviço retornou uma página em vez dos dados. A organização precisa verificar a implantação do Apps Script.",
          );
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new QueryError(
            "json",
            "O serviço retornou uma resposta inválida. Tente novamente ou avise a organização.",
          );
        }
        return validatePayload(payload, id);
      };
      const result = await Promise.race([operation(), aborted]);
      if (sequence !== requestNumber)
        throw new QueryError("cancelled", "Consulta cancelada.");
      return result;
    } catch (error) {
      if (sequence !== requestNumber)
        throw new QueryError("cancelled", "Consulta cancelada.");
      if (controller.signal.aborted)
        throw new QueryError(
          timedOut ? "timeout" : "cancelled",
          timedOut
            ? "A consulta demorou mais que o esperado. Tente novamente."
            : "Consulta cancelada.",
        );
      if (error instanceof QueryError) throw error;
      throw new QueryError(
        "network",
        "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente. Se continuar, avise a organização.",
      );
    } finally {
      clearTimeout(request.timer);
      controller.signal.removeEventListener("abort", abortListener);
      if (active === request) active = null;
    }
  }
  return { query, cancel };
}
