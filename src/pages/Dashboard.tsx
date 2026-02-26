import { useDashboardCounts } from "@/hooks/useJobs";

const Dashboard = () => {
  const { activeJobs, completedLast14Days, pendingUploads } = useDashboardCounts();

  // Example card usage – adapt to your existing layout:
  //
  // "My Jobs" badge => activeJobs
  // "Last 14 days" badge => completedLast14Days
  // "Pending" badge => pendingUploads
};