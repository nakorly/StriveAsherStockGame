import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    // Alpha Vantage API key would be stored in environment variables
    const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "demo"
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    if (data["Error Message"]) {
      return NextResponse.json({ error: "API limit reached or invalid request" }, { status: 429 })
    }

    // Transform the data to match our interface
    const bestMatches =
      data.bestMatches?.map((match: any) => ({
        symbol: match["1. symbol"],
        name: match["2. name"],
        type: match["3. type"],
        region: match["4. region"],
        currency: match["8. currency"],
      })) || []

    return NextResponse.json({ bestMatches })
  } catch (error) {
    console.error("Error fetching stock search:", error)
    return NextResponse.json({ error: "Failed to search stocks" }, { status: 500 })
  }
}
