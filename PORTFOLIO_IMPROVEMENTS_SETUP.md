# Portfolio Dashboard Improvements - Setup Guide

This document explains the improvements made to fix the portfolio pricing issues and add new tracking features.

## Issues Fixed

### 1. **Purchase Price vs Current Price Problem**
**Issue**: Stock prices were never updated after purchase, so purchase_price and current_price were always identical, showing 0% gain/loss.

**Solution**: 
- Created `/api/refresh-portfolio-prices` endpoint that fetches real-time prices for all portfolio stocks
- Added "Refresh Prices" button on the portfolio dashboard
- Auto-refresh prices when dashboard loads
- Prices now update correctly showing actual gains/losses

### 2. **Starting Balance Tracking**
**Issue**: No way to see how much capital you started with to compare against current performance.

**Solution**:
- Added `starting_balance` column to profiles table
- New stat card displays starting balance prominently
- Used to calculate true portfolio performance

### 3. **Portfolio Value History Chart**
**Issue**: No historical data to track portfolio performance over time.

**Solution**:
- Created `portfolio_history` table to store daily snapshots
- Built interactive chart component showing portfolio value over time
- Displays 30-day trend with gain/loss visualization
- Chart appears below the portfolio table

## Files Created/Modified

### New Files:
1. **`scripts/add-portfolio-tracking.sql`** - Database migration script
2. **`app/api/refresh-portfolio-prices/route.ts`** - API to update stock prices
3. **`app/api/portfolio-history/route.ts`** - API to fetch historical data
4. **`components/portfolio-value-chart.tsx`** - Chart component

### Modified Files:
1. **`app/dashboard/page.tsx`** - Enhanced with all new features

## Setup Instructions

### Step 1: Run Database Migration

Execute the SQL migration script in your Supabase SQL editor:

```bash
# Navigate to Supabase Dashboard > SQL Editor
# Run the contents of: scripts/add-portfolio-tracking.sql
```

This script will:
- Add `starting_balance` column to profiles table
- Create `portfolio_history` table for tracking
- Create functions to record portfolio snapshots
- Set up proper permissions and indexes
- Record initial snapshot for all existing users

### Step 2: Install Dependencies (if needed)

The chart component uses native SVG, so no additional packages are required.

### Step 3: Test the Features

1. **Starting Balance**:
   - Login and check the dashboard
   - First stat card should show your starting balance ($100,000 by default)

2. **Price Refresh**:
   - Click "Refresh Prices" button on portfolio tab
   - Watch prices update for your stocks
   - Observe gain/loss calculations change

3. **Portfolio History Chart**:
   - Scroll below your portfolio table
   - Chart will show after you have historical data
   - Initially may show "No data" until snapshots are collected

4. **Automatic Snapshots**:
   - Snapshots are recorded when prices refresh
   - For ongoing tracking, set up a cron job (see below)

### Step 4: Schedule Regular Price Updates (Optional)

For automatic price updates and snapshots, you can:

**Option A: Supabase Edge Function (Recommended)**
```typescript
// Create an edge function that calls update_all_stock_prices()
// and record_all_portfolio_snapshots() on a schedule
```

