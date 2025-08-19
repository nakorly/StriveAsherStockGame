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
  trading_days JSONB DEFAULT '[1,2,3,4,5]', -- Monday-Friday
  is_market_open_override BOOLEAN DEFAULT NULL, -- NULL = auto, true/false = manual override
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

-- Create game settings table
CREATE TABLE IF NOT EXISTS game_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  total_value DECIMAL(15,2) DEFAULT 0,
  total_gain_loss DECIMAL(15,2) DEFAULT 0,
  total_gain_loss_percent DECIMAL(8,4) DEFAULT 0,
  rank INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Admin roles policies (only admins can view/modify)
CREATE POLICY "Admins can view admin roles" ON admin_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage admin roles" ON admin_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'SUPER_ADMIN')
  );

-- Market settings policies
CREATE POLICY "Admins can view market settings" ON market_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

CREATE POLICY "Admins can update market settings" ON market_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Admin activity log policies
CREATE POLICY "Admins can view activity log" ON admin_activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

CREATE POLICY "System can insert activity log" ON admin_activity_log
  FOR INSERT WITH CHECK (true);

-- Game settings policies
CREATE POLICY "Everyone can view game settings" ON game_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage game settings" ON game_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Leaderboard policies
CREATE POLICY "Everyone can view leaderboard" ON leaderboard
  FOR SELECT USING (true);

CREATE POLICY "System can update leaderboard" ON leaderboard
  FOR ALL USING (true);

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
('leaderboard_enabled', 'true', 'Enable leaderboard functionality')
ON CONFLICT (setting_key) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS admin_roles_user_id_idx ON admin_roles(user_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_admin_id_idx ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_created_at_idx ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS leaderboard_rank_idx ON leaderboard(rank);
CREATE INDEX IF NOT EXISTS leaderboard_total_value_idx ON leaderboard(total_value DESC);

-- Function to update leaderboard
CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS void AS $$
BEGIN
  -- Update leaderboard with current portfolio values
  INSERT INTO leaderboard (user_id, total_value, total_gain_loss, total_gain_loss_percent)
  SELECT 
    p.id as user_id,
    COALESCE(prof.balance, 0) + COALESCE(portfolio_value.total_value, 0) as total_value,
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
  LEFT JOIN profiles prof ON p.id = prof.id
  ON CONFLICT (user_id) DO UPDATE SET
    total_value = EXCLUDED.total_value,
    total_gain_loss = EXCLUDED.total_gain_loss,
    total_gain_loss_percent = EXCLUDED.total_gain_loss_percent,
    last_updated = NOW();

  -- Update ranks
  UPDATE leaderboard SET rank = ranked.new_rank
  FROM (
    SELECT user_id, ROW_NUMBER() OVER (ORDER BY total_value DESC) as new_rank
    FROM leaderboard
  ) ranked
  WHERE leaderboard.user_id = ranked.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
