"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, Medal, Award } from "lucide-react"

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
        .order("rank", { ascending: true })
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
        <CardDescription>Top performing traders in the game</CardDescription>
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
                <TableHead>Total Value</TableHead>
                <TableHead>Gain/Loss</TableHead>
                <TableHead>Return %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((entry) => (
                <TableRow key={entry.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRankIcon(entry.rank)}
                      {getRankBadge(entry.rank)}
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
                  <TableCell className="font-medium">
                    ${entry.total_value.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className={`font-medium ${entry.total_gain_loss >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {entry.total_gain_loss >= 0 ? "+" : ""}${entry.total_gain_loss.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`font-medium ${entry.total_gain_loss_percent >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {entry.total_gain_loss_percent >= 0 ? "+" : ""}
                      {entry.total_gain_loss_percent.toFixed(2)}%
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}