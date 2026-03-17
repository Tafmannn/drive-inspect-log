import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useNavigate } from "react-router-dom";
import { usePendingJobs } from "@/hooks/useJobs";

export const PendingJobs = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = usePendingJobs();

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Pending Jobs" showBack onBack={() => navigate('/')} />
      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}
        {!isLoading && (!jobs || jobs.length === 0) && (
          <p className="text-center py-12 text-[14px] text-muted-foreground">No pending jobs.</p>
        )}
        {jobs?.map((job) => (
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
      <BottomNav />
    </div>
  );
};
