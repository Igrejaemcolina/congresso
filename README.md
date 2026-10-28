# Congresso — Consulta de pagamentos

Site estático em HTML, CSS e JavaScript puro, com consulta individual ao Google Apps Script existente. Sem bibliotecas em produção, servidor de aplicação, banco adicional. Nenhuma participante é carregada automaticamente.

A identidade visual acompanha a referência do Congresso das Mulheres: verde floresta, dourado, fundo de papel e ilustrações de colheita, com a marca “Colheita | IGC”. As imagens fornecidas/referenciadas pelo responsável estão em `assets/images/` e são servidas pelo próprio site, sem carregamento externo do Wix. Os títulos usam fontes disponíveis no dispositivo, sem depender de um serviço de fontes. Essa adaptação visual não altera o cadastro, os IDs ou o contrato dos pagamentos.

## Situação da entrega

Implementação local concluída. **A integração real foi confirmada no Chrome após o responsável atualizar a implantação do Apps Script.** A consulta foi realizada pelo próprio site, servido em origem HTTP local diferente do serviço, em um contexto de navegador sem login. O resultado correspondeu ao ID solicitado e exibiu as seis parcelas, sem erro de CORS, HTTP ou conexão. Nenhum ID, nome, comprovante ou resposta pessoal foi gravado em arquivos, capturas ou logs.

Validação local em 28/10/2026: **12 testes unitários e 24 testes de navegador passaram**, incluindo a auditoria automatizada de acessibilidade. O pacote estático foi gerado e as telas foram revisadas visualmente em desktop e celular com dados fictícios. O teste real posterior confirmou a integração em origem local; a publicação e a consulta no endereço final do GitHub Pages ainda não foram verificadas.

O bloqueio anterior era um redirecionamento para o login do Google. Após a atualização, o diagnóstico sem ID identificou o redirecionamento esperado para `script.googleusercontent.com`, resposta HTTP 200 JSON com a mensagem de ID ausente e `Access-Control-Allow-Origin: *`. A primeira tentativa de fetch sem ID ainda falhou por CORS; sua repetição passou. A consulta real com ID passou. A URL permaneceu igual, dispensando alteração da configuração do site. Não fiz alterações no código do Apps Script, na função `adicionarParticipante`, na planilha, nos pagamentos ou nos comprovantes. As permissões individuais dos comprovantes não foram verificadas.

Git e GitHub CLI não estavam disponíveis no ambiente de entrega, e a pasta não continha repositório ou remote. Não foram feitos commit, push, criação de repositório ou publicação. O workflow está preparado, mas sua execução no GitHub ainda depende da criação/configuração do repositório.

## Executar localmente

Com Node.js 24 ou superior, na pasta do projeto:

```powershell
npm start
```

Abra `http://127.0.0.1:4173/congresso-consulta/`. Esse servidor é apenas uma ferramenta local; o site publicado usa somente arquivos estáticos. Não abra o HTML diretamente por `file://`, pois ele utiliza módulos JavaScript.

Alternativa com Python instalado: `python -m http.server 4173 --bind 127.0.0.1`, acessando `http://127.0.0.1:4173/`. Essa alternativa serve a pasta toda: use-a somente para desenvolvimento local.

## Configuração

A URL pública está em [`assets/js/config.js`](assets/js/config.js), junto com o timeout de 20 segundos e o limite de 128 caracteres para o ID. O endereço é visível no navegador e não é senha nem autenticação. Use a URL HTTPS `/macros/s/.../exec` da implantação, sem query string. O cliente aceita somente o host `script.google.com`; o navegador segue o redirecionamento normal do ContentService para `script.googleusercontent.com`.

Os IDs são tratados como texto, preservando zeros à esquerda e letras. Apenas espaços nas extremidades são removidos; caracteres de controle/invisíveis são recusados. Os parâmetros são montados com `URL` e `URLSearchParams`. A resposta precisa corresponder ao ID solicitado e ao contrato das seis parcelas de R$ 100, de novembro/2026 a abril/2027. Contagens e valores incoerentes geram aviso de formato inesperado, sem apresentar um resumo contraditório.

## Testes

```powershell
npm ci
npm test
npm run test:browser
npm run build
```

No Windows, os testes usam o Chrome em sua localização padrão quando disponível. Em outro ambiente, instale o navegador de teste antes de rodar: `npx playwright install chromium` (no Linux CI: `npx playwright install --with-deps chromium`). Em PowerShell com scripts bloqueados, use `npm.cmd`/`npx.cmd` no lugar de `npm`/`npx`.

Os testes unitários cobrem sucesso, participante não encontrada, ID vazio/excessivo/com caracteres de controle, alfanuméricos e zeros à esquerda, comprovantes ausentes/inválidos, rede, HTTP, timeout inclusive na leitura do corpo, HTML, JSON inválido, estrutura e totais incoerentes, cancelamento e concorrência com fetch que ignora abort.

