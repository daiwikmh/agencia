import { SectionTitle, StatTile } from "../ui.js";
import { fmtHbar, shortFacilitator } from "../format.js";
import { useResource, useSessionCalls } from "../store.js";
import type { AuditResp, HealthResp, ManifestResp } from "../types.js";

export default function Overview() {
  const { data: health } = useResource<HealthResp>("health");
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: audit } = useResource<AuditResp>("audit");
  const [calls] = useSessionCalls();

  const manifest = manifestResp?.manifest ?? null;
  const reachable = health?.reachable ?? false;
  const hcsCount = audit?.messages.length ?? 0;
  const paidCalls = calls.filter((c) => c.status === "ok");
  const sessionSpent = paidCalls.reduce((s, c) => s + (c.hbar ?? 0), 0);

  return (
    <section>
      <SectionTitle>Overview</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 12,
        }}
      >
        <StatTile
          label="Service"
          value={reachable ? "Online" : "Offline"}
          tone={reachable ? "good" : "bad"}
          sub={health?.serviceUrl}
        />
        <StatTile label="Network" value={manifest?.network ?? health?.health?.network ?? "—"} />
        <StatTile
          label="Facilitator"
          value={shortFacilitator(manifest?.facilitator ?? health?.health?.facilitator)}
        />
        <StatTile label="HCS receipts" value={hcsCount} sub={audit?.topicId ?? "no topic"} />
        <StatTile
          label="Session spend"
          value={fmtHbar(sessionSpent)}
          sub={`${paidCalls.length} paid`}
        />
      </div>
    </section>
  );
}
