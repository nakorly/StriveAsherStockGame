import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabaseAdmin"

type LeaderboardEntry = {
  rank: number
  user_id: string
  username: string
  display_name: string
  total_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  updated_at: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const days = Number.parseInt(searchParams.get("days") || "30", 10)
  const limit = Number.parseInt(searchParams.get("limit") || "10", 10)

  try {
    const supabase = getAdminSupabase()

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, balance")

    if (profilesError) {
      return NextResponse.json({ success: false, error: "Failed to load profiles" }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, leaderboard: [] })
    }

    const userIds = profiles.map((profile) => profile.id)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Math.max(days, 1))

    const [{ data: history, error: historyError }, { data: portfolios, error: portfolioError }] = await Promise.all([
      supabase
        .from("portfolio_history")
        .select("user_id, snapshot_date, total_value")
        .in("user_id", userIds)
        .gte("snapshot_date", startDate.toISOString())
        .order("snapshot_date", { ascending: true }),
      supabase
        .from("portfolios")
        .select("user_id, total_value")
        .in("user_id", userIds),
    ])

    if (historyError) {
      return NextResponse.json({ success: false, error: "Failed to load portfolio history" }, { status: 500 })
    }

    if (portfolioError) {
      return NextResponse.json({ success: false, error: "Failed to load portfolio totals" }, { status: 500 })
    }

    const historyByUser = new Map<string, { first: { total_value: number } | null; last: { total_value: number } | null }>()
    for (const point of history || []) {
      const existing = historyByUser.get(point.user_id)
      if (!existing) {
        historyByUser.set(point.user_id, { first: { total_value: Number(point.total_value || 0) }, last: { total_value: Number(point.total_value || 0) } })
      } else {
        existing.last = { total_value: Number(point.total_value || 0) }
      }
    }

    const portfolioTotals = new Map<string, number>()
    for (const row of portfolios || []) {
      const current = portfolioTotals.get(row.user_id) || 0
      portfolioTotals.set(row.user_id, current + Number(row.total_value || 0))
    }

    const nowIso = new Date().toISOString()
    const entries = profiles.map((profile) => {
      const historyEntry = historyByUser.get(profile.id)
      let startValue = historyEntry?.first?.total_value ?? null
      let endValue = historyEntry?.last?.total_value ?? null

      if (startValue === null || endValue === null) {
        const portfolioTotal = portfolioTotals.get(profile.id) || 0
        const currentTotal = Number(profile.balance || 0) + portfolioTotal
        if (startValue === null) startValue = currentTotal
        if (endValue === null) endValue = currentTotal
      }

      const totalGainLoss = endValue - startValue
      const totalGainLossPercent = startValue > 0 ? (totalGainLoss / startValue) * 100 : 0
      const usernameFallback = `User${String(profile.id).slice(-4)}`

      return {
        rank: 0,
        user_id: profile.id,
        username: profile.username || usernameFallback,
        display_name: profile.display_name || profile.username || usernameFallback,
        total_value: endValue,
        total_gain_loss: totalGainLoss,
        total_gain_loss_percent: totalGainLossPercent,
        updated_at: nowIso,
      }
    })

    entries.sort((a, b) => {
      if (b.total_gain_loss_percent !== a.total_gain_loss_percent) {
        return b.total_gain_loss_percent - a.total_gain_loss_percent
      }
      return b.total_value - a.total_value
    })

    const ranked = entries.slice(0, Math.max(limit, 1)).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))

    return NextResponse.json({ success: true, leaderboard: ranked })
  } catch (error) {
    console.error("Error loading monthly leaderboard:", error)
    return NextResponse.json({ success: false, error: "Failed to load leaderboard" }, { status: 500 })
  }
}
