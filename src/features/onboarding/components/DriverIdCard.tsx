/**
 * Axentra Digital ID V2 — customer-facing company identification.
 * Screenshot-locked design: navy card, central portrait, 2x3 info grid.
 * No driving licence, job, or independent identity-verification claims.
 */
import type { ComponentType } from "react";
import { BadgeCheck, Clock3, Globe2, HardHat, IdCard, Layers3, Phone, ShieldCheck } from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { DigitalIdCredential, DigitalIdDisplayStatus } from "../hooks/useDigitalCredential";

const CARD_GRADIENT =
  "radial-gradient(70% 35% at 52% 0%, rgba(16,101,209,0.44) 0%, transparent 85%), " +
  "radial-gradient(55% 38% at 100% 100%, rgba(5,108,232,0.28), transparent 85%), " +
  "linear-gradient(153deg, #0b224b 0%, #061631 48%, #06112b 100%)";

export function formatEmployment(value: string | null | undefined): string {
  const names: Record<string, string> = {
    contractor: "Contractor",
    self_employed: "Self-employed",
    employed: "Employee",
    agency: "Agency",
  };
  return value ? (names[value] ?? value.replace(/_/g, " ")) : "Driver";
}

function verifiedTime(value: string | null | undefined): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

interface DriverIdCardProps {
  readonly credential: DigitalIdCredential;
  readonly displayStatus: DigitalIdDisplayStatus;
  readonly photoUrl: string | null;
}

interface InfoCellProps {
  readonly label: string;
  readonly value: string;
  readonly icon: ComponentType<{ className?: string }>;
}

function InfoCell({ label, value, icon: Icon }: InfoCellProps) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-2.5 sm:gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-200/85" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-slate-400 sm:text-[10px]">
          {label}
        </div>
        <div className="mt-0.5 break-words text-[12px] font-semibold leading-snug text-white sm:text-[13px]">
          {value}
        </div>
      </div>
    </div>
  );
}

export function DriverIdCard({ credential, displayStatus, photoUrl }: DriverIdCardProps) {
  const initials = getInitials(credential.full_name || "");
  const isActive = displayStatus === "active" && credential.status === "active";
  const isGrace = displayStatus === "grace" && credential.status === "active";
  let stateText = "Not authorised";
  let statusStyle = "border-red-300/50 bg-red-600/25 text-red-100";
  let iconStyle = "text-red-200";
  if (isActive) {
    stateText = "Authorised / Active";
    statusStyle = "border-emerald-300/50 bg-emerald-600/25 text-white";
    iconStyle = "text-emerald-300";
  } else if (isGrace) {
    stateText = "Connection lost";
    statusStyle = "border-amber-300/60 bg-amber-600/25 text-amber-100";
    iconStyle = "text-amber-200";
  }

  return (
    <section
      aria-label="Axentra company-issued Digital ID"
      className="relative isolate overflow-hidden rounded-[25px] border border-blue-300/25 text-white shadow-[0_25px_46px_-14px_rgba(5,16,44,0.5)]"
      style={{ background: CARD_GRADIENT }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-52 w-72 rotate-[-30deg] rounded-full border-b border-cyan-300/60 bg-blue-500/10 blur-[1px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-48 w-60 rounded-full border-t border-blue-300/50 bg-blue-500/10 blur-[2px]" />
      <div className="relative px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="text-center">
          <img
            src="/axentra-logo-lockup.webp"
            alt="Axentra"
            className="mx-auto mb-3 h-auto w-28 max-w-full object-contain drop-shadow-[0_0_12px_rgba(65,145,235,0.35)] sm:w-32"
          />
          <div className="mx-auto inline-flex max-w-full items-center justify-center rounded-full border border-sky-300/60 bg-white/[0.035] px-4 py-1.5 shadow-[inset_0_0_10px_rgba(44,149,239,0.2)]">
            <span className="text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white sm:text-[10px]">
              Company-issued Driver ID
            </span>
          </div>

          <div className="mx-auto mt-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-sky-300/85 bg-gradient-to-b from-slate-600/50 to-slate-700/65 shadow-[0_0_0_3px_rgba(74,150,243,0.14),0_0_18px_rgba(79,154,255,0.38)] sm:h-24 sm:w-24">
            {photoUrl ? (
              <img src={photoUrl} alt={"Photograph of " + (credential.full_name || "driver")} className="h-full w-full object-cover" />
            ) : (
              <span aria-label="Photograph not yet uploaded" className="text-3xl font-semibold tracking-wide text-white sm:text-4xl">
                {initials || "—"}
              </span>
            )}
          </div>

          <h1 className="mt-3 break-words text-[23px] font-bold leading-tight tracking-tight text-white sm:text-[26px]">
            {credential.full_name || "Name pending"}
          </h1>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.32em] text-slate-300 sm:text-[11px]">
            {credential.role_label || "Authorised Driver"}
          </p>

          <div className={"mx-auto mt-2 inline-flex min-h-7 items-center gap-2 rounded-full border px-4 py-1 shadow-[inset_0_0_15px_rgba(255,255,255,0.07)] " + statusStyle}>
            <BadgeCheck className={"h-4 w-4 " + iconStyle} />
            <span className="text-[12px] font-semibold">{stateText}</span>
            {isActive && <span aria-hidden="true" className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-300 motion-safe:animate-pulse" />}
          </div>
          <p className="mt-2.5 text-[12px] text-slate-300 sm:text-[13px]">
            Representing Axentra Vehicle Logistics
          </p>
        </div>

        <div className="mt-4 border-t border-sky-100/15">
          <div className="grid grid-cols-2 gap-x-3 border-b border-white/10">
            <InfoCell icon={IdCard} label="Driver ID" value={credential.driver_id} />
            <InfoCell icon={Phone} label="Company phone" value={credential.company_phone || "Not provided"} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 border-b border-white/10">
            <InfoCell icon={HardHat} label="Employment" value={formatEmployment(credential.employment_type)} />
            <InfoCell icon={Globe2} label="Website" value={credential.company_website} />
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <InfoCell icon={Layers3} label="Issued by" value={credential.issued_by} />
            <InfoCell icon={Clock3} label="Last checked" value={verifiedTime(credential.checked_at)} />
          </div>
        </div>

        <div className="mt-2 flex min-h-[46px] items-center justify-center gap-3 rounded-2xl border border-emerald-300/40 bg-gradient-to-r from-emerald-600/20 via-sky-600/10 to-emerald-500/20 px-3 py-2.5 shadow-[inset_0_0_12px_rgba(50,205,165,0.08)]">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-300" />
          <span className="h-6 border-l border-emerald-100/35" />
          <span className="text-center text-[12px] font-semibold leading-snug text-white sm:text-[13px]">
            Official Axentra company ID
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 text-center">
          <span className="h-px flex-1 bg-slate-300/30" />
          <p className="shrink-0 text-[9px] font-medium uppercase tracking-[0.25em] text-slate-300 sm:text-[10px]">
            Precision in every move
          </p>
          <span className="h-px flex-1 bg-slate-300/30" />
        </div>
      </div>
    </section>
  );
}
