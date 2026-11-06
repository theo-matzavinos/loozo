import { middleware } from "@loozo/angular-launch/server";

// Times the rest of the call. The header reaches RPC responses only: Launch drops headers
// during server rendering, and a stream's response has started by the time next() settles.
export const timing = middleware(async ({ next, response }) => {
  const start = performance.now();

  try {
    return await next();
  } finally {
    response.headers.append("server-timing", `rpc;dur=${(performance.now() - start).toFixed(1)}`);
  }
});
