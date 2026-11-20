/**
 * The at-a-glance outcome of a move, built from its collection and delivery
 * reports: when it was collected and delivered, how long it took, miles
 * driven, fuel used, and — the question a client actually asks — whether the
 * vehicle arrived in the condition it left.
 */
import type { PortalInspection } from "../api";

export interface MoveSummary {
  collectedAt: string | null;
  deliveredAt: string | null;
  /** Minutes from collection to delivery, when both are known and ordered. */
  durationMinutes: number | null;
  milesDriven: number | null;
  fuelChange: number | null;
  fuelAtCollection: number | null;
  fuelAtDelivery: number | null;
  receivedBy: string | null;
  collectionDamage: number;
  deliveryDamage: number;
  /**
   * "none": no damage at delivery. "pre_existing": damage at delivery, but no
   * more than was recorded at collection. "new": more damage at delivery than
   * at collection. null: the vehicle hasn't been delivered yet.
   */
  condition: "none" | "pre_existing" | "new" | null;
}

function damageCount(i: PortalInspection | undefined): number {
  if (!i) return 0;
  if (i.damage.length > 0) return i.damage.length;
  return i.has_damage ? 1 : 0;
}

export function moveSummary(inspections: PortalInspection[]): MoveSummary {
  const pickup = inspections.find((i) => i.type === "pickup");
  const delivery = inspections.find((i) => i.type === "delivery");

  const collectedAt = pickup?.inspected_at ?? null;
  const deliveredAt = delivery?.inspected_at ?? null;
  let durationMinutes: number | null = null;
  if (collectedAt && deliveredAt) {
    const ms = new Date(deliveredAt).getTime() - new Date(collectedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) durationMinutes = Math.round(ms / 60_000);
  }

  const milesDriven =
    pickup?.odometer != null && delivery?.odometer != null && delivery.odometer >= pickup.odometer
      ? delivery.odometer - pickup.odometer
      : null;
  const fuelChange =
    pickup?.fuel_level_percent != null && delivery?.fuel_level_percent != null
      ? delivery.fuel_level_percent - pickup.fuel_level_percent
      : null;

  const collectionDamage = damageCount(pickup);
  const deliveryDamage = damageCount(delivery);
  const condition: MoveSummary["condition"] = !delivery
    ? null
    : deliveryDamage === 0
      ? "none"
      : deliveryDamage <= collectionDamage
        ? "pre_existing"
        : "new";

  return {
    collectedAt,
    deliveredAt,
    durationMinutes,
    milesDriven,
    fuelChange,
    fuelAtCollection: pickup?.fuel_level_percent ?? null,
    fuelAtDelivery: delivery?.fuel_level_percent ?? null,
    receivedBy: delivery?.customer_name ?? null,
    collectionDamage,
    deliveryDamage,
    condition,
  };
}

/** "45 min", "3 h 20 min", "2 days 4 h". */
export function fmtDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} h` : ""}`;
  return `${hours} h${mins ? ` ${mins} min` : ""}`;
}
