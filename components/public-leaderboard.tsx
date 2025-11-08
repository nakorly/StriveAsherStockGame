"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, Medal, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  display_name: string
  total_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  updated_at: string
}

export function PublicLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null)
  const [holdings, setHoldings] = useState<Array<{ symbol: string; name: string; shares: number; price: number; purchase_price: number; total_value: number; change: number; change_percent: number }>>([])
  const [history, setHistory] = useState<Array<{ year: number; month: number; start_total_value: number; end_total_value: number; return_percent: number; updated_at: string }>>([])

  useEffect(() => {
    loadLeaderboard()
  }, [])

  const loadLeaderboard = async () => {
    setLoading(true)
    try {
      const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase")

      if (!isSupabaseConfigured()) {
        console.log("Supabase not configured, using demo data")
        loadDemoData()
        setLoading(false)
        return
      }

      const supabase = await getSupabase()

      if (!supabase || !supabase.from || typeof supabase.from !== "function") {
        console.log("Invalid Supabase client, using demo data")
        loadDemoData()
        setLoading(false)
        return
      }

      // Update leaderboard first
      await supabase.rpc("update_leaderboard_with_usernames")

      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("total_gain_loss_percent", { ascending: false })
        .limit(10)

      if (error) throw error

      setLeaderboard(data || [])
    } catch (err) {
      console.error("Error loading leaderboard:", err)
      loadDemoData()
    } finally {
      setLoading(false)
    }
  }

  const openDetails = async (entry: LeaderboardEntry) => {
    setSelectedUser({ id: entry.user_id, name: entry.display_name || entry.username })
    setDetailsOpen(true)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/leaderboard-details?user_id=${encodeURIComponent(entry.user_id)}`)
      const data = await res.json()
      if (data.success) {
        setHoldings(data.holdings || [])
        setHistory(data.history || [])
      } else {
        setHoldings([])
        setHistory([])
      }
    } catch (e) {
      setHoldings([])
      setHistory([])
    } finally {
      setDetailsLoading(false)
    }
  }

  const loadDemoData = () => {
    setLeaderboard([
      {
        rank: 1,
        user_id: "demo-1",
        username: "TradingPro",
        display_name: "Trading Pro",
        total_value: 125000,
        total_gain_loss: 25000,
        total_gain_loss_percent: 25.0,
        updated_at: new Date().toISOString(),
      },
      {
        rank: 2,
        user_id: "demo-2",
        username: "StockWiz",
        display_name: "Stock Wizard",
        total_value: 118000,
        total_gain_loss: 18000,
        total_gain_loss_percent: 18.0,
        updated_at: new Date().toISOString(),
      },
      {
        rank: 3,
        user_id: "demo-3",
        username: "MarketMaster",
        display_name: "Market Master",
        total_value: 112000,
        total_gain_loss: 12000,
        total_gain_loss_percent: 12.0,
        updated_at: new Date().toISOString(),
      },
    ])
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />
      default:
        return null
    }
  }

  const getRankBadge = (rank: number) => {
    if (rank <= 3) {
      return <Badge variant="default">#{rank}</Badge>
    }
    return <Badge variant="secondary">#{rank}</Badge>
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500">Loading leaderboard...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Leaderboard
        </CardTitle>
        <CardDescription>Ranked by month-to-date return %</CardDescription>
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No traders ranked yet.</p>
            <p className="text-sm text-gray-400">Start trading to see your position!</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Trader</TableHead>
                <TableHead>Return % (MTD)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((entry, i) => {
                const displayedRank = i + 1
                return (
                <TableRow key={entry.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRankIcon(displayedRank)}
                      {getRankBadge(displayedRank)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.display_name || entry.username}</div>
                      {entry.display_name && entry.display_name !== entry.username && (
                        <div className="text-sm text-gray-500">@{entry.username}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`font-medium ${entry.total_gain_loss_percent >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {entry.total_gain_loss_percent >= 0 ? "+" : ""}
                      {entry.total_gain_loss_percent.toFixed(2)}%
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => openDetails(entry)}>
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Trader Details</DialogTitle>
            <DialogDescription>
              {selectedUser ? `Holdings and monthly performance for ${selectedUser.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="py-6 text-center text-gray-500">Loading details...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Current Holdings</h3>
                {holdings.length === 0 ? (
                  <div className="text-sm text-gray-500">No holdings to display.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Shares</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdings.map((h) => (
                        <TableRow key={h.symbol}>
                          <TableCell className="font-medium">{h.symbol}</TableCell>
                          <TableCell>{h.shares}</TableCell>
                          <TableCell>${(h.total_value || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div>
                <h3 className="font-semibold mb-2">Previous Months</h3>
                {history.length === 0 ? (
                  <div className="text-sm text-gray-500">No monthly history.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Return</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((r) => (
                        <TableRow key={`${r.year}-${r.month}`}>
                          <TableCell>{r.year}-{String(r.month).padStart(2, '0')}</TableCell>
                          <TableCell>${Number(r.start_total_value || 0).toLocaleString()}</TableCell>
                          <TableCell>${Number(r.end_total_value || 0).toLocaleString()}</TableCell>
                          <TableCell className={r.return_percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {Number(r.return_percent || 0).toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
