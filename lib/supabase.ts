"use client"

// Simple configuration check without importing Supabase
export function isSupabaseConfigured(): boolean {
  if (typeof window === "undefined") return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("https://"))
}

// Global client cache
let supabaseClientCache: any = null
let clientInitialized = false
let initializationPromise: Promise<any> | null = null

// Safe Supabase client creation with full error handling
export async function getSupabase() {
  if (typeof window === "undefined") {
    throw new Error("Supabase can only be used on the client side")
  }

  // Return cached client if available
  if (clientInitialized && supabaseClientCache) {
    return supabaseClientCache
  }

  // If already initializing, wait for that promise
  if (initializationPromise) {
    return initializationPromise
  }

  // Check configuration first
  if (!isSupabaseConfigured()) {
    clientInitialized = true
    supabaseClientCache = null
    throw new Error("Supabase is not configured. Please check your environment variables.")
  }

  // Create initialization promise
  initializationPromise = (async () => {
    try {
      // Dynamic import with timeout and error handling
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const supabaseModule = await import("@supabase/supabase-js")
      clearTimeout(timeoutId)

      if (!supabaseModule || !supabaseModule.createClient) {
        throw new Error("Failed to load Supabase module")
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const client = supabaseModule.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })

      // Test the client with a simple operation
      await client.auth.getSession()

      supabaseClientCache = client
      clientInitialized = true
      console.log("Supabase client created and tested successfully")
      return client
    } catch (error) {
      console.error("Failed to create or test Supabase client:", error)
      clientInitialized = true
      supabaseClientCache = null
      initializationPromise = null
      throw new Error(`Supabase initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  })()

  return initializationPromise
}

// Check if client is ready without throwing
export function isSupabaseReady(): boolean {
  return clientInitialized && !!supabaseClientCache
}

// Reset client (for testing or error recovery)
export function resetSupabaseClient() {
  supabaseClientCache = null
  clientInitialized = false
  initializationPromise = null
}

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
      market_settings: {
        Row: {
          id: string
          market_open_time: string
          market_close_time: string
          timezone: string
          trading_days: number[]
          is_market_open_override: boolean | null
          created_at: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          id?: string
          market_open_time: string
          market_close_time: string
          timezone: string
          trading_days: number[]
          is_market_open_override?: boolean | null
          created_at?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          market_open_time?: string
          market_close_time?: string
          timezone?: string
          trading_days?: number[]
          is_market_open_override?: boolean | null
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
      }
      game_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: any
          created_at: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: any
          created_at?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: any
          created_at?: string
          updated_at?: string
          updated_by?: string
        }
      }
      admin_roles: {
        Row: {
          id: string
          user_id: string
          role: string
          permissions: string
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          user_id: string
          role: string
          permissions: string
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: string
          permissions?: string
          created_at?: string
          created_by?: string
        }
      }
      admin_activity_log: {
        Row: {
          id: string
          admin_id: string
          action: string
          target_user_id: string | null
          details: any
          created_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          action: string
          target_user_id?: string | null
          details?: any
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          action?: string
          target_user_id?: string | null
          details?: any
          created_at?: string
        }
      }
      leaderboard: {
        Row: {
          id: string
          user_id: string
          rank: number
          total_value: number
          total_gain_loss: number
          total_gain_loss_percent: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          rank: number
          total_value: number
          total_gain_loss: number
          total_gain_loss_percent: number
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          rank?: number
          total_value?: number
          total_gain_loss?: number
          total_gain_loss_percent?: number
          updated_at?: string
        }
      }
    }
  }
}
