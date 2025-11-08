import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabaseAdmin"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json({ error: "Symbol parameter is required" }, { status: 400 })
  }

  try {
    // Alpha Vantage API key would be stored in environment variables
    const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "demo"
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data["Error Message"]) {
      return NextResponse.json({ error: "Stock not found or API limit reached" }, { status: 404 })
    }

    const globalQuote = data["Global Quote"]
    if (!globalQuote) {
      return NextResponse.json({ error: "No quote data available" }, { status: 404 })
    }

    // Transform the data to match our interface
    const symbol = String(globalQuote["01. symbol"]).toUpperCase()
    const price = Number.parseFloat(globalQuote["05. price"]) || 0
    const change = Number.parseFloat(globalQuote["09. change"]) || 0
    const changePercent = Number.parseFloat(String(globalQuote["10. change percent"]).replace("%", "")) || 0

    const quote = { symbol, price, change, changePercent }

    // Upsert into cache (latest_stock_prices) using admin client
    try {
      const supabase = getAdminSupabase()
      await supabase.rpc("upsert_latest_stock_price", {
        p_symbol: symbol,
        p_name: symbol,
        p_price: price,
        p_change: change,
        p_change_percent: changePercent,
        p_is_artificial: false,
        p_source: "alpha_vantage",
      })
    } catch (cacheErr) {
      console.warn("Could not upsert latest_stock_prices:", cacheErr)
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("Error fetching stock quote:", error)

    // Fallback to cached price if available
    try {
      const supabase = getAdminSupabase()
      const { data } = await supabase
        .from("latest_stock_prices")
        .select("symbol, price, change, change_percent, is_artificial")
        .limit(1)
      if (Array.isArray(data) && data.length > 0) {
        const row = data[0]
        const quote = {
          symbol: row.symbol,
          price: Number(row.price),
          change: Number(row.change ?? 0),
          changePercent: Number(row.change_percent ?? 0),
          isArtificial: !!row.is_artificial,
        }
        return NextResponse.json({ quote, source: "cache" })
      }
    } catch (cacheReadErr) {
      console.warn("Cache fallback failed:", cacheReadErr)
    }

    return NextResponse.json({ error: "Failed to fetch stock quote" }, { status: 500 })
  }
}
