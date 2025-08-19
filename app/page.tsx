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
import { RefreshCw, Copy, Check, Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [resetMessage, setResetMessage] = useState("")
  const [resetError, setResetError] = useState("")
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [suggestedPassword, setSuggestedPassword] = useState("")
  const [passwordCopied, setPasswordCopied] = useState(false)
  const router = useRouter()

  // Password strength indicators
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: "",
    color: "text-gray-500",
  })

  useEffect(() => {
    const initializeAuth = async () => {
      // Check if Supabase is configured by trying to import and use it
      try {
        const { supabase } = await import("@/lib/supabase")

        // Try to get session to verify Supabase is working
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error("Supabase configuration error:", error)
          setSupabaseConfigured(false)
        } else {
          setSupabaseConfigured(true)

          // If user is already logged in, redirect to dashboard
          if (session) {
            router.push("/dashboard")
            return
          }

          // Listen for auth changes
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_OUT" || !session) {
              // Stay on login page
            } else if (session) {
              // Check if user is admin
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
            }
          })

          return () => subscription.unsubscribe()
        }
      } catch (err) {
        console.error("Supabase import/initialization error:", err)
        setSupabaseConfigured(false)
      }
    }

    initializeAuth()
  }, [router])

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
    if (!isLogin) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setMessage("")

    if (!supabaseConfigured) {
      // Fallback to simple validation for demo purposes
      if (email && password.length >= 6) {
        localStorage.setItem("user", JSON.stringify({ email, isAuthenticated: true }))
        router.push("/dashboard")
      } else {
        setError("Please enter a valid email and password (min 6 characters)")
      }
      setLoading(false)
      return
    }

    try {
      const { supabase } = await import("@/lib/supabase")

      if (isLogin) {
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
        } else {
          // Check if user is admin
          const { data: adminRole } = await supabase
            .from("admin_roles")
            .select("role")
            .eq("user_id", data.user?.id)
            .single()

          if (adminRole) {
            router.push("/admin")
          } else {
            router.push("/dashboard")
          }
        }
      } else {
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
    } catch (err) {
      setError("An unexpected error occurred")
      console.error("Auth error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError("")
    setResetMessage("")

    if (!supabaseConfigured) {
      setResetError("Password reset requires Supabase configuration")
      setResetLoading(false)
      return
    }

    if (!resetEmail) {
      setResetError("Please enter your email address")
      setResetLoading(false)
      return
    }

    try {
      const { supabase } = await import("@/lib/supabase")
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
    } catch (err) {
      setResetError("An unexpected error occurred")
      console.error("Password reset error:", err)
    } finally {
      setResetLoading(false)
    }
  }

  // Reset password strength when switching between login/signup
  useEffect(() => {
    if (isLogin) {
      setPasswordStrength({ score: 0, feedback: "", color: "text-gray-500" })
    } else if (password) {
      checkPasswordStrength(password)
    }
  }, [isLogin, password])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{isLogin ? "Sign In" : "Sign Up"}</CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Enter your credentials to access your portfolio"
              : "Create an account to start building your portfolio"}
          </CardDescription>
          {!supabaseConfigured && (
            <Alert>
              <AlertDescription>
                <strong>Demo Mode:</strong> Supabase not configured. Using local storage for demo purposes.
                <br />
                <small>Check console for Supabase connection errors.</small>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
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
              {!isLogin && password && (
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
              {!isLogin && (
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
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>

          <div className="mt-4 space-y-2">
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

            {isLogin && supabaseConfigured && (
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
                          placeholder="john@example.com"
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
