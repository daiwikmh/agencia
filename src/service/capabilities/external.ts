const UA = { "user-agent": "Agencia/0.1 (+https://agencia.reroute-stellarbackend.workers.dev)", accept: "application/json" };

export async function readUrl(url: string) {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("only http(s) urls are supported");
  }
  const res = await fetch(target, {
    headers: { "user-agent": "AgenciaBot/0.1 (+x402)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    url: target.toString(),
    status: res.status,
    title: titleMatch?.[1]?.trim() ?? null,
    length: text.length,
    text: text.slice(0, 6000),
  };
}

export async function dnsLookup(name: string, type: string) {
  const recordType = (type || "A").toUpperCase();
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(recordType)}`,
    { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`dns ${res.status}`);
  const data = (await res.json()) as {
    Status: number;
    Answer?: { name: string; type: number; TTL: number; data: string }[];
  };
  return {
    name,
    type: recordType,
    status: data.Status,
    answers: (data.Answer ?? []).map((a) => ({ name: a.name, ttl: a.TTL, data: a.data })),
  };
}

export async function githubRepo(owner: string, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "AgenciaBot/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) throw new Error(`repo ${owner}/${repo} not found`);
  if (!res.ok) throw new Error(`github ${res.status}`);
  const r = (await res.json()) as Record<string, unknown>;
  return {
    fullName: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    language: r.language,
    license: (r.license as { spdx_id?: string } | null)?.spdx_id ?? null,
    pushedAt: r.pushed_at,
    topics: r.topics ?? [],
  };
}
