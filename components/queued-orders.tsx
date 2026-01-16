"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Clock, X, TrendingUp, TrendingDown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
}

interface QueuedOrdersProps {
  orders: QueuedOrder[]
  onCancelOrder?: (orderId: string) => Promise<void>
  marketStatus?: {
    isOpen: boolean
    nextEvent?: string
    timeUntil?: string
  }
}

export function QueuedOrders({ orders, onCancelOrder, marketStatus }: QueuedOrdersProps) {
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set())
  const safeMarketStatus =
    marketStatus ?? ({
      isOpen: true,
      nextEvent: "Next session",
      timeUntil: "unknown",
    } as const)

  const pendingOrders = orders.filter((order) => order.status === "PENDING")
  const recentExecutedOrders = orders.filter(
    (order) =>
      order.status === "EXECUTED" &&
      order.executed_at &&
      new Date(order.executed_at) > new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
  )

  const handleCancelOrder = async (orderId: string) => {
    if (!onCancelOrder) return

    setCancellingOrders((prev) => new Set(prev).add(orderId))
    try {
      await onCancelOrder(orderId)
    } finally {
      setCancellingOrders((prev) => {
        const newSet = new Set(prev)
        newSet.delete(orderId)
        return newSet
      })
    }
  }

  if (pendingOrders.length === 0 && recentExecutedOrders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Queued Orders</CardTitle>
          <CardDescription>No pending or recently executed orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">
            When the market is closed, new orders will appear here until they execute.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Queued Orders ({pendingOrders.length})
            </CardTitle>
            <CardDescription>Orders waiting to execute when market opens</CardDescription>
          </CardHeader>
          <CardContent>
            {!safeMarketStatus.isOpen && (
              <Alert className="mb-4">
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <strong>Market is closed.</strong> Your orders will execute when the market opens.
                  {safeMarketStatus.nextEvent && (
                    <span>
                      {" "}
                      Next: {safeMarketStatus.nextEvent}
                      {safeMarketStatus.timeUntil ? ` (${safeMarketStatus.timeUntil})` : ""}.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Reference Price</TableHead>
                  <TableHead>Queued At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Badge
                        variant={order.order_type === "BUY" ? "default" : "destructive"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {order.order_type === "BUY" ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {order.order_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{order.symbol}</TableCell>
                    <TableCell>{order.name}</TableCell>
                    <TableCell>{order.shares.toLocaleString()}</TableCell>
                    <TableCell>${order.order_price?.toFixed(2) || "N/A"}</TableCell>
                    <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={!onCancelOrder || cancellingOrders.has(order.id)}
                      >
                        {cancellingOrders.has(order.id) ? (
                          "Cancelling..."
                        ) : (
                          <>
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recently Executed Orders */}
      {recentExecutedOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Recently Executed Orders
            </CardTitle>
            <CardDescription>Orders executed in the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Execution Price</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Executed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExecutedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Badge
                        variant={order.order_type === "BUY" ? "default" : "destructive"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {order.order_type === "BUY" ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {order.order_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{order.symbol}</TableCell>
                    <TableCell>{order.shares.toLocaleString()}</TableCell>
                    <TableCell>${order.execution_price?.toFixed(2) || "N/A"}</TableCell>
                    <TableCell>${((order.execution_price || 0) * order.shares).toLocaleString()}</TableCell>
                    <TableCell>{order.executed_at ? new Date(order.executed_at).toLocaleString() : "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
