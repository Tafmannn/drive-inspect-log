import { useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleDiagram } from "@/components/VehicleDiagram";
import { VehicleDamageModal } from "@/components/VehicleDamageModal";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Camera, X, Loader2 } from "lucide-react";
import { useJob, useSubmitInspection } from "@/hooks/useJobs";
import { storageService } from "@/lib/storage";
import { insertPhoto } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { FUEL_LEVEL_MAP, FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import type { InspectionType, DamageItemDraft, PhotoType } from "@/lib/types";

interface InspectionFormState {
  odometer: string;
  fuelLevel: string;
  vehicleCondition: string;
  lightCondition: string;
  oilLevel: string;
  waterLevel: string;
  notes: string;
  handbook: string;
  serviceBook: string;
  mot: string;
  v5: string;
  parcelShelf: string;
  spareWheel: string;
  toolKit: string;
  tyreInflationKit: string;
  lockingWheelNut: string;
  satNavWorking: string;
  alloysOrTrims: string;
  alloysDamaged: string;
  wheelTrimsDamaged: string;
  numberOfKeys: string;
  evChargingCables: string;
  aerial: string;
  customerPaperwork: string;
  damages: DamageItemDraft[];
  standardPhotos: Record<string, File | null>;
  standardPhotoUrls: Record<string, string>;
}

const PHOTO_TYPES_BY_INSPECTION: Record<InspectionType, { key: string; label: string }[]> = {
  pickup: [
    { key: 'pickup_exterior_front', label: 'Front' },
    { key: 'pickup_exterior_rear', label: 'Rear' },
    { key: 'pickup_exterior_driver_side', label: 'Driver Side' },
    { key: 'pickup_exterior_passenger_side', label: 'Passenger Side' },
    { key: 'pickup_interior', label: 'Interior' },
    { key: 'pickup_dashboard', label: 'Dashboard' },
    { key: 'pickup_fuel_gauge', label: 'Fuel Gauge' },
  ],
  delivery: [
    { key: 'delivery_exterior_front', label: 'Front' },
    { key: 'delivery_exterior_rear', label: 'Rear' },
    { key: 'delivery_exterior_driver_side', label: 'Driver Side' },
    { key: 'delivery_exterior_passenger_side', label: 'Passenger Side' },
    { key: 'delivery_interior', label: 'Interior' },
    { key: 'delivery_dashboard', label: 'Dashboard' },
    { key: 'delivery_fuel_gauge', label: 'Fuel Gauge' },
  ],
};

export const InspectionFlow = () => {
  const navigate = useNavigate();
  const { jobId, inspectionType } = useParams<{ jobId: string; inspectionType: string }>();
  const type = (inspectionType as InspectionType) || 'pickup';
  const { data: job, isLoading: jobLoading } = useJob(jobId ?? '');
  const submitMutation = useSubmitInspection();

  const [currentStep, setCurrentStep] = useState(1);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [pendingDamagePosition, setPendingDamagePosition] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Signature refs
  const driverCanvasRef = useRef<HTMLCanvasElement>(null);
  const customerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [driverSigned, setDriverSigned] = useState(false);
  const [customerSigned, setCustomerSigned] = useState(false);

  const [formState, setFormState] = useState<InspectionFormState>({
    odometer: '',
    fuelLevel: '',
    vehicleCondition: '',
    lightCondition: '',
    oilLevel: '',
    waterLevel: '',
    notes: '',
    handbook: '',
    serviceBook: '',
    mot: '',
    v5: '',
    parcelShelf: '',
    spareWheel: '',
    toolKit: '',
    tyreInflationKit: '',
    lockingWheelNut: '',
    satNavWorking: '',
    alloysOrTrims: '',
    alloysDamaged: '',
    wheelTrimsDamaged: '',
    numberOfKeys: '',
    evChargingCables: '',
    aerial: '',
    customerPaperwork: '',
    damages: [],
    standardPhotos: {},
    standardPhotoUrls: {},
  });

  const totalSteps = 6;

  const updateField = (field: keyof InspectionFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const addDamage = (position: { x: number; y: number }) => {
    setPendingDamagePosition(position);
    setShowDamageModal(true);
  };

  const handleDamageSubmit = (damage: { area: string; location: string; item: string; damageTypes: string[]; notes: string; photo?: File }) => {
    const pos = pendingDamagePosition || { x: 50, y: 50 };
    const draft: DamageItemDraft = {
      tempId: Date.now().toString(),
      x: pos.x,
      y: pos.y,
      area: damage.area,
      location: damage.location,
      item: damage.item,
      damageTypes: damage.damageTypes,
      notes: damage.notes,
      photo: damage.photo,
    };
    setFormState((prev) => ({ ...prev, damages: [...prev.damages, draft] }));
    setPendingDamagePosition(null);
  };

  const handlePhotoCapture = (photoKey: string, file: File) => {
    const url = URL.createObjectURL(file);
    setFormState((prev) => ({
      ...prev,
      standardPhotos: { ...prev.standardPhotos, [photoKey]: file },
      standardPhotoUrls: { ...prev.standardPhotoUrls, [photoKey]: url },
    }));
  };

  // Signature drawing
  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let drawing = false;
    const isDriver = canvas === driverCanvasRef.current;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'hsl(215 28% 17%)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const end = () => {
      drawing = false;
      if (isDriver) setDriverSigned(true);
      else setCustomerSigned(true);
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', move);
    canvas.addEventListener('touchend', end);
  }, []);

  const canvasToFile = async (canvas: HTMLCanvasElement, name: string): Promise<File> => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(new File([blob!], name, { type: 'image/png' }));
      }, 'image/png');
    });
  };

  const handleFinalSubmit = async () => {
    if (!jobId) return;
    setSubmitting(true);
    try {
      // 1. Upload standard photos
      const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];
      for (const pt of photoTypes) {
        const file = formState.standardPhotos[pt.key];
        if (file) {
          const result = await storageService.uploadImage(file, `jobs/${jobId}/${type}/${pt.key}/${Date.now()}`);
          await insertPhoto({ job_id: jobId, inspection_id: null, type: pt.key, url: result.url, thumbnail_url: null, backend: result.backend, backend_ref: result.backendRef ?? null });
        }
      }

      // 2. Upload damage photos
      const damageItemsPayload = [];
      for (const d of formState.damages) {
        let photoUrl: string | null = null;
        if (d.photo) {
          const result = await storageService.uploadImage(d.photo, `jobs/${jobId}/${type}/damage/${d.tempId}`);
          await insertPhoto({ job_id: jobId, inspection_id: null, type: 'damage_close_up', url: result.url, thumbnail_url: null, backend: result.backend, backend_ref: result.backendRef ?? null });
          photoUrl = result.url;
        }
        damageItemsPayload.push({
          x: d.x,
          y: d.y,
          area: d.area,
          location: d.location,
          item: d.item,
          damage_types: d.damageTypes,
          notes: d.notes,
          photo_url: photoUrl,
        });
      }

      // 3. Upload signatures
      let driverSigUrl: string | null = null;
      let customerSigUrl: string | null = null;
      if (driverCanvasRef.current && driverSigned) {
        const file = await canvasToFile(driverCanvasRef.current, 'driver.png');
        const result = await storageService.uploadImage(file, `jobs/${jobId}/signatures/${type}/driver`);
        driverSigUrl = result.url;
      }
      if (customerCanvasRef.current && customerSigned) {
        const file = await canvasToFile(customerCanvasRef.current, 'customer.png');
        const result = await storageService.uploadImage(file, `jobs/${jobId}/signatures/${type}/customer`);
        customerSigUrl = result.url;
      }

      // 4. Submit inspection
      await submitMutation.mutateAsync({
        jobId,
        type,
        inspection: {
          odometer: formState.odometer ? parseInt(formState.odometer) : null,
          fuel_level_percent: FUEL_LEVEL_MAP[formState.fuelLevel] ?? null,
          vehicle_condition: formState.vehicleCondition || null,
          light_condition: formState.lightCondition || null,
          oil_level_status: formState.oilLevel || null,
          water_level_status: formState.waterLevel || null,
          notes: formState.notes || null,
          handbook: formState.handbook || null,
          service_book: formState.serviceBook || null,
          mot: formState.mot || null,
          v5: formState.v5 || null,
          parcel_shelf: formState.parcelShelf || null,
          spare_wheel_status: formState.spareWheel || null,
          tool_kit: formState.toolKit || null,
          tyre_inflation_kit: formState.tyreInflationKit || null,
          locking_wheel_nut: formState.lockingWheelNut || null,
          sat_nav_working: formState.satNavWorking || null,
          alloys_or_trims: formState.alloysOrTrims || null,
          alloys_damaged: formState.alloysDamaged || null,
          wheel_trims_damaged: formState.wheelTrimsDamaged || null,
          number_of_keys: formState.numberOfKeys || null,
          ev_charging_cables: formState.evChargingCables || null,
          aerial: formState.aerial || null,
          customer_paperwork: formState.customerPaperwork || null,
          driver_signature_url: driverSigUrl,
          customer_signature_url: customerSigUrl,
        },
        damageItems: damageItemsPayload,
      });

      toast({ title: 'Success', description: `${type === 'pickup' ? 'Pickup' : 'Delivery'} inspection submitted.` });
      navigate(`/jobs/${jobId}`);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
  };
  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // ─── Step 1: Odometer & Fuel ───
  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Odometer & Fuel Level</h2>
      <div className="space-y-4">
        <div>
          <Label htmlFor="odometer" className="text-base font-medium">Odometer</Label>
          <Input id="odometer" type="number" placeholder="Enter mileage" value={formState.odometer} onChange={(e) => updateField('odometer', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-base font-medium">Fuel Level</Label>
          <RadioGroup value={formState.fuelLevel} onValueChange={(v) => updateField('fuelLevel', v)} className="mt-2">
            {['Empty', '1/4', '1/2', '3/4', 'Full'].map((level) => (
              <div key={level} className="flex items-center space-x-2">
                <RadioGroupItem value={level} id={`fuel-${level}`} />
                <Label htmlFor={`fuel-${level}`}>{level}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>
    </div>
  );

  // ─── Step 2: Checklist ───
  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Collection Checklist</h2>
      <div className="space-y-6">
        <div>
          <Label className="text-base font-medium">Vehicle Condition</Label>
          <RadioGroup value={formState.vehicleCondition} onValueChange={(v) => updateField('vehicleCondition', v)} className="mt-2">
            {['Clean', 'Dirty', 'Wet', 'Snow Covered', 'Iced Over'].map((c) => (
              <div key={c} className="flex items-center space-x-2"><RadioGroupItem value={c} id={`vc-${c}`} /><Label htmlFor={`vc-${c}`}>{c}</Label></div>
            ))}
          </RadioGroup>
        </div>
        <div>
          <Label className="text-base font-medium">Light</Label>
          <RadioGroup value={formState.lightCondition} onValueChange={(v) => updateField('lightCondition', v)} className="mt-2">
            {['Good', 'Poor', 'Dark', 'Artificial', 'Raining'].map((l) => (
              <div key={l} className="flex items-center space-x-2"><RadioGroupItem value={l} id={`lc-${l}`} /><Label htmlFor={`lc-${l}`}>{l}</Label></div>
            ))}
          </RadioGroup>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-base font-medium">Oil Level</Label>
            <RadioGroup value={formState.oilLevel} onValueChange={(v) => updateField('oilLevel', v)} className="mt-2">
              <div className="flex items-center space-x-2"><RadioGroupItem value="Ok" id="oil-ok" /><Label htmlFor="oil-ok">Ok</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="Issue" id="oil-issue" /><Label htmlFor="oil-issue">Issue</Label></div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-base font-medium">Water Level</Label>
            <RadioGroup value={formState.waterLevel} onValueChange={(v) => updateField('waterLevel', v)} className="mt-2">
              <div className="flex items-center space-x-2"><RadioGroupItem value="Ok" id="water-ok" /><Label htmlFor="water-ok">Ok</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="Issue" id="water-issue" /><Label htmlFor="water-issue">Issue</Label></div>
            </RadioGroup>
          </div>
        </div>
        <div>
          <Label htmlFor="notes" className="text-base font-medium">Notes</Label>
          <Textarea id="notes" placeholder="Notes" value={formState.notes} onChange={(e) => updateField('notes', e.target.value)} className="mt-1" />
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">Equipment Checklist</h3>
          {[
            { key: 'handbook' as const, label: 'Handbook' },
            { key: 'serviceBook' as const, label: 'Service Book' },
            { key: 'mot' as const, label: 'MOT' },
            { key: 'v5' as const, label: 'V5' },
            { key: 'parcelShelf' as const, label: 'Parcel Shelf', hasNA: true },
            { key: 'toolKit' as const, label: 'Tool Kit & Jack' },
            { key: 'tyreInflationKit' as const, label: 'Tyre Inflation Kit' },
            { key: 'lockingWheelNut' as const, label: 'Locking Wheel Nut' },
            { key: 'evChargingCables' as const, label: 'EV Charging Cables', hasNA: true },
            { key: 'aerial' as const, label: 'Aerial', hasNA: true },
            { key: 'customerPaperwork' as const, label: 'Customer Paperwork' },
          ].map((item) => (
            <div key={item.key}>
              <Label className="text-sm font-medium">{item.label}</Label>
              <RadioGroup value={formState[item.key]} onValueChange={(v) => updateField(item.key, v)} className="mt-1 flex gap-6">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Present" id={`${item.key}-p`} /><Label htmlFor={`${item.key}-p`}>Present</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Not Present" id={`${item.key}-np`} /><Label htmlFor={`${item.key}-np`}>Not Present</Label></div>
                {item.hasNA && <div className="flex items-center space-x-2"><RadioGroupItem value="N/A" id={`${item.key}-na`} /><Label htmlFor={`${item.key}-na`}>N/A</Label></div>}
              </RadioGroup>
            </div>
          ))}

          <div>
            <Label className="text-sm font-medium">Spare Wheel</Label>
            <RadioGroup value={formState.spareWheel} onValueChange={(v) => updateField('spareWheel', v)} className="mt-1 flex flex-wrap gap-4">
              {['Ok', 'Deflated', 'Damaged', 'Missing'].map((c) => (
                <div key={c} className="flex items-center space-x-2"><RadioGroupItem value={c} id={`spare-${c}`} /><Label htmlFor={`spare-${c}`}>{c}</Label></div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm font-medium">Sat Nav Working</Label>
            <RadioGroup value={formState.satNavWorking} onValueChange={(v) => updateField('satNavWorking', v)} className="mt-1 flex gap-6">
              {['Yes', 'No', 'N/A'].map((v) => (
                <div key={v} className="flex items-center space-x-2"><RadioGroupItem value={v} id={`sn-${v}`} /><Label htmlFor={`sn-${v}`}>{v}</Label></div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm font-medium">Alloys or Wheel Trims</Label>
            <RadioGroup value={formState.alloysOrTrims} onValueChange={(v) => updateField('alloysOrTrims', v)} className="mt-1 flex gap-6">
              <div className="flex items-center space-x-2"><RadioGroupItem value="Alloys" id="at-a" /><Label htmlFor="at-a">Alloys</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="Wheel Trims" id="at-wt" /><Label htmlFor="at-wt">Wheel Trims</Label></div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Alloys Damaged</Label>
              <RadioGroup value={formState.alloysDamaged} onValueChange={(v) => updateField('alloysDamaged', v)} className="mt-1 flex flex-wrap gap-2">
                {['0', '1', '2', '3', '4'].map((n) => (
                  <div key={n} className="flex items-center space-x-2"><RadioGroupItem value={n} id={`ad-${n}`} /><Label htmlFor={`ad-${n}`}>{n}</Label></div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label className="text-sm font-medium">Wheel Trims Damaged</Label>
              <RadioGroup value={formState.wheelTrimsDamaged} onValueChange={(v) => updateField('wheelTrimsDamaged', v)} className="mt-1 flex flex-wrap gap-2">
                {['0', '1', '2', '3', '4'].map((n) => (
                  <div key={n} className="flex items-center space-x-2"><RadioGroupItem value={n} id={`wtd-${n}`} /><Label htmlFor={`wtd-${n}`}>{n}</Label></div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div>
            <Label htmlFor="numberOfKeys" className="text-sm font-medium">Number of Keys</Label>
            <Input id="numberOfKeys" placeholder="Number of Keys" value={formState.numberOfKeys} onChange={(e) => updateField('numberOfKeys', e.target.value)} className="mt-1" />
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Step 3: Damage ───
  const renderStep3 = () => (
    <VehicleDiagram onAddDamage={addDamage} damages={formState.damages.map((d) => ({ id: d.tempId, x: d.x, y: d.y, area: d.area, item: d.item, damageTypes: d.damageTypes }))} />
  );

  // ─── Step 4: Photos ───
  const renderStep4 = () => {
    const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-center">Photos</h2>
        <p className="text-center text-muted-foreground">Capture required vehicle photos</p>
        <div className="grid grid-cols-2 gap-4">
          {photoTypes.map((pt) => (
            <div key={pt.key} className="space-y-2">
              <Label className="text-sm font-medium">{pt.label}</Label>
              {formState.standardPhotoUrls[pt.key] ? (
                <img src={formState.standardPhotoUrls[pt.key]} alt={pt.label} className="w-full h-24 object-cover rounded border" />
              ) : (
                <div className="w-full h-24 bg-muted rounded border flex items-center justify-center">
                  <Camera className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" className="hidden" id={`photo-${pt.key}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoCapture(pt.key, f); }} />
              <Label htmlFor={`photo-${pt.key}`} className="cursor-pointer">
                <Button variant="outline" size="sm" className="w-full gap-1" asChild><span><Camera className="h-3 w-3" />{formState.standardPhotoUrls[pt.key] ? 'Retake' : 'Capture'}</span></Button>
              </Label>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Step 5: Signatures ───
  const renderStep5 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Signatures</h2>
      <Card className="p-4">
        <h3 className="font-medium mb-2">Driver Signature</h3>
        <canvas ref={(el) => { (driverCanvasRef as any).current = el; setupCanvas(el); }} width={320} height={120} className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg bg-white touch-none" />
        {driverSigned && <p className="text-xs text-success mt-1">Signed</p>}
      </Card>
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
        <p className="text-sm text-warning font-medium">Please pass the device to the customer for their signature.</p>
      </div>
      <Card className="p-4">
        <h3 className="font-medium mb-2">Customer Signature</h3>
        <canvas ref={(el) => { (customerCanvasRef as any).current = el; setupCanvas(el); }} width={320} height={120} className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg bg-white touch-none" />
        {customerSigned && <p className="text-xs text-success mt-1">Signed</p>}
      </Card>
    </div>
  );

  // ─── Step 6: Summary ───
  const renderStep6 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Review & Submit</h2>
      <Card className="p-6 space-y-4">
        <h3 className="font-medium">Inspection Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Type:</span><span className="capitalize">{type}</span></div>
          <div className="flex justify-between"><span>Odometer:</span><span>{formState.odometer || 'Not set'}</span></div>
          <div className="flex justify-between"><span>Fuel Level:</span><span>{formState.fuelLevel || 'Not set'}</span></div>
          <div className="flex justify-between"><span>Condition:</span><span>{formState.vehicleCondition || 'Not set'}</span></div>
          <div className="flex justify-between"><span>Damages:</span><span>{formState.damages.length}</span></div>
          <div className="flex justify-between"><span>Photos:</span><span>{Object.values(formState.standardPhotos).filter(Boolean).length}</span></div>
          <div className="flex justify-between"><span>Driver Signature:</span><span>{driverSigned ? '✓' : '—'}</span></div>
          <div className="flex justify-between"><span>Customer Signature:</span><span>{customerSigned ? '✓' : '—'}</span></div>
        </div>
      </Card>
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
        <p className="text-sm text-warning">Please ensure all provided information is correct. You will not be able to make any changes past this point.</p>
      </div>
      <Button className="w-full" size="lg" onClick={() => setShowConfirmationModal(true)} disabled={submitting}>
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : 'Submit Report'}
      </Button>
    </div>
  );

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title={`${type === 'pickup' ? 'Pickup' : 'Delivery'} — Step ${currentStep}/${totalSteps}`} showBack onBack={() => navigate(`/jobs/${jobId}`)} />

      <div className="px-4 py-2 bg-muted/30">
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="p-4">
        {steps[currentStep - 1]()}

        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button variant="outline" onClick={prevStep} disabled={currentStep === 1} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          {currentStep < totalSteps && (
            <Button onClick={nextStep} className="gap-2">Next <ChevronRight className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      <VehicleDamageModal isOpen={showDamageModal} onClose={() => setShowDamageModal(false)} onSubmit={handleDamageSubmit} />

      <Dialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Confirmation
              <Button variant="ghost" size="sm" onClick={() => setShowConfirmationModal(false)}><X className="h-4 w-4" /></Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Please ensure all provided information is correct.</p>
            <p className="text-sm">You will not be able to make any changes past this point.</p>
            <p className="text-sm text-destructive font-medium">After confirming, please pass the device to the customer so they can review any details.</p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowConfirmationModal(false)} className="flex-1">CLOSE</Button>
              <Button onClick={() => { setShowConfirmationModal(false); handleFinalSubmit(); }} className="flex-1" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'CONFIRM'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
