import { Card, Empty, KV, SectionTitle, StatTile } from "../ui.js";
import { C, FF_MONO } from "../theme.js";
import { fmtHbar, shortId, timeAgo } from "../format.js";
import { useResource, useSessionCalls } from "../store.js";
import type { WalletResp } from "../types.js";

export default function Wallet() {
  const { data: wallet } = useResource<WalletResp>("wallet");
  const [calls] = useSessionCalls();

  const paid = calls.filter((c) => c.status === "ok");
  const sessionSpent = paid.reduce((s, c) => s + (c.hbar ?? 0), 0);
  const balance = wallet?.balanceHbar;
  const budget = wallet?.budgetHbar ?? 0;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionTitle>Consuming agent</SectionTitle>
        {wallet?.ok ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 12,
            }}
          >
            <StatTile
              label="Balance"
              value={balance != null ? fmtHbar(balance) : "—"}
              tone={balance != null && balance > 0 ? "good" : "warn"}
            />
            <StatTile label="Session spend" value={fmtHbar(sessionSpent)} sub={`${paid.length} paid`} />
            <StatTile
              label="Budget cap"
              value={budget > 0 ? fmtHbar(budget) : "off"}
              sub="AGENT_BUDGET_HBAR"
            />
            <StatTile
              label="After session"
              value={balance != null ? fmtHbar(Math.max(0, balance - sessionSpent)) : "—"}
            />
          </div>
        ) : (
          <Card>
            <Empty
              text={wallet?.error ?? "Wallet unavailable — set AGENT_ACCOUNT_ID on the platform."}
            />
          </Card>
        )}
      </div>

      {wallet?.ok && (
        <Card>
          <KV k="account" v={shortId(wallet.accountId ?? "—")} />
          <KV k="network" v={wallet.network ?? "—"} />
          {wallet.createdTimestamp && (
            <KV
              k="created"
              v={timeAgo(new Date(Number(wallet.createdTimestamp.split(".")[0]) * 1000).toISOString())}
            />
          )}
          <KV k="HTS tokens" v={String(wallet.tokens?.length ?? 0)} />
        </Card>
      )}

      <div>
        <SectionTitle>HTS balances</SectionTitle>
        <Card pad={0}>
          {wallet?.tokens?.length ? (
            wallet.tokens.map((t) => (
              <div
                key={t.token_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  fontFamily: FF_MONO,
                  fontSize: 12,
                }}
              >
                <span style={{ color: C.muted }}>{t.token_id}</span>
                <span style={{ color: C.ink }}>{t.balance}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: 16 }}>
              <Empty text="No HTS tokens held." />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
