/**
 * ClientProfileCompletion — landing page after a client is quick-created.
 * Phase 3 scaffold; full wizard ships in Phase 5.
 */
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company", desc: "Trading name, company number, VAT" },
  { id: 2, title: "Contacts", desc: "Main contact and billing contact" },
  { id: 3, title: "Finance", desc: "Payment terms, rate type, minimum charge, credit limit" },
  { id: 4, title: "Operations", desc: "Collection address, opening hours, handover, signature" },
  { id: 5, title: "Documents", desc: "Contract, rate card, insurance requirements" },
];

export default function ClientProfileCompletion() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const [params] = useSearchParams();
  const justCreated = params.get("created") === "1";

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Complete Client Profile" />

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate("/control/clients")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to clients
        </Button>

        {justCreated && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Client created</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete the steps below to enable invoicing and dispatch.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-lg font-semibold">Profile completion</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Client ID: <span className="font-mono text-xs">{clientId ?? "—"}</span>
          </p>
        </div>

        <div className="space-y-2">
          {STEPS.map((step) => (
            <Card key={step.id} className="border">
              <CardContent className="p-4 flex items-start gap-3">
                <Circle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      Step {step.id}: {step.title}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-dashed">
          <CardContent className="p-4 text-center text-xs text-muted-foreground">
            The full multi-step client onboarding wizard is being prepared.
            For now, edit core details from the Clients list.
          </CardContent>
        </Card>

        <Button
          className="w-full"
          onClick={() => navigate("/control/clients")}
        >
          Go to Clients list
        </Button>
      </div>
    </div>
  );
}
