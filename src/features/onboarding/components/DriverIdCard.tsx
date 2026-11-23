/**
 * DriverIdCard — the presentational digital-ID badge.
 * Pure/props-driven so it can be previewed or reused without a data fetch.
 */
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { licenceStatus } from "../lib/licenceStatus";

const CARD_GRADIENT =
  "radial-gradient(60% 50% at 50% 0%, rgba(35,120,220,0.35), transparent 70%), " +
  "radial-gradient(55% 45% at 85% 100%, rgba(20,90,190,0.28), transparent 70%), " +
  "linear-gradient(180deg, #0b1c3f 0%, #071431 55%, #040c22 100%)";

const LICENCE_STATUS_STYLE: Record<string, string> = {
  valid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  expiring: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  expired: "bg-red-500/15 text-red-300 border-red-500/30",
  unknown: "bg-white/10 text-white/60 border-white/20",
};

const LICENCE_STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring: "Expiring soon",
  expired: "Expired",
  unknown: "Not on file",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export interface DriverIdCardDriver {
  full_name?: string | null;
  is_active?: boolean | null;
  licence_number?: string | null;
  licence_expiry?: string | null;
  licence_categories?: string[] | null;
  trade_plate_number?: string | null;
  employment_type?: string | null;
}

interface DriverIdCardProps {
  driver: DriverIdCardDriver;
  name: string;
  photoUrl: string | null;
}

export function DriverIdCard({ driver, name, photoUrl }: DriverIdCardProps) {
  const licStatus = licenceStatus(driver.licence_expiry);
  const initials = getInitials(name);
  const categories = driver.licence_categories ?? [];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_30px_60px_rgba(3,9,28,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]"
      style={{ background: CARD_GRADIENT }}
    >
      <div className="px-6 pt-6 pb-5 text-center">
        <img
          src="/axentra-logo-lockup.webp"
          alt="Axentra"
          className="w-28 h-auto mx-auto mb-4 opacity-90"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />

        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="w-full h-full rounded-full overflow-hidden border-2 border-white/25 bg-white/10 flex items-center justify-center">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold text-white/80">{initials || "?"}</span>
            )}
          </div>
        </div>

        <h1 className="text-xl font-semibold text-white truncate">{name}</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/50 mt-0.5">Authorised Driver</p>

        <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
          <Badge
            variant="outline"
            className={driver.is_active ? "bg-primary/20 text-primary-foreground border-primary/40 text-[10px]" : "bg-white/10 text-white/60 border-white/20 text-[10px]"}
          >
            {driver.is_active ? "Active" : "Inactive"}
          </Badge>
          {driver.trade_plate_number && (
            <Badge variant="outline" className="bg-white/10 text-white/80 border-white/20 text-[10px] font-mono">
              {driver.trade_plate_number}
            </Badge>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/15 px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Licence No.</p>
            <p className="text-sm font-mono text-white/90 mt-0.5 truncate">{driver.licence_number || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Expiry</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-sm text-white/90">{fmtDate(driver.licence_expiry)}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Licence status</p>
          <Badge variant="outline" className={`text-[10px] ${LICENCE_STATUS_STYLE[licStatus]}`}>
            {LICENCE_STATUS_LABEL[licStatus]}
          </Badge>
        </div>

        {categories.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Categories</p>
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <Badge key={c} variant="outline" className="bg-white/10 text-white/80 border-white/20 text-[10px]">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {driver.employment_type && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Employment</p>
            <p className="text-sm text-white/90 mt-0.5 capitalize">{driver.employment_type.replace(/_/g, " ")}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-6 py-3 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Precision in Every Move</p>
      </div>
    </div>
  );
}
