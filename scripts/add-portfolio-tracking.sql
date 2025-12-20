-- Add Portfolio Tracking Features
-- This script adds starting balance tracking and portfolio history for charting

-- =============================================================================
-- 1. ADD STARTING BALANCE TO PROFILES
-- =============================================================================

-- Add starting_balance column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS starting_balance DECIMAL(12,2) DEFAULT 100000.00;

-- Set starting_balance for existing users to their current balance
-- (since we don't have historical data, we'll use current balance as baseline)
UPDATE profiles 
SET starting_balance = balance 
WHERE starting_balance IS NULL;

-- =============================================================================
-- 2. CREATE PORTFOLIO HISTORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS portfolio_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total_value DECIMAL(15,2) NOT NULL,
  cash_balance DECIMAL(12,2) NOT NULL,
  portfolio_value DECIMAL(15,2) NOT NULL,
  total_gain_loss DECIMAL(15,2) NOT NULL,
  total_gain_loss_percent DECIMAL(8,4) NOT NULL,
  snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS portfolio_history_user_id_idx ON portfolio_history(user_id);
CREATE INDEX IF NOT EXISTS portfolio_history_snapshot_date_idx ON portfolio_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS portfolio_history_user_date_idx ON portfolio_history(user_id, snapshot_date DESC);

-- Enable RLS
ALTER TABLE portfolio_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own portfolio history" ON portfolio_history;
CREATE POLICY "Users can view their own portfolio history" ON portfolio_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert portfolio history" ON portfolio_history;
CREATE POLICY "System can insert portfolio history" ON portfolio_history
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 3. CREATE FUNCTION TO RECORD PORTFOLIO SNAPSHOT
-- =============================================================================

CREATE OR REPLACE FUNCTION record_portfolio_snapshot(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_cash_balance DECIMAL(12,2);
  v_portfolio_value DECIMAL(15,2);
  v_total_value DECIMAL(15,2);
  v_starting_balance DECIMAL(12,2);
  v_total_gain_loss DECIMAL(15,2);
  v_total_gain_loss_percent DECIMAL(8,4);
BEGIN
  -- Get user's cash balance and starting balance
  SELECT balance, starting_balance 
  INTO v_cash_balance, v_starting_balance
  FROM profiles 
  WHERE id = p_user_id;
  
  -- Calculate total portfolio value
  SELECT COALESCE(SUM(total_value), 0)
  INTO v_portfolio_value
  FROM portfolios
  WHERE user_id = p_user_id;
  
  -- Calculate totals
  v_total_value := v_cash_balance + v_portfolio_value;
  v_total_gain_loss := v_total_value - v_starting_balance;
  v_total_gain_loss_percent := CASE 
    WHEN v_starting_balance > 0 THEN (v_total_gain_loss / v_starting_balance) * 100
    ELSE 0
  END;
  
  -- Insert snapshot
  INSERT INTO portfolio_history (
    user_id,
    total_value,
    cash_balance,
    portfolio_value,
    total_gain_loss,
    total_gain_loss_percent,
    snapshot_date
  ) VALUES (
    p_user_id,
    v_total_value,
    v_cash_balance,
    v_portfolio_value,
    v_total_gain_loss,
    v_total_gain_loss_percent,
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. CREATE FUNCTION TO RECORD ALL USERS' SNAPSHOTS
-- =============================================================================

CREATE OR REPLACE FUNCTION record_all_portfolio_snapshots()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  v_user_count INTEGER;
BEGIN
  -- Loop through all users and record their snapshots
  FOR user_record IN
    SELECT id FROM profiles
  LOOP
    PERFORM record_portfolio_snapshot(user_record.id);
  END LOOP;
  
  -- Log the action (only if there's an authenticated user)
  IF auth.uid() IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_count FROM profiles;
    
    INSERT INTO admin_activity_log (
      admin_id,
      action,
      details,
      created_at
    ) VALUES (
      auth.uid(),
      'RECORD_ALL_SNAPSHOTS',
      json_build_object(
        'timestamp', NOW(),
        'user_count', v_user_count
      ),
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION record_portfolio_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION record_all_portfolio_snapshots TO authenticated;
GRANT SELECT ON portfolio_history TO authenticated;

-- =============================================================================
-- 6. CREATE INITIAL SNAPSHOT FOR ALL EXISTING USERS
-- =============================================================================

-- Record initial snapshot for all existing users
SELECT record_all_portfolio_snapshots();

COMMIT;