Os testes no Chrome cobrem desktop e celular, Enter, foco, reset e limpeza de dados, mensagens acessíveis, comprovantes, prevenção de injeção de HTML, erros, timeout, concorrência e ausência de armazenamento local/session/SW. A auditoria automatizada axe verifica regras WCAG A/AA nos estados inicial, erro e sucesso; não substitui uma auditoria manual completa com tecnologias assistivas. Também há checagem de ausência de rolagem horizontal em larguras de 320, 360, 768 e 1280 px. Todos os dados dos testes são fictícios e ficam fora do artefato de publicação.

### Repetir o teste real

Para verificar novamente a integração, forneça um ID autorizado apenas na sessão, sem gravá-lo no código ou em arquivos:

```powershell
$env:CONSULTA_TEST_ID = Read-Host 'ID autorizado para testar'
npm run test:live
Remove-Item Env:CONSULTA_TEST_ID
```

O teste abre o próprio site em um navegador, de outra origem, e imprime somente indicadores de sucesso/erro e categorias técnicas. Não gera captura, trace, HAR ou resposta pessoal. O processo retorna código 1 se a integração não for confirmada. A consulta só é confirmada se o resultado estiver visível, corresponder ao ID solicitado e exibir seis parcelas.

Para diagnosticar sem consultar nenhuma participante:

```powershell
node tools/diagnose-service.mjs
```

O diagnóstico imprime somente status, hosts, tipo de conteúdo e indicadores; não imprime corpos de resposta. Evite exportar HARs ou compartilhar URLs com ID, respostas, comprovantes ou capturas reais.

## Permissões e atualização da implantação existente do Apps Script

A implantação atual já respondeu à consulta anônima pelo site. Mantenha as permissões abaixo ao atualizar a implantação ou use estes passos se o redirecionamento para login reaparecer. Não é necessário publicar a planilha, mudar permissões dos comprovantes, criar proxy ou alterar `adicionarParticipante`.

1. Acesse o projeto Apps Script original com a conta responsável por ele. Não substitua o código nem os dados da planilha.
2. Abra **Implantar → Gerenciar implantações** e selecione a implantação cuja URL corresponde a `config.js`.
3. Clique no lápis **Editar**. Confirme o tipo **Aplicativo da Web**. Configure **Executar como: Eu** (a conta responsável, com acesso à planilha) e **Quem pode acessar: Qualquer pessoa**, inclusive sem conta Google. A opção limitada a usuários autenticados ou ao domínio não atende a esta interface estática.
4. Se o código não mudou, mantenha a versão existente. Se o responsável alterou o código, salve-o, escolha **Nova versão** na mesma implantação e clique em **Implantar**. Atualizar a implantação existente mantém a URL; apenas salvar código no editor não atualiza uma versão publicada.
5. Autorize o script com a conta responsável se o Google solicitar. Não compartilhe tokens. Copie a URL `/exec` exibida e confirme que corresponde à configuração; se mudou, atualize somente `endpoint` em `config.js`.
6. Em janela anônima, abra primeiro a URL sem ID. Deve retornar `{"ok":false,"erro":"Informe o ID."}` sem exigir login.
7. Rode o diagnóstico e `npm run test:live` novamente. Mesmo obter JSON por navegação direta não dispensa o teste de fetch a partir do site.
8. Depois de publicar no GitHub Pages, abra o endereço final em janela anônima, faça uma consulta autorizada e confira resumo, seis parcelas, limpeza e links. As permissões dos comprovantes precisam ser verificadas separadamente por quem os acessa.

Não há acesso administrativo ao Apps Script neste projeto; a atualização da implantação foi feita pelo responsável. Se a opção **Qualquer pessoa** deixar de estar disponível por política da conta/organização, o responsável precisará liberar uma implantação que permita acesso anônimo. Caso o serviço volte a exigir login, a consulta sem login ficará bloqueada sob as restrições atuais. Não é possível resolver o login obrigatório apenas mudando o JavaScript estático.

Não foi identificado motivo para propor alteração do código do Apps Script. Sem seu código-fonte original não seria possível entregar uma substituição que comprovadamente preservasse `adicionarParticipante`. Se, após ajustar o acesso, persistir um erro do script ou formato inesperado, revise a execução original com o responsável antes de qualquer mudança.

