import { cp, mkdir, writeFile } from "node:fs/promises";

// Somente estes arquivos integram o artefato publicado; testes e ferramentas ficam fora.
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await cp(
  new URL("../index.html", import.meta.url),
  new URL("../dist/index.html", import.meta.url),
);
await cp(
  new URL("../assets/", import.meta.url),
  new URL("../dist/assets/", import.meta.url),
  { recursive: true },
);
await writeFile(new URL("../dist/.nojekyll", import.meta.url), "");
console.log("Site estático preparado em dist/.");
