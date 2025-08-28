import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { useNavigate } from "react-router-dom";

const mockJobs = [
  {
    jobId: "320667",
    plateNumber: "WF25KLJ",
    collectFrom: {
      name: "Chester",
      email: "thrifty.chester@thrifty.co.uk",
      phone: "01244374600",
      company: "Switch Car Rental Chester",
      address: "21 Bumpers Lane Sealands Industrial Estate, Chester, CH1 4LT"
    },
    deliverTo: {
      name: "York",
      email: "thrifty.york@thrifty.co.uk", 
      phone: "01904438844",
      company: "Switch Car Rental York",
      address: "Unit 2 Bentley Park, York, YO10 3JA"
    },
    instructions: "PLEASE TAKE INTERNAL PICTURES OF THE VEHICLE (INCLUDING THE BOOT) ON COLLECTION TO PROVE THAT NOTHING HAS BEEN LEFT IN THE VEHICLE !!!! IF DIRTY INSIDE, TAKE PHOTOS ON THE APP AND CALL THE OFFICE - THIS VEHICLE MAY BE DIVERTED TO DONCASTER THRIFTY - NO EXCUSES PLEASE OR WE WILL BE FORCED INTO BUYING THE VEHICLE !!!!!",
    deadline: "01/09/2025"
  },
  {
    jobId: "320522", 
    plateNumber: "DL25KVJ",
    collectFrom: {
      name: "Mr Sean Steward",
      phone: "01628 528034",
      company: "Modul-System Limited (Service Centre)",
      address: "Unit 4a, Hessay Industrial Estate, New Road, Hessay, York, North Yorkshire, YO26 8LE"
    },
    deliverTo: {
      name: "Mr Neil Powell",
      phone: "07814234778", 
      company: "Sanctuary Housing",
      address: "Unit 2-3, Union Park, Navigation Way, WV2 1PE"
    }
  }
];

export const JobList = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Your Current Jobs"
        showBack
        onBack={() => navigate('/')}
      />
      
      <div className="p-4">
        {mockJobs.map((job) => (
          <JobCard
            key={job.jobId}
            {...job}
            onStartInspection={() => navigate(`/inspection/${job.jobId}`)}
          />
        ))}
      </div>
    </div>
  );
};