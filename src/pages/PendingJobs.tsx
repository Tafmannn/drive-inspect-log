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
      <div className="p-4">
        {isLoading && <DashboardSkeleton />}
        {!isLoading && (!jobs || jobs.length === 0) && (
          <p className="text-center py-12 text-[14px] text-muted-foreground">No pending jobs.</p>
        )}
        {jobs?.map((job) => (
          <JobCard
            key={job.id}
            jobId={job.external_job_number || job.id.slice(0, 8)}
            plateNumber={job.vehicle_reg}
            collectFrom={{ name: job.pickup_contact_name, phone: job.pickup_contact_phone, company: job.pickup_company ?? undefined, address: [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(', ') }}
            deliverTo={{ name: job.delivery_contact_name, phone: job.delivery_contact_phone, company: job.delivery_company ?? undefined, address: [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(', ') }}
            ctaLabel="View POD"
            onStartInspection={() => navigate(`/jobs/${job.id}/pod`)}
            onCardClick={() => navigate(`/jobs/${job.id}`)}
          />
        ))}
      </div>
      <BottomNav />
    </div>
  );
};
