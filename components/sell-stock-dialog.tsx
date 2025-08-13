"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

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

interface SellStockDialogProps {
  stock: Stock | null
  isOpen: boolean
  onClose: () => void
  onSell: (stock: Stock, sharesToSell: number) => Promise<void>
  currentPrice: number
}

export function SellStockDialog({ stock, isOpen, onClose, onSell, currentPrice }: SellStockDialogProps) {
  const [sharesToSell, setSharesToSell] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!stock) return null

  const maxShares = stock.shares || 1
  const saleValue = currentPrice * sharesToSell
  const gainLoss = (currentPrice - (stock.purchase_price || stock.price)) * sharesToSell

  const handleSell = async () => {
    if (sharesToSell <= 0 || sharesToSell > maxShares) {
      setError("Invalid number of shares")
      return
    }

    setLoading(true)
    setError("")

    try {
      await onSell(stock, sharesToSell)
      onClose()
      setSharesToSell(1)
    } catch (err) {
      setError("Failed to sell stock")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    setSharesToSell(1)
    setError("")
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sell {stock.symbol}</DialogTitle>
          <DialogDescription>{stock.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Current Price</Label>
              <div className="text-lg font-bold">${currentPrice.toFixed(2)}</div>
            </div>
            <div>
              <Label>Shares Owned</Label>
              <div className="text-lg font-bold">{maxShares.toLocaleString()}</div>
            </div>
          </div>

          <div>
            <Label htmlFor="sharesToSell">Shares to Sell</Label>
            <Input
              id="sharesToSell"
              type="number"
              min="1"
              max={maxShares}
              value={sharesToSell}
              onChange={(e) => setSharesToSell(Math.min(Math.max(1, Number.parseInt(e.target.value) || 1), maxShares))}
              disabled={loading}
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSharesToSell(Math.floor(maxShares * 0.25))}
                disabled={loading}
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSharesToSell(Math.floor(maxShares * 0.5))}
                disabled={loading}
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSharesToSell(Math.floor(maxShares * 0.75))}
                disabled={loading}
              >
                75%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSharesToSell(maxShares)}
                disabled={loading}
              >
                All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Sale Value</Label>
              <div className="text-lg font-bold text-green-600">${saleValue.toLocaleString()}</div>
            </div>
            <div>
              <Label>Gain/Loss</Label>
              <div className={`text-lg font-bold ${gainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {gainLoss >= 0 ? "+" : ""}${gainLoss.toFixed(2)}
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex space-x-2">
            <Button
              onClick={handleSell}
              disabled={loading || sharesToSell <= 0 || sharesToSell > maxShares}
              className="flex-1"
            >
              {loading ? "Selling..." : `Sell ${sharesToSell} Share${sharesToSell !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
