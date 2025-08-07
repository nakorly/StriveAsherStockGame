"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, TrendingDown, LogOut, Loader2, DollarSign, ShoppingCart, RefreshCw } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import type { User } from "@supabase/supabase-js"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Stock {
  id: string
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  shares: number
  purchase_price: number
  total_value: number
  added_at: string
}

interface SearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
}

interface Profile {
  id: string
  balance: number
}

export default function Dashboard() {
  const [user, setUser] = useState<User | any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [portfolio, setPortfolio] = useState<Stock[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(false)
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null)
  const [selectedStockPrice, setSelectedStockPrice] = useState<number>(0)
  const [sharesToBuy, setSharesToBuy] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const router = useRouter()

  // Auto-refresh prices every 5 minutes
  const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

  const updateStockPrices = useCallback(async (showLoading = true) => {
    if (!user || portfolio.length === 0) return

    if (showLoading) setRefreshing(true)
    
    try {
      const updatedPortfolio = [...portfolio]
      let hasUpdates = false

      for (let i = 0; i < updatedPortfolio.length; i++) {
        const stock = updatedPortfolio[i]
        try {
          const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
          const data = await response.json()

          if (data.quote) {
            const newPrice = Number.parseFloat(data.quote.price)
            const newChange = Number.parseFloat(data.quote.change)
            const newChangePercent = Number.parseFloat(data.quote.changePercent)
            
            // Only update if price has changed
            if (newPrice !== stock.price) {
              updatedPortfolio[i] = {
                ...stock,
                price: newPrice,
                change: newChange,
                change_percent: newChangePercent,
                total_value: stock.shares * newPrice,
              }
              hasUpdates = true

              if (supabaseConfigured) {
                try {
                  const { supabase } = await import("@/lib/supabase")
                  await supabase
                    .from("portfolios")
                    .update({
                      price: newPrice,
                      change: newChange,
                      change_percent: newChangePercent,
                      total_value: updatedPortfolio[i].total_value,
                    })
                    .eq("id", stock.id)
                } catch (err) {
                  console.error("Error updating stock in Supabase:", err)
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error updating ${stock.symbol}:`, error)
        }
      }

      if (hasUpdates) {
        setPortfolio(updatedPortfolio)
        
        if (!supabaseConfigured) {
          localStorage.setItem("portfolio", JSON.stringify(updatedPortfolio))
        }
      }

      setLastRefresh(new Date())
    } catch (error) {
      console.error("Error updating stock prices:", error)
    } finally {
      if (showLoading) setRefreshing(false)
    }
  }, [user, portfolio, supabaseConfigured])

  useEffect(() => {
    const initializeApp = async () => {
    try {
      // Try to import and use Supabase
      const { supabase } = await import("@/lib/supabase")
      
      // Test the connection by getting session
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error("Supabase configuration error:", error)
        throw error
      }

      // Supabase is working
      setSupabaseConfigured(true)

      if (!session) {
        router.push("/")
        return
      }

      setUser(session.user)
      await loadProfile(session.user.id)
      await loadPortfolioFromSupabase(session.user.id)

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          router.push("/")
        } else if (session) {
          setUser(session.user)
          await loadProfile(session.user.id)
          await loadPortfolioFromSupabase(session.user.id)
        }
      })

      setLoading(false)
      return () => subscription.unsubscribe()
    } catch (err) {
      console.error("Supabase error:", err)
      setSupabaseConfigured(false)
      
      // Fallback to localStorage
      const userData = localStorage.getItem("user")
      if (!userData) {
        router.push("/")
        return
      }

      setUser(JSON.parse(userData))
      loadProfileFromLocalStorage()
      loadPortfolioFromLocalStorage()
      setLoading(false)
    }
  }

  initializeApp()
}, [router])

  // Set up auto-refresh interval
  useEffect(() => {
    if (portfolio.length === 0) return

    // Initial refresh after loading
    const initialTimer = setTimeout(() => {
      updateStockPrices(false)
    }, 2000)

    // Set up recurring refresh
    const interval = setInterval(() => {
      updateStockPrices(false)
    }, AUTO_REFRESH_INTERVAL)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [portfolio.length, updateStockPrices])

  const loadProfile = async (userId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error loading profile:", error)
        return
      }

      setProfile(data)
    } catch (err) {
      console.error("Error loading profile:", err)
    }
  }

  const loadProfileFromLocalStorage = () => {
    const savedProfile = localStorage.getItem("profile")
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile))
    } else {
      const newProfile = { id: "demo", balance: 100000 }
      setProfile(newProfile)
      localStorage.setItem("profile", JSON.stringify(newProfile))
    }
  }

  const loadPortfolioFromSupabase = async (userId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase
        .from("portfolios")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) {
        setError("Failed to load portfolio")
        console.error("Error loading portfolio:", error)
        return
      }

      setPortfolio(data || [])
    } catch (err) {
      setError("Failed to load portfolio")
      console.error("Error loading portfolio:", err)
    }
  }

  const loadPortfolioFromLocalStorage = () => {
    const savedPortfolio = localStorage.getItem("portfolio")
    if (savedPortfolio) {
      setPortfolio(JSON.parse(savedPortfolio))
    }
  }

  const handleLogout = async () => {
    if (supabaseConfigured) {
      try {
        const { supabase } = await import("@/lib/supabase")
        await supabase.auth.signOut()
      } catch (err) {
        console.error("Logout error:", err)
      }
    } else {
      localStorage.removeItem("user")
      localStorage.removeItem("portfolio")
      localStorage.removeItem("profile")
      router.push("/")
    }
  }

  const searchStocks = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch(`/api/search-stocks?query=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setSearchResults(data.bestMatches || [])
    } catch (error) {
      console.error("Error searching stocks:", error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const openBuyDialog = async (stock: SearchResult) => {
    setSelectedStock(stock)
    setSharesToBuy(1)

    // Get current stock price
    try {
      const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
      const data = await response.json()
      if (data.quote) {
        setSelectedStockPrice(Number.parseFloat(data.quote.price))
      }
    } catch (error) {
      console.error("Error fetching stock price:", error)
    }

    setIsDialogOpen(false)
    setIsBuyDialogOpen(true)
  }

  const buyStock = async () => {
    if (!user || !profile || !selectedStock || sharesToBuy <= 0) return

    const totalCost = selectedStockPrice * sharesToBuy

    if (totalCost > profile.balance) {
      setError("Insufficient funds to complete this purchase")
      return
    }

    try {
      const response = await fetch(`/api/stock-quote?symbol=${selectedStock.symbol}`)
      const data = await response.json()

      if (data.quote) {
        const currentPrice = Number.parseFloat(data.quote.price)
        const actualTotalCost = currentPrice * sharesToBuy

        if (actualTotalCost > profile.balance) {
          setError("Insufficient funds to complete this purchase")
          return
        }

        // Check if we already own this stock
        const existingStock = portfolio.find((stock) => stock.symbol === selectedStock.symbol.toUpperCase())

        if (supabaseConfigured) {
          const { supabase } = await import("@/lib/supabase")

          if (existingStock) {
            // Update existing position
            const newShares = existingStock.shares + sharesToBuy
            const newTotalValue = newShares * currentPrice
            const avgPurchasePrice =
              (existingStock.purchase_price * existingStock.shares + currentPrice * sharesToBuy) / newShares

            const { error: updateError } = await supabase
              .from("portfolios")
              .update({
                shares: newShares,
                price: currentPrice,
                change: Number.parseFloat(data.quote.change),
                change_percent: Number.parseFloat(data.quote.changePercent),
                purchase_price: avgPurchasePrice,
                total_value: newTotalValue,
              })
              .eq("id", existingStock.id)

            if (updateError) {
              setError("Failed to update stock position")
              return
            }
          } else {
            // Create new position
            const { error: insertError } = await supabase.from("portfolios").insert({
              user_id: user.id,
              symbol: selectedStock.symbol.toUpperCase(),
              name: selectedStock.name,
              price: currentPrice,
              change: Number.parseFloat(data.quote.change),
              change_percent: Number.parseFloat(data.quote.changePercent),
              shares: sharesToBuy,
              purchase_price: currentPrice,
              total_value: actualTotalCost,
            })

            if (insertError) {
              setError("Failed to add stock to portfolio")
              return
            }
          }

          // Update user balance
          const { error: balanceError } = await supabase
            .from("profiles")
            .update({ balance: profile.balance - actualTotalCost })
            .eq("id", user.id)

          if (balanceError) {
            setError("Failed to update balance")
            return
          }

          // Reload data
          await loadProfile(user.id)
          await loadPortfolioFromSupabase(user.id)
        } else {
          // localStorage fallback
          const updatedPortfolio = [...portfolio]
          const newBalance = profile.balance - actualTotalCost

          if (existingStock) {
            // Update existing position
            const stockIndex = updatedPortfolio.findIndex((s) => s.id === existingStock.id)
            const newShares = existingStock.shares + sharesToBuy
            const avgPurchasePrice =
              (existingStock.purchase_price * existingStock.shares + currentPrice * sharesToBuy) / newShares

            updatedPortfolio[stockIndex] = {
              ...existingStock,
              shares: newShares,
              price: currentPrice,
              change: Number.parseFloat(data.quote.change),
              change_percent: Number.parseFloat(data.quote.changePercent),
              purchase_price: avgPurchasePrice,
              total_value: newShares * currentPrice,
            }
          } else {
            // Add new position
            const newStock: Stock = {
              id: crypto.randomUUID(),
              symbol: selectedStock.symbol.toUpperCase(),
              name: selectedStock.name,
              price: currentPrice,
              change: Number.parseFloat(data.quote.change),
              change_percent: Number.parseFloat(data.quote.changePercent),
              shares: sharesToBuy,
              purchase_price: currentPrice,
              total_value: actualTotalCost,
              added_at: new Date().toISOString(),
            }
            updatedPortfolio.push(newStock)
          }

          setPortfolio(updatedPortfolio)
          const updatedProfile = { ...profile, balance: newBalance }
          setProfile(updatedProfile)

          localStorage.setItem("portfolio", JSON.stringify(updatedPortfolio))
          localStorage.setItem("profile", JSON.stringify(updatedProfile))
        }

        setIsBuyDialogOpen(false)
        setSelectedStock(null)
        setSharesToBuy(1)
        setError("")
      }
    } catch (error) {
      setError("Error buying stock")
      console.error("Error buying stock:", error)
    }
  }

  const sellStock = async (stock: Stock, sharesToSell: number) => {
    const actualShares = stock.shares || 1
    if (!user || !profile || sharesToSell <= 0 || sharesToSell > actualShares) return

    try {
      const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
      const data = await response.json()

      if (data.quote) {
        const currentPrice = Number.parseFloat(data.quote.price)
        const saleValue = currentPrice * sharesToSell

        if (supabaseConfigured) {
          const { supabase } = await import("@/lib/supabase")

          if (sharesToSell === stock.shares) {
            // Sell all shares - remove from portfolio
            const { error: deleteError } = await supabase.from("portfolios").delete().eq("id", stock.id)

            if (deleteError) {
              setError("Failed to sell stock")
              return
            }
          } else {
            // Partial sale - update shares
            const remainingShares = stock.shares - sharesToSell
            const newTotalValue = remainingShares * currentPrice

            const { error: updateError } = await supabase
              .from("portfolios")
              .update({
                shares: remainingShares,
                price: currentPrice,
                change: Number.parseFloat(data.quote.change),
                change_percent: Number.parseFloat(data.quote.changePercent),
                total_value: newTotalValue,
              })
              .eq("id", stock.id)

            if (updateError) {
              setError("Failed to update stock position")
              return
            }
          }

          // Update user balance
          const { error: balanceError } = await supabase
            .from("profiles")
            .update({ balance: profile.balance + saleValue })
            .eq("id", user.id)

          if (balanceError) {
            setError("Failed to update balance")
            return
          }

          // Reload data
          await loadProfile(user.id)
          await loadPortfolioFromSupabase(user.id)
        } else {
          // localStorage fallback
          let updatedPortfolio = [...portfolio]
          const newBalance = profile.balance + saleValue

          if (sharesToSell === stock.shares) {
            // Remove stock completely
            updatedPortfolio = updatedPortfolio.filter((s) => s.id !== stock.id)
          } else {
            // Update shares
            const stockIndex = updatedPortfolio.findIndex((s) => s.id === stock.id)
            const remainingShares = stock.shares - sharesToSell

            updatedPortfolio[stockIndex] = {
              ...stock,
              shares: remainingShares,
              price: currentPrice,
              change: Number.parseFloat(data.quote.change),
              change_percent: Number.parseFloat(data.quote.changePercent),
              total_value: remainingShares * currentPrice,
            }
          }

          setPortfolio(updatedPortfolio)
          const updatedProfile = { ...profile, balance: newBalance }
          setProfile(updatedProfile)

          localStorage.setItem("portfolio", JSON.stringify(updatedPortfolio))
          localStorage.setItem("profile", JSON.stringify(updatedProfile))
        }

        setError("")
      }
    } catch (error) {
      setError("Error selling stock")
      console.error("Error selling stock:", error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  const totalPortfolioValue = portfolio.reduce((sum, stock) => {
    const totalValue = stock.total_value || stock.price * (stock.shares || 1)
    return sum + totalValue
  }, 0)

  const totalGainLoss = portfolio.reduce((sum, stock) => {
    const purchasePrice = stock.purchase_price || stock.price || 0
    const shares = stock.shares || 1
    return sum + (stock.price - purchasePrice) * shares
  }, 0)
  const totalAccountValue = profile.balance + totalPortfolioValue

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trading Dashboard</h1>
              <p className="text-sm text-gray-600">
                Welcome back, {user.email}
                {!supabaseConfigured && <span className="text-orange-600"> (Demo Mode)</span>}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-600">Available Cash</div>
                <div className="text-lg font-bold text-green-600">${profile.balance.toLocaleString()}</div>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={() => updateStockPrices(true)} disabled={refreshing}>
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
                {lastRefresh && (
                  <span className="text-xs text-gray-500">
                    Last: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!supabaseConfigured && (
          <Alert className="mb-6">
            <AlertDescription>
              <strong>Demo Mode:</strong> Your portfolio and balance are stored locally. Add Supabase configuration for
              persistent storage across devices.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Auto-refresh indicator */}
        {portfolio.length > 0 && (
          <Alert className="mb-6">
            <AlertDescription>
              <strong>Auto-refresh enabled:</strong> Stock prices update automatically every 5 minutes to show real-time gains/losses.
            </AlertDescription>
          </Alert>
        )}

        {/* Account Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Account Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalAccountValue.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Cash</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${profile.balance.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalPortfolioValue.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Gain/Loss</CardTitle>
              {totalGainLoss >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalGainLoss >= 0 ? "+" : ""}${totalGainLoss.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Buy Dialog */}
        <div className="mb-6">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Buy Stocks
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Search Stocks to Buy</DialogTitle>
                <DialogDescription>Search for stocks by symbol or company name</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Search stocks (e.g., AAPL, Microsoft)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchStocks()}
                  />
                  <Button onClick={searchStocks} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {searchResults.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <div className="font-medium">{result.symbol}</div>
                          <div className="text-sm text-gray-600">{result.name}</div>
                          <div className="text-xs text-gray-500">
                            {result.type} • {result.region}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => openBuyDialog(result)}>
                          Buy
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Buy Stock Dialog */}
        <Dialog open={isBuyDialogOpen} onOpenChange={setIsBuyDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Buy {selectedStock?.symbol}</DialogTitle>
              <DialogDescription>{selectedStock?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Current Price</Label>
                <div className="text-2xl font-bold">${selectedStockPrice.toFixed(2)}</div>
              </div>
              <div>
                <Label htmlFor="shares">Number of Shares</Label>
                <Input
                  id="shares"
                  type="number"
                  min="1"
                  value={sharesToBuy}
                  onChange={(e) => setSharesToBuy(Number.parseInt(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label>Total Cost</Label>
                <div className="text-xl font-bold">${(selectedStockPrice * sharesToBuy).toLocaleString()}</div>
              </div>
              <div>
                <Label>Available Cash</Label>
                <div className="text-lg text-green-600">${profile.balance.toLocaleString()}</div>
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={buyStock}
                  disabled={selectedStockPrice * sharesToBuy > profile.balance}
                  className="flex-1"
                >
                  {selectedStockPrice * sharesToBuy > profile.balance ? "Insufficient Funds" : "Buy Shares"}
                </Button>
                <Button variant="outline" onClick={() => setIsBuyDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Portfolio Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Portfolio</CardTitle>
            <CardDescription>Track your stock investments and performance (auto-refreshes every 5 minutes)</CardDescription>
          </CardHeader>
          <CardContent>
            {portfolio.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No stocks in your portfolio yet</p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Buy Your First Stock
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Current Price</TableHead>
                    <TableHead>Daily Change</TableHead>
                    <TableHead>Purchase Price</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Gain/Loss</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portfolio.map((stock) => {
                    // Add null checks and default values
                    const purchasePrice = stock.purchase_price || stock.price || 0
                    const shares = stock.shares || 1
                    const totalValue = stock.total_value || stock.price * shares
                    const gainLoss = (stock.price - purchasePrice) * shares
                    const gainLossPercent =
                      purchasePrice > 0 ? ((stock.price - purchasePrice) / purchasePrice) * 100 : 0

                    return (
                      <TableRow key={stock.id}>
                        <TableCell className="font-medium">{stock.symbol}</TableCell>
                        <TableCell>{stock.name}</TableCell>
                        <TableCell>{shares.toLocaleString()}</TableCell>
                        <TableCell>${stock.price.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className={stock.change >= 0 ? "text-green-600" : "text-red-600"}>
                            {stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}
                            <br />
                            <Badge variant={stock.change >= 0 ? "default" : "destructive"} className="text-xs">
                              {stock.change_percent >= 0 ? "+" : ""}
                              {stock.change_percent.toFixed(2)}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>${purchasePrice.toFixed(2)}</TableCell>
                        <TableCell>${totalValue.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className={gainLoss >= 0 ? "text-green-600" : "text-red-600"}>
                            {gainLoss >= 0 ? "+" : ""}${gainLoss.toFixed(2)}
                            <br />
                            <Badge variant={gainLoss >= 0 ? "default" : "destructive"} className="text-xs">
                              {gainLoss >= 0 ? "+" : ""}
                              {gainLossPercent.toFixed(2)}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                openBuyDialog({
                                  symbol: stock.symbol,
                                  name: stock.name,
                                  type: "",
                                  region: "",
                                  currency: "",
                                })
                              }
                            >
                              Buy More
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => sellStock(stock, shares)}>
                              Sell All
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
