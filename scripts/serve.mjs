import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const port = Number(process.env.PORT ?? 1420);
const host = process.env.TAURI_DEV_HOST ?? "127.0.0.1";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  const candidate = path.resolve(root, relativePath);

  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== path.join(root, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(candidate);
    if (!info.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Media Player web app listening on http://${host}:${port}`);
});
