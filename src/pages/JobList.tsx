import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { BottomNav } from "@/components/BottomNav";
import { useNavigate } from "react-router-dom";
import { useActiveJobs } from "@/hooks/useJobs";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import type { Job } from "@/lib/types";

function getJobCta(job: Job): { label: string; route: string } {
  if (!job.has_pickup_inspection) return { label: 'Start Pickup', route: `/inspection/${job.id}/pickup` };
  if (!job.has_delivery_inspection) return { label: 'Start Delivery', route: `/inspection/${job.id}/delivery` };
  return { label: 'View POD', route: `/jobs/${job.id}/pod` };
}

function buildAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}

export const JobList = () => {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useActiveJobs();

  const sortedJobs = jobs?.slice().sort((a, b) => {
    if (a.job_date && b.job_date) return a.job_date.localeCompare(b.job_date);
    if (a.job_date) return -1;
    if (b.job_date) return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="My Jobs" showBack onBack={() => navigate('/')}>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted"
          onClick={() => navigate('/jobs/new')}
        >
          <Plus className="w-6 h-6 stroke-[2]" />
        </Button>
      </AppHeader>

      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}

        {!isLoading && (!sortedJobs || sortedJobs.length === 0) && (
          <div className="text-center py-12 space-y-4">
            <p className="text-[14px] text-muted-foreground">No active jobs found.</p>
            <Button onClick={() => navigate('/jobs/new')} className="min-h-[44px] rounded-lg">
              Create Job
            </Button>
          </div>
        )}

        {sortedJobs?.map((job) => {
          const cta = getJobCta(job);
          return (
            <JobCard
              key={job.id}
              jobRef={job.external_job_number || job.id.slice(0, 8)}
              reg={job.vehicle_reg}
              status={job.status}
              route={{
                pickupAddress: buildAddress([job.pickup_address_line1, job.pickup_city, job.pickup_postcode]),
                deliveryAddress: buildAddress([job.delivery_address_line1, job.delivery_city, job.delivery_postcode]),
                pickupPhone: job.pickup_contact_phone || undefined,
                deliveryPhone: job.delivery_contact_phone || undefined,
              }}
              restriction={job.earliest_delivery_date ? `Do not deliver before ${job.earliest_delivery_date}` : (job.pickup_notes ?? undefined)}
              hasPickupInspection={job.has_pickup_inspection}
              hasDeliveryInspection={job.has_delivery_inspection}
              ctaLabel={cta.label}
              onPrimaryAction={() => navigate(cta.route)}
              onCardClick={() => navigate(`/jobs/${job.id}`)}
            />
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
};
