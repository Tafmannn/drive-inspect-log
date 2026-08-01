import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OfflineListState } from "@/components/OfflineListState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useNavigate } from "react-router-dom";
import { usePendingJobs } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { Clock } from "lucide-react";

export const PendingJobs = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading, isError, refetch } = usePendingJobs();
  const online = useOnlineStatus();
  const gate = useDriverGate();

  // Scope to driver's own jobs if driver-only
  const filteredJobs = (gate.isDriverOnly && gate.driverProfileId && jobs)
    ? jobs.filter(j => j.driver_id === gate.driverProfileId)
    : jobs;

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Pending Jobs" showBack onBack={() => navigate('/')} />
      <PullToRefresh onRefresh={() => refetch()}>
      <div className="p-4 max-w-lg mx-auto page-enter">
        {isLoading && <DashboardSkeleton />}
        {/* A failed fetch while offline is NOT an empty list — say so. */}
        {!isLoading && (!filteredJobs || filteredJobs.length === 0) && isError && !online && (
          <OfflineListState noun="jobs" />
        )}
        {!isLoading && (!filteredJobs || filteredJobs.length === 0) && !(isError && !online) && (
          <div className="text-center py-12 space-y-3">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground stroke-[1.5]" />
            <p className="text-sm text-muted-foreground">No pending jobs.</p>
          </div>
        )}
        {filteredJobs?.map((job) => (
          <JobCard
            key={job.id}
            jobRef={job.external_job_number || job.id.slice(0, 8)}
            reg={job.vehicle_reg}
            status={job.status ?? "pod_ready"}
            route={{
              pickupAddress: [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(', '),
              deliveryAddress: [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(', '),
              pickupPhone: job.pickup_contact_phone || undefined,
              deliveryPhone: job.delivery_contact_phone || undefined,
            }}
            hasPickupInspection={job.has_pickup_inspection}
            hasDeliveryInspection={job.has_delivery_inspection}
            ctaLabel="View POD"
            onPrimaryAction={() => navigate(`/jobs/${job.id}/pod`)}
            onCardClick={() => navigate(`/jobs/${job.id}`)}
          />
        ))}
      </div>
      </PullToRefresh>
      <BottomNav />
    </div>
  );
};
