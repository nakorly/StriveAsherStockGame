import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
}

if (!supabaseAnonKey) {
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
    }
  }
}
