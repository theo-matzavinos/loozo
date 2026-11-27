// Serves the platform-neutral build (`ng run todos:build:neutral`) on Cloudflare's workerd:
//   wrangler dev --config runtimes/wrangler.jsonc
// Wrangler serves dist/neutral/browser and hands every other request to this worker.
import { handle, upgrade } from "../dist/neutral/server/server.mjs";

export default {
  async fetch(request, env, ctx) {
    // Keeps each call's cleanup alive after its client leaves, which workerd would cancel.
    const waitUntil = ctx.waitUntil.bind(ctx);

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return handle(request, waitUntil);
    }

    const result = await upgrade(request, waitUntil);

    if (result === null) {
      return new Response("Not found", { status: 404 });
    }

    if (result instanceof Response) {
      return result;
    }

    const [client, server] = Object.values(new WebSocketPair());

    server.accept();
    result.accept(server);

    return new Response(null, { status: 101, webSocket: client, headers: result.headers });
  },
};
