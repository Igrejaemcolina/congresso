import { CONFIG } from "./config.js";
import { createQueryClient, receiptUrl, QueryError } from "./api.js";

const byId = (id) => document.getElementById(id);
const form = byId("query-form");
const input = byId("participant-id");
const results = byId("results");
const client = createQueryClient(CONFIG);
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const consultationTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});
let currentRequest = 0;

function setStatus(message = "", state = "initial") {
  byId("request-area").classList.toggle("is-empty", !message);
  byId("request-area").dataset.state = state;
  byId("status").textContent = message;
  byId("cancel-query").hidden = state !== "loading";
  form.setAttribute("aria-busy", String(state === "loading"));
}

function clearResults() {
  results.hidden = true;
  for (const id of [
    "participant-name",
    "participant-code",
    "paid-value",
    "remaining-value",
    "paid-count",
    "remaining-count",
    "paid-count-caption",
    "remaining-count-caption",
    "progress-label",
    "progress-description",
    "consulted-at",
  ])
    byId(id).textContent = "";
  byId("consulted-at").removeAttribute("datetime");
  byId("installments").replaceChildren();
  byId("payment-progress").value = 0;
}

function clearValidation() {
  input.removeAttribute("aria-invalid");
  byId("field-error").hidden = true;
  byId("field-error").textContent = "";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paymentDate(value) {
  if (!value.trim()) return "";
  // Datas ISO sem horário são datas de calendário; não deslocar para o dia anterior.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }).format(date);
  }
  return value;
}

function renderInstallment(item) {
  const card = element("li", "installment");
  const top = element("div", "installment-top");
  top.append(
    element("h4", "", item.mes),
    element(
      "span",
      item.pago ? "badge paid" : "badge",
      item.pago ? "✓ Pago" : "◷ Pendente",
    ),
  );
  card.append(top, element("p", "installment-value", money.format(item.valor)));
  if (item.data.trim())
    card.append(
      element(
        "p",
        "installment-date",
        `Data do pagamento: ${paymentDate(item.data)}`,
      ),
    );
  const bottom = element("div", "installment-bottom");
  const url = receiptUrl(item.comprovante);
  if (url) {
    const link = element("a", "receipt-link", "Ver comprovante ↗");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.setAttribute(
      "aria-label",
      `Ver comprovante de ${item.mes} (abre em nova aba)`,
    );
    bottom.append(link);
  } else if (item.pago) {
    bottom.append(element("span", "", "Comprovante não disponível"));
  } else {
    bottom.append(element("span", "", "Aguardando registro do pagamento"));
  }
  card.append(bottom);
  return card;
}

function renderResult(data) {
  const now = new Date();
  byId("participant-name").textContent = data.participante.nome;
  byId("participant-code").textContent = `ID: ${data.participante.id}`;
  byId("paid-value").textContent = money.format(data.valorPago);
  byId("remaining-value").textContent = money.format(data.saldo);
  byId("paid-count").textContent = data.parcelasPagas;
  byId("remaining-count").textContent = data.parcelasFaltantes;
  byId("paid-count-caption").textContent =
    `de ${data.parcelas.length} parcelas`;
  byId("remaining-count-caption").textContent =
    `de ${data.parcelas.length} parcelas`;
  const percentage = Math.round(
    (data.parcelasPagas / data.parcelas.length) * 100,
  );
  byId("payment-progress").value = percentage;
  byId("progress-label").textContent = `${percentage}%`;
  byId("progress-description").textContent =
    `${data.parcelasPagas} de ${data.parcelas.length} parcelas pagas`;
  byId("installments").replaceChildren(...data.parcelas.map(renderInstallment));
  byId("consulted-at").textContent = consultationTime.format(now);
  byId("consulted-at").dateTime = now.toISOString();
  results.hidden = false;
  byId("participant-name").focus({ preventScroll: true });
  results.scrollIntoView({ behavior: "instant", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const request = ++currentRequest;
  clearResults();
  clearValidation();
  setStatus("Consultando os pagamentos…", "loading");
  try {
    const data = await client.query(input.value);
    if (request !== currentRequest) return;
    renderResult(data);
    setStatus(
      "Consulta concluída. Os pagamentos estão disponíveis abaixo.",
      "success",
    );
  } catch (error) {
    if (request !== currentRequest) return;
    const message =
      error instanceof QueryError
        ? error.message
        : "Não foi possível concluir a consulta. Tente novamente.";
    if (error.kind === "validation") {
      input.setAttribute("aria-invalid", "true");
      byId("field-error").textContent = message;
      byId("field-error").hidden = false;
      input.focus();
    }
    setStatus(message, error.kind === "cancelled" ? "initial" : "error");
  }
});

byId("cancel-query").addEventListener("click", () => {
  currentRequest += 1;
  client.cancel();
  clearResults();
  setStatus("Consulta cancelada. Você pode tentar novamente.");
  input.focus();
});

byId("new-query").addEventListener("click", () => {
  currentRequest += 1;
  client.cancel();
  clearResults();
  clearValidation();
  form.reset();
  setStatus();
  input.focus();
  byId("consulta").scrollIntoView({ behavior: "instant", block: "start" });
});

// Limpa informações também ao sair da página ou restaurá-la pelo histórico.
window.addEventListener("pagehide", () => {
  currentRequest += 1;
  client.cancel();
  clearResults();
  clearValidation();
  form.reset();
  setStatus();
});
