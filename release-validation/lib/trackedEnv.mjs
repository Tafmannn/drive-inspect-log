// Decides whether a git-tracked `.env` is acceptable.
//
// A Vite app legitimately ships public client config (VITE_* keys, anon JWT).
// A tracked .env is only a problem if it holds anything secret. This returns
// { ok, problems } so suites 01 and 10 can fail only on real secrets.

const SECRET_KEY_RE = /(SERVICE_ROLE|SECRET|PASSWORD|PRIVATE|TOKEN|API_KEY|ACCESS_KEY)/i;

function decodeJwtRole(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

export function classifyTrackedEnv(content) {
  const problems = [];
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) {
    problems.push("contains a PEM private key");
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!key.startsWith("VITE_")) problems.push(`non-public key ${key}`);
    if (SECRET_KEY_RE.test(key)) problems.push(`secret-named key ${key}`);
    for (const jwt of value.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
      const role = decodeJwtRole(jwt);
      if (role !== "anon") problems.push(`JWT in ${key} has role "${role ?? "unknown"}", expected anon`);
    }
  }
  return { ok: problems.length === 0, problems };
}
