import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { useNavigate } from "react-router-dom";
import { useActiveJobs } from "@/hooks/useJobs";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-background">
      <AppHeader title="Your Current Jobs" showBack onBack={() => navigate('/')}>
        <Button size="sm" variant="ghost" className="text-app-header-foreground hover:bg-white/20" onClick={() => navigate('/jobs/new')}>
          <Plus className="h-5 w-5" />
        </Button>
      </AppHeader>

      <div className="p-4 max-w-lg mx-auto">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && (!sortedJobs || sortedJobs.length === 0) && (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">No active jobs found.</p>
            <Button onClick={() => navigate('/jobs/new')}>Create Job</Button>
          </div>
        )}

        {sortedJobs?.map((job) => {
          const cta = getJobCta(job);
          return (
            <JobCard
              key={job.id}
              jobId={job.external_job_number || job.id.slice(0, 8)}
              plateNumber={job.vehicle_reg}
              clientName={job.client_name ?? undefined}
              status={job.status}
              jobDate={job.job_date ?? undefined}
              distanceMiles={job.distance_miles}
              collectFrom={{
                name: job.pickup_contact_name,
                phone: job.pickup_contact_phone,
                company: job.pickup_company ?? undefined,
                address: buildAddress([job.pickup_address_line1, job.pickup_address_line2, job.pickup_city, job.pickup_postcode]),
              }}
              deliverTo={{
                name: job.delivery_contact_name,
                phone: job.delivery_contact_phone,
                company: job.delivery_company ?? undefined,
                address: buildAddress([job.delivery_address_line1, job.delivery_address_line2, job.delivery_city, job.delivery_postcode]),
              }}
              instructions={job.pickup_notes ?? undefined}
              deadline={job.earliest_delivery_date ?? undefined}
              ctaLabel={cta.label}
              onStartInspection={() => navigate(cta.route)}
              onCardClick={() => navigate(`/jobs/${job.id}`)}
            />
          );
        })}
      </div>
    </div>
  );
};
