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
      admin_audit_log: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_address: string | null
          performed_by: string
          performed_by_email: string
          target_org_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          performed_by: string
          performed_by_email: string
          target_org_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          performed_by?: string
          performed_by_email?: string
          target_org_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
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
      attention_acknowledgements: {
        Row: {
          acknowledged_by: string
          created_at: string
          exception_id: string
          id: string
          job_id: string | null
          note: string | null
          snoozed_until: string | null
        }
        Insert: {
          acknowledged_by: string
          created_at?: string
          exception_id: string
          id?: string
          job_id?: string | null
          note?: string | null
          snoozed_until?: string | null
        }
        Update: {
          acknowledged_by?: string
          created_at?: string
          exception_id?: string
          id?: string
          job_id?: string | null
          note?: string | null
          snoozed_until?: string | null
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
      client_rate_cards: {
        Row: {
          agreed_price: number | null
          client_id: string
          created_at: string
          created_by: string | null
          minimum_charge: number | null
          org_id: string
          rate_card_active: boolean
          rate_card_notes: string | null
          rate_per_mile: number | null
          updated_at: string
          updated_by: string | null
          waiting_rate_per_hour: number | null
        }
        Insert: {
          agreed_price?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          minimum_charge?: number | null
          org_id: string
          rate_card_active?: boolean
          rate_card_notes?: string | null
          rate_per_mile?: number | null
          updated_at?: string
          updated_by?: string | null
          waiting_rate_per_hour?: number | null
        }
        Update: {
          agreed_price?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          minimum_charge?: number | null
          org_id?: string
          rate_card_active?: boolean
          rate_card_notes?: string | null
          rate_per_mile?: number | null
          updated_at?: string
          updated_by?: string | null
          waiting_rate_per_hour?: number | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          account_status: string
          address: string | null
          billing_address: string | null
          billing_email: string | null
          client_type: string | null
          company: string | null
          company_number: string | null
          contact_email: string | null
          contact_mobile: string | null
          contact_name: string | null
          created_at: string
          credit_limit: number | null
          email: string | null
          handover_requirements: string | null
          id: string
          is_active: boolean
          main_phone: string | null
          minimum_charge: number | null
          name: string
          notes: string | null
          opening_hours: string | null
          org_id: string
          payment_terms: string | null
          phone: string | null
          rate_type: string | null
          rate_value: number | null
          signature_required: boolean
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          account_status?: string
          address?: string | null
          billing_address?: string | null
          billing_email?: string | null
          client_type?: string | null
          company?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          handover_requirements?: string | null
          id?: string
          is_active?: boolean
          main_phone?: string | null
          minimum_charge?: number | null
          name: string
          notes?: string | null
          opening_hours?: string | null
          org_id: string
          payment_terms?: string | null
          phone?: string | null
          rate_type?: string | null
          rate_value?: number | null
          signature_required?: boolean
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          account_status?: string
          address?: string | null
          billing_address?: string | null
          billing_email?: string | null
          client_type?: string | null
          company?: string | null
          company_number?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          handover_requirements?: string | null
          id?: string
          is_active?: boolean
          main_phone?: string | null
          minimum_charge?: number | null
          name?: string
          notes?: string | null
          opening_hours?: string | null
          org_id?: string
          payment_terms?: string | null
          phone?: string | null
          rate_type?: string | null
          rate_value?: number | null
          signature_required?: boolean
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checks: {
        Row: {
          check_type: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          org_id: string
          related_id: string
          related_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          check_type: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          related_id: string
          related_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          check_type?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          related_id?: string
          related_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      damage_items: {
        Row: {
          archived_at: string | null
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
          run_id: string | null
          submission_session_id: string | null
          x: number | null
          y: number | null
        }
        Insert: {
          archived_at?: string | null
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
          run_id?: string | null
          submission_session_id?: string | null
          x?: number | null
          y?: number | null
        }
        Update: {
          archived_at?: string | null
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
          run_id?: string | null
          submission_session_id?: string | null
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
      driver_onboarding: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          employment_type: string | null
          full_name: string
          headshot_url: string | null
          id: string
          licence_back_url: string | null
          licence_expiry: string | null
          licence_front_url: string | null
          linked_user_id: string | null
          notes: string | null
          org_id: string
          phone: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trade_plate_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          employment_type?: string | null
          full_name: string
          headshot_url?: string | null
          id?: string
          licence_back_url?: string | null
          licence_expiry?: string | null
          licence_front_url?: string | null
          linked_user_id?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trade_plate_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          employment_type?: string | null
          full_name?: string
          headshot_url?: string | null
          id?: string
          licence_back_url?: string | null
          licence_expiry?: string | null
          licence_front_url?: string | null
          linked_user_id?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trade_plate_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_onboarding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          automatic_capable: boolean
          availability_notes: string | null
          bank_captured: boolean
          city: string | null
          created_at: string
          date_joined: string | null
          date_of_birth: string | null
          display_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          endorsements: string | null
          ev_capable: boolean
          full_name: string
          home_postcode: string | null
          id: string
          is_active: boolean
          licence_categories: string[] | null
          licence_expiry: string | null
          licence_number: string | null
          manual_capable: boolean
          max_daily_distance: number | null
          notes: string | null
          org_id: string
          payout_terms: string | null
          phone: string | null
          postcode: string | null
          preferred_regions: string[] | null
          prestige_approved: boolean
          restore_note: string | null
          restored_at: string | null
          restored_by: string | null
          right_to_work: string | null
          start_date: string | null
          trade_plate_number: string | null
          unavailable_regions: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          automatic_capable?: boolean
          availability_notes?: string | null
          bank_captured?: boolean
          city?: string | null
          created_at?: string
          date_joined?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          endorsements?: string | null
          ev_capable?: boolean
          full_name?: string
          home_postcode?: string | null
          id?: string
          is_active?: boolean
          licence_categories?: string[] | null
          licence_expiry?: string | null
          licence_number?: string | null
          manual_capable?: boolean
          max_daily_distance?: number | null
          notes?: string | null
          org_id: string
          payout_terms?: string | null
          phone?: string | null
          postcode?: string | null
          preferred_regions?: string[] | null
          prestige_approved?: boolean
          restore_note?: string | null
          restored_at?: string | null
          restored_by?: string | null
          right_to_work?: string | null
          start_date?: string | null
          trade_plate_number?: string | null
          unavailable_regions?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          automatic_capable?: boolean
          availability_notes?: string | null
          bank_captured?: boolean
          city?: string | null
          created_at?: string
          date_joined?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          endorsements?: string | null
          ev_capable?: boolean
          full_name?: string
          home_postcode?: string | null
          id?: string
          is_active?: boolean
          licence_categories?: string[] | null
          licence_expiry?: string | null
          licence_number?: string | null
          manual_capable?: boolean
          max_daily_distance?: number | null
          notes?: string | null
          org_id?: string
          payout_terms?: string | null
          phone?: string | null
          postcode?: string | null
          preferred_regions?: string[] | null
          prestige_approved?: boolean
          restore_note?: string | null
          restored_at?: string | null
          restored_by?: string | null
          right_to_work?: string | null
          start_date?: string | null
          trade_plate_number?: string | null
          unavailable_regions?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
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
          archived_at: string | null
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
          run_id: string | null
          sat_nav_working: string | null
          service_book: string | null
          spare_wheel_status: string | null
          submission_session_id: string | null
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
          archived_at?: string | null
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
          run_id?: string | null
          sat_nav_working?: string | null
          service_book?: string | null
          spare_wheel_status?: string | null
          submission_session_id?: string | null
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
          archived_at?: string | null
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
          run_id?: string | null
          sat_nav_working?: string | null
          service_book?: string | null
          spare_wheel_status?: string | null
          submission_session_id?: string | null
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
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          job_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          job_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          job_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_address: string | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          job_id: string | null
          line_items: Json
          notes: string | null
          org_id: string
          payment_terms: string | null
          pdf_url: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          job_id?: string | null
          line_items?: Json
          notes?: string | null
          org_id: string
          payment_terms?: string | null
          pdf_url?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          job_id?: string | null
          line_items?: Json
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          pdf_url?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
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
      job_deviation_log: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          job_id: string
          notes: string | null
          org_id: string
          reason: string
          recommended_job_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          job_id: string
          notes?: string | null
          org_id: string
          reason: string
          recommended_job_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          reason?: string
          recommended_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_deviation_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_deviation_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_deviation_log_recommended_job_id_fkey"
            columns: ["recommended_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          client_id: string | null
          client_name: string | null
          client_notes: string | null
          client_phone: string | null
          completed_at: string | null
          created_at: string
          current_run_id: string
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
          driver_id: string | null
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
          pricing_metadata: Json | null
          pricing_suggestion_used_at: string | null
          pricing_suggestion_used_by: string | null
          priority: string | null
          promise_by_time: string | null
          rate_per_mile: number | null
          route_distance_miles: number | null
          route_eta_minutes: number | null
          sheet_job_id: string | null
          sheet_row_index: number | null
          sort_order: number | null
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
          client_id?: string | null
          client_name?: string | null
          client_notes?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          current_run_id?: string
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
          driver_id?: string | null
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
          pricing_metadata?: Json | null
          pricing_suggestion_used_at?: string | null
          pricing_suggestion_used_by?: string | null
          priority?: string | null
          promise_by_time?: string | null
          rate_per_mile?: number | null
          route_distance_miles?: number | null
          route_eta_minutes?: number | null
          sheet_job_id?: string | null
          sheet_row_index?: number | null
          sort_order?: number | null
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
          client_id?: string | null
          client_name?: string | null
          client_notes?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          current_run_id?: string
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
          driver_id?: string | null
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
          pricing_metadata?: Json | null
          pricing_suggestion_used_at?: string | null
          pricing_suggestion_used_by?: string | null
          priority?: string | null
          promise_by_time?: string | null
          rate_per_mile?: number | null
          route_distance_miles?: number | null
          route_eta_minutes?: number | null
          sheet_job_id?: string | null
          sheet_row_index?: number | null
          sort_order?: number | null
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
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "active_driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_documents: {
        Row: {
          created_at: string
          document_type: string
          expires_at: string | null
          file_name: string
          file_url: string
          id: string
          org_id: string
          related_id: string
          related_type: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          expires_at?: string | null
          file_name: string
          file_url: string
          id?: string
          org_id: string
          related_id: string
          related_type: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_name?: string
          file_url?: string
          id?: string
          org_id?: string
          related_id?: string
          related_type?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      organisations: {
        Row: {
          billing_plan: string | null
          branding_name: string | null
          company_number: string | null
          created_at: string
          id: string
          legal_name: string | null
          logo_url: string | null
          main_contact_email: string | null
          main_contact_name: string | null
          main_contact_phone: string | null
          max_users: number | null
          name: string
          notes: string | null
          primary_colour: string | null
          registered_address: string | null
          status: string
          trading_address: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          billing_plan?: string | null
          branding_name?: string | null
          company_number?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          max_users?: number | null
          name: string
          notes?: string | null
          primary_colour?: string | null
          registered_address?: string | null
          status?: string
          trading_address?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          billing_plan?: string | null
          branding_name?: string | null
          company_number?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          max_users?: number | null
          name?: string
          notes?: string | null
          primary_colour?: string | null
          registered_address?: string | null
          status?: string
          trading_address?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      permission_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          new_grant_type: string | null
          old_grant_type: string | null
          permission_key: string
          reason: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_grant_type?: string | null
          old_grant_type?: string | null
          permission_key: string
          reason?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_grant_type?: string | null
          old_grant_type?: string | null
          permission_key?: string
          reason?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permission_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permission_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "permission_audit_log_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "permission_audit_log_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["permission_key"]
          },
          {
            foreignKeyName: "permission_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permission_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permission_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      permissions_catalog: {
        Row: {
          category: string
          created_at: string
          description: string | null
          is_sensitive: boolean
          key: string
          label: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          is_sensitive?: boolean
          key: string
          label: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          is_sensitive?: boolean
          key?: string
          label?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          archived_at: string | null
          backend: string
          backend_ref: string | null
          created_at: string
          id: string
          inspection_id: string | null
          job_id: string
          label: string | null
          org_id: string
          run_id: string | null
          thumbnail_url: string | null
          type: string
          url: string
        }
        Insert: {
          archived_at?: string | null
          backend?: string
          backend_ref?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id: string
          label?: string | null
          org_id: string
          run_id?: string | null
          thumbnail_url?: string | null
          type: string
          url: string
        }
        Update: {
          archived_at?: string | null
          backend?: string
          backend_ref?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id?: string
          label?: string | null
          org_id?: string
          run_id?: string | null
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
      pricing_snapshots: {
        Row: {
          applied_price: number | null
          breakdown: Json
          confidence: string | null
          created_at: string
          created_by: string | null
          id: string
          inputs: Json
          is_final_invoice_price: boolean
          job_id: string
          missing_inputs: Json
          org_id: string
          reasons: Json
          source: string
          suggested_price: number | null
          warnings: Json
        }
        Insert: {
          applied_price?: number | null
          breakdown?: Json
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          is_final_invoice_price?: boolean
          job_id: string
          missing_inputs?: Json
          org_id: string
          reasons?: Json
          source?: string
          suggested_price?: number | null
          warnings?: Json
        }
        Update: {
          applied_price?: number | null
          breakdown?: Json
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          is_final_invoice_price?: boolean
          job_id?: string
          missing_inputs?: Json
          org_id?: string
          reasons?: Json
          source?: string
          suggested_price?: number | null
          warnings?: Json
        }
        Relationships: []
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
      role_permission_templates: {
        Row: {
          created_at: string
          is_allowed: boolean
          permission_key: string
          role: string
        }
        Insert: {
          created_at?: string
          is_allowed?: boolean
          permission_key: string
          role: string
        }
        Update: {
          created_at?: string
          is_allowed?: boolean
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_templates_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permission_templates_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          grant_type: string
          granted_by: string | null
          id: string
          permission_key: string
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grant_type: string
          granted_by?: string | null
          id?: string
          permission_key: string
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grant_type?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["permission_key"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          account_status: string
          activated_at: string | null
          activated_by: string | null
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          internal_notes: string | null
          is_protected: boolean
          last_name: string | null
          mobile: string | null
          org_id: string | null
          permissions: Json
          phone: string | null
          profile_photo_path: string | null
          role: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          activated_at?: string | null
          activated_by?: string | null
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          internal_notes?: string | null
          is_protected?: boolean
          last_name?: string | null
          mobile?: string | null
          org_id?: string | null
          permissions?: Json
          phone?: string | null
          profile_photo_path?: string | null
          role?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          activated_at?: string | null
          activated_by?: string | null
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          internal_notes?: string | null
          is_protected?: boolean
          last_name?: string | null
          mobile?: string | null
          org_id?: string | null
          permissions?: Json
          phone?: string | null
          profile_photo_path?: string | null
          role?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_driver_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          city: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          licence_categories: string[] | null
          licence_expiry: string | null
          licence_number: string | null
          notes: string | null
          org_id: string | null
          phone: string | null
          postcode: string | null
          restore_note: string | null
          restored_at: string | null
          restored_by: string | null
          start_date: string | null
          trade_plate_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      user_effective_permissions: {
        Row: {
          is_allowed: boolean | null
          permission_key: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_templates_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permission_templates_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      user_permission_overrides_detailed: {
        Row: {
          created_at: string | null
          grant_type: string | null
          granted_by: string | null
          granted_by_email: string | null
          id: string | null
          is_sensitive: boolean | null
          permission_category: string | null
          permission_description: string | null
          permission_key: string | null
          permission_label: string | null
          reason: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["permission_key"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_effective_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_permissions_matrix"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      user_permissions_matrix: {
        Row: {
          category: string | null
          email: string | null
          is_allowed: boolean | null
          org_id: string | null
          permission_key: string | null
          permission_label: string | null
          role: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_user_account: {
        Args: { p_target_user_id: string }
        Returns: {
          account_status: string
          activated_at: string | null
          activated_by: string | null
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          internal_notes: string | null
          is_protected: boolean
          last_name: string | null
          mobile: string | null
          org_id: string | null
          permissions: Json
          phone: string | null
          profile_photo_path: string | null
          role: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_driver_profile: {
        Args: {
          p_reason?: string
          p_suspend_account?: boolean
          p_target_user_id: string
        }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          automatic_capable: boolean
          availability_notes: string | null
          bank_captured: boolean
          city: string | null
          created_at: string
          date_joined: string | null
          date_of_birth: string | null
          display_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          endorsements: string | null
          ev_capable: boolean
          full_name: string
          home_postcode: string | null
          id: string
          is_active: boolean
          licence_categories: string[] | null
          licence_expiry: string | null
          licence_number: string | null
          manual_capable: boolean
          max_daily_distance: number | null
          notes: string | null
          org_id: string
          payout_terms: string | null
          phone: string | null
          postcode: string | null
          preferred_regions: string[] | null
          prestige_approved: boolean
          restore_note: string | null
          restored_at: string | null
          restored_by: string | null
          right_to_work: string | null
          start_date: string | null
          trade_plate_number: string | null
          unavailable_regions: string[] | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_actor_manage_permission: {
        Args: {
          p_actor_user_id: string
          p_grant_type: string
          p_permission_key: string
          p_target_user_id: string
        }
        Returns: boolean
      }
      can_actor_manage_target_user: {
        Args: { p_actor_user_id: string; p_target_user_id: string }
        Returns: boolean
      }
      complete_job: {
        Args: { p_job_id: string; p_notes?: string }
        Returns: {
          admin_rate: number | null
          cancellation_reason: string | null
          caz_ulez_cost: number | null
          caz_ulez_flag: string | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_notes: string | null
          client_phone: string | null
          completed_at: string | null
          created_at: string
          current_run_id: string
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
          driver_id: string | null
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
          pricing_metadata: Json | null
          pricing_suggestion_used_at: string | null
          pricing_suggestion_used_by: string | null
          priority: string | null
          promise_by_time: string | null
          rate_per_mile: number | null
          route_distance_miles: number | null
          route_eta_minutes: number | null
          sheet_job_id: string | null
          sheet_row_index: number | null
          sort_order: number | null
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
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_actor_email: { Args: never; Returns: string }
      current_user_has_permission: {
        Args: { p_permission_key: string }
        Returns: boolean
      }
      delete_user_permission_override:
        | {
            Args: { p_permission_key: string; p_target_user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_permission_key: string
              p_reason?: string
              p_target_user_id: string
            }
            Returns: undefined
          }
      is_admin_or_super_admin: { Args: never; Returns: boolean }
      is_protected_user: { Args: { p_user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      job_current_run_id: { Args: { p_job_id: string }; Returns: string }
      link_unlinked_photos_to_inspection: {
        Args: { p_inspection_type: string; p_job_id: string; p_org_id: string }
        Returns: undefined
      }
      next_job_number: { Args: never; Returns: string }
      normalize_client_name: { Args: { input: string }; Returns: string }
      reopen_job: {
        Args: { p_job_id: string; p_notes?: string }
        Returns: Json
      }
      restore_driver_profile: {
        Args: {
          p_reactivate_account?: boolean
          p_restore_note?: string
          p_target_user_id: string
        }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          automatic_capable: boolean
          availability_notes: string | null
          bank_captured: boolean
          city: string | null
          created_at: string
          date_joined: string | null
          date_of_birth: string | null
          display_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          endorsements: string | null
          ev_capable: boolean
          full_name: string
          home_postcode: string | null
          id: string
          is_active: boolean
          licence_categories: string[] | null
          licence_expiry: string | null
          licence_number: string | null
          manual_capable: boolean
          max_daily_distance: number | null
          notes: string | null
          org_id: string
          payout_terms: string | null
          phone: string | null
          postcode: string | null
          preferred_regions: string[] | null
          prestige_approved: boolean
          restore_note: string | null
          restored_at: string | null
          restored_by: string | null
          right_to_work: string | null
          start_date: string | null
          trade_plate_number: string | null
          unavailable_regions: string[] | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      role_rank: { Args: { p_role: string }; Returns: number }
      rollback_inspection_submission: {
        Args: {
          p_job_id: string
          p_reason?: string
          p_submission_session_id: string
        }
        Returns: Json
      }
      same_org_as_target: { Args: { target_org_id: string }; Returns: boolean }
      submit_inspection:
        | {
            Args: {
              p_damage_items: Json
              p_inspection: Json
              p_job_id: string
              p_type: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_damage_items: Json
              p_inspection: Json
              p_job_id: string
              p_submission_session_id?: string
              p_type: string
            }
            Returns: Json
          }
      suspend_user_account: {
        Args: { p_reason?: string; p_target_user_id: string }
        Returns: {
          account_status: string
          activated_at: string | null
          activated_by: string | null
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          internal_notes: string | null
          is_protected: boolean
          last_name: string | null
          mobile: string | null
          org_id: string | null
          permissions: Json
          phone: string | null
          profile_photo_path: string | null
          role: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_user_permission_override: {
        Args: {
          p_grant_type: string
          p_permission_key: string
          p_reason?: string
          p_target_user_id: string
        }
        Returns: {
          created_at: string
          grant_type: string
          granted_by: string | null
          id: string
          permission_key: string
          reason: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_permission_overrides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_account_status: { Args: never; Returns: string }
      user_has_permission: {
        Args: { p_permission_key: string; p_user_id: string }
        Returns: boolean
      }
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
