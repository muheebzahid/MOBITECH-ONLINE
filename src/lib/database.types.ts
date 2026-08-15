export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          id: string
          legal_name: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          legal_name?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deal_documents: {
        Row: {
          deal_id: string
          document_type: string
          file_name: string
          file_url: string | null
          id: string
          notes: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          deal_id: string
          document_type: string
          file_name: string
          file_url?: string | null
          id?: string
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          deal_id?: string
          document_type?: string
          file_name?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_edit_history: {
        Row: {
          deal_id: string
          edit_note: string | null
          edited_at: string | null
          edited_by: string | null
          field_changes: Json
          id: string
        }
        Insert: {
          deal_id: string
          edit_note?: string | null
          edited_at?: string | null
          edited_by?: string | null
          field_changes: Json
          id?: string
        }
        Update: {
          deal_id?: string
          edit_note?: string | null
          edited_at?: string | null
          edited_by?: string | null
          field_changes?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_edit_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_items: {
        Row: {
          carrier: string | null
          color: string | null
          created_at: string | null
          deal_id: string
          grade: string | null
          id: string
          model: string
          quantity: number
          storage: string | null
          unit_cost: number
        }
        Insert: {
          carrier?: string | null
          color?: string | null
          created_at?: string | null
          deal_id: string
          grade?: string | null
          id?: string
          model: string
          quantity: number
          storage?: string | null
          unit_cost: number
        }
        Update: {
          carrier?: string | null
          color?: string | null
          created_at?: string | null
          deal_id?: string
          grade?: string | null
          id?: string
          model?: string
          quantity?: number
          storage?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          deal_id: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          deal_id: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          deal_id?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_status_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amex_amount: number | null
          amex_payment_date: string | null
          amex_statement_date: string | null
          arrived_dubai_date: string | null
          arrived_miami_date: string | null
          att_invoice_number: string | null
          auction_fee: number | null
          auction_platform: string
          auction_won_date: string | null
          carrier: string | null
          cash_amount: number | null
          cash_days_deployed: number | null
          cash_finance_cost: number | null
          cash_finance_rate: number | null
          cashback_amount: number | null
          cashback_eligible: boolean | null
          cashback_received: boolean | null
          color: string | null
          created_at: string | null
          created_by: string | null
          deal_closed_date: string | null
          deal_number: string
          funding_source: string
          grade: string | null
          gross_profit: number | null
          id: string
          model: string
          notes: string | null
          other_fees: number | null
          payment_date: string | null
          payment_link_date: string | null
          pickup_ready_date: string | null
          quantity: number
          received_mobitech_date: string | null
          shipped_dubai_date: string | null
          shipped_usa_date: string | null
          status: string
          storage: string | null
          supplier: string
          total_cogs: number | null
          total_commitment: number
          total_cost: number
          total_revenue: number | null
          turbo_invoice_amount: number | null
          turbo_invoice_paid: boolean | null
          turbo_invoice_paid_date: string | null
          unit_cost: number
          updated_at: string | null
        }
        Insert: {
          amex_amount?: number | null
          amex_payment_date?: string | null
          amex_statement_date?: string | null
          arrived_dubai_date?: string | null
          arrived_miami_date?: string | null
          att_invoice_number?: string | null
          auction_fee?: number | null
          auction_platform: string
          auction_won_date?: string | null
          carrier?: string | null
          cash_amount?: number | null
          cash_days_deployed?: number | null
          cash_finance_cost?: number | null
          cash_finance_rate?: number | null
          cashback_amount?: number | null
          cashback_eligible?: boolean | null
          cashback_received?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_closed_date?: string | null
          deal_number: string
          funding_source?: string
          grade?: string | null
          gross_profit?: number | null
          id?: string
          model: string
          notes?: string | null
          other_fees?: number | null
          payment_date?: string | null
          payment_link_date?: string | null
          pickup_ready_date?: string | null
          quantity: number
          received_mobitech_date?: string | null
          shipped_dubai_date?: string | null
          shipped_usa_date?: string | null
          status?: string
          storage?: string | null
          supplier: string
          total_cogs?: number | null
          total_commitment: number
          total_cost: number
          total_revenue?: number | null
          turbo_invoice_amount?: number | null
          turbo_invoice_paid?: boolean | null
          turbo_invoice_paid_date?: string | null
          unit_cost: number
          updated_at?: string | null
        }
        Update: {
          amex_amount?: number | null
          amex_payment_date?: string | null
          amex_statement_date?: string | null
          arrived_dubai_date?: string | null
          arrived_miami_date?: string | null
          att_invoice_number?: string | null
          auction_fee?: number | null
          auction_platform?: string
          auction_won_date?: string | null
          carrier?: string | null
          cash_amount?: number | null
          cash_days_deployed?: number | null
          cash_finance_cost?: number | null
          cash_finance_rate?: number | null
          cashback_amount?: number | null
          cashback_eligible?: boolean | null
          cashback_received?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_closed_date?: string | null
          deal_number?: string
          funding_source?: string
          grade?: string | null
          gross_profit?: number | null
          id?: string
          model?: string
          notes?: string | null
          other_fees?: number | null
          payment_date?: string | null
          payment_link_date?: string | null
          pickup_ready_date?: string | null
          quantity?: number
          received_mobitech_date?: string | null
          shipped_dubai_date?: string | null
          shipped_usa_date?: string | null
          status?: string
          storage?: string | null
          supplier?: string
          total_cogs?: number | null
          total_commitment?: number
          total_cost?: number
          total_revenue?: number | null
          turbo_invoice_amount?: number | null
          turbo_invoice_paid?: boolean | null
          turbo_invoice_paid_date?: string | null
          unit_cost?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          item_id: string
          new_location: Database["public"]["Enums"]["inventory_location"]
          new_status: Database["public"]["Enums"]["inventory_status"]
          notes: string | null
          old_location: Database["public"]["Enums"]["inventory_location"] | null
          old_status: Database["public"]["Enums"]["inventory_status"] | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id: string
          new_location: Database["public"]["Enums"]["inventory_location"]
          new_status: Database["public"]["Enums"]["inventory_status"]
          notes?: string | null
          old_location?:
            | Database["public"]["Enums"]["inventory_location"]
            | null
          old_status?: Database["public"]["Enums"]["inventory_status"] | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id?: string
          new_location?: Database["public"]["Enums"]["inventory_location"]
          new_status?: Database["public"]["Enums"]["inventory_status"]
          notes?: string | null
          old_location?:
            | Database["public"]["Enums"]["inventory_location"]
            | null
          old_status?: Database["public"]["Enums"]["inventory_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          color: string | null
          created_at: string
          deal_id: string
          grade: string | null
          id: string
          imei: string | null
          invoice_id: string | null
          location: Database["public"]["Enums"]["inventory_location"]
          logistics_cost: number
          model: string
          notes: string | null
          online_order_id: string | null
          online_order_item_id: string | null
          qc_document_url: string | null
          refurb_stage: Database["public"]["Enums"]["refurb_stage"] | null
          repair_cost: number
          serial_number: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          storage: string | null
          target_price: number | null
          total_cost: number | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deal_id: string
          grade?: string | null
          id?: string
          imei?: string | null
          invoice_id?: string | null
          location?: Database["public"]["Enums"]["inventory_location"]
          logistics_cost?: number
          model: string
          notes?: string | null
          online_order_id?: string | null
          online_order_item_id?: string | null
          qc_document_url?: string | null
          refurb_stage?: Database["public"]["Enums"]["refurb_stage"] | null
          repair_cost?: number
          serial_number?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          storage?: string | null
          target_price?: number | null
          total_cost?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deal_id?: string
          grade?: string | null
          id?: string
          imei?: string | null
          invoice_id?: string | null
          location?: Database["public"]["Enums"]["inventory_location"]
          logistics_cost?: number
          model?: string
          notes?: string | null
          online_order_id?: string | null
          online_order_item_id?: string | null
          qc_document_url?: string | null
          refurb_stage?: Database["public"]["Enums"]["refurb_stage"] | null
          repair_cost?: number
          serial_number?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          storage?: string | null
          target_price?: number | null
          total_cost?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_online_order_item_id_fkey"
            columns: ["online_order_item_id"]
            isOneToOne: false
            referencedRelation: "online_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          deal_id: string | null
          deal_item_id: string | null
          description: string
          id: string
          invoice_id: string
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          deal_item_id?: string | null
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          deal_item_id?: string | null
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_deal_item_id_fkey"
            columns: ["deal_item_id"]
            isOneToOne: false
            referencedRelation: "deal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          approval_status: string
          balance_due: number
          client_id: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          discount: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          approval_status?: string
          balance_due?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          approval_status?: string
          balance_due?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_items: {
        Row: {
          carrier: string | null
          color: string | null
          created_at: string
          grade: string | null
          id: string
          model: string
          order_id: string
          quantity: number
          storage: string | null
          unit_price: number
        }
        Insert: {
          carrier?: string | null
          color?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          model: string
          order_id: string
          quantity: number
          storage?: string | null
          unit_price?: number
        }
        Update: {
          carrier?: string | null
          color?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          model?: string
          order_id?: string
          quantity?: number
          storage?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "online_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          order_number: string
          platform: Database["public"]["Enums"]["online_platform"]
          sale_date: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          order_number: string
          platform: Database["public"]["Enums"]["online_platform"]
          sale_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          order_number?: string
          platform?: Database["public"]["Enums"]["online_platform"]
          sale_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string
          expense_date: string
          id: string
          logged_by: string | null
          reference_link: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          logged_by?: string | null
          reference_link?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          logged_by?: string | null
          reference_link?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          requested_by: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["partner_transaction_status"]
          type: Database["public"]["Enums"]["partner_transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          requested_by?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["partner_transaction_status"]
          type: Database["public"]["Enums"]["partner_transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          requested_by?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["partner_transaction_status"]
          type?: Database["public"]["Enums"]["partner_transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string | null
          id: string
          is_working_partner: boolean | null
          monthly_salary_aed: number | null
          name: string
          ownership_percentage: number
          user_profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_working_partner?: boolean | null
          monthly_salary_aed?: number | null
          name: string
          ownership_percentage: number
          user_profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_working_partner?: boolean | null
          monthly_salary_aed?: number | null
          name?: string
          ownership_percentage?: number
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          logged_by: string | null
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          logged_by?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          logged_by?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      record_sync_state: {
        Row: {
          created_at: string
          destination_project_id: string
          id: string
          last_sync_job_id: string | null
          last_synced_at: string
          last_synced_local_checksum: string
          last_synced_online_checksum: string
          source_record_id: string
          source_system: string
          source_table: string
          sync_version: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_project_id: string
          id?: string
          last_sync_job_id?: string | null
          last_synced_at: string
          last_synced_local_checksum: string
          last_synced_online_checksum: string
          source_record_id: string
          source_system?: string
          source_table: string
          sync_version?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_project_id?: string
          id?: string
          last_sync_job_id?: string | null
          last_synced_at?: string
          last_synced_local_checksum?: string
          last_synced_online_checksum?: string
          source_record_id?: string
          source_system?: string
          source_table?: string
          sync_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_sync_state_last_sync_job_id_fkey"
            columns: ["last_sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          logged_by: string | null
          notes: string | null
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          source: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          source?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      shipment_deals: {
        Row: {
          added_at: string
          deal_id: string
          id: string
          shipment_id: string
        }
        Insert: {
          added_at?: string
          deal_id: string
          id?: string
          shipment_id: string
        }
        Update: {
          added_at?: string
          deal_id?: string
          id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_deals_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_documents: {
        Row: {
          file_url: string
          id: string
          name: string
          shipment_id: string
          uploaded_at: string
        }
        Insert: {
          file_url: string
          id?: string
          name: string
          shipment_id: string
          uploaded_at?: string
        }
        Update: {
          file_url?: string
          id?: string
          name?: string
          shipment_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_documents_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          arrived_dubai_date: string | null
          awb_number: string | null
          carrier: string | null
          condition_notes: string | null
          created_at: string
          created_by: string | null
          customs_cleared_date: string | null
          customs_ref: string | null
          delivered_mobitech_date: string | null
          duty_amount: number | null
          freight_cost: number | null
          handled_by: string | null
          id: string
          notes: string | null
          pickup_date: string | null
          pickup_ref: string | null
          sb_fee: number | null
          sb_invoice_number: string | null
          shipment_number: string
          shipped_usa_date: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          total_logistics_cost: number | null
          turbo_fee: number | null
          turbo_invoice_number: string | null
          turbo_received_date: string | null
          updated_at: string
          usa_to_dxb_cost: number | null
          usa_to_usa_cost: number | null
        }
        Insert: {
          arrived_dubai_date?: string | null
          awb_number?: string | null
          carrier?: string | null
          condition_notes?: string | null
          created_at?: string
          created_by?: string | null
          customs_cleared_date?: string | null
          customs_ref?: string | null
          delivered_mobitech_date?: string | null
          duty_amount?: number | null
          freight_cost?: number | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          pickup_date?: string | null
          pickup_ref?: string | null
          sb_fee?: number | null
          sb_invoice_number?: string | null
          shipment_number: string
          shipped_usa_date?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          total_logistics_cost?: number | null
          turbo_fee?: number | null
          turbo_invoice_number?: string | null
          turbo_received_date?: string | null
          updated_at?: string
          usa_to_dxb_cost?: number | null
          usa_to_usa_cost?: number | null
        }
        Update: {
          arrived_dubai_date?: string | null
          awb_number?: string | null
          carrier?: string | null
          condition_notes?: string | null
          created_at?: string
          created_by?: string | null
          customs_cleared_date?: string | null
          customs_ref?: string | null
          delivered_mobitech_date?: string | null
          duty_amount?: number | null
          freight_cost?: number | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          pickup_date?: string | null
          pickup_ref?: string | null
          sb_fee?: number | null
          sb_invoice_number?: string | null
          shipment_number?: string
          shipped_usa_date?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          total_logistics_cost?: number | null
          turbo_fee?: number | null
          turbo_invoice_number?: string | null
          turbo_received_date?: string | null
          updated_at?: string
          usa_to_dxb_cost?: number | null
          usa_to_usa_cost?: number | null
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          created_at: string
          field_name: string | null
          id: string
          last_synced_value: Json | null
          local_value: Json | null
          online_value: Json | null
          resolution: Database["public"]["Enums"]["sync_resolution"]
          resolved_at: string | null
          resolved_by: string | null
          source_record_id: string
          source_table: string
          sync_job_id: string
        }
        Insert: {
          created_at?: string
          field_name?: string | null
          id?: string
          last_synced_value?: Json | null
          local_value?: Json | null
          online_value?: Json | null
          resolution?: Database["public"]["Enums"]["sync_resolution"]
          resolved_at?: string | null
          resolved_by?: string | null
          source_record_id: string
          source_table: string
          sync_job_id: string
        }
        Update: {
          created_at?: string
          field_name?: string | null
          id?: string
          last_synced_value?: Json | null
          local_value?: Json | null
          online_value?: Json | null
          resolution?: Database["public"]["Enums"]["sync_resolution"]
          resolved_at?: string | null
          resolved_by?: string | null
          source_record_id?: string
          source_table?: string
          sync_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_job_deals: {
        Row: {
          created_at: string
          deal_id: string | null
          deal_number_snapshot: string
          id: string
          inclusion_reason: Database["public"]["Enums"]["sync_inclusion_reason"]
          is_required_dependency: boolean
          is_user_selected: boolean
          package_status: string | null
          sync_job_id: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          deal_number_snapshot: string
          id?: string
          inclusion_reason: Database["public"]["Enums"]["sync_inclusion_reason"]
          is_required_dependency?: boolean
          is_user_selected?: boolean
          package_status?: string | null
          sync_job_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          deal_number_snapshot?: string
          id?: string
          inclusion_reason?: Database["public"]["Enums"]["sync_inclusion_reason"]
          is_required_dependency?: boolean
          is_user_selected?: boolean
          package_status?: string | null
          sync_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_job_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_job_deals_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_job_files: {
        Row: {
          cloud_bucket: string | null
          cloud_object_path: string | null
          created_at: string
          error_details: Json | null
          file_name: string | null
          file_size: number | null
          id: string
          local_bucket: string | null
          local_object_path: string | null
          mime_type: string | null
          parent_record_id: string | null
          sha256_checksum: string | null
          source_record_id: string
          source_table: string
          status: Database["public"]["Enums"]["sync_file_status"]
          sync_job_id: string
          updated_at: string
          was_uploaded_by_this_job: boolean
        }
        Insert: {
          cloud_bucket?: string | null
          cloud_object_path?: string | null
          created_at?: string
          error_details?: Json | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          local_bucket?: string | null
          local_object_path?: string | null
          mime_type?: string | null
          parent_record_id?: string | null
          sha256_checksum?: string | null
          source_record_id: string
          source_table: string
          status?: Database["public"]["Enums"]["sync_file_status"]
          sync_job_id: string
          updated_at?: string
          was_uploaded_by_this_job?: boolean
        }
        Update: {
          cloud_bucket?: string | null
          cloud_object_path?: string | null
          created_at?: string
          error_details?: Json | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          local_bucket?: string | null
          local_object_path?: string | null
          mime_type?: string | null
          parent_record_id?: string | null
          sha256_checksum?: string | null
          source_record_id?: string
          source_table?: string
          status?: Database["public"]["Enums"]["sync_file_status"]
          sync_job_id?: string
          updated_at?: string
          was_uploaded_by_this_job?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sync_job_files_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_job_records: {
        Row: {
          created_at: string
          error_category: string | null
          error_code: string | null
          error_details: Json | null
          id: string
          last_synced_checksum: string | null
          local_checksum: string | null
          online_checksum: string | null
          operation: Database["public"]["Enums"]["sync_operation"]
          parent_deal_id: string | null
          record_snapshot: Json | null
          source_record_id: string
          source_table: string
          sync_job_id: string
          updated_at: string
          validation_status: Database["public"]["Enums"]["sync_validation_status"]
        }
        Insert: {
          created_at?: string
          error_category?: string | null
          error_code?: string | null
          error_details?: Json | null
          id?: string
          last_synced_checksum?: string | null
          local_checksum?: string | null
          online_checksum?: string | null
          operation?: Database["public"]["Enums"]["sync_operation"]
          parent_deal_id?: string | null
          record_snapshot?: Json | null
          source_record_id: string
          source_table: string
          sync_job_id: string
          updated_at?: string
          validation_status?: Database["public"]["Enums"]["sync_validation_status"]
        }
        Update: {
          created_at?: string
          error_category?: string | null
          error_code?: string | null
          error_details?: Json | null
          id?: string
          last_synced_checksum?: string | null
          local_checksum?: string | null
          online_checksum?: string | null
          operation?: Database["public"]["Enums"]["sync_operation"]
          parent_deal_id?: string | null
          record_snapshot?: Json | null
          source_record_id?: string
          source_table?: string
          sync_job_id?: string
          updated_at?: string
          validation_status?: Database["public"]["Enums"]["sync_validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_job_records_parent_deal_id_fkey"
            columns: ["parent_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_job_records_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          completed_at: string | null
          conflicts_count: number
          created_at: string
          destination_environment: string
          destination_project_id: string
          error_summary: Json | null
          files_discovered: number
          files_failed: number
          files_reused: number
          files_uploaded: number
          id: string
          records_blocked: number
          records_created: number
          records_discovered: number
          records_skipped: number
          records_updated: number
          selected_deal_count: number
          started_at: string
          started_by: string | null
          status: Database["public"]["Enums"]["sync_job_status"]
          sync_type: Database["public"]["Enums"]["sync_job_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          conflicts_count?: number
          created_at?: string
          destination_environment?: string
          destination_project_id: string
          error_summary?: Json | null
          files_discovered?: number
          files_failed?: number
          files_reused?: number
          files_uploaded?: number
          id?: string
          records_blocked?: number
          records_created?: number
          records_discovered?: number
          records_skipped?: number
          records_updated?: number
          selected_deal_count?: number
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          sync_type?: Database["public"]["Enums"]["sync_job_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          conflicts_count?: number
          created_at?: string
          destination_environment?: string
          destination_project_id?: string
          error_summary?: Json | null
          files_discovered?: number
          files_failed?: number
          files_reused?: number
          files_uploaded?: number
          id?: string
          records_blocked?: number
          records_created?: number
          records_discovered?: number
          records_skipped?: number
          records_updated?: number
          selected_deal_count?: number
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          sync_type?: Database["public"]["Enums"]["sync_job_type"]
          updated_at?: string
        }
        Relationships: []
      }
      treasury_settings: {
        Row: {
          amex_limit: number
          id: string
          sb_cash_limit: number
          turbo_cash_limit: number
          updated_at: string
        }
        Insert: {
          amex_limit?: number
          id?: string
          sb_cash_limit?: number
          turbo_cash_limit?: number
          updated_at?: string
        }
        Update: {
          amex_limit?: number
          id?: string
          sb_cash_limit?: number
          turbo_cash_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          role_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          role_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          role_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      wire_transfers: {
        Row: {
          amount: number
          created_at: string
          deal_id: string | null
          destination: string
          id: string
          logged_by: string | null
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          deal_id?: string | null
          destination: string
          id?: string
          logged_by?: string | null
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          deal_id?: string | null
          destination?: string
          id?: string
          logged_by?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wire_transfers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_sync_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "SUPER_ADMIN" | "SALES" | "LOGISTICS" | "FINANCE"
      expense_category:
        | "RENT"
        | "SOFTWARE"
        | "OFFICE_SUPPLIES"
        | "TRAVEL"
        | "MARKETING"
        | "LEGAL_FEES"
        | "UTILITIES"
        | "PAYROLL"
        | "OTHER"
      inventory_location:
        | "MIAMI"
        | "IN_TRANSIT"
        | "DUBAI_WAREHOUSE"
        | "AMAZON_FBA"
        | "REVIBE"
        | "SOLD"
        | "RMA"
      inventory_status:
        | "AVAILABLE"
        | "RESERVED"
        | "SOLD"
        | "RETURNED"
        | "ASSIGNED"
      invoice_status: "DRAFT" | "ISSUED" | "PARTIAL" | "PAID" | "CANCELLED"
      online_platform: "AMAZON" | "REVIBE"
      partner_transaction_status: "PENDING" | "APPROVED" | "REJECTED"
      partner_transaction_type:
        | "CAPITAL_INJECTION"
        | "PROFIT_SHARE"
        | "WITHDRAWAL"
      payment_method: "WIRE_TRANSFER" | "CASH" | "CREDIT_CARD" | "OTHER"
      refurb_stage:
        | "SEPARATED"
        | "HANDED_TO_REFURBISH"
        | "QC_DONE"
        | "READY_TO_SELL"
        | "ASSIGNED"
        | "SOLD"
      shipment_status:
        | "PENDING"
        | "AT_SB_TECHNOLOGY"
        | "SHIPPED_FROM_USA"
        | "IN_TRANSIT"
        | "ARRIVED_DUBAI"
        | "CUSTOMS_CLEARED"
        | "AT_TURBO_LOGISTICS"
        | "DELIVERED_TO_MOBITECH"
      sync_file_status:
        | "DISCOVERED"
        | "VALIDATED"
        | "EXISTS_ONLINE"
        | "UPLOADING"
        | "UPLOADED"
        | "REFERENCED"
        | "FAILED"
        | "CLEANUP_PENDING"
        | "CLEANED_UP"
      sync_inclusion_reason:
        | "USER_SELECTED"
        | "SHARED_INVOICE"
        | "SHARED_SHIPMENT"
        | "OTHER_DEPENDENCY"
      sync_job_status:
        | "PENDING"
        | "DISCOVERING"
        | "VALIDATING"
        | "BLOCKED"
        | "READY"
        | "SYNCING"
        | "SUCCESS"
        | "FAILED"
        | "CONFLICT"
        | "CANCELLED"
        | "PARTIAL"
      sync_job_type: "INITIAL" | "INCREMENTAL" | "RETRY"
      sync_operation:
        | "CREATE"
        | "UPDATE"
        | "SKIP"
        | "CONFLICT"
        | "BLOCKED"
        | "UNCHECKED"
      sync_resolution:
        | "UNRESOLVED"
        | "KEEP_ONLINE"
        | "SKIP_LOCAL"
        | "KEEP_LOCAL"
        | "CANCEL_PACKAGE"
      sync_validation_status:
        | "PENDING"
        | "VALID"
        | "WARNING"
        | "BLOCKED"
        | "CONFLICT"
        | "FAILED"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["SUPER_ADMIN", "SALES", "LOGISTICS", "FINANCE"],
      expense_category: [
        "RENT",
        "SOFTWARE",
        "OFFICE_SUPPLIES",
        "TRAVEL",
        "MARKETING",
        "LEGAL_FEES",
        "UTILITIES",
        "PAYROLL",
        "OTHER",
      ],
      inventory_location: [
        "MIAMI",
        "IN_TRANSIT",
        "DUBAI_WAREHOUSE",
        "AMAZON_FBA",
        "REVIBE",
        "SOLD",
        "RMA",
      ],
      inventory_status: [
        "AVAILABLE",
        "RESERVED",
        "SOLD",
        "RETURNED",
        "ASSIGNED",
      ],
      invoice_status: ["DRAFT", "ISSUED", "PARTIAL", "PAID", "CANCELLED"],
      online_platform: ["AMAZON", "REVIBE"],
      partner_transaction_status: ["PENDING", "APPROVED", "REJECTED"],
      partner_transaction_type: [
        "CAPITAL_INJECTION",
        "PROFIT_SHARE",
        "WITHDRAWAL",
      ],
      payment_method: ["WIRE_TRANSFER", "CASH", "CREDIT_CARD", "OTHER"],
      refurb_stage: [
        "SEPARATED",
        "HANDED_TO_REFURBISH",
        "QC_DONE",
        "READY_TO_SELL",
        "ASSIGNED",
        "SOLD",
      ],
      shipment_status: [
        "PENDING",
        "AT_SB_TECHNOLOGY",
        "SHIPPED_FROM_USA",
        "IN_TRANSIT",
        "ARRIVED_DUBAI",
        "CUSTOMS_CLEARED",
        "AT_TURBO_LOGISTICS",
        "DELIVERED_TO_MOBITECH",
      ],
      sync_file_status: [
        "DISCOVERED",
        "VALIDATED",
        "EXISTS_ONLINE",
        "UPLOADING",
        "UPLOADED",
        "REFERENCED",
        "FAILED",
        "CLEANUP_PENDING",
        "CLEANED_UP",
      ],
      sync_inclusion_reason: [
        "USER_SELECTED",
        "SHARED_INVOICE",
        "SHARED_SHIPMENT",
        "OTHER_DEPENDENCY",
      ],
      sync_job_status: [
        "PENDING",
        "DISCOVERING",
        "VALIDATING",
        "BLOCKED",
        "READY",
        "SYNCING",
        "SUCCESS",
        "FAILED",
        "CONFLICT",
        "CANCELLED",
        "PARTIAL",
      ],
      sync_job_type: ["INITIAL", "INCREMENTAL", "RETRY"],
      sync_operation: [
        "CREATE",
        "UPDATE",
        "SKIP",
        "CONFLICT",
        "BLOCKED",
        "UNCHECKED",
      ],
      sync_resolution: [
        "UNRESOLVED",
        "KEEP_ONLINE",
        "SKIP_LOCAL",
        "KEEP_LOCAL",
        "CANCEL_PACKAGE",
      ],
      sync_validation_status: [
        "PENDING",
        "VALID",
        "WARNING",
        "BLOCKED",
        "CONFLICT",
        "FAILED",
      ],
    },
  },
} as const

