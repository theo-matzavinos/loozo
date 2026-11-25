// Serves the platform-neutral build (`ng run todos:build:neutral`) on Deno:
//   deno run --allow-net --allow-read --allow-env runtimes/deno.mjs
// Prints `LAUNCH_READY <url>` once listening on a free loopback port.
import { reqHandler, upgrade } from "../dist/neutral/server/server.mjs";

const browser = new URL("../dist/neutral/browser/", import.meta.url);
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
};

async function channel(request) {
  // Deno.upgradeWebSocket aborts request.signal under Deno's default (legacy) abort behavior,
  // so Launch gets a signal of its own: it follows the request until the upgrade, and aborts
  // if Deno can't complete the handshake.
  const leaving = new AbortController();
  const follow = () => leaving.abort(request.signal.reason);

  request.signal.addEventListener("abort", follow, { once: true });

  const result = await upgrade(new Request(request, { signal: leaving.signal }));

  request.signal.removeEventListener("abort", follow);

  if (result === null) {
    return new Response("Not found", { status: 404 });
  }

  if (result instanceof Response) {
    return result;
  }

  let upgraded;

  try {
    // Throws for a handshake Launch doesn't check, such as one without Sec-WebSocket-Key.
    upgraded = Deno.upgradeWebSocket(request);
  } catch (error) {
    leaving.abort(error);

    return new Response("Bad websocket handshake", { status: 400 });
  }

  const { socket, response } = upgraded;

  // A handshake that fails after the 101 is only an error event, without open or close.
  socket.addEventListener("open", () => result.accept(socket), { once: true });
  socket.addEventListener("error", () => leaving.abort(), { once: true });

  for (const [name, value] of result.headers) {
    response.headers.append(name, value);
  }

  return response;
}

async function asset(pathname) {
  const file = new URL(`.${pathname}`, browser);

  if (!file.href.startsWith(browser.href)) {
    return new Response("Invalid asset", { status: 400 });
  }

  try {
    const type = types[pathname.slice(pathname.lastIndexOf("."))];

    return new Response(await Deno.readFile(file), {
      headers: type ? { "content-type": type } : {},
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

Deno.serve(
  {
    hostname: "127.0.0.1",
    port: 0,
    onListen: ({ port }) => console.log(`LAUNCH_READY http://127.0.0.1:${port}`),
  },
  (request) => {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return channel(request);
    }

    const { pathname } = new URL(request.url);
    const name = pathname.slice(pathname.lastIndexOf("/") + 1);

    if (name.includes(".")) {
      return asset(pathname);
    }

    return reqHandler(request);
  },
);
