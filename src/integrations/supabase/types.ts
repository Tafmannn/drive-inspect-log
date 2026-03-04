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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      client_logs: {
        Row: {
          context: Json | null
          created_at: string
          event: string
          id: string
          job_id: string | null
          message: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          event: string
          id?: string
          job_id?: string | null
          message?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          event?: string
          id?: string
          job_id?: string | null
          message?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
          org_id: string
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
          org_id: string
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
          org_id?: string
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
          {
            foreignKeyName: "damage_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          backend: string
          backend_ref: string | null
          created_at: string
          expense_id: string
          id: string
          thumbnail_url: string | null
          url: string
        }
        Insert: {
          backend?: string
          backend_ref?: string | null
          created_at?: string
          expense_id: string
          id?: string
          thumbnail_url?: string | null
          url: string
        }
        Update: {
          backend?: string
          backend_ref?: string | null
          created_at?: string
          expense_id?: string
          id?: string
          thumbnail_url?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          billable_on_pod: boolean
          category: string
          created_at: string
          currency: string
          date: string
          driver_id: string | null
          id: string
          is_hidden: boolean
          job_id: string
          label: string | null
          notes: string | null
          org_id: string
          time: string | null
          updated_at: string
          upload_status: string
        }
        Insert: {
          amount: number
          billable_on_pod?: boolean
          category: string
          created_at?: string
          currency?: string
          date?: string
          driver_id?: string | null
          id?: string
          is_hidden?: boolean
          job_id: string
          label?: string | null
          notes?: string | null
          org_id: string
          time?: string | null
          updated_at?: string
          upload_status?: string
        }
        Update: {
          amount?: number
          billable_on_pod?: boolean
          category?: string
          created_at?: string
          currency?: string
          date?: string
          driver_id?: string | null
          id?: string
          is_hidden?: boolean
          job_id?: string
          label?: string | null
          notes?: string | null
          org_id?: string
          time?: string | null
          updated_at?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          customer_name: string | null
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
          org_id: string
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
          customer_name?: string | null
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
          org_id: string
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
          customer_name?: string | null
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
          org_id?: string
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
          {
            foreignKeyName: "inspections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          org_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          job_id: string
          notes?: string | null
          org_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
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
          {
            foreignKeyName: "job_activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          admin_rate: number | null
          cancellation_reason: string | null
          caz_ulez_cost: number | null
          caz_ulez_flag: string | null
          client_company: string | null
          client_email: string | null
          client_name: string | null
          client_notes: string | null
          client_phone: string | null
          completed_at: string | null
          created_at: string
          delivery_access_notes: string | null
          delivery_address_line1: string
          delivery_address_line2: string | null
          delivery_city: string
          delivery_company: string | null
          delivery_contact_name: string
          delivery_contact_phone: string
          delivery_notes: string | null
          delivery_postcode: string
          delivery_time_from: string | null
          delivery_time_to: string | null
          distance_miles: number | null
          driver_external_id: string | null
          driver_name: string | null
          earliest_delivery_date: string | null
          external_job_number: string | null
          has_delivery_inspection: boolean
          has_pickup_inspection: boolean
          id: string
          is_hidden: boolean
          job_date: string | null
          job_notes: string | null
          job_source: string | null
          job_type: string | null
          maps_validated: boolean
          notify_customer_on_arrival: boolean
          notify_customer_on_complete: boolean
          notify_customer_on_start: boolean
          org_id: string
          other_expenses: number | null
          pickup_access_notes: string | null
          pickup_address_line1: string
          pickup_address_line2: string | null
          pickup_city: string
          pickup_company: string | null
          pickup_contact_name: string
          pickup_contact_phone: string
          pickup_notes: string | null
          pickup_postcode: string
          pickup_time_from: string | null
          pickup_time_to: string | null
          pod_pdf_url: string | null
          priority: string | null
          promise_by_time: string | null
          rate_per_mile: number | null
          route_distance_miles: number | null
          route_eta_minutes: number | null
          sheet_job_id: string | null
          sheet_row_index: number | null
          status: string
          sync_to_map: boolean | null
          total_price: number | null
          updated_at: string
          vehicle_colour: string
          vehicle_fuel_type: string | null
          vehicle_make: string
          vehicle_model: string
          vehicle_reg: string
          vehicle_type: string | null
          vehicle_year: string | null
        }
        Insert: {
          admin_rate?: number | null
          cancellation_reason?: string | null
          caz_ulez_cost?: number | null
          caz_ulez_flag?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name?: string | null
          client_notes?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_access_notes?: string | null
          delivery_address_line1: string
          delivery_address_line2?: string | null
          delivery_city: string
          delivery_company?: string | null
          delivery_contact_name: string
          delivery_contact_phone: string
          delivery_notes?: string | null
          delivery_postcode: string
          delivery_time_from?: string | null
          delivery_time_to?: string | null
          distance_miles?: number | null
          driver_external_id?: string | null
          driver_name?: string | null
          earliest_delivery_date?: string | null
          external_job_number?: string | null
          has_delivery_inspection?: boolean
          has_pickup_inspection?: boolean
          id?: string
          is_hidden?: boolean
          job_date?: string | null
          job_notes?: string | null
          job_source?: string | null
          job_type?: string | null
          maps_validated?: boolean
          notify_customer_on_arrival?: boolean
          notify_customer_on_complete?: boolean
          notify_customer_on_start?: boolean
          org_id: string
          other_expenses?: number | null
          pickup_access_notes?: string | null
          pickup_address_line1: string
          pickup_address_line2?: string | null
          pickup_city: string
          pickup_company?: string | null
          pickup_contact_name: string
          pickup_contact_phone: string
          pickup_notes?: string | null
          pickup_postcode: string
          pickup_time_from?: string | null
          pickup_time_to?: string | null
          pod_pdf_url?: string | null
          priority?: string | null
          promise_by_time?: string | null
          rate_per_mile?: number | null
          route_distance_miles?: number | null
          route_eta_minutes?: number | null
          sheet_job_id?: string | null
          sheet_row_index?: number | null
          status?: string
          sync_to_map?: boolean | null
          total_price?: number | null
          updated_at?: string
          vehicle_colour: string
          vehicle_fuel_type?: string | null
          vehicle_make: string
          vehicle_model: string
          vehicle_reg: string
          vehicle_type?: string | null
          vehicle_year?: string | null
        }
        Update: {
          admin_rate?: number | null
          cancellation_reason?: string | null
          caz_ulez_cost?: number | null
          caz_ulez_flag?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name?: string | null
          client_notes?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_access_notes?: string | null
          delivery_address_line1?: string
          delivery_address_line2?: string | null
          delivery_city?: string
          delivery_company?: string | null
          delivery_contact_name?: string
          delivery_contact_phone?: string
          delivery_notes?: string | null
          delivery_postcode?: string
          delivery_time_from?: string | null
          delivery_time_to?: string | null
          distance_miles?: number | null
          driver_external_id?: string | null
          driver_name?: string | null
          earliest_delivery_date?: string | null
          external_job_number?: string | null
          has_delivery_inspection?: boolean
          has_pickup_inspection?: boolean
          id?: string
          is_hidden?: boolean
          job_date?: string | null
          job_notes?: string | null
          job_source?: string | null
          job_type?: string | null
          maps_validated?: boolean
          notify_customer_on_arrival?: boolean
          notify_customer_on_complete?: boolean
          notify_customer_on_start?: boolean
          org_id?: string
          other_expenses?: number | null
          pickup_access_notes?: string | null
          pickup_address_line1?: string
          pickup_address_line2?: string | null
          pickup_city?: string
          pickup_company?: string | null
          pickup_contact_name?: string
          pickup_contact_phone?: string
          pickup_notes?: string | null
          pickup_postcode?: string
          pickup_time_from?: string | null
          pickup_time_to?: string | null
          pod_pdf_url?: string | null
          priority?: string | null
          promise_by_time?: string | null
          rate_per_mile?: number | null
          route_distance_miles?: number | null
          route_eta_minutes?: number | null
          sheet_job_id?: string | null
          sheet_row_index?: number | null
          status?: string
          sync_to_map?: boolean | null
          total_price?: number | null
          updated_at?: string
          vehicle_colour?: string
          vehicle_fuel_type?: string | null
          vehicle_make?: string
          vehicle_model?: string
          vehicle_reg?: string
          vehicle_type?: string | null
          vehicle_year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
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
          label: string | null
          org_id: string
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
          label?: string | null
          org_id: string
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
          label?: string | null
          org_id?: string
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
          {
            foreignKeyName: "photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_confirmations: {
        Row: {
          confirmed_at: string | null
          created_at: string
          customer_name: string | null
          event_type: string
          expires_at: string
          id: string
          job_id: string
          notes: string | null
          token: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string | null
          event_type: string
          expires_at?: string
          id?: string
          job_id: string
          notes?: string | null
          token?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string | null
          event_type?: string
          expires_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_confirmations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_sync_config: {
        Row: {
          column_mapping: Json
          created_at: string
          id: string
          is_enabled: boolean
          last_pull_at: string | null
          last_push_at: string | null
          sheet_name: string
          spreadsheet_id: string
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_pull_at?: string | null
          last_push_at?: string | null
          sheet_name?: string
          spreadsheet_id: string
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_pull_at?: string | null
          last_push_at?: string | null
          sheet_name?: string
          spreadsheet_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sheet_sync_logs: {
        Row: {
          created_at: string
          details: Json | null
          direction: string
          errors: Json | null
          id: string
          rows_created: number
          rows_processed: number
          rows_skipped: number
          rows_updated: number
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          direction: string
          errors?: Json | null
          id?: string
          rows_created?: number
          rows_processed?: number
          rows_skipped?: number
          rows_updated?: number
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          direction?: string
          errors?: Json | null
          id?: string
          rows_created?: number
          rows_processed?: number
          rows_skipped?: number
          rows_updated?: number
          status?: string
        }
        Relationships: []
      }
      sync_errors: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          missing_fields: string[]
          resolved: boolean
          sheet_job_id: string | null
          sheet_row_index: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          missing_fields?: string[]
          resolved?: boolean
          sheet_job_id?: string | null
          sheet_row_index: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          missing_fields?: string[]
          resolved?: boolean
          sheet_job_id?: string | null
          sheet_row_index?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_super_admin: { Args: never; Returns: boolean }
      user_org_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
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
