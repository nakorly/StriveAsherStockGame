"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  TrendingUp,
  TrendingDown,
  LogOut,
  Loader2,
  DollarSign,
  ShoppingCart,
  RefreshCw,
  Clock,
} from "lucide-react"
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
import { SellStockDialog } from "@/components/sell-stock-dialog"
import { QueuedOrders } from "@/components/queued-orders"

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

interface QueuedOrder {
  id: string
  symbol: string
  name: string
  order_type: "BUY" | "SELL"
  shares: number
  order_price: number
  status: "PENDING" | "EXECUTED" | "CANCELLED"
  created_at: string
  executed_at?: string
  execution_price?: number
  portfolio_id?: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [portfolio, setPortfolio] = useState<Stock[]>([])
  const [queuedOrders, setQueuedOrders] = useState<QueuedOrder[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(false)
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false)
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null)
  const [selectedStockForSale, setSelectedStockForSale] = useState<Stock | null>(null)
  const [selectedStockPrice, setSelectedStockPrice] = useState<number>(0)
  const [sharesToBuy, setSharesToBuy] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean
    nextEvent: string
    timeUntil: string
  }>({ isOpen: false, nextEvent: "", timeUntil: "" })
  const router = useRouter()

  // Session timeout - 24 hours
  const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

  // Simulate stock price changes
  const simulateStockPrice = (currentPrice: number, symbol: string) => {
    // Create some volatility based on symbol hash for consistency
    const symbolHash = symbol.split("").reduce((a, b) => a + b.charCodeAt(0), 0)
    const volatility = 0.02 + (symbolHash % 10) * 0.001 // 2-3% volatility

    // Random walk with slight upward bias
    const randomChange = (Math.random() - 0.48) * volatility
    const newPrice = currentPrice * (1 + randomChange)

    // Ensure price doesn't go below $1
    return Math.max(1, Number(newPrice.toFixed(2)))
  }

  // Get market status from admin settings or calculate automatically
  const getMarketStatus = useCallback(async () => {
    if (supabaseConfigured) {
      try {
        const { supabase } = await import("@/lib/supabase")
        const { data: marketSettings } = await supabase.from("market_settings").select("*").single()

        if (marketSettings?.is_market_open_override !== null) {
          // Admin has overridden market status
          const isOpen = marketSettings.is_market_open_override
          return {
            isOpen,
            nextEvent: isOpen ? "Market manually opened" : "Market manually closed",
            timeUntil: "Admin controlled",
          }
        }
      } catch (err) {
        console.error("Error fetching market settings:", err)
      }
    }

    // Default market hours calculation
    const now = new Date()
    const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const day = easternTime.getDay() // 0 = Sunday, 6 = Saturday
    const hours = easternTime.getHours()
    const minutes = easternTime.getMinutes()
    const currentTime = hours * 60 + minutes // Convert to minutes since midnight

    // Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
    const marketOpen = 9 * 60 + 30 // 9:30 AM
    const marketClose = 16 * 60 // 4:00 PM

    const isWeekday = day >= 1 && day <= 5
    const isMarketHours = currentTime >= marketOpen && currentTime < marketClose
    const isOpen = isWeekday && isMarketHours

    let nextEvent = ""
    let timeUntil = ""

    if (isWeekday) {
      if (currentTime < marketOpen) {
        // Market opens today
        nextEvent = "Market opens"
        const minutesUntil = marketOpen - currentTime
        timeUntil = formatTimeUntil(minutesUntil)
      } else if (currentTime < marketClose) {
        // Market closes today
        nextEvent = "Market closes"
        const minutesUntil = marketClose - currentTime
        timeUntil = formatTimeUntil(minutesUntil)
      } else {
        // Market opens tomorrow (or Monday if Friday)
        nextEvent = day === 5 ? "Market opens Monday" : "Market opens tomorrow"
        const minutesUntilMidnight = 24 * 60 - currentTime
        const minutesUntilOpen =
          day === 5 ? minutesUntilMidnight + 2 * 24 * 60 + marketOpen : minutesUntilMidnight + marketOpen
        timeUntil = formatTimeUntil(minutesUntilOpen)
      }
    } else {
      // Weekend
      nextEvent = "Market opens Monday"
      const daysUntilMonday = day === 0 ? 1 : 8 - day // Sunday = 1 day, Saturday = 2 days
      const minutesUntilMonday = daysUntilMonday * 24 * 60 - currentTime + marketOpen
      timeUntil = formatTimeUntil(minutesUntilMonday)
    }

    return { isOpen, nextEvent, timeUntil }
  }, [supabaseConfigured])

  const formatTimeUntil = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24

    if (days > 0) {
      return `${days}d ${remainingHours}h ${mins}m`
    } else if (hours > 0) {
      return `${hours}h ${mins}m`
    } else {
      return `${mins}m`
    }
  }

  // Check session timeout
  const checkSessionTimeout = useCallback(() => {
    const lastActivity = localStorage.getItem("lastActivity")
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - Number.parseInt(lastActivity)
      if (timeSinceLastActivity > SESSION_TIMEOUT) {
        // Session expired, logout user
        handleLogout()
        return false
      }
    }
    // Update last activity
    localStorage.setItem("lastActivity", Date.now().toString())
    return true
  }, [])

  // Execute queued orders when market opens
  const executeQueuedOrders = useCallback(async () => {
    if (!user || !marketStatus.isOpen) return

    const pendingOrders = queuedOrders.filter((order) => order.status === "PENDING")
    if (pendingOrders.length === 0) return

    console.log(`Market opened - executing ${pendingOrders.length} queued orders`)

    for (const order of pendingOrders) {
      try {
        // Get current stock price (try real API first, then simulate)
        let currentPrice = order.order_price || 100
        let quoteData = {
          change: 0,
          changePercent: 0,
        }

        try {
          const response = await fetch(`/api/stock-quote?symbol=${order.symbol}`)
          const data = await response.json()

          if (data.quote) {
            currentPrice = Number.parseFloat(data.quote.price)
            quoteData = {
              change: Number.parseFloat(data.quote.change),
              changePercent: Number.parseFloat(data.quote.changePercent),
            }
          } else {
            // Simulate price if API fails
            currentPrice = simulateStockPrice(order.order_price || 100, order.symbol)
            const priceChange = currentPrice - (order.order_price || 100)
            quoteData = {
              change: priceChange,
              changePercent: (priceChange / (order.order_price || 100)) * 100,
            }
          }
        } catch (apiError) {
          console.log("API failed, using simulated price for", order.symbol)
          currentPrice = simulateStockPrice(order.order_price || 100, order.symbol)
          const priceChange = currentPrice - (order.order_price || 100)
          quoteData = {
            change: priceChange,
            changePercent: (priceChange / (order.order_price || 100)) * 100,
          }
        }

        if (order.order_type === "BUY") {
          await executeBuyOrder(order, currentPrice, quoteData)
        } else {
          await executeSellOrder(order, currentPrice, quoteData)
        }
      } catch (error) {
        console.error(`Error executing order ${order.id}:`, error)
      }
    }

    // Reload data after executing orders
    if (supabaseConfigured) {
      await loadProfile(user.id)
      await loadPortfolioFromSupabase(user.id)
      await loadQueuedOrders(user.id)
    } else {
      loadProfileFromLocalStorage()
      loadPortfolioFromLocalStorage()
      loadQueuedOrdersFromLocalStorage()
    }
  }, [user, marketStatus.isOpen, queuedOrders, supabaseConfigured])

  const executeBuyOrder = async (order: QueuedOrder, currentPrice: number, quoteData: any) => {
    const totalCost = currentPrice * order.shares

    if (supabaseConfigured) {
      const { supabase } = await import("@/lib/supabase")

      // Check if user has sufficient balance
      const { data: profileData } = await supabase.from("profiles").select("balance").eq("id", user.id).single()

      if (!profileData || profileData.balance < totalCost) {
        // Cancel order due to insufficient funds
        await supabase.from("queued_orders").update({ status: "CANCELLED" }).eq("id", order.id)
        return
      }

      // Check if we already own this stock
      const { data: existingStock } = await supabase
        .from("portfolios")
        .select("*")
        .eq("user_id", user.id)
        .eq("symbol", order.symbol)
        .single()

      if (existingStock) {
        // Update existing position
        const newShares = existingStock.shares + order.shares
        const newTotalValue = newShares * currentPrice
        const avgPurchasePrice =
          (existingStock.purchase_price * existingStock.shares + currentPrice * order.shares) / newShares

        await supabase
          .from("portfolios")
          .update({
            shares: newShares,
            price: currentPrice,
            change: Number.parseFloat(quoteData.change),
            change_percent: Number.parseFloat(quoteData.changePercent),
            purchase_price: avgPurchasePrice,
            total_value: newTotalValue,
          })
          .eq("id", existingStock.id)
      } else {
        // Create new position
        await supabase.from("portfolios").insert({
          user_id: user.id,
          symbol: order.symbol,
          name: order.name,
          price: currentPrice,
          change: Number.parseFloat(quoteData.change),
          change_percent: Number.parseFloat(quoteData.changePercent),
          shares: order.shares,
          purchase_price: currentPrice,
          total_value: totalCost,
        })
      }

      // Update user balance
      await supabase
        .from("profiles")
        .update({ balance: profileData.balance - totalCost })
        .eq("id", user.id)

      // Mark order as executed
      await supabase
        .from("queued_orders")
        .update({
          status: "EXECUTED",
          executed_at: new Date().toISOString(),
          execution_price: currentPrice,
        })
        .eq("id", order.id)
    } else {
      // localStorage fallback
      const profile = JSON.parse(localStorage.getItem("profile") || "{}")
      if (profile.balance < totalCost) return

      const portfolio = JSON.parse(localStorage.getItem("portfolio") || "[]")
      const existingStockIndex = portfolio.findIndex((s: Stock) => s.symbol === order.symbol)

      if (existingStockIndex >= 0) {
        // Update existing position
        const existingStock = portfolio[existingStockIndex]
        const newShares = existingStock.shares + order.shares
        const avgPurchasePrice =
          (existingStock.purchase_price * existingStock.shares + currentPrice * order.shares) / newShares

        portfolio[existingStockIndex] = {
          ...existingStock,
          shares: newShares,
          price: currentPrice,
          change: Number.parseFloat(quoteData.change),
          change_percent: Number.parseFloat(quoteData.changePercent),
          purchase_price: avgPurchasePrice,
          total_value: newShares * currentPrice,
        }
      } else {
        // Add new position
        portfolio.push({
          id: crypto.randomUUID(),
          symbol: order.symbol,
          name: order.name,
          price: currentPrice,
          change: Number.parseFloat(quoteData.change),
          change_percent: Number.parseFloat(quoteData.changePercent),
          shares: order.shares,
          purchase_price: currentPrice,
          total_value: totalCost,
          added_at: new Date().toISOString(),
        })
      }

      // Update balance and save
      profile.balance -= totalCost
      localStorage.setItem("portfolio", JSON.stringify(portfolio))
      localStorage.setItem("profile", JSON.stringify(profile))

      // Update queued order
      const orders = JSON.parse(localStorage.getItem("queuedOrders") || "[]")
      const orderIndex = orders.findIndex((o: QueuedOrder) => o.id === order.id)
      if (orderIndex >= 0) {
        orders[orderIndex] = {
          ...orders[orderIndex],
          status: "EXECUTED",
          executed_at: new Date().toISOString(),
          execution_price: currentPrice,
        }
        localStorage.setItem("queuedOrders", JSON.stringify(orders))
      }
    }
  }

  const executeSellOrder = async (order: QueuedOrder, currentPrice: number, quoteData: any) => {
    const saleValue = currentPrice * order.shares

    if (supabaseConfigured) {
      const { supabase } = await import("@/lib/supabase")

      // Find the stock to sell
      const { data: stockData } = await supabase
        .from("portfolios")
        .select("*")
        .eq("user_id", user.id)
        .eq("symbol", order.symbol)
        .single()

      if (!stockData || stockData.shares < order.shares) {
        // Cancel order - insufficient shares
        await supabase.from("queued_orders").update({ status: "CANCELLED" }).eq("id", order.id)
        return
      }

      if (order.shares === stockData.shares) {
        // Sell all shares - remove from portfolio
        await supabase.from("portfolios").delete().eq("id", stockData.id)
      } else {
        // Partial sale - update shares
        const remainingShares = stockData.shares - order.shares
        const newTotalValue = remainingShares * currentPrice

        await supabase
          .from("portfolios")
          .update({
            shares: remainingShares,
            price: currentPrice,
            change: Number.parseFloat(quoteData.change),
            change_percent: Number.parseFloat(quoteData.changePercent),
            total_value: newTotalValue,
          })
          .eq("id", stockData.id)
      }

      // Update user balance
      const { data: profileData } = await supabase.from("profiles").select("balance").eq("id", user.id).single()

      if (profileData) {
        await supabase
          .from("profiles")
          .update({ balance: profileData.balance + saleValue })
          .eq("id", user.id)
      }

      // Mark order as executed
      await supabase
        .from("queued_orders")
        .update({
          status: "EXECUTED",
          executed_at: new Date().toISOString(),
          execution_price: currentPrice,
        })
        .eq("id", order.id)
    } else {
      // localStorage fallback
      const portfolio = JSON.parse(localStorage.getItem("portfolio") || "[]")
      const stockIndex = portfolio.findIndex((s: Stock) => s.symbol === order.symbol)

      if (stockIndex < 0 || portfolio[stockIndex].shares < order.shares) return

      const profile = JSON.parse(localStorage.getItem("profile") || "{}")

      if (order.shares === portfolio[stockIndex].shares) {
        // Remove stock completely
        portfolio.splice(stockIndex, 1)
      } else {
        // Update shares
        const remainingShares = portfolio[stockIndex].shares - order.shares
        portfolio[stockIndex] = {
          ...portfolio[stockIndex],
          shares: remainingShares,
          price: currentPrice,
          change: Number.parseFloat(quoteData.change),
          change_percent: Number.parseFloat(quoteData.changePercent),
          total_value: remainingShares * currentPrice,
        }
      }

      // Update balance and save
      profile.balance += saleValue
      localStorage.setItem("portfolio", JSON.stringify(portfolio))
      localStorage.setItem("profile", JSON.stringify(profile))

      // Update queued order
      const orders = JSON.parse(localStorage.getItem("queuedOrders") || "[]")
      const orderIndex = orders.findIndex((o: QueuedOrder) => o.id === order.id)
      if (orderIndex >= 0) {
        orders[orderIndex] = {
          ...orders[orderIndex],
          status: "EXECUTED",
          executed_at: new Date().toISOString(),
          execution_price: currentPrice,
        }
        localStorage.setItem("queuedOrders", JSON.stringify(orders))
      }
    }
  }

  // Update stock prices based on market events
  const updateStockPrices = useCallback(
    async (showLoading = true) => {
      if (!user || portfolio.length === 0) return

      if (showLoading) setRefreshing(true)

      try {
        const updatedPortfolio = [...portfolio]
        let hasUpdates = false

        for (let i = 0; i < updatedPortfolio.length; i++) {
          const stock = updatedPortfolio[i]
          let newPrice = stock.price
          let newChange = stock.change
          let newChangePercent = stock.change_percent

          try {
            // Try to get real stock data first
            const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
            const data = await response.json()

            if (data.quote) {
              newPrice = Number.parseFloat(data.quote.price)
              newChange = Number.parseFloat(data.quote.change)
              newChangePercent = Number.parseFloat(data.quote.changePercent)
            } else {
              // Simulate price if API fails
              newPrice = simulateStockPrice(stock.price, stock.symbol)
              newChange = newPrice - stock.price
              newChangePercent = (newChange / stock.price) * 100
            }
          } catch (error) {
            console.log(`API failed for ${stock.symbol}, simulating price`)
            // Simulate price if API fails
            newPrice = simulateStockPrice(stock.price, stock.symbol)
            newChange = newPrice - stock.price
            newChangePercent = (newChange / stock.price) * 100
          }

          // Only update if price has changed
          if (Math.abs(newPrice - stock.price) > 0.01) {
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
    },
    [user, portfolio, supabaseConfigured],
  )

  // Schedule market-based updates and order execution
  const scheduleMarketUpdates = useCallback(() => {
    const now = new Date()
    const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const currentMinutes = easternTime.getHours() * 60 + easternTime.getMinutes()

    // Market open: 9:30 AM ET (570 minutes)
    // Market close: 4:00 PM ET (960 minutes)
    const marketOpen = 9 * 60 + 30
    const marketClose = 16 * 60

    const scheduleUpdate = (targetMinutes: number, label: string, callback: () => void) => {
      let msUntilTarget

      if (currentMinutes <= targetMinutes) {
        // Target is today
        msUntilTarget = (targetMinutes - currentMinutes) * 60 * 1000
      } else {
        // Target is tomorrow
        msUntilTarget = (24 * 60 - currentMinutes + targetMinutes) * 60 * 1000
      }

      setTimeout(() => {
        console.log(`${label} - executing callback`)
        callback()
      }, msUntilTarget)
    }

    // Schedule market open (execute orders + update prices)
    scheduleUpdate(marketOpen, "Market Open", () => {
      executeQueuedOrders()
      updateStockPrices(false)
    })

    // Schedule market close (update prices)
    scheduleUpdate(marketClose, "Market Close", () => {
      updateStockPrices(false)
    })
  }, [executeQueuedOrders, updateStockPrices])

  useEffect(() => {
    const initializeApp = async () => {
      // Check session timeout first
      if (!checkSessionTimeout()) {
        return
      }

      try {
        // Try to import and use Supabase
        const { supabase } = await import("@/lib/supabase")

        // Test the connection by getting session
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

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

        // Check if user is admin and redirect if so
        const { data: adminRole } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", session.user?.id)
          .single()

        if (adminRole) {
          console.log("User is admin, redirecting to admin dashboard")
          router.push("/admin")
          return
        }

        setUser(session.user)
        await loadProfile(session.user.id)
        await loadPortfolioFromSupabase(session.user.id)
        await loadQueuedOrders(session.user.id)

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === "SIGNED_OUT" || !session) {
            router.push("/")
          } else if (session) {
            // Check if user is admin
            const { data: adminRole } = await supabase
              .from("admin_roles")
              .select("role")
              .eq("user_id", session.user?.id)
              .single()

            if (adminRole) {
              router.push("/admin")
              return
            }

            setUser(session.user)
            await loadProfile(session.user.id)
            await loadPortfolioFromSupabase(session.user.id)
            await loadQueuedOrders(session.user.id)
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
        loadQueuedOrdersFromLocalStorage()
        setLoading(false)
      }
    }

    initializeApp()
  }, [router, checkSessionTimeout])

  // Update market status every minute and handle market events
  useEffect(() => {
    const updateMarketStatus = async () => {
      const newStatus = await getMarketStatus()
      const wasOpen = marketStatus.isOpen
      setMarketStatus(newStatus)

      // If market just opened, execute queued orders and update prices
      if (!wasOpen && newStatus.isOpen) {
        console.log("Market just opened - executing orders and updating prices")
        executeQueuedOrders()
        updateStockPrices(false)
      }
      // If market just closed, update prices
      else if (wasOpen && !newStatus.isOpen) {
        console.log("Market just closed - updating prices")
        updateStockPrices(false)
      }
    }

    updateMarketStatus() // Initial update
    const interval = setInterval(updateMarketStatus, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [marketStatus.isOpen, executeQueuedOrders, updateStockPrices, getMarketStatus])

  // Schedule market-based updates
  useEffect(() => {
    scheduleMarketUpdates()
  }, [scheduleMarketUpdates])

  // Activity tracking for session timeout
  useEffect(() => {
    const trackActivity = () => {
      localStorage.setItem("lastActivity", Date.now().toString())
    }

    // Track various user activities
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"]
    events.forEach((event) => {
      document.addEventListener(event, trackActivity, true)
    })

    // Check session timeout every 5 minutes
    const timeoutCheck = setInterval(checkSessionTimeout, 5 * 60 * 1000)

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, trackActivity, true)
      })
      clearInterval(timeoutCheck)
    }
  }, [checkSessionTimeout])

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

  const loadQueuedOrders = async (userId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase
        .from("queued_orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error loading queued orders:", error)
        return
      }

      setQueuedOrders(data || [])
    } catch (err) {
      console.error("Error loading queued orders:", err)
    }
  }

  const loadQueuedOrdersFromLocalStorage = () => {
    const savedOrders = localStorage.getItem("queuedOrders")
    if (savedOrders) {
      setQueuedOrders(JSON.parse(savedOrders))
    }
  }

  const cancelQueuedOrder = async (orderId: string) => {
    if (supabaseConfigured) {
      const { supabase } = await import("@/lib/supabase")
      const { error } = await supabase.from("queued_orders").update({ status: "CANCELLED" }).eq("id", orderId)

      if (error) {
        setError("Failed to cancel order")
        return
      }

      await loadQueuedOrders(user.id)
    } else {
      const orders = JSON.parse(localStorage.getItem("queuedOrders") || "[]")
      const orderIndex = orders.findIndex((o: QueuedOrder) => o.id === orderId)
      if (orderIndex >= 0) {
        orders[orderIndex].status = "CANCELLED"
        localStorage.setItem("queuedOrders", JSON.stringify(orders))
        setQueuedOrders(orders)
      }
    }
  }

  const handleLogout = async () => {
    // Clear session tracking
    localStorage.removeItem("lastActivity")

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
      localStorage.removeItem("queuedOrders")
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

    // Get current stock price (try real API first, then simulate)
    try {
      const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
      const data = await response.json()
      if (data.quote) {
        setSelectedStockPrice(Number.parseFloat(data.quote.price))
      } else {
        // Simulate price if API fails
        const simulatedPrice = 50 + Math.random() * 200 // Random price between $50-$250
        setSelectedStockPrice(Number.parseFloat(simulatedPrice.toFixed(2)))
      }
    } catch (error) {
      console.error("Error fetching stock price:", error)
      // Simulate price if API fails
      const simulatedPrice = 50 + Math.random() * 200 // Random price between $50-$250
      setSelectedStockPrice(Number.parseFloat(simulatedPrice.toFixed(2)))
    }

    setIsDialogOpen(false)
    setIsBuyDialogOpen(true)
  }

  const openSellDialog = async (stock: Stock) => {
    // Get current stock price (try real API first, then simulate)
    try {
      const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
      const data = await response.json()
      if (data.quote) {
        setSelectedStockPrice(Number.parseFloat(data.quote.price))
      } else {
        // Simulate price if API fails
        setSelectedStockPrice(simulateStockPrice(stock.price, stock.symbol))
      }
    } catch (error) {
      console.error("Error fetching stock price:", error)
      setSelectedStockPrice(simulateStockPrice(stock.price, stock.symbol))
    }

    setSelectedStockForSale(stock)
    setIsSellDialogOpen(true)
  }

  const buyStock = async () => {
    if (!user || !profile || !selectedStock || sharesToBuy <= 0) return

    const totalCost = selectedStockPrice * sharesToBuy

    // If market is closed, queue the order
    if (!marketStatus.isOpen) {
      const queuedOrder: QueuedOrder = {
        id: crypto.randomUUID(),
        symbol: selectedStock.symbol.toUpperCase(),
        name: selectedStock.name,
        order_type: "BUY",
        shares: sharesToBuy,
        order_price: selectedStockPrice,
        status: "PENDING",
        created_at: new Date().toISOString(),
      }

      if (supabaseConfigured) {
        const { supabase } = await import("@/lib/supabase")
        const { error } = await supabase.from("queued_orders").insert({
          user_id: user.id,
          symbol: queuedOrder.symbol,
          name: queuedOrder.name,
          order_type: queuedOrder.order_type,
          shares: queuedOrder.shares,
          order_price: queuedOrder.order_price,
          status: queuedOrder.status,
        })

        if (error) {
          setError("Failed to queue buy order")
          return
        }

        await loadQueuedOrders(user.id)
      } else {
        const orders = JSON.parse(localStorage.getItem("queuedOrders") || "[]")
        orders.push(queuedOrder)
        localStorage.setItem("queuedOrders", JSON.stringify(orders))
        setQueuedOrders(orders)
      }

      setIsBuyDialogOpen(false)
      setSelectedStock(null)
      setSharesToBuy(1)
      setError("")
      return
    }

    // Market is open, execute immediately
    if (totalCost > profile.balance) {
      setError("Insufficient funds to complete this purchase")
      return
    }

    try {
      // Try to get real-time price, fallback to simulation
      let currentPrice = selectedStockPrice
      let quoteData = {
        change: 0,
        changePercent: 0,
      }

      try {
        const response = await fetch(`/api/stock-quote?symbol=${selectedStock.symbol}`)
        const data = await response.json()

        if (data.quote) {
          currentPrice = Number.parseFloat(data.quote.price)
          quoteData = {
            change: Number.parseFloat(data.quote.change),
            changePercent: Number.parseFloat(data.quote.changePercent),
          }
        } else {
          // Simulate if API fails
          currentPrice = simulateStockPrice(selectedStockPrice, selectedStock.symbol)
          const priceChange = currentPrice - selectedStockPrice
          quoteData = {
            change: priceChange,
            changePercent: (priceChange / selectedStockPrice) * 100,
          }
        }
      } catch (apiError) {
        console.log("API failed, using simulated price")
        currentPrice = simulateStockPrice(selectedStockPrice, selectedStock.symbol)
        const priceChange = currentPrice - selectedStockPrice
        quoteData = {
          change: priceChange,
          changePercent: (priceChange / selectedStockPrice) * 100,
        }
      }

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
              change: quoteData.change,
              change_percent: quoteData.changePercent,
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
            change: quoteData.change,
            change_percent: quoteData.changePercent,
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
            change: quoteData.change,
            change_percent: quoteData.changePercent,
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
            change: quoteData.change,
            change_percent: quoteData.changePercent,
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
    } catch (error) {
      setError("Error buying stock")
      console.error("Error buying stock:", error)
    }
  }

  const sellStock = async (stock: Stock, sharesToSell: number) => {
    const actualShares = stock.shares || 1
    if (!user || !profile || sharesToSell <= 0 || sharesToSell > actualShares) return

    // If market is closed, queue the order
    if (!marketStatus.isOpen) {
      const queuedOrder: QueuedOrder = {
        id: crypto.randomUUID(),
        symbol: stock.symbol,
        name: stock.name,
        order_type: "SELL",
        shares: sharesToSell,
        order_price: selectedStockPrice,
        status: "PENDING",
        created_at: new Date().toISOString(),
        portfolio_id: stock.id,
      }

      if (supabaseConfigured) {
        const { supabase } = await import("@/lib/supabase")
        const { error } = await supabase.from("queued_orders").insert({
          user_id: user.id,
          symbol: queuedOrder.symbol,
          name: queuedOrder.name,
          order_type: queuedOrder.order_type,
          shares: queuedOrder.shares,
          order_price: queuedOrder.order_price,
          status: queuedOrder.status,
          portfolio_id: queuedOrder.portfolio_id,
        })

        if (error) {
          setError("Failed to queue sell order")
          return
        }

        await loadQueuedOrders(user.id)
      } else {
        const orders = JSON.parse(localStorage.getItem("queuedOrders") || "[]")
        orders.push(queuedOrder)
        localStorage.setItem("queuedOrders", JSON.stringify(orders))
        setQueuedOrders(orders)
      }

      return
    }

    // Market is open, execute immediately
    try {
      // Try to get real-time price, fallback to simulation
      let currentPrice = selectedStockPrice
      let quoteData = {
        change: 0,
        changePercent: 0,
      }

      try {
        const response = await fetch(`/api/stock-quote?symbol=${stock.symbol}`)
        const data = await response.json()

        if (data.quote) {
          currentPrice = Number.parseFloat(data.quote.price)
          quoteData = {
            change: Number.parseFloat(data.quote.change),
            changePercent: Number.parseFloat(data.quote.changePercent),
          }
        } else {
          // Simulate if API fails
          currentPrice = simulateStockPrice(stock.price, stock.symbol)
          const priceChange = currentPrice - stock.price
          quoteData = {
            change: priceChange,
            changePercent: (priceChange / stock.price) * 100,
          }
        }
      } catch (apiError) {
        console.log("API failed, using simulated price")
        currentPrice = simulateStockPrice(stock.price, stock.symbol)
        const priceChange = currentPrice - stock.price
        quoteData = {
          change: priceChange,
          changePercent: (priceChange / stock.price) * 100,
        }
      }

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
              change: quoteData.change,
              change_percent: quoteData.changePercent,
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
            change: quoteData.change,
            change_percent: quoteData.changePercent,
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
                <div className="text-right text-xs">
                  <div className={`font-medium ${marketStatus.isOpen ? "text-green-600" : "text-red-600"}`}>
                    {marketStatus.isOpen ? "🟢 Market Open" : "🔴 Market Closed"}
                  </div>
                  <div className="text-gray-500">
                    {marketStatus.nextEvent} in {marketStatus.timeUntil}
                  </div>
                </div>
                <Button variant="outline" onClick={() => updateStockPrices(true)} disabled={refreshing}>
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
                {lastRefresh && <span className="text-xs text-gray-500">Last: {lastRefresh.toLocaleTimeString()}</span>}
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

        {/* Market status and order queuing info */}
        <Alert className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            {marketStatus.isOpen ? <strong>Market is open:</strong> : <strong>Market is closed:</strong>}
            {marketStatus.isOpen
              ? " Orders execute immediately. Stock prices update in real-time."
              : ` Orders will be queued and executed when market opens. ${marketStatus.nextEvent} in ${marketStatus.timeUntil}.`}
          </AlertDescription>
        </Alert>

        {/* Queued Orders */}
        <QueuedOrders orders={queuedOrders} onCancelOrder={cancelQueuedOrder} marketStatus={marketStatus} />

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
                {marketStatus.isOpen ? "Buy Stocks" : "Queue Buy Order"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Search Stocks to Buy</DialogTitle>
                <DialogDescription>
                  {marketStatus.isOpen
                    ? "Search for stocks by symbol or company name"
                    : "Orders will be queued and executed when market opens"}
                </DialogDescription>
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
                          {marketStatus.isOpen ? "Buy" : "Queue"}
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
              <DialogTitle>
                {marketStatus.isOpen ? "Buy" : "Queue Buy Order for"} {selectedStock?.symbol}
              </DialogTitle>
              <DialogDescription>
                {selectedStock?.name}
                {!marketStatus.isOpen && (
                  <div className="mt-2 text-orange-600 text-sm">
                    Market is closed. This order will be executed when market opens.
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Current Price</Label>
                <div className="text-2xl font-bold">${selectedStockPrice.toFixed(2)}</div>
                {!marketStatus.isOpen && (
                  <div className="text-xs text-gray-500">Reference price - actual execution price may vary</div>
                )}
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
                <Label>Estimated Cost</Label>
                <div className="text-xl font-bold">${(selectedStockPrice * sharesToBuy).toLocaleString()}</div>
                {!marketStatus.isOpen && (
                  <div className="text-xs text-gray-500">Estimated - final cost depends on execution price</div>
                )}
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
                  {selectedStockPrice * sharesToBuy > profile.balance
                    ? "Insufficient Funds"
                    : marketStatus.isOpen
                      ? "Buy Shares"
                      : "Queue Order"}
                </Button>
                <Button variant="outline" onClick={() => setIsBuyDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Sell Stock Dialog */}
        <SellStockDialog
          stock={selectedStockForSale}
          isOpen={isSellDialogOpen}
          onClose={() => setIsSellDialogOpen(false)}
          onSell={sellStock}
          currentPrice={selectedStockPrice}
        />

        {/* Portfolio Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Portfolio</CardTitle>
            <CardDescription>
              Track your stock investments and performance
              {marketStatus.isOpen ? " (live trading)" : " (orders will be queued)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {portfolio.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No stocks in your portfolio yet</p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {marketStatus.isOpen ? "Buy Your First Stock" : "Queue Your First Order"}
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
                              {marketStatus.isOpen ? "Buy More" : "Queue Buy"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openSellDialog(stock)}>
                              {marketStatus.isOpen ? "Sell" : "Queue Sell"}
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
