import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleDiagram } from "@/components/VehicleDiagram";
import { VehicleDamageModal } from "@/components/VehicleDamageModal";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Camera, Plus, X } from "lucide-react";

interface InspectionData {
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
  damages: Array<{
    id: string;
    x: number;
    y: number;
    area: string;
    location: string;
    item: string;
    damageTypes: string[];
    notes: string;
  }>;
  photos: any[];
}

export const InspectionFlow = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [inspectionData, setInspectionData] = useState<InspectionData>({
    odometer: "",
    fuelLevel: "",
    vehicleCondition: "",
    lightCondition: "",
    oilLevel: "",
    waterLevel: "",
    notes: "",
    handbook: "",
    serviceBook: "",
    mot: "",
    v5: "",
    parcelShelf: "",
    spareWheel: "",
    toolKit: "",
    tyreInflationKit: "",
    lockingWheelNut: "",
    satNavWorking: "",
    alloysOrTrims: "",
    alloysDamaged: "",
    wheelTrimsDamaged: "",
    numberOfKeys: "",
    evChargingCables: "",
    aerial: "",
    customerPaperwork: "",
    damages: [],
    photos: []
  });

  const totalSteps = 4;

  const updateData = (field: string, value: string) => {
    setInspectionData(prev => ({ ...prev, [field]: value }));
  };

  const addDamage = (position: { x: number; y: number }) => {
    setShowDamageModal(true);
    // Store position temporarily for when modal submits
    (window as any).tempDamagePosition = position;
  };

  const handleDamageSubmit = (damage: any) => {
    const position = (window as any).tempDamagePosition || { x: 0, y: 0 };
    const newDamage = {
      id: Date.now().toString(),
      x: position.x,
      y: position.y,
      ...damage
    };
    setInspectionData(prev => ({
      ...prev,
      damages: [...prev.damages, newDamage]
    }));
  };

  const nextStep = () => {
    if (currentStep === 4) {
      setShowConfirmationModal(true);
    } else if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Section 1</h2>
      <p className="text-center text-muted-foreground">Odometer & Fuel Level</p>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="odometer" className="text-base font-medium">Odometer</Label>
          <Input
            id="odometer"
            placeholder="Odometer"
            value={inspectionData.odometer}
            onChange={(e) => updateData('odometer', e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-base font-medium">Fuel Level</Label>
          <RadioGroup 
            value={inspectionData.fuelLevel} 
            onValueChange={(value) => updateData('fuelLevel', value)}
            className="mt-2"
          >
            {['Empty', '1/4', '1/2', '3/4', 'Full'].map((level) => (
              <div key={level} className="flex items-center space-x-2">
                <RadioGroupItem value={level} id={level} />
                <Label htmlFor={level}>{level}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Section 2</h2>
      <p className="text-center text-muted-foreground">Collection Checklist</p>
      
      <div className="space-y-6">
        <div>
          <Label className="text-base font-medium">Vehicle Condition</Label>
          <RadioGroup 
            value={inspectionData.vehicleCondition} 
            onValueChange={(value) => updateData('vehicleCondition', value)}
            className="mt-2"
          >
            {['Clean', 'Dirty', 'Wet', 'Snow Covered', 'Iced Over'].map((condition) => (
              <div key={condition} className="flex items-center space-x-2">
                <RadioGroupItem value={condition} id={`vehicle-${condition}`} />
                <Label htmlFor={`vehicle-${condition}`}>{condition}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div>
          <Label className="text-base font-medium">Light</Label>
          <RadioGroup 
            value={inspectionData.lightCondition} 
            onValueChange={(value) => updateData('lightCondition', value)}
            className="mt-2"
          >
            {['Good', 'Poor', 'Dark', 'Artificial', 'Raining'].map((light) => (
              <div key={light} className="flex items-center space-x-2">
                <RadioGroupItem value={light} id={`light-${light}`} />
                <Label htmlFor={`light-${light}`}>{light}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-base font-medium">Oil Level</Label>
            <RadioGroup 
              value={inspectionData.oilLevel} 
              onValueChange={(value) => updateData('oilLevel', value)}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Ok" id="oil-ok" />
                <Label htmlFor="oil-ok">Ok</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Issue" id="oil-issue" />
                <Label htmlFor="oil-issue">Issue</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-base font-medium">Water Level</Label>
            <RadioGroup 
              value={inspectionData.waterLevel} 
              onValueChange={(value) => updateData('waterLevel', value)}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Ok" id="water-ok" />
                <Label htmlFor="water-ok">Ok</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Issue" id="water-issue" />
                <Label htmlFor="water-issue">Issue</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div>
          <Label htmlFor="notes" className="text-base font-medium">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Notes"
            value={inspectionData.notes}
            onChange={(e) => updateData('notes', e.target.value)}
            className="mt-1"
          />
        </div>

        {/* Equipment Checklist */}
        <div className="space-y-4">
          <h3 className="font-medium">Equipment Checklist</h3>
          
          {[
            { key: 'handbook', label: 'Handbook' },
            { key: 'serviceBook', label: 'Service Book' },
            { key: 'mot', label: 'MOT' },
            { key: 'v5', label: 'V5' },
            { key: 'parcelShelf', label: 'Parcel Shelf' },
            { key: 'toolKit', label: 'Tool Kit & Jack' },
            { key: 'tyreInflationKit', label: 'Tyre Inflation Kit' },
            { key: 'lockingWheelNut', label: 'Locking Wheel Nut' },
            { key: 'evChargingCables', label: 'EV Charging Cables' },
            { key: 'aerial', label: 'Aerial' },
            { key: 'customerPaperwork', label: 'Customer Paperwork' }
          ].map((item) => (
            <div key={item.key}>
              <Label className="text-sm font-medium">{item.label}</Label>
              <RadioGroup 
                value={inspectionData[item.key as keyof InspectionData] as string}
                onValueChange={(value) => updateData(item.key, value)}
                className="mt-1 flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Present" id={`${item.key}-present`} />
                  <Label htmlFor={`${item.key}-present`}>Present</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Not Present" id={`${item.key}-not-present`} />
                  <Label htmlFor={`${item.key}-not-present`}>Not Present</Label>
                </div>
                {item.key === 'parcelShelf' || item.key === 'evChargingCables' || item.key === 'aerial' ? (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N/A" id={`${item.key}-na`} />
                    <Label htmlFor={`${item.key}-na`}>N/A</Label>
                  </div>
                ) : null}
              </RadioGroup>
            </div>
          ))}

          <div>
            <Label className="text-sm font-medium">Spare Wheel</Label>
            <RadioGroup 
              value={inspectionData.spareWheel}
              onValueChange={(value) => updateData('spareWheel', value)}
              className="mt-1 flex flex-wrap gap-4"
            >
              {['Ok', 'Deflated', 'Damaged', 'Missing'].map((condition) => (
                <div key={condition} className="flex items-center space-x-2">
                  <RadioGroupItem value={condition} id={`spare-${condition}`} />
                  <Label htmlFor={`spare-${condition}`}>{condition}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm font-medium">Sat Nav Working</Label>
            <RadioGroup 
              value={inspectionData.satNavWorking}
              onValueChange={(value) => updateData('satNavWorking', value)}
              className="mt-1 flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Yes" id="satnav-yes" />
                <Label htmlFor="satnav-yes">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="No" id="satnav-no" />
                <Label htmlFor="satnav-no">No</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="N/A" id="satnav-na" />
                <Label htmlFor="satnav-na">N/A</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-sm font-medium">Alloys or Wheel Trims</Label>
            <RadioGroup 
              value={inspectionData.alloysOrTrims}
              onValueChange={(value) => updateData('alloysOrTrims', value)}
              className="mt-1 flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Alloys" id="alloys" />
                <Label htmlFor="alloys">Alloys</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Wheel Trims" id="wheel-trims" />
                <Label htmlFor="wheel-trims">Wheel Trims</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Alloys Damaged</Label>
              <RadioGroup 
                value={inspectionData.alloysDamaged}
                onValueChange={(value) => updateData('alloysDamaged', value)}
                className="mt-1 flex flex-wrap gap-2"
              >
                {['0', '1', '2', '3', '4'].map((num) => (
                  <div key={num} className="flex items-center space-x-2">
                    <RadioGroupItem value={num} id={`alloys-${num}`} />
                    <Label htmlFor={`alloys-${num}`}>{num}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm font-medium">Wheel Trims Damaged</Label>
              <RadioGroup 
                value={inspectionData.wheelTrimsDamaged}
                onValueChange={(value) => updateData('wheelTrimsDamaged', value)}
                className="mt-1 flex flex-wrap gap-2"
              >
                {['0', '1', '2', '3', '4'].map((num) => (
                  <div key={num} className="flex items-center space-x-2">
                    <RadioGroupItem value={num} id={`trims-${num}`} />
                    <Label htmlFor={`trims-${num}`}>{num}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div>
            <Label htmlFor="numberOfKeys" className="text-sm font-medium">Number of Keys</Label>
            <Input
              id="numberOfKeys"
              placeholder="Number of Keys"
              value={inspectionData.numberOfKeys}
              onChange={(e) => updateData('numberOfKeys', e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <VehicleDiagram 
      onAddDamage={addDamage}
      damages={inspectionData.damages}
    />
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Submit Job</h2>
      
      <Card className="p-6 space-y-4">
        <h3 className="font-medium">Inspection Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Odometer:</span>
            <span>{inspectionData.odometer || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span>Fuel Level:</span>
            <span>{inspectionData.fuelLevel || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span>Damages:</span>
            <span>{inspectionData.damages.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Photos:</span>
            <span>{inspectionData.photos.length}</span>
          </div>
        </div>
      </Card>

      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
        <p className="text-sm text-warning">
          Please ensure all provided information is correct. You will not be able to make any changes past this point.
        </p>
      </div>

      <Card className="p-6">
        <h3 className="font-medium mb-4">Customer Signature</h3>
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg h-32 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Signature area - pass device to customer</p>
        </div>
      </Card>

      <Button 
        className="w-full" 
        size="lg"
        onClick={() => {
          // Handle submission
          navigate('/jobs');
        }}
      >
        Submit Report
      </Button>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return renderStep1();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title={`Step ${currentStep} of ${totalSteps}`}
        showBack
        onBack={() => navigate('/jobs')}
      />
      
      {/* Progress Bar */}
      <div className="px-4 py-2 bg-muted/30">
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-4">
        {renderCurrentStep()}
        
        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          {currentStep < totalSteps ? (
            <Button onClick={nextStep} className="gap-2">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Vehicle Damage Modal */}
      <VehicleDamageModal
        isOpen={showDamageModal}
        onClose={() => setShowDamageModal(false)}
        onSubmit={handleDamageSubmit}
      />

      {/* Confirmation Modal */}
      <Dialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Confirmation
              <Button variant="ghost" size="sm" onClick={() => setShowConfirmationModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm">Please ensure all provided information is correct</p>
            <p className="text-sm">You will not be able to make any changes past this point</p>
            <p className="text-sm text-destructive font-medium">
              After confirming please pass the device to the customer so they can review any details
            </p>
            
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmationModal(false)}
                className="flex-1"
              >
                CLOSE
              </Button>
              <Button 
                onClick={() => {
                  setShowConfirmationModal(false);
                  navigate('/jobs');
                }}
                className="flex-1"
              >
                CONFIRM
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};