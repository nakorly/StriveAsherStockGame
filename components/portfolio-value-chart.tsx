"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface PortfolioHistoryPoint {
  snapshot_date: string
  total_value: number
  cash_balance: number
  portfolio_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
}

interface PortfolioValueChartProps {
  userId: string
  days?: number
}

export function PortfolioValueChart({ userId, days = 30 }: PortfolioValueChartProps) {
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/portfolio-history?userId=${userId}&days=${days}`)
        const data = await response.json()

        if (data.success) {
          setHistory(data.history)
        } else {
          setError(data.error || "Failed to load history")
        }
      } catch (err) {
        console.error("Error fetching portfolio history:", err)
        setError("Failed to load portfolio history")
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchHistory()
    }
  }, [userId, days])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Value Over Time</CardTitle>
          <CardDescription>Historical performance of your portfolio</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  if (error || history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Value Over Time</CardTitle>
          <CardDescription>Historical performance of your portfolio</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-gray-500">
            {error || "No historical data available yet. Data will be collected over time."}
          </p>
        </CardContent>
      </Card>
    )
  }

  // Calculate chart dimensions and scaling
  const maxValue = Math.max(...history.map((point) => point.total_value))
  const minValue = Math.min(...history.map((point) => point.total_value))
  const valueRange = maxValue - minValue || 1
  const padding = valueRange * 0.1 // 10% padding

  const chartHeight = 200
  const chartWidth = 600
  const pointSpacing = chartWidth / Math.max(history.length - 1, 1)

  // Create SVG path for the line
  const linePath = history
    .map((point, index) => {
      const x = index * pointSpacing
      const y = chartHeight - ((point.total_value - minValue + padding) / (valueRange + 2 * padding)) * chartHeight
      return `${index === 0 ? "M" : "L"} ${x} ${y}`
    })
    .join(" ")

  // Create SVG path for the filled area
  const areaPath = 
    linePath + 
    ` L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Calculate overall change
  const firstValue = history[0]?.total_value || 0
  const lastValue = history[history.length - 1]?.total_value || 0
  const totalChange = lastValue - firstValue
  const totalChangePercent = firstValue > 0 ? (totalChange / firstValue) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Value Over Time</CardTitle>
        <CardDescription>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <span className="text-xs text-gray-500">Current Value: </span>
              <span className="text-sm font-semibold">${lastValue.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500">{days}-Day Change: </span>
              <span className={`text-sm font-semibold ${totalChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${totalChange.toFixed(2)} ({totalChangePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height: chartHeight + 60 }}>
          <svg
            width="100%"
            height={chartHeight + 40}
            viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}
            preserveAspectRatio="none"
            className="overflow-visible"
          >
            {/* Grid lines */}
            <g className="text-gray-200">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = chartHeight * ratio
                return (
                  <line
                    key={ratio}
                    x1="0"
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                )
              })}
            </g>

            {/* Area fill */}
            <path
              d={areaPath}
              fill="url(#gradient)"
              opacity="0.3"
            />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={totalChange >= 0 ? "#16a34a" : "#dc2626"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {history.map((point, index) => {
              const x = index * pointSpacing
              const y = chartHeight - ((point.total_value - minValue + padding) / (valueRange + 2 * padding)) * chartHeight
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={totalChange >= 0 ? "#16a34a" : "#dc2626"}
                  className="hover:r-5 transition-all cursor-pointer"
                >
                  <title>
                    {formatDate(point.snapshot_date)}: ${point.total_value.toLocaleString()}
                  </title>
                </circle>
              )
            })}

            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={totalChange >= 0 ? "#16a34a" : "#dc2626"} stopOpacity="0.8" />
                <stop offset="100%" stopColor={totalChange >= 0 ? "#16a34a" : "#dc2626"} stopOpacity="0.1" />
              </linearGradient>
            </defs>
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{formatDate(history[0].snapshot_date)}</span>
            {history.length > 2 && (
              <span>{formatDate(history[Math.floor(history.length / 2)].snapshot_date)}</span>
            )}
            <span>{formatDate(history[history.length - 1].snapshot_date)}</span>
          </div>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex flex-col justify-between text-xs text-gray-500" style={{ height: chartHeight }}>
            <span>${(maxValue + padding).toLocaleString()}</span>
            <span>${((maxValue + minValue) / 2).toLocaleString()}</span>
            <span>${(minValue - padding).toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}