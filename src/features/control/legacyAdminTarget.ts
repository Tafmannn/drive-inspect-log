/** Where an old /admin/{pod-review,finance,drivers} link lands now. */
export function legacyAdminTarget(
  area: "pod-review" | "finance" | "drivers",
  params: URLSearchParams,
): string {
  if (area === "finance") {
    // Old dashboard buckets linked "ready to invoice" / "not invoiced" here.
    const f = params.get("filter");
    if (f === "ready" || f === "uninvoiced") return "/control/invoice-prep";
  }
  // The merged pages translate old filter names themselves.
  const q = params.toString();
  return q ? `/control/${area}?${q}` : `/control/${area}`;
}
