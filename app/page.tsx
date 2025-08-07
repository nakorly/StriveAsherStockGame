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
  const router = useRouter()

  useEffect(() => {
    const initializeAuth = async () => {
      // Check if Supabase is configured by trying to import and use it
      try {
        const { supabase } = await import("@/lib/supabase")
        
        // Try to get session to verify Supabase is working
        const { data: { session }, error } = await supabase.auth.getSession()
        
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
              router.push("/dashboard")
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
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
        } else {
          router.push("/dashboard")
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
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
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
                    <button
                      type="button"
                      className="text-sm text-gray-600 hover:underline"
                      disabled={loading}
                    >
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
