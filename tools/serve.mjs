// Ferramenta de desenvolvimento; não é necessária no site publicado.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export async function startServer(port = 4173) {
  const server = http.createServer(async (request, response) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      let pathname = new URL(request.url, "http://localhost").pathname;
      // Simula também a hospedagem no subdiretório de um repositório.
      if (pathname === "/congresso-consulta") {
        response.writeHead(308, { Location: "/congresso-consulta/" }).end();
        return;
      }
      if (pathname.startsWith("/congresso-consulta/"))
        pathname = pathname.slice("/congresso-consulta".length);
      if (pathname === "/") pathname = "/index.html";
      if (
        pathname !== "/index.html" &&
        pathname !== "/assets/favicon.svg" &&
        !/^\/assets\/(css|js|images)\/[a-zA-Z0-9.-]+$/.test(pathname)
      ) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(path.join(root, pathname));
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(pathname)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await startServer(Number(process.env.PORT || 4173));
  console.log(
    `Prévia local: http://127.0.0.1:${server.address().port}/congresso-consulta/`,
  );
}
