import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabaseAdmin"

type AuthUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
}

export async function GET() {
  try {
    const supabase = getAdminSupabase()

    const allUsers: AuthUser[] = []
    let page = 1
    const perPage = 1000

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) throw error

      const users = (data?.users || []) as AuthUser[]
      allUsers.push(...users)

      if (users.length < perPage) break
      page += 1
    }

    const userIds = allUsers.map((u) => u.id)

    const [{ data: profiles }, { data: adminRoles }, { data: portfolios }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, balance, created_at")
        .in("id", userIds),
      supabase.from("admin_roles").select("user_id, role").in("user_id", userIds),
      supabase.from("portfolios").select("user_id, total_value").in("user_id", userIds),
    ])

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
    const adminSet = new Set((adminRoles || []).map((ar: any) => ar.user_id))

    const portfolioTotals = new Map<string, number>()
    for (const p of portfolios || []) {
      const current = portfolioTotals.get(p.user_id) || 0
      portfolioTotals.set(p.user_id, current + (p.total_value || 0))
    }

    const users = allUsers.map((authUser) => {
      const profile = profileMap.get(authUser.id)
      const balance = Number(profile?.balance || 0)
      const portfolioTotal = portfolioTotals.get(authUser.id) || 0

      return {
        id: authUser.id,
        email: authUser.email || "Unknown",
        balance,
        total_value: balance + portfolioTotal,
        created_at: authUser.created_at || profile?.created_at || new Date().toISOString(),
        last_sign_in_at: authUser.last_sign_in_at || null,
        is_admin: adminSet.has(authUser.id),
      }
    })

    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ success: true, users })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to load users" }, { status: 500 })
  }
}
