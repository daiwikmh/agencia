import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import { dnsLookup, githubRepo, readUrl } from "../../capabilities/external.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerExternalTools(server: McpServer): void {
  const web = catalogEntry("web_read");
  if (web) {
    registerPaidTool(server, {
      name: web.name,
      description: web.description,
      inputSchema: { url: z.string().url().describe("Absolute http(s) URL") },
      price: (args) => priceFor(web.name, args),
      run: async (args) => jsonResult(await readUrl(String(args.url))),
    });
  }

  const dns = catalogEntry("dns_lookup");
  if (dns) {
    registerPaidTool(server, {
      name: dns.name,
      description: dns.description,
      inputSchema: {
        name: z.string().describe("Hostname to resolve"),
        type: z.string().default("A").describe("DNS record type, e.g. A, AAAA, MX, TXT"),
      },
      price: (args) => priceFor(dns.name, args),
      run: async (args) => jsonResult(await dnsLookup(String(args.name), String(args.type ?? "A"))),
    });
  }

  const gh = catalogEntry("github_repo");
  if (gh) {
    registerPaidTool(server, {
      name: gh.name,
      description: gh.description,
      inputSchema: {
        owner: z.string().describe("Repository owner or org"),
        repo: z.string().describe("Repository name"),
      },
      price: (args) => priceFor(gh.name, args),
      run: async (args) => jsonResult(await githubRepo(String(args.owner), String(args.repo))),
    });
  }
}
