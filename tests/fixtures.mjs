// Dados inteiramente fictícios, utilizados apenas nos testes; não são publicados.
export function success(id = "TESTE-001") {
  return {
    ok: true,
    participante: { id, nome: "Participante de teste" },
    parcelas: [
      "Novembro/2026",
      "Dezembro/2026",
      "Janeiro/2027",
      "Fevereiro/2027",
      "Março/2027",
      "Abril/2027",
    ].map((mes, i) => ({
      mes,
      valor: 100,
      pago: i < 2,
      data: i === 0 ? "2026-11-05" : "",
      comprovante: i === 0 ? "https://example.com/comprovante-teste" : "",
    })),
    parcelasPagas: 2,
    parcelasFaltantes: 4,
    valorPago: 200,
    saldo: 400,
  };
}
