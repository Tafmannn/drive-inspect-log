/**
 * DriverProfileCompletion — landing page after a driver is quick-created.
 *
 * Phase 3 scaffold: provides the redirect target and a clear "next steps"
 * outline. The full multi-step wizard ships in Phase 4.
 */
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";

const STEPS = [
  { id: 1, title: "Personal", desc: "Name, contact, postcode, emergency contact" },
  { id: 2, title: "Compliance", desc: "Licence, endorsements, right to work, trade plate" },
  { id: 3, title: "Operations", desc: "Regions, max distance, EV / prestige capability" },
  { id: 4, title: "Finance", desc: "Payout terms and bank capture flag" },
  { id: 5, title: "Documents", desc: "Licence, proof of address, signed agreement" },
];

export default function DriverProfileCompletion() {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [params] = useSearchParams();
  const justCreated = params.get("created") === "1";

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Complete Driver Profile" />

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate("/admin/drivers")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to drivers
        </Button>

        {justCreated && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Driver account created</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete the steps below to make this driver dispatch-eligible.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-lg font-semibold">Profile completion</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Driver ID: <span className="font-mono text-xs">{userId ?? "—"}</span>
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
            The full multi-step driver onboarding wizard is being prepared.
            For now, edit core driver details from the Drivers list.
          </CardContent>
        </Card>

        <Button
          className="w-full"
          onClick={() => navigate("/admin/drivers")}
        >
          Go to Drivers list
        </Button>
      </div>
    </div>
  );
}
