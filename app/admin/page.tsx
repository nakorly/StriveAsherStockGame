"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminDashboard } from "@/components/admin-dashboard"
import { Loader2 } from "lucide-react"
import type { User } from "@supabase/supabase-js"

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Check if Supabase is configured
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("https://"))

        if (!isConfigured) {
          console.log("Supabase not configured, redirecting to dashboard")
          router.push("/dashboard")
          return
        }

        // Try to initialize Supabase with timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Supabase initialization timeout")), 5000),
        )

        const initPromise = (async () => {
          const { getSupabase } = await import("@/lib/supabase")
          return await getSupabase()
        })()

        const supabase = await Promise.race([initPromise, timeoutPromise])

        if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") {
          throw new Error("Failed to initialize Supabase client")
        }

        // Get current session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error("Session error:", sessionError)
          throw sessionError
        }

        if (!session) {
          console.log("No session found, redirecting to login")
          router.push("/")
          return
        }

        // Check if user has admin role
        if (!supabase.from || typeof supabase.from !== "function") {
          throw new Error("Database methods not available")
        }

        const { data: adminRole, error: roleError } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single()

        if (roleError) {
          if (roleError.message.includes("No rows found")) {
            console.log("User is not an admin, redirecting to dashboard")
            router.push("/dashboard")
            return
          }
          console.error("Error checking admin role:", roleError)
          throw roleError
        }

        if (!adminRole) {
          console.log("User is not an admin, redirecting to dashboard")
          router.push("/dashboard")
          return
        }

        console.log("Admin access confirmed for user:", session.user.email)
        setUser(session.user)

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === "SIGNED_OUT" || !session) {
            router.push("/")
          } else if (session) {
            // Re-check admin status
            const { data: adminRole } = await supabase
              .from("admin_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .single()

            if (!adminRole) {
              router.push("/dashboard")
              return
            }

            setUser(session.user)
          }
        })

        setLoading(false)
        return () => subscription.unsubscribe()
      } catch (err) {
        console.error("Admin access check error:", err)
        setError("Failed to verify admin access. Please try again later.")

        // Fallback - redirect to dashboard after a delay
        setTimeout(() => {
          router.push("/dashboard")
        }, 3000)

        setLoading(false)
      }
    }

    checkAdminAccess()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">⚠️ {error}</div>
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handleLogout = async () => {
    try {
      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

      if (!isSupabaseConfigured()) {
        router.push("/")
        return
      }

      const supabase = await getSupabase()
      if (supabase && supabase.auth && typeof supabase.auth.signOut === "function") {
        await supabase.auth.signOut()
      }
      router.push("/")
    } catch (err) {
      console.error("Logout error:", err)
      router.push("/")
    }
  }

  return <AdminDashboard user={user} onLogout={handleLogout} />
}
