-- Complete Database Setup Script for Stock Trading Game
-- This script ensures all tables, functions, and permissions are properly set up

-- =============================================================================
-- 1. CREATE BASE TABLES
-- =============================================================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  balance DECIMAL(12,2) DEFAULT 100000.00,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  change DECIMAL(10,2) NOT NULL DEFAULT 0,
  change_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  shares INTEGER DEFAULT 1,
  purchase_price DECIMAL(10,2) NOT NULL,
  total_value DECIMAL(12,2) NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Create admin roles table
CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role VARCHAR(20) DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'SUPER_ADMIN')),
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create market settings table
CREATE TABLE IF NOT EXISTS market_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_open_time TIME DEFAULT '09:30:00',
  market_close_time TIME DEFAULT '16:00:00',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  trading_days JSONB DEFAULT '[1,2,3,4,5]',
  is_market_open_override BOOLEAN DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create game settings table
CREATE TABLE IF NOT EXISTS game_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create admin activity log
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  username VARCHAR(50),
  display_name VARCHAR(100),
  total_value DECIMAL(15,2) DEFAULT 0,
  total_gain_loss DECIMAL(15,2) DEFAULT 0,
  total_gain_loss_percent DECIMAL(8,4) DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create artificial stock prices table
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

-- Create queued orders table
CREATE TABLE IF NOT EXISTS queued_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
  shares INTEGER NOT NULL,
  order_price DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'CANCELLED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_price DECIMAL(10,2),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL
);

-- =============================================================================
-- 2. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE artificial_stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE queued_orders ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. CREATE HELPER FUNCTIONS
-- =============================================================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_roles 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. CREATE RLS POLICIES
-- =============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Portfolios policies
DROP POLICY IF EXISTS "Users can view their own portfolio items" ON portfolios;
CREATE POLICY "Users can view their own portfolio items" ON portfolios
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own portfolio items" ON portfolios;
CREATE POLICY "Users can insert their own portfolio items" ON portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own portfolio items" ON portfolios;
CREATE POLICY "Users can update their own portfolio items" ON portfolios
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own portfolio items" ON portfolios;
CREATE POLICY "Users can delete their own portfolio items" ON portfolios
  FOR DELETE USING (auth.uid() = user_id);

-- Admin roles policies
DROP POLICY IF EXISTS "Admins can view admin roles" ON admin_roles;
CREATE POLICY "Admins can view admin roles" ON admin_roles
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Super admins can manage admin roles" ON admin_roles;
CREATE POLICY "Super admins can manage admin roles" ON admin_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'SUPER_ADMIN')
  );

-- Market settings policies
DROP POLICY IF EXISTS "Admins can view market settings" ON market_settings;
CREATE POLICY "Admins can view market settings" ON market_settings
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update market settings" ON market_settings;
CREATE POLICY "Admins can update market settings" ON market_settings
  FOR UPDATE USING (is_admin());

-- Game settings policies
DROP POLICY IF EXISTS "Everyone can view game settings" ON game_settings;
CREATE POLICY "Everyone can view game settings" ON game_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage game settings" ON game_settings;
CREATE POLICY "Admins can manage game settings" ON game_settings
  FOR ALL USING (is_admin());

-- Admin activity log policies
DROP POLICY IF EXISTS "Admins can view activity log" ON admin_activity_log;
CREATE POLICY "Admins can view activity log" ON admin_activity_log
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "System can insert activity log" ON admin_activity_log;
CREATE POLICY "System can insert activity log" ON admin_activity_log
  FOR INSERT WITH CHECK (true);

-- Leaderboard policies
DROP POLICY IF EXISTS "Everyone can view leaderboard" ON leaderboard;
CREATE POLICY "Everyone can view leaderboard" ON leaderboard
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can update leaderboard" ON leaderboard;
CREATE POLICY "System can update leaderboard" ON leaderboard
  FOR ALL USING (true);

-- Artificial stock prices policies
DROP POLICY IF EXISTS "Everyone can view artificial stock prices" ON artificial_stock_prices;
CREATE POLICY "Everyone can view artificial stock prices" ON artificial_stock_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage artificial stock prices" ON artificial_stock_prices;
CREATE POLICY "Admins can manage artificial stock prices" ON artificial_stock_prices
  FOR ALL USING (is_admin());

-- Queued orders policies
DROP POLICY IF EXISTS "Users can view their own queued orders" ON queued_orders;
CREATE POLICY "Users can view their own queued orders" ON queued_orders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own queued orders" ON queued_orders;
CREATE POLICY "Users can insert their own queued orders" ON queued_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own queued orders" ON queued_orders;
CREATE POLICY "Users can update their own queued orders" ON queued_orders
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own queued orders" ON queued_orders;
CREATE POLICY "Users can delete their own queued orders" ON queued_orders
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 5. CREATE MAIN FUNCTIONS
-- =============================================================================

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, balance)
  VALUES (new.id, 100000.00);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update leaderboard with usernames (main function called by frontend)
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

-- Function to update all stock prices (called by admin)
CREATE OR REPLACE FUNCTION update_all_stock_prices()
RETURNS void AS $$
DECLARE
    portfolio_record RECORD;
    new_price NUMERIC;
    price_change NUMERIC;
    change_percent NUMERIC;
    symbol_hash INTEGER;
    volatility NUMERIC;
    random_change NUMERIC;
