export const fmtHbar = (n: number) => {
  const s = n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return `${s} ℏ`;
};

export const shortId = (id: string) =>
  id.length > 22 ? `${id.slice(0, 14)}…${id.slice(-6)}` : id;

export const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

export function shortFacilitator(f?: string) {
  if (!f) return "—";
  if (f === "mirror-node") return "mirror-node";
  try {
    return new URL(f).host;
  } catch {
    return f;
  }
}
