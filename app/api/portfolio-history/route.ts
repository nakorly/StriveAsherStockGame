import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabaseAdmin"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get("userId")
  const days = Number.parseInt(searchParams.get("days") || "30")

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 })
  }

  try {
    const supabase = getAdminSupabase()

    // Calculate the date threshold
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Fetch portfolio history
    const { data: history, error } = await supabase
      .from("portfolio_history")
      .select("*")
      .eq("user_id", userId)
      .gte("snapshot_date", startDate.toISOString())
      .order("snapshot_date", { ascending: true })

    if (error) {
      console.error("Error fetching portfolio history:", error)
      return NextResponse.json({ error: "Failed to fetch portfolio history" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      history: history || [],
    })

  } catch (error) {
    console.error("Error in portfolio history endpoint:", error)
    return NextResponse.json(
      { error: "Failed to fetch portfolio history" },
      { status: 500 }
    )
  }
}