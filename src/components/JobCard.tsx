import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Building, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";

interface ContactInfo {
  name: string;
  phone?: string;
  company?: string;
  address: string;
}

interface JobCardProps {
  jobId: string;
  plateNumber: string;
  clientName?: string;
  status?: string;
  jobDate?: string;
  distanceMiles?: number | null;
  collectFrom: ContactInfo;
  deliverTo: ContactInfo;
  instructions?: string;
  deadline?: string;
  ctaLabel?: string;
  onStartInspection?: () => void;
  onCardClick?: () => void;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = d.getTime() - today.getTime();
    const days = Math.round(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

export const JobCard = ({
  jobId,
  plateNumber,
  clientName,
  status,
  jobDate,
  distanceMiles,
  collectFrom,
  deliverTo,
  instructions,
  deadline,
  ctaLabel = "Start Inspection",
  onStartInspection,
  onCardClick,
}: JobCardProps) => {
  const displayName = clientName || collectFrom.name || jobId;
  const initial = displayName.charAt(0).toUpperCase();
  const statusStyle = status ? getStatusStyle(status) : null;

  const summaryParts: string[] = [];
  if (jobDate) summaryParts.push(formatDate(jobDate));
  if (distanceMiles != null) summaryParts.push(`${distanceMiles} mi`);

  return (
    <Card className="p-4 mb-3 border border-border cursor-pointer active:bg-muted/50 transition-colors" onClick={onCardClick}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate">{displayName}</h3>
            <p className="text-xs text-muted-foreground truncate">{jobId}</p>
          </div>
        </div>
        <div className="shrink-0 ml-2">
          <UKPlate reg={plateNumber} />
        </div>
      </div>

      {/* Summary line — no price */}
      {(summaryParts.length > 0 || statusStyle) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {summaryParts.length > 0 && (
            <span className="text-xs text-muted-foreground">{summaryParts.join(' • ')}</span>
          )}
          {statusStyle && (
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
          )}
        </div>
      )}

      {/* Pickup & Delivery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <ContactBlock label="Collect From" contact={collectFrom} />
        <ContactBlock label="Deliver To" contact={deliverTo} />
      </div>

      {instructions && (
        <div className="mb-3 p-2.5 bg-warning/10 border border-warning/20 rounded-lg">
          <div className="text-xs"><span className="font-semibold text-warning">NOTE:</span> {instructions}</div>
        </div>
      )}

      {deadline && <div className="mb-3 text-xs text-destructive"><strong>Do not deliver before {deadline}</strong></div>}

      <Button
        onClick={(e) => { e.stopPropagation(); onStartInspection?.(); }}
        className="w-full"
        size="default"
      >
        {ctaLabel}
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </Card>
  );
};

function ContactBlock({ label, contact }: { label: string; contact: ContactInfo }) {
  return (
    <div className="space-y-1">
      <h4 className="font-semibold text-xs text-muted-foreground">{label}</h4>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{contact.name}</span>
        </div>
        {contact.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="text-sm text-primary underline-offset-2 hover:underline truncate">
              {contact.phone}
            </a>
          </div>
        )}
        {contact.company && <div className="text-xs text-muted-foreground pl-5">{contact.company}</div>}
        <div className="flex items-start gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <a href={mapsUrl(contact.address)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-primary underline-offset-2 hover:underline">
            {contact.address}
          </a>
        </div>
      </div>
    </div>
  );
}
