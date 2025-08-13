import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log("Supabase URL:", supabaseUrl ? "✓ Set" : "✗ Missing")
console.log("Supabase Key:", supabaseAnonKey ? "✓ Set" : "✗ Missing")

if (!supabaseUrl) {
  console.error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
}

if (!supabaseAnonKey) {
  console.error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          balance?: number
          created_at?: string
          updated_at?: string
        }
      }
      portfolios: {
        Row: {
          id: string
          user_id: string
          symbol: string
          name: string
          price: number
          change: number
          change_percent: number
          shares: number
          purchase_price: number
          total_value: number
          added_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          symbol: string
          name: string
          price: number
          change: number
          change_percent: number
          shares?: number
          purchase_price: number
          total_value: number
          added_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          symbol?: string
          name?: string
          price?: number
          change?: number
          change_percent?: number
          shares?: number
          purchase_price?: number
          total_value?: number
          added_at?: string
          created_at?: string
        }
      }
      queued_orders: {
        Row: {
          id: string
          user_id: string
          symbol: string
          name: string
          order_type: "BUY" | "SELL"
          shares: number
          order_price: number | null
          status: "PENDING" | "EXECUTED" | "CANCELLED"
          created_at: string
          executed_at: string | null
          execution_price: number | null
          portfolio_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          symbol: string
          name: string
          order_type: "BUY" | "SELL"
          shares: number
          order_price?: number | null
          status?: "PENDING" | "EXECUTED" | "CANCELLED"
          created_at?: string
          executed_at?: string | null
          execution_price?: number | null
          portfolio_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          symbol?: string
          name?: string
          order_type?: "BUY" | "SELL"
          shares?: number
          order_price?: number | null
          status?: "PENDING" | "EXECUTED" | "CANCELLED"
          created_at?: string
          executed_at?: string | null
          execution_price?: number | null
          portfolio_id?: string | null
        }
      }
    }
  }
}
