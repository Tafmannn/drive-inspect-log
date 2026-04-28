/**
 * DocumentsUploader — generic file uploader for onboarding_documents.
 *
 * Stores files in the `onboarding-docs` bucket under
 *   {orgId}/{relatedType}/{relatedId}/{timestamp}-{name}
 * and registers them in the onboarding_documents table.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, Trash2, ExternalLink } from "lucide-react";

export interface DocumentSlot {
  documentType: string;
  label: string;
  required?: boolean;
  needsExpiry?: boolean;
}

interface Props {
  orgId: string;
  relatedType: "driver" | "client" | "organisation";
  relatedId: string;
  slots: DocumentSlot[];
}

interface DocRow {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  expires_at: string | null;
}

export function DocumentsUploader({ orgId, relatedType, relatedId, slots }: Props) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("onboarding_documents")
      .select("id, document_type, file_name, file_url, expires_at")
      .eq("related_type", relatedType)
      .eq("related_id", relatedId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load documents", description: error.message, variant: "destructive" });
    } else {
      setDocs((data as DocRow[]) ?? []);
    }
    setLoading(false);
  }, [relatedType, relatedId]);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (slot: DocumentSlot, file: File) => {
    setUploadingType(slot.documentType);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${orgId}/${relatedType}/${relatedId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("onboarding-docs")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("onboarding-docs")
        .getPublicUrl(path);

      const { error: insErr } = await supabase
        .from("onboarding_documents")
        .insert({
          org_id: orgId,
          related_type: relatedType,
          related_id: relatedId,
          document_type: slot.documentType,
          file_name: safeName,
          file_url: urlData?.publicUrl || path,
        });
      if (insErr) throw insErr;
      toast({ title: "Document uploaded" });
      await load();
    } catch (e) {
      toast({ title: "Upload failed", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  };

  const setExpiry = async (docId: string, value: string) => {
    const { error } = await supabase
      .from("onboarding_documents")
      .update({ expires_at: value || null })
      .eq("id", docId);
    if (error) {
      toast({ title: "Could not save expiry", description: error.message, variant: "destructive" });
      return;
    }
    setDocs(d => d.map(x => x.id === docId ? { ...x, expires_at: value || null } : x));
  };

  const remove = async (docId: string) => {
    const { error } = await supabase.from("onboarding_documents").delete().eq("id", docId);
    if (error) {
      toast({ title: "Could not remove", description: error.message, variant: "destructive" });
      return;
    }
    setDocs(d => d.filter(x => x.id !== docId));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {slots.map(slot => {
        const slotDocs = docs.filter(d => d.document_type === slot.documentType);
        const isUploading = uploadingType === slot.documentType;
        return (
          <div key={slot.documentType} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                {slot.label}
                {slot.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
              </Label>
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(slot, f);
                    e.currentTarget.value = "";
                  }}
                  disabled={isUploading}
                />
                <span className={
                  "inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border " +
                  "cursor-pointer hover:bg-accent " + (isUploading ? "opacity-60 pointer-events-none" : "")
                }>
                  {isUploading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </span>
              </label>
            </div>

            {slotDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No file uploaded.</p>
            ) : (
              <ul className="space-y-1.5">
                {slotDocs.map(d => (
                  <li key={d.id} className="flex items-center gap-2 text-xs">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 truncate underline decoration-dotted underline-offset-2"
                    >
                      {d.file_name}
                    </a>
                    {slot.needsExpiry && (
                      <Input
                        type="date"
                        value={d.expires_at ?? ""}
                        onChange={e => setExpiry(d.id, e.target.value)}
                        className="h-7 w-[130px] text-xs"
                      />
                    )}
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