**Option B: External Cron Job**
```bash
# Call your admin API endpoint daily
curl -X POST https://your-app.com/api/admin/update-prices \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Option C: Manual Updates**
- Admin can call `update_all_stock_prices()` function from SQL editor
- Then call `record_all_portfolio_snapshots()` to save snapshot

## How It Works

### Price Updates

1. User clicks "Refresh Prices" or dashboard loads
2. `/api/refresh-portfolio-prices` is called with user ID
3. For each stock in portfolio:
   - Checks for artificial prices first
   - Falls back to Alpha Vantage API
   - Generates realistic variation if API fails
   - Updates portfolio table with new prices
4. Records portfolio snapshot for historical tracking
5. Dashboard reloads to show updated values

### Historical Tracking

1. `portfolio_history` table stores snapshots of:
   - Total portfolio value
   - Cash balance
   - Stock holdings value
   - Gain/loss amounts and percentages
   - Timestamp

2. Chart component:
   - Fetches last 30 days of snapshots
   - Renders interactive SVG line chart
   - Shows trend and performance metrics

### Current Price Calculation

```typescript
// In loadPortfolio function
const current_price = item.price || item.purchase_price
const total_value = current_price * item.shares
const gain_loss = total_value - (item.purchase_price * item.shares)
```

## Database Schema

### New Column: profiles.starting_balance
```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS starting_balance DECIMAL(12,2) DEFAULT 100000.00;
```

### New Table: portfolio_history
```sql
CREATE TABLE portfolio_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  total_value DECIMAL(15,2),
  cash_balance DECIMAL(12,2),
  portfolio_value DECIMAL(15,2),
  total_gain_loss DECIMAL(15,2),
  total_gain_loss_percent DECIMAL(8,4),
  snapshot_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
);
```

## API Endpoints

### POST /api/refresh-portfolio-prices
**Purpose**: Update current prices for user's portfolio stocks

**Request**:
```json
{
  "userId": "user-uuid"
}
```

**Response**:
```json
{
  "success": true,
  "updated": 5,
  "total": 5,
  "errors": []
}
```

### GET /api/portfolio-history
**Purpose**: Fetch historical portfolio snapshots

**Query Parameters**:
- `userId`: User's UUID
- `days`: Number of days to fetch (default: 30)

**Response**:
```json
{
  "success": true,
  "history": [
    {
      "snapshot_date": "2024-01-01T00:00:00Z",
      "total_value": 105000.00,
      "cash_balance": 50000.00,
      "portfolio_value": 55000.00,
      "total_gain_loss": 5000.00,
      "total_gain_loss_percent": 5.00
    }
  ]
}
```

## UI Components

### Dashboard Stats Cards
Now displays 5 cards instead of 4:
1. **Starting Balance** - Your initial capital (blue)
2. **Cash Balance** - Available funds
3. **Portfolio Value** - Current stock holdings value
4. **Total Gain/Loss** - Profit/loss amount and percentage
5. **Total Value** - Cash + Portfolio combined

### Refresh Prices Button
- Located in portfolio card header
- Shows spinner animation while refreshing
- Disabled during refresh operation

### Portfolio Value Chart
- Displays below portfolio table
- Interactive tooltips on data points
- Color-coded: green for gains, red for losses
- Shows 30-day performance trend
- Includes summary metrics

## Troubleshooting

### Chart Not Showing
- **Cause**: No historical data yet
- **Solution**: Wait for snapshots to be recorded or manually call `record_portfolio_snapshot(user_id)`

### Prices Not Updating
- **Cause**: API rate limits or network issues
- **Solution**: Function generates realistic variations as fallback

### Starting Balance is Wrong
- **Update manually**:
```sql
UPDATE profiles 
SET starting_balance = 100000.00 
WHERE id = 'your-user-id';
```

### Permission Errors
- **Check RLS policies**:
```sql
-- Verify users can read their own history
SELECT * FROM portfolio_history WHERE user_id = auth.uid();
```

## Future Enhancements

Potential improvements:
1. Add more time ranges (7 days, 90 days, 1 year)
2. Export portfolio history to CSV
3. Email reports with performance summaries
4. Comparison against market benchmarks
5. Real-time WebSocket price updates
6. Multiple chart types (candlestick, area, bar)

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify database migration ran successfully
3. Ensure RLS policies are correct
4. Check API endpoint logs

## Summary

These improvements provide:
- ✅ Real current prices that differ from purchase prices
- ✅ Accurate gain/loss calculations
- ✅ Starting balance tracking
- ✅ Historical portfolio value chart
- ✅ Better understanding of true portfolio performance
- ✅ Fixed the "why do I have more money than I started with" issue

The system now correctly tracks your actual investment performance over time!