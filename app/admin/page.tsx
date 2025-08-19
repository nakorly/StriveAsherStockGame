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
        const { supabase } = await import("@/lib/supabase")

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error || !session) {
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
      const { supabase } = await import("@/lib/supabase")
      await supabase.auth.signOut()
      router.push("/")
    } catch (err) {
      console.error("Logout error:", err)
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