BEGIN
    -- Loop through all unique stocks in portfolios
    FOR portfolio_record IN 
        SELECT DISTINCT symbol, price
        FROM portfolios 
        ORDER BY symbol
    LOOP
        -- Create volatility based on symbol hash for consistency
        SELECT ASCII(LEFT(portfolio_record.symbol, 1)) + 
               ASCII(COALESCE(SUBSTRING(portfolio_record.symbol, 2, 1), 'A')) + 
               ASCII(COALESCE(SUBSTRING(portfolio_record.symbol, 3, 1), 'A'))
        INTO symbol_hash;
        
        -- Calculate volatility (2-3% base + symbol variation)
        volatility := 0.02 + (symbol_hash % 10) * 0.001;
        
        -- Generate random change with slight upward bias
        random_change := (RANDOM() - 0.48) * volatility;
        
        -- Calculate new price (minimum $1.00)
        new_price := GREATEST(1.00, portfolio_record.price * (1 + random_change));
        new_price := ROUND(new_price, 2);
        
        -- Calculate change metrics
        price_change := new_price - portfolio_record.price;
        change_percent := CASE 
            WHEN portfolio_record.price > 0 THEN (price_change / portfolio_record.price) * 100
            ELSE 0
        END;
        
        -- Update all portfolios with this symbol
        UPDATE portfolios 
        SET 
            price = new_price,
            change = ROUND(price_change, 2),
            change_percent = ROUND(change_percent, 2),
            total_value = shares * new_price
        WHERE symbol = portfolio_record.symbol;
        
    END LOOP;
    
    -- Log the bulk update
    INSERT INTO admin_activity_log (
        admin_id, 
        action, 
        details, 
        created_at
    ) VALUES (
        COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'),
        'BULK_STOCK_PRICE_UPDATE',
        json_build_object(
            'updated_at', NOW(),
            'type', 'market_simulation',
            'stocks_updated', (SELECT COUNT(DISTINCT symbol) FROM portfolios)
        ),
        NOW()
    );
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get stock price (artificial or real)
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
  
  -- If no artificial price found, return placeholder for real price
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

-- =============================================================================
-- 6. CREATE TRIGGERS
-- =============================================================================

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger to update leaderboard when profiles change
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

DROP TRIGGER IF EXISTS update_leaderboard_on_profile_change ON profiles;
CREATE TRIGGER update_leaderboard_on_profile_change
  AFTER INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_update_leaderboard();

-- =============================================================================
-- 7. CREATE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS profiles_id_idx ON profiles(id);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON profiles(display_name);
CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS portfolios_symbol_idx ON portfolios(symbol);
CREATE INDEX IF NOT EXISTS admin_roles_user_id_idx ON admin_roles(user_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_admin_id_idx ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_created_at_idx ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS leaderboard_rank_idx ON leaderboard(rank);
CREATE INDEX IF NOT EXISTS leaderboard_total_value_idx ON leaderboard(total_value DESC);
CREATE INDEX IF NOT EXISTS leaderboard_username_idx ON leaderboard(username);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_symbol_idx ON artificial_stock_prices(symbol);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_active_idx ON artificial_stock_prices(is_active);
CREATE INDEX IF NOT EXISTS queued_orders_user_id_idx ON queued_orders(user_id);
CREATE INDEX IF NOT EXISTS queued_orders_status_idx ON queued_orders(status);
CREATE INDEX IF NOT EXISTS queued_orders_symbol_idx ON queued_orders(symbol);

-- =============================================================================
-- 8. INSERT DEFAULT DATA
-- =============================================================================

-- Insert default market settings
INSERT INTO market_settings (market_open_time, market_close_time, timezone, trading_days)
VALUES ('09:30:00', '16:00:00', 'America/New_York', '[1,2,3,4,5]')
ON CONFLICT DO NOTHING;

-- Insert default game settings
INSERT INTO game_settings (setting_key, setting_value, description) VALUES
('starting_balance', '100000', 'Starting balance for new users'),
('max_position_size', '0.2', 'Maximum position size as percentage of portfolio'),
('trading_fee', '0', 'Trading fee per transaction'),
('allow_short_selling', 'false', 'Allow short selling'),
('allow_margin_trading', 'false', 'Allow margin trading'),
('daily_trading_limit', '10', 'Maximum trades per day per user'),
('game_start_date', '"2024-01-01"', 'Game start date'),
('game_end_date', '"2024-12-31"', 'Game end date'),
('leaderboard_enabled', 'true', 'Enable leaderboard functionality'),
('allow_new_registrations', 'true', 'Allow new user registrations')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert some example artificial stock prices for testing
INSERT INTO artificial_stock_prices (symbol, name, artificial_price, original_price, is_active) VALUES
('DEMO', 'Demo Stock for Testing', 150.00, 145.50, true),
('TEST', 'Test Company Inc', 75.25, 72.00, true)
ON CONFLICT (symbol) DO NOTHING;

-- Update existing users to have usernames if they don't have them
INSERT INTO profiles (id, balance)
SELECT id, 100000.00 FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

UPDATE profiles 
SET username = 'user' || RIGHT(id::TEXT, 8),
    display_name = 'Player ' || RIGHT(id::TEXT, 4)
WHERE username IS NULL;

-- =============================================================================
-- 9. GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION is_admin TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_stock_price TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_leaderboard_with_usernames TO authenticated;
GRANT EXECUTE ON FUNCTION update_all_stock_prices TO authenticated;
GRANT SELECT ON artificial_stock_prices TO authenticated, anon;

-- =============================================================================
-- 10. FINAL SETUP
-- =============================================================================

-- Run initial leaderboard update
SELECT update_leaderboard_with_usernames();

COMMIT;