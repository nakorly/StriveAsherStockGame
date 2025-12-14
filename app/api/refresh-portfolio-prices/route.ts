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
      .select("id, symbol, shares, purchase_price")
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

    const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "demo"
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

        if (artificialPrice) {
          // Use artificial price
          currentPrice = Number(artificialPrice.artificial_price)
          stockName = artificialPrice.name
        } else {
          // Fetch from Alpha Vantage API
          const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${item.symbol}&apikey=${API_KEY}`
          const response = await fetch(url)
          const data = await response.json()

          if (data["Error Message"] || !data["Global Quote"]) {
            // If API fails, generate a realistic price change based on the stored price
            const variation = (Math.random() - 0.48) * 0.03 // -1.8% to +1.32%
            currentPrice = Number(item.purchase_price) * (1 + variation)
            currentPrice = Math.max(1, Math.round(currentPrice * 100) / 100)
            console.log(`Generated price for ${item.symbol}: $${currentPrice}`)
          } else {
            const globalQuote = data["Global Quote"]
            currentPrice = Number.parseFloat(globalQuote["05. price"]) || Number(item.purchase_price)
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