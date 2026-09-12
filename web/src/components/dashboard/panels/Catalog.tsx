import { useMemo, useState } from "react";
import { Empty, SectionTitle } from "../ui.js";
import { C, FF_MONO } from "../theme.js";
import { useResource } from "../store.js";
import type { HealthResp, ManifestResp } from "../types.js";
import ToolCard from "./ToolCard.js";

export default function Catalog() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: health } = useResource<HealthResp>("health");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const resources = manifestResp?.manifest?.resources ?? [];
  const reachable = health?.reachable ?? false;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of resources) {
      const c = r.category ?? "Other";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [
      { name: "All", count: resources.length },
      ...[...counts.entries()].map(([name, count]) => ({ name, count })),
    ];
  }, [resources]);

  const searching = query.trim().length > 0 || category !== "All";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (category !== "All" && (r.category ?? "Other") !== category) return false;
      if (!q) return true;
      return `${r.title ?? ""} ${r.tool} ${r.description ?? ""} ${r.category ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [resources, query, category]);

  const featured = resources.filter((r) => r.featured);
  const rest = searching ? filtered : filtered.filter((r) => !r.featured);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionTitle>Catalog · services behind x402</SectionTitle>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search endpoints (e.g. account snapshot, price feed, dns)"
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {categories.map((c) => (
          <button
            key={c.name}
            onClick={() => setCategory(c.name)}
            className="ag-btn"
            style={{
              background: category === c.name ? C.accentBg : C.card,
              color: category === c.name ? C.accent : C.muted,
              border: `1px solid ${category === c.name ? C.accent : C.border}`,
            }}
          >
            {c.name}
            <span style={{ fontFamily: FF_MONO, fontSize: 10, opacity: 0.7 }}>{c.count}</span>
          </button>
        ))}
      </div>

      {resources.length === 0 ? (
        <Empty
          text={manifestResp?.error ?? "Manifest unavailable — is the Agencia service running?"}
        />
      ) : (
        <>
          {!searching && featured.length > 0 && (
            <div>
              <SectionTitle>Featured</SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                {featured.map((r) => (
                  <ToolCard key={r.resource} resource={r} reachable={reachable} featured />
                ))}
              </div>
            </div>
          )}

          {!searching && <SectionTitle>All services</SectionTitle>}

          {rest.length === 0 ? (
            <Empty text="No services match that search." />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
                gap: 12,
                alignItems: "start",
              }}
            >
              {rest.map((r) => (
                <ToolCard key={r.resource} resource={r} reachable={reachable} featured={r.featured} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
