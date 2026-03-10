import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabaseAdmin"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    // Get user's portfolio
    const { data: portfolioItems, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id, symbol, shares, purchase_price, price")
      .eq("user_id", userId)

    if (portfolioError) {
      console.error("Error fetching portfolio:", portfolioError)
      return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 })
    }

    if (!portfolioItems || portfolioItems.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No portfolio items to update",
        updated: 0 
      })
    }

    const API_KEY = process.env.FINNHUB_API_KEY
    if (!API_KEY) {
      return NextResponse.json({ error: "FINNHUB_API_KEY is not set" }, { status: 500 })
    }
    let updatedCount = 0
    const errors: string[] = []

    // Update each stock price
    for (const item of portfolioItems) {
      try {
        // Check if we have a cached artificial price first
        const { data: artificialPrice } = await supabase
          .from("artificial_stock_prices")
          .select("artificial_price, name")
          .eq("symbol", item.symbol)
          .eq("is_active", true)
          .single()

        let currentPrice: number
        let stockName: string = item.symbol
        let priceSource: "artificial" | "finnhub" | "cache_fallback" | "generated" = "generated"

        if (artificialPrice) {
          // Use artificial price
          currentPrice = Number(artificialPrice.artificial_price)
          stockName = artificialPrice.name
          priceSource = "artificial"
        } else {
          // Fetch from Finnhub API
          const url = `https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${API_KEY}`
          const response = await fetch(url)
          const data = await response.json()

          const livePrice = Number(data?.c)
          if (!response.ok || data?.error || !Number.isFinite(livePrice) || livePrice <= 0) {
            // If API fails, fall back to last cached price or portfolio price, then apply a small drift
            let basePrice = Number(item.price ?? item.purchase_price)
            try {
              const { data: cached } = await supabase
                .from("latest_stock_prices")
                .select("price, name")
                .eq("symbol", item.symbol)
                .limit(1)
                .single()
              if (cached?.price) {
                basePrice = Number(cached.price)
                if (cached.name) stockName = cached.name
                priceSource = "cache_fallback"
              }
            } catch (_) {}

            const variation = (Math.random() - 0.5) * 0.02 // -1% to +1%
            currentPrice = basePrice * (1 + variation)
            currentPrice = Math.max(1, Math.round(currentPrice * 10) / 10)
            console.log(`Generated price for ${item.symbol}: $${currentPrice}`)
          } else {
            currentPrice = livePrice
            priceSource = "finnhub"
          }
        }

        // Calculate metrics
        const totalValue = currentPrice * item.shares
        const change = currentPrice - Number(item.purchase_price)
        const changePercent = Number(item.purchase_price) > 0 
          ? (change / Number(item.purchase_price)) * 100 
          : 0

        // Update the portfolio item
        const { error: updateError } = await supabase
          .from("portfolios")
          .update({
            price: currentPrice,
            change: Math.round(change * 100) / 100,
            change_percent: Math.round(changePercent * 100) / 100,
            total_value: Math.round(totalValue * 100) / 100,
          })
          .eq("id", item.id)

        if (updateError) {
          console.error(`Error updating ${item.symbol}:`, updateError)
          errors.push(`${item.symbol}: ${updateError.message}`)
        } else {
          updatedCount++
        }

        // Best-effort: update latest_stock_prices cache for related searches
        try {
          await supabase.rpc("upsert_latest_stock_price", {
            p_symbol: item.symbol,
            p_name: stockName,
            p_price: currentPrice,
            p_change: Math.round(change * 100) / 100,
            p_change_percent: Math.round(changePercent * 100) / 100,
            p_is_artificial: priceSource === "artificial",
            p_source: priceSource,
          })
        } catch (cacheErr) {
          console.warn("Could not update latest_stock_prices:", cacheErr)
        }

        // Add small delay to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (stockError) {
        console.error(`Error processing ${item.symbol}:`, stockError)
        errors.push(`${item.symbol}: ${stockError instanceof Error ? stockError.message : 'Unknown error'}`)
      }
    }

    // Record a portfolio snapshot after updating prices
    try {
      await supabase.rpc("record_portfolio_snapshot", { p_user_id: userId })
    } catch (snapshotError) {
      console.warn("Could not record portfolio snapshot:", snapshotError)
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: portfolioItems.length,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error) {
    console.error("Error refreshing portfolio prices:", error)
    return NextResponse.json(
      { error: "Failed to refresh portfolio prices" },
      { status: 500 }
    )
  }
}
