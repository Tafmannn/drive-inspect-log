import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Building, ChevronRight } from "lucide-react";

interface JobCardProps {
  jobId: string;
  plateNumber: string;
  collectFrom: {
    name: string;
    contact?: string;
    email?: string;
    phone?: string;
    company?: string;
    address: string;
  };
  deliverTo: {
    name: string;
    contact?: string;
    email?: string;
    phone?: string;
    company?: string;
    address: string;
  };
  instructions?: string;
  deadline?: string;
  ctaLabel?: string;
  onStartInspection?: () => void;
  onCardClick?: () => void;
}

export const JobCard = ({ 
  jobId, 
  plateNumber, 
  collectFrom, 
  deliverTo, 
  instructions,
  deadline,
  ctaLabel = "Start Inspection",
  onStartInspection,
  onCardClick,
}: JobCardProps) => {
  return (
    <Card className="p-4 mb-4 border-2 border-primary/20 cursor-pointer" onClick={onCardClick}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">
            {jobId.slice(-1)}
          </div>
          <h3 className="font-semibold text-lg">{jobId}</h3>
        </div>
        <Badge variant="secondary" className="bg-warning text-warning-foreground font-bold px-3 py-1">
          {plateNumber}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Collect From</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{collectFrom.name}</span></div>
            {collectFrom.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{collectFrom.phone}</span></div>}
            {collectFrom.company && <div className="text-sm text-muted-foreground">{collectFrom.company}</div>}
            <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span className="text-sm">{collectFrom.address}</span></div>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Deliver To</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{deliverTo.name}</span></div>
            {deliverTo.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{deliverTo.phone}</span></div>}
            {deliverTo.company && <div className="text-sm text-muted-foreground">{deliverTo.company}</div>}
            <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span className="text-sm">{deliverTo.address}</span></div>
          </div>
        </div>
      </div>

      {instructions && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
          <div className="text-sm"><span className="font-semibold text-warning">IMPORTANT:</span> {instructions}</div>
        </div>
      )}

      {deadline && <div className="mb-4 text-sm text-destructive"><strong>Do not deliver before {deadline}</strong></div>}

      <Button 
        onClick={(e) => { e.stopPropagation(); onStartInspection?.(); }}
        className="w-full"
        size="lg"
      >
        {ctaLabel}
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );
};
