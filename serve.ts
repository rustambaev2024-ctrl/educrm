import server from "./dist/server/index.js";
import { file } from "bun";

const port = process.env.PORT || 8080;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve static files from dist/client
    if (url.pathname !== "/") {
      const staticFile = file(`./dist/client${url.pathname}`);
      if (await staticFile.exists()) {
        return new Response(staticFile);
      }
    }
    
    // Otherwise handle SSR
    const fetchHandler = server.default || server.fetch || server;
    if (typeof fetchHandler === "function") {
      return fetchHandler(req);
    } else if (fetchHandler.fetch) {
      return fetchHandler.fetch(req);
    }
    
    return new Response("Not found", { status: 404 });
  }
});

console.log(`Listening on http://localhost:${port}`);
