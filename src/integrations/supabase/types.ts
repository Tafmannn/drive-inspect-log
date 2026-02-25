export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      damage_items: {
        Row: {
          area: string | null
          created_at: string
          damage_types: string[] | null
          id: string
          inspection_id: string
          item: string | null
          location: string | null
          notes: string | null
          photo_url: string | null
          x: number | null
          y: number | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          damage_types?: string[] | null
          id?: string
          inspection_id: string
          item?: string | null
          location?: string | null
          notes?: string | null
          photo_url?: string | null
          x?: number | null
          y?: number | null
        }
        Update: {
          area?: string | null
          created_at?: string
          damage_types?: string[] | null
          id?: string
          inspection_id?: string
          item?: string | null
          location?: string | null
          notes?: string | null
          photo_url?: string | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          aerial: string | null
          alloys_damaged: string | null
          alloys_or_trims: string | null
          created_at: string
          customer_paperwork: string | null
          customer_signature_url: string | null
          driver_signature_url: string | null
          ev_charging_cables: string | null
          fuel_level_percent: number | null
          handbook: string | null
          has_damage: boolean
          id: string
          inspected_at: string | null
          inspected_by_name: string | null
          job_id: string
          light_condition: string | null
          locking_wheel_nut: string | null
          mot: string | null
          notes: string | null
          number_of_keys: string | null
          odometer: number | null
          oil_level_status: string | null
          parcel_shelf: string | null
          sat_nav_working: string | null
          service_book: string | null
          spare_wheel_status: string | null
          tool_kit: string | null
          type: string
          tyre_inflation_kit: string | null
          updated_at: string
          v5: string | null
          vehicle_condition: string | null
          water_level_status: string | null
          wheel_trims_damaged: string | null
        }
        Insert: {
          aerial?: string | null
          alloys_damaged?: string | null
          alloys_or_trims?: string | null
          created_at?: string
          customer_paperwork?: string | null
          customer_signature_url?: string | null
          driver_signature_url?: string | null
          ev_charging_cables?: string | null
          fuel_level_percent?: number | null
          handbook?: string | null
          has_damage?: boolean
          id?: string
          inspected_at?: string | null
          inspected_by_name?: string | null
          job_id: string
          light_condition?: string | null
          locking_wheel_nut?: string | null
          mot?: string | null
          notes?: string | null
          number_of_keys?: string | null
          odometer?: number | null
          oil_level_status?: string | null
          parcel_shelf?: string | null
          sat_nav_working?: string | null
          service_book?: string | null
          spare_wheel_status?: string | null
          tool_kit?: string | null
          type: string
          tyre_inflation_kit?: string | null
          updated_at?: string
          v5?: string | null
          vehicle_condition?: string | null
          water_level_status?: string | null
          wheel_trims_damaged?: string | null
        }
        Update: {
          aerial?: string | null
          alloys_damaged?: string | null
          alloys_or_trims?: string | null
          created_at?: string
          customer_paperwork?: string | null
          customer_signature_url?: string | null
          driver_signature_url?: string | null
          ev_charging_cables?: string | null
          fuel_level_percent?: number | null
          handbook?: string | null
          has_damage?: boolean
          id?: string
          inspected_at?: string | null
          inspected_by_name?: string | null
          job_id?: string
          light_condition?: string | null
          locking_wheel_nut?: string | null
          mot?: string | null
          notes?: string | null
          number_of_keys?: string | null
          odometer?: number | null
          oil_level_status?: string | null
          parcel_shelf?: string | null
          sat_nav_working?: string | null
          service_book?: string | null
          spare_wheel_status?: string | null
          tool_kit?: string | null
          type?: string
          tyre_inflation_kit?: string | null
          updated_at?: string
          v5?: string | null
          vehicle_condition?: string | null
          water_level_status?: string | null
          wheel_trims_damaged?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_activity_log: {
        Row: {
          action: string
          created_at: string
          from_status: string | null
          id: string
          job_id: string
          notes: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          job_id: string
          notes?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          delivery_address_line1: string
          delivery_address_line2: string | null
          delivery_city: string
          delivery_company: string | null
          delivery_contact_name: string
          delivery_contact_phone: string
          delivery_notes: string | null
          delivery_postcode: string
          earliest_delivery_date: string | null
          external_job_number: string | null
          has_delivery_inspection: boolean
          has_pickup_inspection: boolean
          id: string
          pickup_address_line1: string
          pickup_address_line2: string | null
          pickup_city: string
          pickup_company: string | null
          pickup_contact_name: string
          pickup_contact_phone: string
          pickup_notes: string | null
          pickup_postcode: string
          status: string
          updated_at: string
          vehicle_colour: string
          vehicle_make: string
          vehicle_model: string
          vehicle_reg: string
          vehicle_year: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          delivery_address_line1: string
          delivery_address_line2?: string | null
          delivery_city: string
          delivery_company?: string | null
          delivery_contact_name: string
          delivery_contact_phone: string
          delivery_notes?: string | null
          delivery_postcode: string
          earliest_delivery_date?: string | null
          external_job_number?: string | null
          has_delivery_inspection?: boolean
          has_pickup_inspection?: boolean
          id?: string
          pickup_address_line1: string
          pickup_address_line2?: string | null
          pickup_city: string
          pickup_company?: string | null
          pickup_contact_name: string
          pickup_contact_phone: string
          pickup_notes?: string | null
          pickup_postcode: string
          status?: string
          updated_at?: string
          vehicle_colour: string
          vehicle_make: string
          vehicle_model: string
          vehicle_reg: string
          vehicle_year?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          delivery_address_line1?: string
          delivery_address_line2?: string | null
          delivery_city?: string
          delivery_company?: string | null
          delivery_contact_name?: string
          delivery_contact_phone?: string
          delivery_notes?: string | null
          delivery_postcode?: string
          earliest_delivery_date?: string | null
          external_job_number?: string | null
          has_delivery_inspection?: boolean
          has_pickup_inspection?: boolean
          id?: string
          pickup_address_line1?: string
          pickup_address_line2?: string | null
          pickup_city?: string
          pickup_company?: string | null
          pickup_contact_name?: string
          pickup_contact_phone?: string
          pickup_notes?: string | null
          pickup_postcode?: string
          status?: string
          updated_at?: string
          vehicle_colour?: string
          vehicle_make?: string
          vehicle_model?: string
          vehicle_reg?: string
          vehicle_year?: string | null
        }
        Relationships: []
      }
      photos: {
        Row: {
          backend: string
          backend_ref: string | null
          created_at: string
          id: string
          inspection_id: string | null
          job_id: string
          thumbnail_url: string | null
          type: string
          url: string
        }
        Insert: {
          backend?: string
          backend_ref?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id: string
          thumbnail_url?: string | null
          type: string
          url: string
        }
        Update: {
          backend?: string
          backend_ref?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id?: string
          thumbnail_url?: string | null
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
