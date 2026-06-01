import server from "./dist/server/index.js";
import { file } from "bun";

const port = process.env.PORT || 8080;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. Static files only (assets/*, fonts, images, manifests, etc.)
    if (
      url.pathname.startsWith("/assets/") ||
      /\.(ico|svg|png|jpg|jpeg|webp|gif|css|js|map|woff2?|ttf|json|txt|webmanifest)$/.test(url.pathname)
    ) {
      const staticFile = file(`./dist/client${url.pathname}`);
      if (await staticFile.exists()) {
        return new Response(staticFile);
      }
    }

    // 2. Every other path → SSR handler (TanStack Start exports it as `default`)
    try {
      const handler = (server as any).default || (server as any).fetch || server;
      if (typeof handler === "function") {
        return await handler(req);
      }
      if (typeof handler?.fetch === "function") {
        return await handler.fetch(req);
      }
    } catch (err) {
      console.error("SSR error:", err);
    }

    // 3. SPA fallback — serve index.html for client-side routing if it exists
    const indexFile = file("./dist/client/index.html");
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Server Error", { status: 500 });
  },
});

console.log(`Listening on http://localhost:${port}`);
