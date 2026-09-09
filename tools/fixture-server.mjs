/* Serves tools/fixture.json at the same path the real webhook uses, so the
   dashboard can be pointed at it with ?api=http://localhost:5186 and reviewed
   before anything is deployed to n8n.

   Local review only — it reads a file and serves it, nothing else.
     node tools/fixture-server.mjs [port]
*/
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 5186);

const server = createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  if (req.url.startsWith("/webhook/framework-tracker/data")) {
    // read per request, so rebuilding the fixture shows up on refresh
    const body = readFileSync(resolve(here, "fixture.json"), "utf8");
    res.writeHead(200, cors);
    return res.end(body);
  }
  if (req.url.startsWith("/webhook/framework-tracker/functions")) {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({ success: true, functions: [], updatedAt: new Date().toISOString() }));
  }
  res.writeHead(404, cors);
  res.end(JSON.stringify({ error: "not found", url: req.url }));
});

server.listen(port, () => {
  console.log(`fixture server  http://localhost:${port}/webhook/framework-tracker/data`);
});
