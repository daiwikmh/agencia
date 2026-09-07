import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Hono } from "hono";
import { buildMcpServer } from "../../mcp/server.js";
import { requestOrigin } from "../origin.js";

export const mcp = new Hono<{ Bindings: HttpBindings }>();

mcp.all("/mcp", async (c) => {
  const server = buildMcpServer(requestOrigin(c.req.raw));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  const { incoming, outgoing } = c.env;
  outgoing.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  const body = await c.req.json().catch(() => undefined);
  await transport.handleRequest(incoming, outgoing, body);
  return RESPONSE_ALREADY_SENT;
});
