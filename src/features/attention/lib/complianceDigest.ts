/**
 * Compliance Digest – Group compliance exceptions by affected entity (driver / client / organisation).
 * Pure transformation, no fetching.
 */

import type { AttentionException } from "../types/exceptionTypes";

export type DigestEntityType = "driver" | "client" | "organisation" | "other";

export interface DigestGroup {
  id: string;
  entityType: DigestEntityType;
  entityId: string;
  entityName: string;
  route: string;
  expiredCount: number;
  expiringCount: number;
  missingCount: number;
  highestSeverity: "critical" | "high" | "medium" | "low";
  items: AttentionException[];
}

function inferEntity(exc: AttentionException): {
  type: DigestEntityType;
  id: string;
  name: string;
  route: string;
} {
  const route = exc.actionRoute || "";
  // Match /admin/drivers/:userId
  const driverMatch = route.match(/\/admin\/drivers\/([^/?#]+)/);
  if (driverMatch) {
    return {
      type: "driver",
      id: driverMatch[1],
      name: exc.title.replace(/^(Expired|Expiring|Missing)\s+/i, "").split(" — ")[0] || "Driver",
      route,
    };
  }
  const clientMatch = route.match(/\/admin\/clients\/([^/?#]+)/);
  if (clientMatch) {
    return {
      type: "client",
      id: clientMatch[1],
      name: exc.title.split(" — ")[0] || "Client",
      route,
    };
  }
  const orgMatch = route.match(/\/super-admin\/orgs\/([^/?#]+)/);
  if (orgMatch) {
    return {
      type: "organisation",
      id: orgMatch[1],
      name: exc.title.split(" — ")[0] || "Organisation",
      route,
    };
  }
  return { type: "other", id: exc.id, name: exc.title, route };
}

const SEV_RANK: Record<DigestGroup["highestSeverity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function classify(exc: AttentionException): "expired" | "expiring" | "missing" {
  const t = exc.title.toLowerCase();
  if (t.includes("expired")) return "expired";
  if (t.includes("expir")) return "expiring";
  return "missing";
}

export function groupComplianceDigest(exceptions: AttentionException[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>();

  for (const exc of exceptions) {
    if (exc.category !== "compliance") continue;
    const entity = inferEntity(exc);
    const key = `${entity.type}:${entity.id}`;
    let group = map.get(key);
    if (!group) {
      group = {
        id: key,
        entityType: entity.type,
        entityId: entity.id,
        entityName: entity.name,
        route: entity.route,
        expiredCount: 0,
        expiringCount: 0,
        missingCount: 0,
        highestSeverity: exc.severity,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(exc);
    const cls = classify(exc);
    if (cls === "expired") group.expiredCount += 1;
    else if (cls === "expiring") group.expiringCount += 1;
    else group.missingCount += 1;

    if (SEV_RANK[exc.severity] > SEV_RANK[group.highestSeverity]) {
      group.highestSeverity = exc.severity;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const sev = SEV_RANK[b.highestSeverity] - SEV_RANK[a.highestSeverity];
    if (sev !== 0) return sev;
    const aTotal = a.expiredCount + a.expiringCount + a.missingCount;
    const bTotal = b.expiredCount + b.expiringCount + b.missingCount;
    return bTotal - aTotal;
  });
}
