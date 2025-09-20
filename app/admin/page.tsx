"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminDashboard } from "@/components/admin-dashboard"
import { Loader2 } from "lucide-react"
import type { User } from "@supabase/supabase-js"

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

        if (!isSupabaseConfigured()) {
          console.log("Supabase not configured, redirecting to home")
          router.push("/")
          return
        }

        const supabase = await getSupabase()

        // Verify supabase client is valid
        if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") {
          console.error("Invalid Supabase client")
          router.push("/")
          return
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error || !session) {
          console.log("No valid session, redirecting to home")
          router.push("/")
          return
        }

        // Verify supabase.from is available before using it
        if (!supabase.from || typeof supabase.from !== "function") {
          console.error("Supabase database methods not available")
          router.push("/")
          return
        }

        // Check if user has admin role
        const { data: adminRole, error: adminError } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single()

        if (adminError || !adminRole) {
          // Not an admin, redirect to regular dashboard
          console.log("User is not an admin, redirecting to dashboard")
          router.push("/dashboard")
          return
        }

        setUser(session.user)
        setIsAdmin(true)
      } catch (err) {
        console.error("Admin access check error:", err)
        router.push("/")
      } finally {
        setLoading(false)
      }
    }

    checkAdminAccess()
  }, [router])

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return <AdminDashboard user={user} onLogout={handleLogout} />
}