Referências oficiais: [aplicativos da Web e permissões](https://developers.google.com/apps-script/guides/web), [atualizar uma implantação mantendo sua URL](https://developers.google.com/apps-script/concepts/deployments), [ContentService e redirecionamento](https://developers.google.com/apps-script/guides/content). `TextOutput` não oferece uma API genérica para definir cabeçalhos CORS. Não utilize JSONP para estes dados pessoais, `mode: "no-cors"` ou proxies públicos.

## GitHub e GitHub Pages

Instale Git e GitHub CLI, então autentique pela interface do CLI: `gh auth login`. Não coloque tokens neste projeto ou no chat. Antes de inicializar, verifique se esta pasta já pertence a um repositório com `git status` e `git remote -v` para preservar trabalho existente. Os comandos abaixo são para esta pasta ainda sem repositório:

```powershell
gh auth status
gh api user --jq .login
```

Confirme a conta de destino. Verifique se `congresso-consulta` está livre no perfil. Se houver um repositório com esse nome, inspecione-o antes de reutilizar; não sobrescreva seu conteúdo. Depois de conferir os arquivos e a ausência de dados pessoais:

```powershell
git init -b main
git add index.html assets tools tests .github .gitignore README.md package.json package-lock.json playwright.config.js
git diff --cached --stat
git diff --cached
git commit -m "Implementa consulta individual de pagamentos do Congresso"
gh repo create congresso-consulta --private --source=. --remote=origin --push
```

Prefira repositório privado. [GitHub Pages permite repositórios privados em planos compatíveis, como Pro e Team](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Se o plano exigir repositório público, obtenha a decisão do responsável antes de criar ou alterar para público. Um repositório privado não implica que o site Pages ficará privado; este projeto foi preparado para acesso público à interface, sem login do ChatGPT.

No GitHub, abra **Settings → Pages → Build and deployment → Source → GitHub Actions**. Em **Actions**, execute **Testar e publicar no GitHub Pages → Run workflow**, na branch `main`. O workflow testa, prepara `dist/` e publica somente HTML, CSS, JavaScript e `.nojekyll`. Os arquivos de teste, ferramentas e dependências de desenvolvimento não são enviados no artefato Pages.

O endereço final será informado pelo job de deployment e por **Settings → Pages**. Verifique o carregamento dos arquivos `assets/` no endereço real do repositório; os caminhos relativos foram testados localmente em `/congresso-consulta/`, mas isso ainda não valida uma publicação no GitHub.

### Atualizações

Edite os arquivos-fonte, rode os testes, revise o diff e faça commit e push para `main`, sem force push. O workflow publica após os testes passarem. Alterações apenas no Apps Script exigem atualização de sua implantação, conforme os passos anteriores; não exigem novo push do site se a URL e o contrato permanecerem iguais.

## Privacidade e limites de acesso

- **Consulta por ID não é autenticação segura.** Quem souber ou adivinhar um ID válido pode consultar os dados correspondentes. Como melhoria futura, adote códigos individuais longos e aleatórios, com a organização planejando a migração; este projeto mantém o contrato atual.
- O site não lista participantes, não sugere nomes, não faz consulta em lote e não contém dados da planilha. Dados recebidos são inseridos com `textContent` e APIs de DOM; não há HTML dinâmico vindo da resposta.
- Resultados ficam somente na memória e no DOM durante a consulta, sem logs de dados pessoais, analytics, localStorage, sessionStorage, IndexedDB, cache de aplicação ou service worker. São removidos ao iniciar outra consulta, cancelar, redefinir ou sair da página. A requisição usa `cache: "no-store"`.
- O contrato usa GET: o ID integra a URL da requisição de rede e pode aparecer nos registros da infraestrutura Google e nas ferramentas de desenvolvedor. A URL pública do Apps Script não é segredo nem protege o acesso.
- A situação depende exclusivamente do booleano `pago`. Ter comprovante não confirma pagamento. Não há cálculo de atraso, porque não foram fornecidos dias de vencimento.
- Links de comprovantes exigem HTTPS, abrem em nova aba com `noopener noreferrer` e não transmitem referrer. A interface não altera permissões do Drive nem garante acesso a arquivos não verificados. Um link inválido nunca é clicável.
- “Consulta realizada em” representa o horário de término da consulta no navegador, exibido em `America/Sao_Paulo`; não indica a última atualização da planilha.
- A política CSP limita scripts/estilos à própria origem e as consultas aos dois hosts do Apps Script. Não há dependência de fontes ou imagens externas.

## Organização

```text
index.html                  Interface e marcação acessível
assets/css/styles.css       Layout responsivo e estados visuais
assets/js/config.js         URL e limites da consulta
assets/js/api.js            Validação, rede, timeout e cancelamento
assets/js/app.js            Interação e renderização segura
tests/                      Testes com dados exclusivamente fictícios
tools/                      Servidor local, diagnóstico, teste real e empacotamento
.github/workflows/pages.yml Validação e publicação automatizada
```

Playwright e axe são dependências apenas de desenvolvimento para automação de navegador e auditoria de acessibilidade. O site em produção não carrega nenhuma delas.
