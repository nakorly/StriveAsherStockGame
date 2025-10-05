"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { RefreshCw, Copy, Check, Eye, EyeOff, Shield, User } from "lucide-react"

// Simple configuration check without importing Supabase
function isSupabaseConfigured(): boolean {
  if (typeof window === "undefined") return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("https://"))
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [isLogin, setIsLogin] = useState(true)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [resetMessage, setResetMessage] = useState("")
  const [resetError, setResetError] = useState("")
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [supabaseAvailable, setSupabaseAvailable] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [suggestedPassword, setSuggestedPassword] = useState("")
  const [passwordCopied, setPasswordCopied] = useState(false)
  const router = useRouter()

  // Admin credentials (hidden from UI)
  const ADMIN_EMAIL = "greencheez@proton.me"
  const ADMIN_PASSWORD = "SecureTrader01!"

  // Password strength indicators
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: "",
    color: "text-gray-500",
  })

  useEffect(() => {
    const initializeAuth = async () => {
      // Check if we're on the client side
      if (typeof window === "undefined") {
        return
      }

      // Check if Supabase is configured
      const configured = isSupabaseConfigured()

      if (!configured) {
        console.log("Supabase not configured, using demo mode")
        setSupabaseAvailable(false)
        return
      }

      // Try to test Supabase availability without importing it initially
      console.log("Supabase appears configured, testing availability...")

      // Use a very short timeout to test if Supabase can be loaded
      const testSupabase = async () => {
        try {
          // Only try to load Supabase if we really need it
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))

          const loadPromise = import("@/lib/supabase").then(async (module) => {
            const supabase = await module.getSupabase()
            if (supabase) {
              // Quick test
              await supabase.auth.getSession()
              return true
            }
            return false
          })

          const result = await Promise.race([loadPromise, timeoutPromise])

          if (result) {
            console.log("Supabase is available")
            setSupabaseAvailable(true)

            // Now we can safely use Supabase
            const { getSupabase } = await import("@/lib/supabase")
            const supabase = await getSupabase()

            if (supabase) {
              // Check for existing session
              const {
                data: { session },
              } = await supabase.auth.getSession()

              if (session) {
                // Check if user is admin
                try {
                  const { data: adminRole } = await supabase
                    .from("admin_roles")
                    .select("role")
                    .eq("user_id", session.user?.id)
                    .single()

                  if (adminRole) {
                    router.push("/admin")
                  } else {
                    router.push("/dashboard")
                  }
                  return
                } catch (adminCheckError) {
                  console.warn("Could not check admin role:", adminCheckError)
                  router.push("/dashboard")
                  return
                }
              }

              // Listen for auth changes
              const {
                data: { subscription },
              } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === "SIGNED_OUT" || !session) {
                  // Stay on login page
                } else if (session) {
                  // Check if user is admin
                  try {
                    const { data: adminRole } = await supabase
                      .from("admin_roles")
                      .select("role")
                      .eq("user_id", session.user?.id)
                      .single()

                    console.log("Session admin check:", { adminRole })

                    if (adminRole) {
                      window.location.href = "/admin"
                    } else {
                      router.push("/dashboard")
                    }
                  } catch (adminCheckError) {
                    console.warn("Could not check admin role:", adminCheckError)
                    router.push("/dashboard")
                  }
                }
              })

              return () => subscription.unsubscribe()
            }
          }
        } catch (error) {
          console.log("Supabase not available, using demo mode:", error)
          setSupabaseAvailable(false)
        }
      }

      await testSupabase()
    }

    initializeAuth()
  }, [router])

  // Clear fields when switching modes
  useEffect(() => {
    setEmail("")
    setPassword("")
    setError("")
    setMessage("")
  }, [isAdminMode])

  // Generate strong password
  const generateStrongPassword = () => {
    const lowercase = "abcdefghijklmnopqrstuvwxyz"
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const numbers = "0123456789"
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?"

    let password = ""

    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)]
    password += uppercase[Math.floor(Math.random() * uppercase.length)]
    password += numbers[Math.floor(Math.random() * numbers.length)]
    password += symbols[Math.floor(Math.random() * symbols.length)]

    // Fill the rest with random characters from all categories
    const allChars = lowercase + uppercase + numbers + symbols
    for (let i = 4; i < 16; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)]
    }

    // Shuffle the password
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("")
  }

  // Check password strength
  const checkPasswordStrength = (pwd: string) => {
    if (!pwd) {
      setPasswordStrength({ score: 0, feedback: "", color: "text-gray-500" })
      return
    }

    let score = 0
    const feedback = []

    // Length check
    if (pwd.length >= 8) score += 1
    else feedback.push("at least 8 characters")

    // Lowercase check
    if (/[a-z]/.test(pwd)) score += 1
    else feedback.push("lowercase letters")

    // Uppercase check
    if (/[A-Z]/.test(pwd)) score += 1
    else feedback.push("uppercase letters")

    // Number check
    if (/\d/.test(pwd)) score += 1
    else feedback.push("numbers")

    // Symbol check
    if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)) score += 1
    else feedback.push("special characters")

    let strengthText = ""
    let color = ""

    if (score <= 2) {
      strengthText = "Weak"
      color = "text-red-500"
    } else if (score <= 3) {
      strengthText = "Fair"
      color = "text-yellow-500"
    } else if (score <= 4) {
      strengthText = "Good"
      color = "text-blue-500"
    } else {
      strengthText = "Strong"
      color = "text-green-500"
    }

    const feedbackText = feedback.length > 0 ? `Add: ${feedback.join(", ")}` : "Password meets all requirements"

    setPasswordStrength({
      score,
      feedback: `${strengthText} - ${feedbackText}`,
      color,
    })
  }

  // Handle password change
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)
    if (!isLogin && !isAdminMode) {
      checkPasswordStrength(newPassword)
    }
  }

  // Use suggested password
  const useSuggestedPassword = () => {
    const newPassword = generateStrongPassword()
    setSuggestedPassword(newPassword)
    setPassword(newPassword)
    checkPasswordStrength(newPassword)
  }

  // Copy password to clipboard
  const copyPassword = async (passwordToCopy: string) => {
    try {
      await navigator.clipboard.writeText(passwordToCopy)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy password:", err)
    }
  }

  // Setup default admin account
  const setupDefaultAdmin = async () => {
    if (!supabaseAvailable) {
      setError("Supabase is required for admin setup but is not available")
      return
    }

    setLoading(true)
    setError("")
    setMessage("Setting up admin account...")

    try {
      const { getSupabase } = await import("@/lib/supabase")
      const supabase = await getSupabase()

      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      // First, try to sign up the admin user
      setMessage("Creating admin account...")
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      })

      let userId = signUpData?.user?.id

      // Handle different signup scenarios
      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setMessage("Admin account exists, checking credentials...")

          // Wait for rate limit to reset
          await new Promise((resolve) => setTimeout(resolve, 8000))

          // Try to sign in to get the user ID
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          })

          if (signInError) {
            if (signInError.message.includes("7 seconds")) {
              setError("Please wait a moment and try again. Supabase has rate limiting on authentication requests.")
              setLoading(false)
              return
            }
            throw signInError
          }
          userId = signInData.user?.id
        } else if (signUpError.message.includes("7 seconds")) {
          setError("Please wait a moment and try again. Supabase has rate limiting on authentication requests.")
          setLoading(false)
          return
        } else {
          throw signUpError
        }
      }

      if (!userId) {
        throw new Error("Could not get user ID")
      }

      setMessage("Setting up admin privileges...")

      // Wait a bit before making the next request
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Create profile first
      await supabase.from("profiles").upsert({
        id: userId,
        balance: 1000000.0,
      })

      // Create admin role with proper JSON syntax
      const { error: adminRoleError } = await supabase.from("admin_roles").upsert({
        user_id: userId,
        role: "SUPER_ADMIN",
        permissions: JSON.stringify(["all"]),
        created_by: userId,
      })

      if (adminRoleError && !adminRoleError.message.includes("duplicate")) {
        throw adminRoleError
      }

      // Log the admin creation
      await supabase.from("admin_activity_log").insert({
        admin_id: userId,
        action: "ADMIN_ACCOUNT_CREATED",
        details: JSON.stringify({
          type: "default_admin",
          email: ADMIN_EMAIL,
        }),
      })

      setMessage(`Admin account setup complete! 

A confirmation email has been sent to the admin email address. 
Please check the email and confirm the account, then contact the system administrator for login credentials.`)
    } catch (err: any) {
      console.error("Admin setup error:", err)
      if (err.message.includes("7 seconds")) {
        setError("Rate limit exceeded. Please wait 10 seconds and try again.")
      } else if (err.message.includes("Supabase")) {
        setError("Supabase connection failed. Please check your configuration.")
        setSupabaseAvailable(false)
      } else {
        setError(`Failed to setup admin account: ${err.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  // Alternative setup method that just provides instructions
  const showAdminInstructions = () => {
    setMessage(`To set up admin access manually:
      
1. Contact the system administrator for admin credentials
2. Sign up with the provided admin email and password
3. Check your email for confirmation and confirm your account
4. Wait 10 seconds after signup
5. Come back and login through the Admin tab
6. The system will automatically grant admin privileges on first login
      
Or wait 10 seconds and try the "Setup Admin" button again.`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setMessage("")

    // Demo mode fallback (always available)
    if (!supabaseAvailable) {
      // Simple validation for demo purposes
      if (email && password.length >= 6) {
        localStorage.setItem("user", JSON.stringify({ email, isAuthenticated: true }))
        if (isAdminMode) {
          router.push("/admin")
        } else {
          router.push("/dashboard")
        }
      } else {
        setError("Please enter a valid email and password (min 6 characters)")
      }
      setLoading(false)
      return
    }

    // Supabase mode
    try {
      const { getSupabase } = await import("@/lib/supabase")
      const supabase = await getSupabase()

      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      if (isLogin || isAdminMode) {
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
        } else {
          console.log("Login successful for:", data.user?.email)

          // Auto-grant admin role to default admin email on first login
          if (data.user?.email === ADMIN_EMAIL) {
            try {
              // Check if admin role already exists
              const { data: existingRole } = await supabase
                .from("admin_roles")
                .select("role")
                .eq("user_id", data.user.id)
                .single()

              if (!existingRole) {
                console.log("Creating admin role for default admin")
                // Create admin role automatically
                await supabase.from("admin_roles").insert({
                  user_id: data.user.id,
                  role: "SUPER_ADMIN",
                  permissions: JSON.stringify(["all"]),
                  created_by: data.user.id,
                })

                // Create profile with admin balance
                await supabase.from("profiles").upsert({
                  id: data.user.id,
                  balance: 1000000.0,
                })

                // Log the admin creation
                await supabase.from("admin_activity_log").insert({
                  admin_id: data.user.id,
                  action: "ADMIN_ACCOUNT_CREATED",
                  details: JSON.stringify({
                    type: "auto_grant",
                    email: data.user.email,
                  }),
                })
              }
            } catch (autoGrantError) {
              console.warn("Could not auto-grant admin role:", autoGrantError)
            }
          }

          // Always check admin role after login
          try {
            const { data: adminRole, error: adminRoleError } = await supabase
              .from("admin_roles")
              .select("role")
              .eq("user_id", data.user?.id)
              .single()

            console.log("Admin role check result:", { adminRole, adminRoleError })

            if (adminRole) {
              console.log("Admin role found, redirecting to admin dashboard")
              // Force redirect to admin dashboard with a slight delay
              setTimeout(() => {
                window.location.href = "/admin"
              }, 100)
            } else if (isAdminMode) {
              setError("This account does not have admin privileges. Please contact the system administrator.")
              setLoading(false)
              return
            } else {
              console.log("No admin role, redirecting to user dashboard")
              router.push("/dashboard")
            }
          } catch (roleCheckError) {
            console.warn("Could not check admin role:", roleCheckError)
            if (isAdminMode) {
              setError("Could not verify admin privileges. Please try again.")
              setLoading(false)
              return
            } else {
              router.push("/dashboard")
            }
          }
        }
      } else {
        // Check if registration is allowed before proceeding
        try {
          const { data: gameSettings } = await supabase
            .from("game_settings")
            .select("setting_value")
            .eq("setting_key", "allow_new_registrations")
            .single()

          const registrationAllowed = gameSettings?.setting_value === true || gameSettings?.setting_value === "true"
          
          if (!registrationAllowed) {
            setError("New user registrations are currently disabled. Please contact the administrator.")
            setLoading(false)
            return
          }
        } catch (settingsError) {
          console.warn("Could not check registration settings:", settingsError)
          // Allow registration if we can't check the setting
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) {
          setError(error.message)
        } else {
          setMessage("Check your email for the confirmation link!")
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err)
      // Fall back to demo mode if Supabase fails
      console.log("Falling back to demo mode due to error:", err.message)
      setSupabaseAvailable(false)

      if (email && password.length >= 6) {
        localStorage.setItem("user", JSON.stringify({ email, isAuthenticated: true }))
        if (isAdminMode) {
          router.push("/admin")
        } else {
          router.push("/dashboard")
        }
      } else {
        setError("Please enter a valid email and password (min 6 characters)")
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError("")
    setResetMessage("")

    if (!supabaseAvailable) {
      setResetError("Password reset requires Supabase but it's not available")
      setResetLoading(false)
      return
    }

    if (!resetEmail) {
      setResetError("Please enter your email address")
      setResetLoading(false)
      return
    }

    try {
      const { getSupabase } = await import("@/lib/supabase")
      const supabase = await getSupabase()

      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/reset-password`,
      })

      if (error) {
        setResetError(error.message)
      } else {
        setResetMessage("Password reset email sent! Check your inbox.")
        setTimeout(() => {
          setIsResetDialogOpen(false)
          setResetEmail("")
          setResetMessage("")
        }, 3000)
      }
    } catch (err: any) {
      setResetError(`Password reset error: ${err.message || "An unexpected error occurred"}`)
      console.error("Password reset error:", err)
    } finally {
      setResetLoading(false)
    }
  }

  // Reset password strength when switching between login/signup
  useEffect(() => {
    if (isLogin || isAdminMode) {
      setPasswordStrength({ score: 0, feedback: "", color: "text-gray-500" })
    } else if (password) {
      checkPasswordStrength(password)
    }
  }, [isLogin, isAdminMode, password])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
            {isAdminMode ? (
              <>
                <Shield className="h-6 w-6 text-blue-600" />
                Admin Login
              </>
            ) : (
              <>
                <User className="h-6 w-6" />
                {isLogin ? "Sign In" : "Sign Up"}
              </>
            )}
          </CardTitle>
          <CardDescription className="text-center">
            {isAdminMode
              ? "Access the administrative dashboard"
              : isLogin
                ? "Enter your credentials to access your portfolio"
                : "Create an account to start building your portfolio"}
          </CardDescription>
          {!supabaseAvailable && (
            <Alert>
              <AlertDescription>
                <strong>Demo Mode:</strong> Running in demo mode with local storage.
                <br />
                <small>All features work with simulated data.</small>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent>
          {/* Login Mode Toggle */}
          <div className="flex mb-4 bg-gray-100 p-1 rounded-lg">
            <Button
              type="button"
              variant={!isAdminMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsAdminMode(false)}
              className="flex-1 flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              User
            </Button>
            <Button
              type="button"
              variant={isAdminMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsAdminMode(true)}
              className="flex-1 flex items-center gap-2"
            >
              <Shield className="h-4 w-4" />
              Admin
            </Button>
          </div>

          {/* Admin Setup Helper */}
          {isAdminMode && supabaseAvailable && (
            <Alert className="mb-4">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Need to create the default admin account?</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={setupDefaultAdmin} disabled={loading}>
                        {loading ? "Setting up..." : "Auto Setup"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={showAdminInstructions} disabled={loading}>
                        Manual Setup
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">Contact system administrator for admin credentials.</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={handlePasswordChange}
                  required
                  disabled={loading}
                  minLength={6}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>

              {/* Password strength indicator for signup */}
              {!isLogin && !isAdminMode && password && (
                <div className="text-sm">
                  <div className={`font-medium ${passwordStrength.color}`}>{passwordStrength.feedback}</div>
                  <div className="flex mt-1 space-x-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 w-full rounded ${
                          level <= passwordStrength.score
                            ? passwordStrength.score <= 2
                              ? "bg-red-500"
                              : passwordStrength.score <= 3
                                ? "bg-yellow-500"
                                : passwordStrength.score <= 4
                                  ? "bg-blue-500"
                                  : "bg-green-500"
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Strong password suggestion for signup */}
              {!isLogin && !isAdminMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={useSuggestedPassword}
                      disabled={loading}
                      className="text-xs bg-transparent"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Suggest Strong Password
                    </Button>
                    {password && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyPassword(password)}
                        disabled={loading}
                        className="text-xs"
                      >
                        {passwordCopied ? (
                          <Check className="h-3 w-3 mr-1 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        {passwordCopied ? "Copied!" : "Copy"}
                      </Button>
                    )}
                  </div>

                  {suggestedPassword && suggestedPassword !== password && (
                    <Alert>
                      <AlertDescription className="text-xs">
                        <strong>Suggested:</strong> {suggestedPassword}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyPassword(suggestedPassword)}
                          className="ml-2 h-6 px-2 text-xs"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {message && (
              <Alert>
                <AlertDescription style={{ whiteSpace: "pre-line" }}>{message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isAdminMode ? "Admin Login" : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>

          <div className="mt-4 space-y-2">
            {!isAdminMode && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-blue-600 hover:underline"
                  disabled={loading}
                >
                  {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              </div>
            )}

            {(isLogin || isAdminMode) && supabaseAvailable && (
              <div className="text-center">
                <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="text-sm text-gray-600 hover:underline" disabled={loading}>
                      Forgot your password?
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Reset Password</DialogTitle>
                      <DialogDescription>
                        Enter your email address and we'll send you a link to reset your password.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePasswordReset} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="resetEmail">Email</Label>
                        <Input
                          id="resetEmail"
                          type="email"
                          placeholder="Enter your email address"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                          disabled={resetLoading}
                        />
                      </div>

                      {resetError && (
                        <Alert variant="destructive">
                          <AlertDescription>{resetError}</AlertDescription>
                        </Alert>
                      )}

                      {resetMessage && (
                        <Alert>
                          <AlertDescription>{resetMessage}</AlertDescription>
                        </Alert>
                      )}

                      <div className="flex space-x-2">
                        <Button type="submit" disabled={resetLoading} className="flex-1">
                          {resetLoading ? "Sending..." : "Send Reset Link"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsResetDialogOpen(false)}
                          disabled={resetLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
