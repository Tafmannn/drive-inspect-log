import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const JobForm = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const isEdit = !!jobId;
  const { data: existingJob, isLoading: jobLoading } = useJob(jobId ?? '');
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const [form, setForm] = useState({
    external_job_number: '',
    vehicle_reg: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_colour: '',
    vehicle_year: '',
    pickup_contact_name: '',
    pickup_contact_phone: '',
    pickup_company: '',
    pickup_address_line1: '',
    pickup_address_line2: '',
    pickup_city: '',
    pickup_postcode: '',
    pickup_notes: '',
    delivery_contact_name: '',
    delivery_contact_phone: '',
    delivery_company: '',
    delivery_address_line1: '',
    delivery_address_line2: '',
    delivery_city: '',
    delivery_postcode: '',
    delivery_notes: '',
    earliest_delivery_date: '',
  });

  // Populate form when editing
  const [populated, setPopulated] = useState(false);
  if (isEdit && existingJob && !populated) {
    setForm({
      external_job_number: existingJob.external_job_number ?? '',
      vehicle_reg: existingJob.vehicle_reg,
      vehicle_make: existingJob.vehicle_make,
      vehicle_model: existingJob.vehicle_model,
      vehicle_colour: existingJob.vehicle_colour,
      vehicle_year: existingJob.vehicle_year ?? '',
      pickup_contact_name: existingJob.pickup_contact_name,
      pickup_contact_phone: existingJob.pickup_contact_phone,
      pickup_company: existingJob.pickup_company ?? '',
      pickup_address_line1: existingJob.pickup_address_line1,
      pickup_address_line2: existingJob.pickup_address_line2 ?? '',
      pickup_city: existingJob.pickup_city,
      pickup_postcode: existingJob.pickup_postcode,
      pickup_notes: existingJob.pickup_notes ?? '',
      delivery_contact_name: existingJob.delivery_contact_name,
      delivery_contact_phone: existingJob.delivery_contact_phone,
      delivery_company: existingJob.delivery_company ?? '',
      delivery_address_line1: existingJob.delivery_address_line1,
      delivery_address_line2: existingJob.delivery_address_line2 ?? '',
      delivery_city: existingJob.delivery_city,
      delivery_postcode: existingJob.delivery_postcode,
      delivery_notes: existingJob.delivery_notes ?? '',
      earliest_delivery_date: existingJob.earliest_delivery_date ?? '',
    });
    setPopulated(true);
  }

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.vehicle_reg || !form.vehicle_make || !form.vehicle_model || !form.vehicle_colour) {
      toast({ title: 'Validation Error', description: 'Vehicle details are required.', variant: 'destructive' });
      return;
    }
    if (!form.pickup_contact_name || !form.pickup_contact_phone || !form.pickup_address_line1 || !form.pickup_city || !form.pickup_postcode) {
      toast({ title: 'Validation Error', description: 'Pickup contact & address are required.', variant: 'destructive' });
      return;
    }
    if (!form.delivery_contact_name || !form.delivery_contact_phone || !form.delivery_address_line1 || !form.delivery_city || !form.delivery_postcode) {
      toast({ title: 'Validation Error', description: 'Delivery contact & address are required.', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        ...form,
        vehicle_year: form.vehicle_year || null,
        pickup_company: form.pickup_company || null,
        pickup_address_line2: form.pickup_address_line2 || null,
        pickup_notes: form.pickup_notes || null,
        delivery_company: form.delivery_company || null,
        delivery_address_line2: form.delivery_address_line2 || null,
        delivery_notes: form.delivery_notes || null,
        earliest_delivery_date: form.earliest_delivery_date || null,
        external_job_number: form.external_job_number || null,
      };

      if (isEdit && jobId) {
        await updateMutation.mutateAsync({ jobId, input: payload });
        toast({ title: 'Job Updated' });
        navigate(`/jobs/${jobId}`);
      } else {
        const job = await createMutation.mutateAsync(payload);
        toast({ title: 'Job Created' });
        navigate(`/jobs/${job.id}`);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  if (isEdit && jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const Field = ({ label, field, required, placeholder, type }: { label: string; field: string; required?: boolean; placeholder?: string; type?: string }) => (
    <div>
      <Label className="text-sm font-medium">{label}{required && ' *'}</Label>
      <Input
        type={type ?? 'text'}
        value={(form as any)[field]}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder ?? label}
        className="mt-1"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title={isEdit ? 'Edit Job' : 'New Job'} showBack onBack={() => navigate(-1 as any)} />
      <div className="p-4 space-y-6 max-w-lg mx-auto">
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Vehicle Details</h3>
          <Field label="Job Number" field="external_job_number" placeholder="External reference" />
          <Field label="Registration" field="vehicle_reg" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make" field="vehicle_make" required />
            <Field label="Model" field="vehicle_model" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour" field="vehicle_colour" required />
            <Field label="Year" field="vehicle_year" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Pickup</h3>
          <Field label="Contact Name" field="pickup_contact_name" required />
          <Field label="Phone" field="pickup_contact_phone" required />
          <Field label="Company" field="pickup_company" />
          <Field label="Address Line 1" field="pickup_address_line1" required />
          <Field label="Address Line 2" field="pickup_address_line2" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" field="pickup_city" required />
            <Field label="Postcode" field="pickup_postcode" required />
          </div>
          <div>
            <Label className="text-sm font-medium">Pickup Notes</Label>
            <Textarea value={form.pickup_notes} onChange={(e) => update('pickup_notes', e.target.value)} className="mt-1" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Delivery</h3>
          <Field label="Contact Name" field="delivery_contact_name" required />
          <Field label="Phone" field="delivery_contact_phone" required />
          <Field label="Company" field="delivery_company" />
          <Field label="Address Line 1" field="delivery_address_line1" required />
          <Field label="Address Line 2" field="delivery_address_line2" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" field="delivery_city" required />
            <Field label="Postcode" field="delivery_postcode" required />
          </div>
          <div>
            <Label className="text-sm font-medium">Delivery Notes</Label>
            <Textarea value={form.delivery_notes} onChange={(e) => update('delivery_notes', e.target.value)} className="mt-1" />
          </div>
          <Field label="Earliest Delivery Date" field="earliest_delivery_date" type="date" />
        </div>

        <Button className="w-full" size="lg" onClick={handleSubmit} disabled={isMutating}>
          {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Update Job' : 'Create Job'}
        </Button>
      </div>
    </div>
  );
};
