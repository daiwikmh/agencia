import { Hono } from "hono";
import { config } from "../../../config.js";
import { inventory, marketplace } from "../../compute/registry.js";
import { listLeases } from "../../compute/leases.js";
import { getIdentity, listIdentities, setContact, touchIdentity } from "../../identity/accounts.js";
import {
  listSuppliers,
  publicSupplier,
  registerSupplier,
  setSupplierStatus,
  type SupplierRegistration,
} from "../../compute/suppliers.js";

export const providers = new Hono();

function admin(header: string | undefined): boolean {
  return !!config.compute.adminToken && header === `Bearer ${config.compute.adminToken}`;
}

providers.get("/providers", async (c) => {
  const cpu = Number(c.req.query("cpu") ?? 1);
  const memMb = Number(c.req.query("memMb") ?? 512);
  return c.json(await marketplace(cpu, memMb));
});

providers.get("/compute/inventory", async (c) => {
  const cpu = Number(c.req.query("cpu") ?? 1);
  const memMb = Number(c.req.query("memMb") ?? 512);
  const [hardware, market] = await Promise.all([inventory(cpu, memMb), marketplace(cpu, memMb)]);
  const owner = c.req.query("owner");
  return c.json({
    ...hardware,
    leases: listLeases(owner || undefined),
    hbarUsd: market.hbarUsd,
    directory: market.directory,
  });
});

providers.post("/providers/register", async (c) => {
  let body: SupplierRegistration;
  try {
    body = await c.req.json<SupplierRegistration>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  try {
    const supplier = registerSupplier(body);
    return c.json(
      {
        ok: true,
        supplier: publicSupplier(supplier),
        next:
          supplier.status === "allowlisted"
            ? "allowlisted — leases can route to you now"
            : "pending review — an operator must allowlist this endpoint before it receives leases",
      },
      201,
    );
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 400);
  }
});

providers.post("/providers/:id/status", async (c) => {
  if (!admin(c.req.header("authorization"))) return c.json({ error: "unauthorized" }, 401);
  const status = (await c.req.json<{ status: string }>().catch(() => ({ status: "" }))).status;
  if (status !== "allowlisted" && status !== "pending" && status !== "suspended") {
    return c.json({ error: "status must be allowlisted, pending or suspended" }, 400);
  }
  try {
    return c.json({ ok: true, supplier: publicSupplier(setSupplierStatus(c.req.param("id"), status)) });
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 404);
  }
});

providers.get("/identity/:accountId", (c) => {
  const identity = getIdentity(c.req.param("accountId"));
  if (!identity) return c.json({ error: "unknown account" }, 404);
  return c.json({ ...identity, leases: listLeases(identity.accountId) });
});

providers.post("/identity/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  if (!/^\d+\.\d+\.\d+$/.test(accountId)) return c.json({ error: "invalid account id" }, 400);
  const body: { email?: string; label?: string } = await c.req
    .json<{ email?: string; label?: string }>()
    .catch(() => ({}));
  try {
    touchIdentity(accountId);
    return c.json(setContact(accountId, body.email, body.label));
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 400);
  }
});

providers.get("/identities", (c) => c.json({ identities: listIdentities() }));

providers.get("/providers/suppliers", (c) => c.json({ suppliers: listSuppliers().map(publicSupplier) }));
