// Domain types matching Supabase schema exactly

export type JobStatus =
  | 'ready_for_pickup'
  | 'pickup_in_progress'
  | 'pickup_complete'
  | 'in_transit'
  | 'delivery_in_progress'
  | 'delivery_complete'
  | 'pod_ready'
  | 'completed'
  | 'cancelled';

export type InspectionType = 'pickup' | 'delivery';

export type PhotoType =
  | 'pickup_exterior_front'
  | 'pickup_exterior_rear'
  | 'pickup_exterior_driver_side'
  | 'pickup_exterior_passenger_side'
  | 'pickup_interior'
  | 'pickup_dashboard'
  | 'pickup_fuel_gauge'
  | 'pickup_other'
  | 'delivery_exterior_front'
  | 'delivery_exterior_rear'
  | 'delivery_exterior_driver_side'
  | 'delivery_exterior_passenger_side'
  | 'delivery_interior'
  | 'delivery_dashboard'
  | 'delivery_fuel_gauge'
  | 'delivery_other'
  | 'damage_close_up';

export type StorageBackend = 'internal' | 'googleDrive' | 'googleCloud';

export interface Job {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_colour: string;
  vehicle_year: string | null;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  pickup_company: string | null;
  pickup_address_line1: string;
  pickup_address_line2: string | null;
  pickup_city: string;
  pickup_postcode: string;
  pickup_notes: string | null;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_company: string | null;
  delivery_address_line1: string;
  delivery_address_line2: string | null;
  delivery_city: string;
  delivery_postcode: string;
  delivery_notes: string | null;
  earliest_delivery_date: string | null;
  status: JobStatus;
  has_pickup_inspection: boolean;
  has_delivery_inspection: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  is_hidden?: boolean;
  admin_rate?: number | null;
  pod_pdf_url?: string | null;
  route_distance_miles?: number | null;
  route_eta_minutes?: number | null;
  maps_validated?: boolean;
}

export interface Inspection {
  id: string;
  job_id: string;
  type: InspectionType;
  odometer: number | null;
  fuel_level_percent: number | null;
  vehicle_condition: string | null;
  light_condition: string | null;
  oil_level_status: string | null;
  water_level_status: string | null;
  notes: string | null;
  handbook: string | null;
  service_book: string | null;
  mot: string | null;
  v5: string | null;
  parcel_shelf: string | null;
  spare_wheel_status: string | null;
  tool_kit: string | null;
  tyre_inflation_kit: string | null;
  locking_wheel_nut: string | null;
  sat_nav_working: string | null;
  alloys_or_trims: string | null;
  alloys_damaged: string | null;
  wheel_trims_damaged: string | null;
  number_of_keys: string | null;
  ev_charging_cables: string | null;
  aerial: string | null;
  customer_paperwork: string | null;
  has_damage: boolean;
  inspected_at: string | null;
  inspected_by_name: string | null;
  customer_name: string | null;
  driver_signature_url: string | null;
  customer_signature_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DamageItem {
  id: string;
  inspection_id: string;
  x: number | null;
  y: number | null;
  area: string | null;
  location: string | null;
  item: string | null;
  damage_types: string[] | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface Photo {
  id: string;
  job_id: string;
  inspection_id: string | null;
  type: string;
  url: string;
  thumbnail_url: string | null;
  backend: string;
  backend_ref: string | null;
  label: string | null;
  created_at: string;
}

export interface JobActivityLog {
  id: string;
  job_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface JobWithRelations extends Job {
  inspections: Inspection[];
  photos: Photo[];
  damage_items: DamageItem[];
  activity_log: JobActivityLog[];
}

export interface DamageItemDraft {
  tempId: string;
  x: number;
  y: number;
  area: string;
  location: string;
  item: string;
  damageTypes: string[];
  notes: string;
  photo?: File;
  photoUrl?: string;
}

export interface AdditionalPhotoDraft {
  tempId: string;
  file: File;
  label: string;
  previewUrl: string;
}

export interface StoredFileInfo {
  url: string;
  thumbnailUrl?: string;
  backend: StorageBackend;
  backendRef?: string;
}

export interface StorageService {
  uploadImage(file: File, pathHint: string): Promise<StoredFileInfo>;
}

// Fuel level mapping
export const FUEL_LEVEL_MAP: Record<string, number> = {
  'Empty': 0,
  '1/4': 25,
  '1/2': 50,
  '3/4': 75,
  'Full': 100,
};

export const FUEL_PERCENT_TO_LABEL: Record<number, string> = {
  0: 'Empty',
  25: '1/4',
  50: '1/2',
  75: '3/4',
  100: 'Full',
};
