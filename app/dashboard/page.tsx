"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Loader2, Search, TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Plus, Minus, User as UserIcon, Edit } from "lucide-react"
import { SellStockDialog } from "@/components/sell-stock-dialog"
import { QueuedOrders } from "@/components/queued-orders"
import { PublicLeaderboard } from "@/components/public-leaderboard"
import type { User } from "@supabase/supabase-js"

interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
}

interface Portfolio {
  id: string
  symbol: string
  name: string
  shares: number
  purchase_price: number
  current_price: number
  total_value: number
  gain_loss: number
  gain_loss_percent: number
}

interface LeaderboardEntry {
  rank: number
  user_id: string
  total_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
}

interface QueuedOrder {
  id: string
  symbol: string
  name: string
  order_type: "BUY" | "SELL"
  shares: number
  order_price: number | null
  status: "PENDING" | "EXECUTED" | "CANCELLED"
  created_at: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [balance, setBalance] = useState(10000)
  const [portfolio, setPortfolio] = useState<Portfolio[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [queuedOrders, setQueuedOrders] = useState<QueuedOrder[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [isMarketOpen, setIsMarketOpen] = useState(true)
  const [marketStatus, setMarketStatus] = useState("Market Open")
  const [buyDialogOpen, setBuyDialogOpen] = useState(false)
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [buyShares, setBuyShares] = useState("")
  const [sellDialogOpen, setSellDialogOpen] = useState(false)
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<Portfolio | null>(null)
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const router = useRouter()

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

        if (!isSupabaseConfigured()) {
          console.log("Supabase not configured, using demo mode")
          loadDemoData()
          setLoading(false)
          return
        }

        const supabase = await getSupabase()

        // Verify supabase client is valid
        if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") {
          console.log("Invalid Supabase client, using demo mode")
          loadDemoData()
          setLoading(false)
          return
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error || !session) {
          router.push("/")
          return
        }

        setUser(session.user)

        // Verify database methods are available
        if (supabase.from && typeof supabase.from === "function") {
          await Promise.all([
            loadUserData(supabase, session.user.id),
            loadUserProfile(supabase, session.user.id),
            loadPortfolio(supabase, session.user.id),
            loadLeaderboard(supabase),
            loadQueuedOrders(supabase, session.user.id),
            updateMarketStatus(supabase),
          ])
        } else {
          console.log("Database methods not available, using demo mode")
          loadDemoData()
        }
      } catch (err) {
        console.error("Dashboard initialization error:", err)
        loadDemoData()
      } finally {
        setLoading(false)
      }
    }

    initializeDashboard()
  }, [router])

  const loadDemoData = () => {
    setBalance(10000)
    setPortfolio([
      {
        id: "1",
        symbol: "AAPL",
        name: "Apple Inc.",
        shares: 10,
        purchase_price: 150,
        current_price: 175,
        total_value: 1750,
        gain_loss: 250,
        gain_loss_percent: 16.67,
      },
      {
        id: "2",
        symbol: "GOOGL",
        name: "Alphabet Inc.",
        shares: 5,
        purchase_price: 2500,
        current_price: 2650,
        total_value: 13250,
        gain_loss: 750,
        gain_loss_percent: 6.0,
      },
    ])
    setLeaderboard([
      { rank: 1, user_id: "demo-user-1", total_value: 25000, total_gain_loss: 5000, total_gain_loss_percent: 25.0 },
      { rank: 2, user_id: "demo-user-2", total_value: 22000, total_gain_loss: 2000, total_gain_loss_percent: 10.0 },
      { rank: 3, user_id: "You", total_value: 15000, total_gain_loss: 0, total_gain_loss_percent: 0 },
    ])
  }

  const loadUserData = async (supabase: any, userId: string) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data, error } = await supabase.from("profiles").select("balance").eq("id", userId).single()

      if (error) {
        console.error("Error loading user data:", error)
        return
      }

      if (data) {
        setBalance(data.balance)
      }
    } catch (err) {
      console.error("Error in loadUserData:", err)
    }
  }

  const loadUserProfile = async (supabase: any, userId: string) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, created_at")
        .eq("id", userId)
        .single()

      if (error) {
        console.error("Error loading user profile:", error)
        return
      }

      if (data) {
        setUserProfile(data)
        setUsername(data.username || "")
        setDisplayName(data.display_name || "")
      }
    } catch (err) {
      console.error("Error in loadUserProfile:", err)
    }
  }

  const updateUserProfile = async () => {
    if (!user) return

    try {
      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

      if (!isSupabaseConfigured()) {
        // Demo mode - just update local state
        setUserProfile({ username, display_name: displayName })
        setIsProfileDialogOpen(false)
        return
      }

      const supabase = await getSupabase()
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          username: username || null,
          display_name: displayName || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)

      if (error) {
        console.error("Error updating profile:", error)
        return
      }

      await loadUserProfile(supabase, user.id)
      setIsProfileDialogOpen(false)
    } catch (err) {
      console.error("Error updating profile:", err)
    }
  }

  const loadPortfolio = async (supabase: any, userId: string) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data, error } = await supabase.from("portfolios").select("*").eq("user_id", userId)

      if (error) {
        console.error("Error loading portfolio:", error)
        return
      }

      if (data) {
        const portfolioData = data.map((item: any) => ({
          id: item.id,
          symbol: item.symbol,
          name: item.name,
          shares: item.shares,
          purchase_price: item.purchase_price,
          current_price: item.price,
          total_value: item.total_value,
          gain_loss: item.total_value - item.purchase_price * item.shares,
          gain_loss_percent:
            ((item.total_value - item.purchase_price * item.shares) / (item.purchase_price * item.shares)) * 100,
        }))
        setPortfolio(portfolioData)
      }
    } catch (err) {
      console.error("Error in loadPortfolio:", err)
    }
  }

  const loadLeaderboard = async (supabase: any) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("rank", { ascending: true })
        .limit(10)

      if (error) {
        console.error("Error loading leaderboard:", error)
        return
      }

      if (data) {
        setLeaderboard(data)
      }
    } catch (err) {
      console.error("Error in loadLeaderboard:", err)
    }
  }

  const loadQueuedOrders = async (supabase: any, userId: string) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data, error } = await supabase
        .from("queued_orders")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error loading queued orders:", error)
        return
      }

      if (data) {
        setQueuedOrders(data)
      }
    } catch (err) {
      console.error("Error in loadQueuedOrders:", err)
    }
  }

  const updateMarketStatus = async (supabase: any) => {
    try {
      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        return
      }

      const { data: marketSettings, error } = await supabase.from("market_settings").select("*").single()

      if (error) {
        console.error("Error fetching market settings:", error)
        return
      }

      if (marketSettings) {
        const now = new Date()
        const currentTime = now.toTimeString().slice(0, 5)
        const currentDay = now.getDay()

        const isOpenOverride = marketSettings.is_market_open_override
        const isTradingDay = marketSettings.trading_days.includes(currentDay)
        const isWithinHours =
          currentTime >= marketSettings.market_open_time && currentTime <= marketSettings.market_close_time

        const marketOpen = isOpenOverride !== null ? isOpenOverride : isTradingDay && isWithinHours

        setIsMarketOpen(marketOpen)
        setMarketStatus(marketOpen ? "Market Open" : "Market Closed")
      }
    } catch (err) {
      console.error("Error in updateMarketStatus:", err)
    }
  }

  const searchStocks = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const response = await fetch(`/api/search-stocks?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.stocks)
      } else {
        console.error("Search error:", data.error)
        setSearchResults([])
      }
    } catch (error) {
      console.error("Search error:", error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleBuyStock = async () => {
    if (!selectedStock || !buyShares || !user) return

    const shares = Number.parseInt(buyShares)
    const totalCost = selectedStock.price * shares

    if (totalCost > balance) {
      alert("Insufficient funds")
      return
    }

    try {
      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

      if (!isSupabaseConfigured()) {
        // Demo mode - update local state
        const newBalance = balance - totalCost
        setBalance(newBalance)

        const existingStock = portfolio.find((p) => p.symbol === selectedStock.symbol)
        if (existingStock) {
          const newShares = existingStock.shares + shares
          const newTotalValue = newShares * selectedStock.price
          const updatedPortfolio = portfolio.map((p) =>
            p.symbol === selectedStock.symbol
              ? {
                  ...p,
                  shares: newShares,
                  total_value: newTotalValue,
                  gain_loss: newTotalValue - p.purchase_price * newShares,
                  gain_loss_percent:
                    ((newTotalValue - p.purchase_price * newShares) / (p.purchase_price * newShares)) * 100,
                }
              : p,
          )
          setPortfolio(updatedPortfolio)
        } else {
          const newPortfolioItem: Portfolio = {
            id: Date.now().toString(),
            symbol: selectedStock.symbol,
            name: selectedStock.name,
            shares: shares,
            purchase_price: selectedStock.price,
            current_price: selectedStock.price,
            total_value: totalCost,
            gain_loss: 0,
            gain_loss_percent: 0,
          }
          setPortfolio([...portfolio, newPortfolioItem])
        }

        setBuyDialogOpen(false)
        setBuyShares("")
        setSelectedStock(null)
        return
      }

      const supabase = await getSupabase()

      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        alert("Database not available")
        return
      }

      if (isMarketOpen) {
        // Execute immediately
        const { error: portfolioError } = await supabase.from("portfolios").upsert({
          user_id: user.id,
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          price: selectedStock.price,
          change: selectedStock.change,
          change_percent: selectedStock.change_percent,
          shares: shares,
          purchase_price: selectedStock.price,
          total_value: totalCost,
        })

        if (portfolioError) {
          console.error("Error adding to portfolio:", portfolioError)
          return
        }

        const { error: balanceError } = await supabase
          .from("profiles")
          .update({ balance: balance - totalCost })
          .eq("id", user.id)

        if (balanceError) {
          console.error("Error updating balance:", balanceError)
          return
        }

        await loadUserData(supabase, user.id)
        await loadPortfolio(supabase, user.id)
      } else {
        // Queue the order
        const { error } = await supabase.from("queued_orders").insert({
          user_id: user.id,
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          order_type: "BUY",
          shares: shares,
          order_price: selectedStock.price,
          status: "PENDING",
        })

        if (error) {
          console.error("Error queuing order:", error)
          return
        }

        await loadQueuedOrders(supabase, user.id)
      }

      setBuyDialogOpen(false)
      setBuyShares("")
      setSelectedStock(null)
    } catch (error) {
      console.error("Error buying stock:", error)
    }
  }

  const handleLogout = async () => {
    try {
      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

      if (!isSupabaseConfigured()) {
        router.push("/")
        return
      }

      const supabase = await getSupabase()

      if (supabase && supabase.auth && typeof supabase.auth.signOut === "function") {
        await supabase.auth.signOut()
      }

      router.push("/")
    } catch (err) {
      console.error("Logout error:", err)
      router.push("/")
    }
  }

  const totalPortfolioValue = portfolio.reduce((sum, item) => sum + item.total_value, 0)
  const totalGainLoss = portfolio.reduce((sum, item) => sum + item.gain_loss, 0)
  const totalGainLossPercent =
    totalPortfolioValue > 0 ? (totalGainLoss / (totalPortfolioValue - totalGainLoss)) * 100 : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Portfolio Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user?.email || "Demo User"}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={isMarketOpen ? "default" : "secondary"}>{marketStatus}</Badge>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Balance</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${balance.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
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
                ${totalGainLoss.toLocaleString()}
              </div>
              <p className={`text-xs ${totalGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalGainLossPercent.toFixed(2)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(balance + totalPortfolioValue).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="portfolio" className="space-y-6">
          <TabsList>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="search">Search Stocks</TabsTrigger>
            <TabsTrigger value="orders">Queued Orders</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio">
            <Card>
              <CardHeader>
                <CardTitle>Your Portfolio</CardTitle>
                <CardDescription>Track your stock investments and performance</CardDescription>
              </CardHeader>
              <CardContent>
                {portfolio.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No stocks in your portfolio yet.</p>
                    <p className="text-sm text-gray-400">Search for stocks to start investing!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Shares</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Current Price</TableHead>
                        <TableHead>Total Value</TableHead>
                        <TableHead>Gain/Loss</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.symbol}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.shares}</TableCell>
                          <TableCell>${item.purchase_price.toFixed(2)}</TableCell>
                          <TableCell>${item.current_price.toFixed(2)}</TableCell>
                          <TableCell>${item.total_value.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className={item.gain_loss >= 0 ? "text-green-600" : "text-red-600"}>
                              ${item.gain_loss.toFixed(2)}
                              <br />
                              <span className="text-xs">({item.gain_loss_percent.toFixed(2)}%)</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPortfolioItem(item)
                                setSellDialogOpen(true)
                              }}
                            >
                              <Minus className="h-4 w-4 mr-1" />
                              Sell
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle>Search Stocks</CardTitle>
                <CardDescription>Find and buy stocks to add to your portfolio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for stocks (e.g., AAPL, GOOGL, TSLA)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchStocks()}
                  />
                  <Button onClick={searchStocks} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map((stock) => (
                        <TableRow key={stock.symbol}>
                          <TableCell className="font-medium">{stock.symbol}</TableCell>
                          <TableCell>{stock.name}</TableCell>
                          <TableCell>${stock.price.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className={stock.change >= 0 ? "text-green-600" : "text-red-600"}>
                              ${stock.change.toFixed(2)} ({stock.change_percent.toFixed(2)}%)
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedStock(stock)
                                setBuyDialogOpen(true)
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Buy
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <QueuedOrders
              orders={queuedOrders}
              onOrdersUpdate={() => {
                if (user) {
                  const updateOrders = async () => {
                    try {
                      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

                      if (!isSupabaseConfigured()) return

                      const supabase = await getSupabase()
                      if (supabase && supabase.from && typeof supabase.from === "function") {
                        await loadQueuedOrders(supabase, user.id)
                      }
                    } catch (err) {
                      console.error("Error updating orders:", err)
                    }
                  }
                  updateOrders()
                }
              }}
            />
          </TabsContent>

          <TabsContent value="leaderboard">
            <PublicLeaderboard />
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5" />
                      Profile Settings
                    </CardTitle>
                    <CardDescription>Manage your trading profile and display preferences</CardDescription>
                  </div>
                  <Button onClick={() => setIsProfileDialogOpen(true)} className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    Edit Profile
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">{user?.email || "Not available"}</div>
                </div>
                <div>
                  <Label>Username</Label>
                  <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    {userProfile?.username || "Not set"}
                  </div>
                </div>
                <div>
                  <Label>Display Name</Label>
                  <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    {userProfile?.display_name || "Not set"}
                  </div>
                </div>
                <div>
                  <Label>Member Since</Label>
                  <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString() : "Unknown"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Buy Stock Dialog */}
        <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buy {selectedStock?.symbol}</DialogTitle>
              <DialogDescription>Current price: ${selectedStock?.price.toFixed(2)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="shares">Number of shares</Label>
                <Input
                  id="shares"
                  type="number"
                  value={buyShares}
                  onChange={(e) => setBuyShares(e.target.value)}
                  placeholder="Enter number of shares"
                />
              </div>
              {buyShares && selectedStock && (
                <div className="text-sm text-gray-600">
                  Total cost: ${(Number.parseInt(buyShares) * selectedStock.price).toLocaleString()}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBuyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleBuyStock}>{isMarketOpen ? "Buy Now" : "Queue Order"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Sell Stock Dialog */}
        {selectedPortfolioItem && (
          <SellStockDialog
            open={sellDialogOpen}
            onOpenChange={setSellDialogOpen}
            portfolioItem={selectedPortfolioItem}
            user={user}
            isMarketOpen={isMarketOpen}
            onSellComplete={() => {
              if (user) {
                const updateData = async () => {
                  try {
                    const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

                    if (!isSupabaseConfigured()) return

                    const supabase = await getSupabase()
                    if (supabase && supabase.from && typeof supabase.from === "function") {
                      await Promise.all([
                        loadUserData(supabase, user.id),
                        loadPortfolio(supabase, user.id),
                        loadQueuedOrders(supabase, user.id),
                      ])
                    }
                  } catch (err) {
                    console.error("Error updating data after sell:", err)
                  }
                }
                updateData()
              }
            }}
          />
        )}

        {/* Profile Edit Dialog */}
        <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update your username and display name for the leaderboard
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  maxLength={50}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Used for leaderboard rankings. Must be unique.
                </div>
              </div>
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  maxLength={100}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Shown publicly on the leaderboard.
                </div>
              </div>
              <div className="flex space-x-2">
                <Button onClick={updateUserProfile}>
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
