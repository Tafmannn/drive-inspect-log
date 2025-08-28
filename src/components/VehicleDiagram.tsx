import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Camera } from "lucide-react";

interface VehicleDiagramProps {
  onAddDamage: (position: { x: number; y: number }) => void;
  damages: Array<{ id: string; x: number; y: number; area: string; item: string; damageTypes: string[] }>;
}

export const VehicleDiagram = ({ onAddDamage, damages }: VehicleDiagramProps) => {
  const [isAddingDamage, setIsAddingDamage] = useState(false);

  const handleDiagramClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingDamage) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    
    onAddDamage({ x, y });
    setIsAddingDamage(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-center flex-1">Vehicle Damage</h2>
      </div>
      <p className="text-center text-muted-foreground">View & pinpoint any known damage</p>
      
      <Button 
        onClick={() => setIsAddingDamage(!isAddingDamage)}
        className={`w-full mb-4 ${isAddingDamage ? 'bg-destructive hover:bg-destructive/90' : ''}`}
        variant={isAddingDamage ? "destructive" : "default"}
      >
        {isAddingDamage ? "Cancel" : "Add Damage"}
      </Button>

      <Card className={`relative overflow-hidden ${isAddingDamage ? 'border-primary border-2' : ''}`}>
        <div 
          className="relative w-full h-80 bg-muted/20 cursor-pointer"
          onClick={handleDiagramClick}
        >
          {/* Vehicle Diagram SVG */}
          <svg
            viewBox="0 0 400 300"
            className="w-full h-full"
            style={{ background: '#f8f9fa' }}
          >
            {/* Top view of vehicle */}
            <g transform="translate(50, 30)">
              {/* Main body */}
              <rect x="75" y="50" width="150" height="200" fill="#e9ecef" stroke="#6c757d" strokeWidth="2" rx="10"/>
              
              {/* Front */}
              <rect x="75" y="30" width="150" height="20" fill="#e9ecef" stroke="#6c757d" strokeWidth="2" rx="10"/>
              
              {/* Rear */}
              <rect x="75" y="250" width="150" height="20" fill="#e9ecef" stroke="#6c757d" strokeWidth="2" rx="10"/>
              
              {/* Doors */}
              <line x1="75" y1="100" x2="75" y2="200" stroke="#6c757d" strokeWidth="1"/>
              <line x1="225" y1="100" x2="225" y2="200" stroke="#6c757d" strokeWidth="1"/>
              <line x1="100" y1="50" x2="200" y2="50" stroke="#6c757d" strokeWidth="1"/>
              <line x1="100" y1="250" x2="200" y2="250" stroke="#6c757d" strokeWidth="1"/>
              
              {/* Wheels */}
              <circle cx="50" cy="80" r="15" fill="#6c757d"/>
              <circle cx="250" cy="80" r="15" fill="#6c757d"/>
              <circle cx="50" cy="220" r="15" fill="#6c757d"/>
              <circle cx="250" cy="220" r="15" fill="#6c757d"/>
              
              {/* Windows */}
              <rect x="90" y="70" width="120" height="40" fill="#cce7ff" stroke="#6c757d" strokeWidth="1" rx="5"/>
              <rect x="90" y="190" width="120" height="40" fill="#cce7ff" stroke="#6c757d" strokeWidth="1" rx="5"/>
              <rect x="90" y="120" width="50" height="60" fill="#cce7ff" stroke="#6c757d" strokeWidth="1" rx="3"/>
              <rect x="160" y="120" width="50" height="60" fill="#cce7ff" stroke="#6c757d" strokeWidth="1" rx="3"/>
            </g>
            
            {/* Side view of vehicle */}
            <g transform="translate(50, 350)">
              {/* Main body */}
              <rect x="50" y="50" width="200" height="60" fill="#e9ecef" stroke="#6c757d" strokeWidth="2" rx="5"/>
              
              {/* Roof */}
              <path d="M 70 50 Q 150 30 230 50" fill="none" stroke="#6c757d" strokeWidth="2"/>
              <line x1="70" y1="50" x2="70" y2="40" stroke="#6c757d" strokeWidth="2"/>
              <line x1="230" y1="50" x2="230" y2="40" stroke="#6c757d" strokeWidth="2"/>
              
              {/* Wheels */}
              <circle cx="80" cy="110" r="20" fill="#6c757d"/>
              <circle cx="220" cy="110" r="20" fill="#6c757d"/>
              
              {/* Windows */}
              <rect x="80" y="55" width="30" height="20" fill="#cce7ff" stroke="#6c757d" strokeWidth="1"/>
              <rect x="120" y="55" width="60" height="20" fill="#cce7ff" stroke="#6c757d" strokeWidth="1"/>
              <rect x="190" y="55" width="30" height="20" fill="#cce7ff" stroke="#6c757d" strokeWidth="1"/>
            </g>
          </svg>
          
          {/* Damage markers */}
          {damages.map((damage) => (
            <div
              key={damage.id}
              className="absolute w-3 h-3 bg-primary rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ 
                left: `${damage.x}%`, 
                top: `${damage.y}%`,
                zIndex: 10
              }}
              title={`${damage.area} - ${damage.item}: ${damage.damageTypes.join(', ')}`}
            />
          ))}
          
          {isAddingDamage && (
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
              <p className="text-primary font-medium">Click to mark damage location</p>
            </div>
          )}
        </div>
      </Card>

      {damages.length === 0 && !isAddingDamage && (
        <div className="text-center py-8">
          <p className="text-lg font-medium mb-2">No damages recorded for this job</p>
        </div>
      )}
    </div>
  );
};