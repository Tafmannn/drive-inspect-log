import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useNavigate } from "react-router-dom";
import { useCompletedJobs } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { Clock } from "lucide-react";

export const CompletedJobs = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useCompletedJobs();
  const gate = useDriverGate();

  // Scope to driver's own jobs if driver-only
  const filteredJobs = (gate.isDriverOnly && gate.driverProfileId && jobs)
    ? jobs.filter(j => j.driver_id === gate.driverProfileId)
    : jobs;

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Last 14 Days" showBack onBack={() => navigate('/')} />
      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}
        {!isLoading && (!filteredJobs || filteredJobs.length === 0) && (
          <div className="text-center py-12 space-y-3">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground stroke-[1.5]" />
            <p className="text-sm text-muted-foreground">
              {gate.isDriverOnly
                ? "No completed jobs in the last 14 days."
                : "No completed jobs in the last 14 days."}
            </p>
          </div>
        )}
        {filteredJobs?.map((job) => (
          <JobCard
            key={job.id}
            jobRef={job.external_job_number || job.id.slice(0, 8)}
            reg={job.vehicle_reg}
            status={job.status}
            route={{
              pickupAddress: [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(', '),
              deliveryAddress: [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(', '),
            }}
            hasPickupInspection={job.has_pickup_inspection}
            hasDeliveryInspection={job.has_delivery_inspection}
            ctaLabel="View POD"
            onPrimaryAction={() => navigate(`/jobs/${job.id}/pod`)}
            onCardClick={() => navigate(`/jobs/${job.id}`)}
          />
        ))}
      </div>
      <BottomNav />
    </div>
  );
};
