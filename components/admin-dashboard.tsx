"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Settings, Users, DollarSign, Clock, Activity, Trophy, Shield, RefreshCw, UserPlus } from "lucide-react"

interface AdminUser {
  id: string
  email: string
  balance: number
  total_value: number
  created_at: string
  last_sign_in_at: string
  is_admin?: boolean
}

interface MarketSettings {
  id?: string
  market_open_time: string
  market_close_time: string
  timezone: string
  trading_days: number[]
  is_market_open_override: boolean | null
}

interface GameSettings {
  [key: string]: any
}

interface AdminActivity {
  id: string
  admin_email: string
  action: string
  target_user_email?: string
  details: any
  created_at: string
}

interface LeaderboardEntry {
  rank: number
  user_email: string
  total_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
}

interface AdminDashboardProps {
  user: any
  onLogout: () => void
}

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [marketSettings, setMarketSettings] = useState<MarketSettings | null>(null)
  const [gameSettings, setGameSettings] = useState<GameSettings>({})
  const [adminActivity, setAdminActivity] = useState<AdminActivity[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [balanceAdjustment, setBalanceAdjustment] = useState<number>(0)
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false)
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadUsers(), loadMarketSettings(), loadGameSettings(), loadAdminActivity(), loadLeaderboard()])
    } catch (err) {
      setError("Failed to load admin data")
      console.error("Admin data loading error:", err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const { supabase } = await import("@/lib/supabase")

      // Get all users with their profiles and portfolio values
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select(`
          id,
          balance,
          created_at
        `)

      if (profilesError) throw profilesError

      // Get admin roles
      const { data: adminRoles, error: adminError } = await supabase.from("admin_roles").select("user_id, role")

      if (adminError) console.warn("Cannot fetch admin roles:", adminError)

      // Get user emails from auth.users (requires service role key)
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()

      if (authError) {
        console.warn("Cannot fetch user emails (requires service role key):", authError)
      }

      // Get portfolio values
      const { data: portfolios, error: portfolioError } = await supabase
        .from("portfolios")
        .select("user_id, total_value")

      if (portfolioError) throw portfolioError

      // Combine data
      const usersData =
        profiles?.map((profile) => {
          const authUser = authUsers?.users.find((u) => u.id === profile.id)
          const userPortfolios = portfolios?.filter((p) => p.user_id === profile.id) || []
          const totalPortfolioValue = userPortfolios.reduce((sum, p) => sum + (p.total_value || 0), 0)
          const isAdmin = adminRoles?.some((ar) => ar.user_id === profile.id)

          return {
            id: profile.id,
            email: authUser?.email || "Unknown",
            balance: profile.balance,
            total_value: profile.balance + totalPortfolioValue,
            created_at: profile.created_at,
            last_sign_in_at: authUser?.last_sign_in_at || null,
            is_admin: isAdmin,
          }
        }) || []

      setUsers(usersData)
    } catch (err) {
      console.error("Error loading users:", err)
    }
  }

  const loadMarketSettings = async () => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase.from("market_settings").select("*").single()

      if (error) throw error
      setMarketSettings(data)
    } catch (err) {
      console.error("Error loading market settings:", err)
    }
  }

  const loadGameSettings = async () => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase.from("game_settings").select("*")

      if (error) throw error

      const settings: GameSettings = {}
      data?.forEach((setting) => {
        settings[setting.setting_key] = setting.setting_value
      })
      setGameSettings(settings)
    } catch (err) {
      console.error("Error loading game settings:", err)
    }
  }

  const loadAdminActivity = async () => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { data, error } = await supabase
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error

      // Note: In a real implementation, you'd join with auth.users to get emails
      const activities =
        data?.map((activity) => ({
          ...activity,
          admin_email: "Admin", // Would need service role to get actual email
          target_user_email: activity.target_user_id ? "User" : undefined,
        })) || []

      setAdminActivity(activities)
    } catch (err) {
      console.error("Error loading admin activity:", err)
    }
  }

  const loadLeaderboard = async () => {
    try {
      const { supabase } = await import("@/lib/supabase")

      // Update leaderboard first
      await supabase.rpc("update_leaderboard")

      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("rank", { ascending: true })
        .limit(20)

      if (error) throw error

      // Note: Would need to join with auth.users to get emails
      const leaderboardData =
        data?.map((entry) => ({
          ...entry,
          user_email: "User", // Would need service role to get actual email
        })) || []

      setLeaderboard(leaderboardData)
    } catch (err) {
      console.error("Error loading leaderboard:", err)
    }
  }

  const updateMarketSettings = async (newSettings: Partial<MarketSettings>) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { error } = await supabase
        .from("market_settings")
        .update({
          ...newSettings,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("id", marketSettings?.id)

      if (error) throw error

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "UPDATE_MARKET_SETTINGS",
        details: newSettings,
      })

      await loadMarketSettings()
      setError("")
    } catch (err) {
      setError("Failed to update market settings")
      console.error("Market settings update error:", err)
    }
  }

  const updateGameSettings = async (settingKey: string, settingValue: any) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      const { error } = await supabase.from("game_settings").upsert({
        setting_key: settingKey,
        setting_value: settingValue,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })

      if (error) throw error

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "UPDATE_GAME_SETTINGS",
        details: { setting_key: settingKey, setting_value: settingValue },
      })

      await loadGameSettings()
      setError("")
    } catch (err) {
      setError("Failed to update game settings")
      console.error("Game settings update error:", err)
    }
  }

  const adjustUserBalance = async () => {
    if (!selectedUser || balanceAdjustment === 0) return

    try {
      const { supabase } = await import("@/lib/supabase")
      const newBalance = selectedUser.balance + balanceAdjustment

      const { error } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", selectedUser.id)

      if (error) throw error

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "ADJUST_USER_BALANCE",
        target_user_id: selectedUser.id,
        details: {
          old_balance: selectedUser.balance,
          adjustment: balanceAdjustment,
          new_balance: newBalance,
        },
      })

      await loadUsers()
      setIsBalanceDialogOpen(false)
      setSelectedUser(null)
      setBalanceAdjustment(0)
      setError("")
    } catch (err) {
      setError("Failed to adjust user balance")
      console.error("Balance adjustment error:", err)
    }
  }

  const resetUserPortfolio = async (userId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")

      // Delete all portfolio positions
      await supabase.from("portfolios").delete().eq("user_id", userId)

      // Reset balance to starting amount
      const startingBalance = gameSettings.starting_balance || 100000
      await supabase.from("profiles").update({ balance: startingBalance }).eq("id", userId)

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "RESET_USER_PORTFOLIO",
        target_user_id: userId,
        details: { starting_balance: startingBalance },
      })

      await loadUsers()
      setError("")
    } catch (err) {
      setError("Failed to reset user portfolio")
      console.error("Portfolio reset error:", err)
    }
  }

  const makeUserAdmin = async (userId: string, userEmail: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")

      // Add admin role
      const { error } = await supabase.from("admin_roles").insert({
        user_id: userId,
        role: "ADMIN",
        permissions: '["user_management", "market_control"]',
        created_by: user.id,
      })

      if (error) throw error

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "GRANT_ADMIN_ROLE",
        target_user_id: userId,
        details: { user_email: userEmail, role: "ADMIN" },
      })

      await loadUsers()
      setError("")
    } catch (err) {
      setError("Failed to grant admin role")
      console.error("Admin role grant error:", err)
    }
  }

  const removeUserAdmin = async (userId: string, userEmail: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")

      // Remove admin role
      const { error } = await supabase.from("admin_roles").delete().eq("user_id", userId)

      if (error) throw error

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "REVOKE_ADMIN_ROLE",
        target_user_id: userId,
        details: { user_email: userEmail },
      })

      await loadUsers()
      setError("")
    } catch (err) {
      setError("Failed to revoke admin role")
      console.error("Admin role revoke error:", err)
    }
  }

  const createAdminByEmail = async () => {
    if (!newAdminEmail) return

    try {
      const { supabase } = await import("@/lib/supabase")

      // Find user by email
      const targetUser = users.find((u) => u.email.toLowerCase() === newAdminEmail.toLowerCase())

      if (!targetUser) {
        setError("User not found with that email address")
        return
      }

      if (targetUser.is_admin) {
        setError("User is already an admin")
        return
      }

      await makeUserAdmin(targetUser.id, targetUser.email)
      setIsAdminDialogOpen(false)
      setNewAdminEmail("")
    } catch (err) {
      setError("Failed to create admin")
      console.error("Admin creation error:", err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-600">Trading Game Administration</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Admin: {user.email}
              </Badge>
              <Button
                variant="outline"
                onClick={loadAdminData}
                disabled={loading}
                className="flex items-center gap-2 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh Data
              </Button>
              <Button variant="outline" onClick={onLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: "overview", label: "Overview", icon: DollarSign },
            { id: "users", label: "Users", icon: Users },
            { id: "market", label: "Market", icon: Clock },
            { id: "settings", label: "Game Settings", icon: Settings },
            { id: "leaderboard", label: "Leaderboard", icon: Trophy },
            { id: "activity", label: "Activity Log", icon: Activity },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Overview Dashboard */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.length}</div>
                  <p className="text-xs text-muted-foreground">{users.filter((u) => u.is_admin).length} admins</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${users.reduce((sum, user) => sum + user.total_value, 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">Across all users</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Market Status</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {marketSettings?.is_market_open_override === true
                      ? "🟢 Open"
                      : marketSettings?.is_market_open_override === false
                        ? "🔴 Closed"
                        : "🟡 Auto"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {marketSettings?.is_market_open_override !== null ? "Manual Override" : "Automatic"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Admin actions logged</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{adminActivity.length}</div>
                  <p className="text-xs text-muted-foreground">Admin actions logged</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common administrative tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button
                    onClick={() => updateMarketSettings({ is_market_open_override: true })}
                    className="flex flex-col items-center gap-2 h-20"
                  >
                    <Clock className="h-6 w-6" />
                    Force Market Open
                  </Button>
                  <Button
                    onClick={() => updateMarketSettings({ is_market_open_override: false })}
                    variant="destructive"
                    className="flex flex-col items-center gap-2 h-20"
                  >
                    <Clock className="h-6 w-6" />
                    Force Market Closed
                  </Button>
                  <Button
                    onClick={() => updateMarketSettings({ is_market_open_override: null })}
                    variant="outline"
                    className="flex flex-col items-center gap-2 h-20"
                  >
                    <RefreshCw className="h-6 w-6" />
                    Auto Market Mode
                  </Button>
                  <Button
                    onClick={() => setActiveTab("users")}
                    variant="outline"
                    className="flex flex-col items-center gap-2 h-20"
                  >
                    <Users className="h-6 w-6" />
                    Manage Users
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recent Users */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Users</CardTitle>
                <CardDescription>Latest user registrations</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.slice(0, 5).map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>${user.total_value.toLocaleString()}</TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {user.is_admin ? (
                            <Badge variant="secondary">Admin</Badge>
                          ) : (
                            <Badge variant="outline">User</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Users Management */}
        {activeTab === "users" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription>Manage user accounts, balances, and admin roles</CardDescription>
                </div>
                <Button onClick={() => setIsAdminDialogOpen(true)} className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Make Admin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.is_admin ? (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <Shield className="h-3 w-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline">User</Badge>
                        )}
                      </TableCell>
                      <TableCell>${user.balance.toLocaleString()}</TableCell>
                      <TableCell>${user.total_value.toLocaleString()}</TableCell>
                      <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedUser(user)
                              setIsBalanceDialogOpen(true)
                            }}
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Adjust Balance
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => resetUserPortfolio(user.id)}>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reset Portfolio
                          </Button>
                          {user.is_admin ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeUserAdmin(user.id, user.email)}
                            >
                              Remove Admin
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => makeUserAdmin(user.id, user.email)}>
                              <Shield className="h-3 w-3 mr-1" />
                              Make Admin
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Market Settings */}
        {activeTab === "market" && marketSettings && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Market Hours
                </CardTitle>
                <CardDescription>Configure trading hours and market status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="openTime">Market Open Time</Label>
                    <Input
                      id="openTime"
                      type="time"
                      value={marketSettings.market_open_time}
                      onChange={(e) => updateMarketSettings({ market_open_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="closeTime">Market Close Time</Label>
                    <Input
                      id="closeTime"
                      type="time"
                      value={marketSettings.market_close_time}
                      onChange={(e) => updateMarketSettings({ market_close_time: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={marketSettings.timezone}
                    onValueChange={(value) => updateMarketSettings({ timezone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={marketSettings.is_market_open_override === true}
                    onCheckedChange={(checked) =>
                      updateMarketSettings({ is_market_open_override: checked ? true : null })
                    }
                  />
                  <Label>Force Market Open (Override Schedule)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={marketSettings.is_market_open_override === false}
                    onCheckedChange={(checked) =>
                      updateMarketSettings({ is_market_open_override: checked ? false : null })
                    }
                  />
                  <Label>Force Market Closed (Override Schedule)</Label>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Game Settings */}
        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Game Settings
              </CardTitle>
              <CardDescription>Configure game rules and parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Starting Balance</Label>
                  <Input
                    type="number"
                    value={gameSettings.starting_balance || 100000}
                    onChange={(e) => updateGameSettings("starting_balance", Number(e.target.value))}
                    onBlur={(e) => updateGameSettings("starting_balance", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Daily Trading Limit</Label>
                  <Input
                    type="number"
                    value={gameSettings.daily_trading_limit || 10}
                    onChange={(e) => updateGameSettings("daily_trading_limit", Number(e.target.value))}
                    onBlur={(e) => updateGameSettings("daily_trading_limit", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Trading Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={gameSettings.trading_fee || 0}
                    onChange={(e) => updateGameSettings("trading_fee", Number(e.target.value))}
                    onBlur={(e) => updateGameSettings("trading_fee", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Max Position Size (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    max="1"
                    value={gameSettings.max_position_size || 0.2}
                    onChange={(e) => updateGameSettings("max_position_size", Number(e.target.value))}
                    onBlur={(e) => updateGameSettings("max_position_size", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={gameSettings.allow_short_selling === true || gameSettings.allow_short_selling === "true"}
                    onCheckedChange={(checked) => updateGameSettings("allow_short_selling", checked)}
                  />
                  <Label>Allow Short Selling</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={gameSettings.allow_margin_trading === true || gameSettings.allow_margin_trading === "true"}
                    onCheckedChange={(checked) => updateGameSettings("allow_margin_trading", checked)}
                  />
                  <Label>Allow Margin Trading</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={gameSettings.leaderboard_enabled === true || gameSettings.leaderboard_enabled === "true"}
                    onCheckedChange={(checked) => updateGameSettings("leaderboard_enabled", checked)}
                  />
                  <Label>Enable Leaderboard</Label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Game Start Date</Label>
                  <Input
                    type="date"
                    value={gameSettings.game_start_date ? JSON.parse(gameSettings.game_start_date) : "2024-01-01"}
                    onChange={(e) => updateGameSettings("game_start_date", JSON.stringify(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Game End Date</Label>
                  <Input
                    type="date"
                    value={gameSettings.game_end_date ? JSON.parse(gameSettings.game_end_date) : "2024-12-31"}
                    onChange={(e) => updateGameSettings("game_end_date", JSON.stringify(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        {activeTab === "leaderboard" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Leaderboard
              </CardTitle>
              <CardDescription>Top performing traders</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Gain/Loss</TableHead>
                    <TableHead>Return %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry) => (
                    <TableRow key={entry.rank}>
                      <TableCell>
                        <Badge variant={entry.rank <= 3 ? "default" : "secondary"}>#{entry.rank}</Badge>
                      </TableCell>
                      <TableCell>{entry.user_email}</TableCell>
                      <TableCell>${entry.total_value.toLocaleString()}</TableCell>
                      <TableCell className={entry.total_gain_loss >= 0 ? "text-green-600" : "text-red-600"}>
                        {entry.total_gain_loss >= 0 ? "+" : ""}${entry.total_gain_loss.toLocaleString()}
                      </TableCell>
                      <TableCell className={entry.total_gain_loss_percent >= 0 ? "text-green-600" : "text-red-600"}>
                        {entry.total_gain_loss_percent >= 0 ? "+" : ""}
                        {entry.total_gain_loss_percent.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Activity Log */}
        {activeTab === "activity" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Admin Activity Log
              </CardTitle>
              <CardDescription>Recent administrative actions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target User</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminActivity.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>{activity.admin_email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{activity.action.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>{activity.target_user_email || "-"}</TableCell>
                      <TableCell>
                        <pre className="text-xs">{JSON.stringify(activity.details, null, 2)}</pre>
                      </TableCell>
                      <TableCell>{new Date(activity.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Balance Adjustment Dialog */}
        <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust User Balance</DialogTitle>
              <DialogDescription>Modify the cash balance for {selectedUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Current Balance</Label>
                <div className="text-2xl font-bold">${selectedUser?.balance.toLocaleString()}</div>
              </div>
              <div>
                <Label htmlFor="adjustment">Adjustment Amount</Label>
                <Input
                  id="adjustment"
                  type="number"
                  value={balanceAdjustment}
                  onChange={(e) => setBalanceAdjustment(Number(e.target.value))}
                  placeholder="Enter positive or negative amount"
                />
              </div>
              <div>
                <Label>New Balance</Label>
                <div className="text-xl font-bold">
                  ${((selectedUser?.balance || 0) + balanceAdjustment).toLocaleString()}
                </div>
              </div>
              <div className="flex space-x-2">
                <Button onClick={adjustUserBalance} disabled={balanceAdjustment === 0}>
                  Apply Adjustment
                </Button>
                <Button variant="outline" onClick={() => setIsBalanceDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Admin Dialog */}
        <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Admin Role</DialogTitle>
              <DialogDescription>Enter the email address of the user to make an admin</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="adminEmail">User Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="flex space-x-2">
                <Button onClick={createAdminByEmail} disabled={!newAdminEmail}>
                  Grant Admin Role
                </Button>
                <Button variant="outline" onClick={() => setIsAdminDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
