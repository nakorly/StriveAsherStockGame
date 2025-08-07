import { type NextRequest, NextResponse } from "next/server"

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
    const quote = {
      symbol: globalQuote["01. symbol"],
      price: globalQuote["05. price"],
      change: globalQuote["09. change"],
      changePercent: globalQuote["10. change percent"].replace("%", ""),
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("Error fetching stock quote:", error)
    return NextResponse.json({ error: "Failed to fetch stock quote" }, { status: 500 })
  }
}
