-- Add missing features to the stock market game
-- This script adds: usernames, artificial stock prices, registration toggle, and artificial stock management

-- 1. Add username field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Create artificial stock prices table for admin manipulation
CREATE TABLE IF NOT EXISTS artificial_stock_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  artificial_price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  price_change_percent DECIMAL(8,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 3. Add registration control to game settings
INSERT INTO game_settings (setting_key, setting_value, description) VALUES
('allow_new_registrations', 'true', 'Allow new user registrations')
ON CONFLICT (setting_key) DO NOTHING;

-- 4. Update leaderboard table to use usernames
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS username VARCHAR(50);
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. Enable RLS for new tables
ALTER TABLE artificial_stock_prices ENABLE ROW LEVEL SECURITY;

-- 6. Create policies for artificial stock prices
CREATE POLICY "Everyone can view artificial stock prices" ON artificial_stock_prices
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage artificial stock prices" ON artificial_stock_prices
  FOR ALL USING (is_admin());

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON profiles(display_name);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_symbol_idx ON artificial_stock_prices(symbol);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_active_idx ON artificial_stock_prices(is_active);
CREATE INDEX IF NOT EXISTS leaderboard_username_idx ON leaderboard(username);

-- 8. Create function to get stock price (artificial or real)
CREATE OR REPLACE FUNCTION get_stock_price(stock_symbol TEXT)
RETURNS TABLE(
  symbol TEXT,
  name TEXT,
  price DECIMAL(10,2),
  is_artificial BOOLEAN
) AS $$
BEGIN
  -- First check if there's an active artificial price
  RETURN QUERY
  SELECT 
    asp.symbol::TEXT,
    asp.name::TEXT,
    asp.artificial_price,
    true as is_artificial
  FROM artificial_stock_prices asp
  WHERE asp.symbol = stock_symbol AND asp.is_active = true;
  
  -- If no artificial price found, this would normally call external API
  -- For now, return a placeholder that indicates real price should be used
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      stock_symbol::TEXT,
      'Real Stock'::TEXT,
      0.00::DECIMAL(10,2),
      false as is_artificial;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to update leaderboard with usernames
CREATE OR REPLACE FUNCTION update_leaderboard_with_usernames()
RETURNS void AS $$
BEGIN
  -- Update leaderboard with current portfolio values and usernames
  INSERT INTO leaderboard (user_id, username, display_name, total_value, total_gain_loss, total_gain_loss_percent)
  SELECT 
    p.id as user_id,
    COALESCE(p.username, 'User' || RIGHT(p.id::TEXT, 4)) as username,
    COALESCE(p.display_name, p.username, 'Anonymous') as display_name,
    COALESCE(p.balance, 0) + COALESCE(portfolio_value.total_value, 0) as total_value,
    COALESCE(portfolio_value.total_gain_loss, 0) as total_gain_loss,
    CASE 
      WHEN COALESCE(portfolio_value.total_invested, 0) > 0 
      THEN (COALESCE(portfolio_value.total_gain_loss, 0) / portfolio_value.total_invested) * 100
      ELSE 0 
    END as total_gain_loss_percent
  FROM profiles p
  LEFT JOIN (
    SELECT 
      user_id,
      SUM(total_value) as total_value,
      SUM((price - purchase_price) * shares) as total_gain_loss,
      SUM(purchase_price * shares) as total_invested
    FROM portfolios 
    GROUP BY user_id
  ) portfolio_value ON p.id = portfolio_value.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    total_value = EXCLUDED.total_value,
    total_gain_loss = EXCLUDED.total_gain_loss,
    total_gain_loss_percent = EXCLUDED.total_gain_loss_percent,
    updated_at = NOW();

  -- Update ranks
  UPDATE leaderboard SET rank = ranked.new_rank
  FROM (
    SELECT user_id, ROW_NUMBER() OVER (ORDER BY total_value DESC) as new_rank
    FROM leaderboard
  ) ranked
  WHERE leaderboard.user_id = ranked.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create trigger to update leaderboard when profiles change
CREATE OR REPLACE FUNCTION trigger_update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the specific user's leaderboard entry
  INSERT INTO leaderboard (user_id, username, display_name, total_value, total_gain_loss, total_gain_loss_percent)
  SELECT 
    NEW.id as user_id,
    COALESCE(NEW.username, 'User' || RIGHT(NEW.id::TEXT, 4)) as username,
    COALESCE(NEW.display_name, NEW.username, 'Anonymous') as display_name,
    COALESCE(NEW.balance, 0) as total_value,
    0 as total_gain_loss,
    0 as total_gain_loss_percent
  ON CONFLICT (user_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_leaderboard_on_profile_change ON profiles;
CREATE TRIGGER update_leaderboard_on_profile_change
  AFTER INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_update_leaderboard();

-- 11. Grant permissions
GRANT EXECUTE ON FUNCTION get_stock_price TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_leaderboard_with_usernames TO authenticated;
GRANT SELECT ON artificial_stock_prices TO authenticated, anon;

-- 12. Insert some example artificial stock prices for testing
INSERT INTO artificial_stock_prices (symbol, name, artificial_price, original_price, created_by, is_active) VALUES
('DEMO', 'Demo Stock for Testing', 150.00, 145.50, (SELECT id FROM admin_roles LIMIT 1), true),
('TEST', 'Test Company Inc', 75.25, 72.00, (SELECT id FROM admin_roles LIMIT 1), true)
ON CONFLICT (symbol) DO NOTHING;

-- 13. Update existing users to have usernames if they don't have them
UPDATE profiles 
SET username = 'user' || RIGHT(id::TEXT, 8),
    display_name = 'Player ' || RIGHT(id::TEXT, 4)
WHERE username IS NULL;

COMMIT;