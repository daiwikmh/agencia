import { Badge, Card, Empty, SectionTitle } from "../ui.js";
import { C, FF_MONO } from "../theme.js";
import { fmtHbar, shortId, timeAgo } from "../format.js";
import { useResource, useSessionCalls } from "../store.js";
import type { HealthResp, ManifestResp } from "../types.js";
import ToolCard from "./ToolCard.js";

const LINKS = [
  { label: "Subgraph MCP docs", href: "https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/" },
  { label: "Subgraph SKILLs", href: "https://github.com/graphprotocol/subgraphs-skills" },
  { label: "Substreams SKILLs", href: "https://github.com/streamingfast/substreams-skills" },
];

export default function Graph() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: health } = useResource<HealthResp>("health");
  const [calls] = useSessionCalls();

  const resource = manifestResp?.manifest?.resources.find((r) => r.tool === "graph_query");
  const reachable = health?.reachable ?? false;
  const runs = calls.filter((c) => c.tool === "graph_query");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionTitle>Query 15,000+ subgraphs, pay per query</SectionTitle>
        <Card>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
            Every query is a paid MCP call, same as the rest of the catalog: 402 → verify →
            run the GraphQL query → settle in HBAR → HCS receipt. Point it at any subgraph
            endpoint — a Studio query URL works with no key; a bare subgraph id resolves
            through the Graph Gateway if <code>GRAPH_API_KEY</code> is set on the service.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {LINKS.map((l) => (
              <a
                key={l.href}
                className="ag-link"
                href={l.href}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, fontFamily: FF_MONO }}
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </Card>
      </div>

      {resource ? (
        <ToolCard resource={resource} reachable={reachable} featured defaultOpen />
      ) : (
        <Card>
          <Empty text={manifestResp?.error ?? "graph_query is not in the manifest — is the service running?"} />
        </Card>
      )}

      <div>
        <SectionTitle>Recent Graph queries</SectionTitle>
        <Card pad={0}>
          {runs.length ? (
            runs.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "11px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.ink,
                      fontFamily: FF_MONO,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.summary}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 2 }}>
                    {timeAgo(c.at)}
                    {c.txId ? ` · ${shortId(c.txId)}` : ""}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {c.status === "running" && <Badge tone="neutral">running</Badge>}
                  {c.status === "ok" && <Badge tone="pass">{c.hbar ? fmtHbar(c.hbar) : "paid"}</Badge>}
                  {c.status === "error" && <Badge tone="breach">failed</Badge>}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 16 }}>
              <Empty text="No subgraph queries run this session." />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
