import { Info } from "lucide-react";

/** Prominent, honest banner: these documents are drafts pending legal review. */
export function LegalNotice() {
  return (
    <div className="mb-8 flex gap-3 rounded-xl border border-marketing-warning/30 bg-marketing-warning/10 p-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-marketing-warning" aria-hidden="true" />
      <p className="text-sm text-marketing-text-secondary">
        <strong className="text-marketing-text">Draft for review.</strong> This is a working draft
        provided as a starting point. It must be reviewed and approved by a qualified legal
        professional before it is relied upon.
      </p>
    </div>
  );
}
