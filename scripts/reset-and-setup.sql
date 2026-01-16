
BEGIN;

-- Ensure crypto helpers are available for password hashing + UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop trigger on auth.users if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions (app-specific)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_current_user_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_current_user_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.has_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.update_leaderboard_with_usernames() CASCADE;
DROP FUNCTION IF EXISTS public.update_all_stock_prices() CASCADE;
DROP FUNCTION IF EXISTS public.get_stock_price(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.upsert_latest_stock_price(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.mirror_artificial_price_into_cache() CASCADE;
DROP FUNCTION IF EXISTS public.update_portfolios_from_latest_prices() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_current_total(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_monthly_baseline_for_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_monthly_performance_all_users() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_update_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.record_portfolio_snapshot(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.record_all_portfolio_snapshots() CASCADE;

-- Drop tables (app-specific)
DROP TABLE IF EXISTS public.latest_stock_prices CASCADE;
DROP TABLE IF EXISTS public.monthly_performance CASCADE;
DROP TABLE IF EXISTS public.portfolio_history CASCADE;
DROP TABLE IF EXISTS public.queued_orders CASCADE;
DROP TABLE IF EXISTS public.artificial_stock_prices CASCADE;
DROP TABLE IF EXISTS public.leaderboard CASCADE;
DROP TABLE IF EXISTS public.admin_activity_log CASCADE;
DROP TABLE IF EXISTS public.game_settings CASCADE;
DROP TABLE IF EXISTS public.market_settings CASCADE;
DROP TABLE IF EXISTS public.admin_roles CASCADE;
DROP TABLE IF EXISTS public.portfolios CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =============================================================================
-- 1. CREATE BASE TABLES
-- =============================================================================

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  balance DECIMAL(12,2) DEFAULT 100000.00,
  starting_balance DECIMAL(12,2) DEFAULT 100000.00,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.portfolios (
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

CREATE TABLE public.admin_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role VARCHAR(20) DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'SUPER_ADMIN')),
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE public.market_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_open_time TIME DEFAULT '09:30:00',
  market_close_time TIME DEFAULT '16:00:00',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  trading_days JSONB DEFAULT '[1,2,3,4,5]',
  is_market_open_override BOOLEAN DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE TABLE public.game_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE TABLE public.admin_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.leaderboard (
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

CREATE TABLE public.artificial_stock_prices (
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

CREATE TABLE public.queued_orders (
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
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE SET NULL
);

CREATE TABLE public.latest_stock_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price DECIMAL(12,4) NOT NULL,
  change DECIMAL(12,4) DEFAULT 0,
  change_percent DECIMAL(8,4) DEFAULT 0,
  is_artificial BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'unknown',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.monthly_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  start_total_value DECIMAL(15,2) NOT NULL,
  end_total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  return_percent DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

CREATE TABLE public.portfolio_history (
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

-- =============================================================================
-- 2. ENABLE RLS
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artificial_stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queued_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.latest_stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_history ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. RLS POLICIES (fixed admin recursion)
-- =============================================================================
-- Helper functions required by RLS policies
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE role = 'SUPER_ADMIN'
  );
END;
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own portfolio items" ON public.portfolios;
CREATE POLICY "Users can view their own portfolio items" ON public.portfolios
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own portfolio items" ON public.portfolios;
CREATE POLICY "Users can insert their own portfolio items" ON public.portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own portfolio items" ON public.portfolios;
CREATE POLICY "Users can update their own portfolio items" ON public.portfolios
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own portfolio items" ON public.portfolios;
CREATE POLICY "Users can delete their own portfolio items" ON public.portfolios
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view admin roles" ON public.admin_roles;
CREATE POLICY "Users can view admin roles" ON public.admin_roles
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "Super admins can manage admin roles" ON public.admin_roles;
CREATE POLICY "Super admins can manage admin roles" ON public.admin_roles
  FOR ALL USING (public.is_current_user_super_admin());

DROP POLICY IF EXISTS "Allow initial admin creation" ON public.admin_roles;
CREATE POLICY "Allow initial admin creation" ON public.admin_roles
  FOR INSERT WITH CHECK (
    NOT public.has_super_admin() OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "Admins can view market settings" ON public.market_settings;
DROP POLICY IF EXISTS "Everyone can view market settings" ON public.market_settings;
CREATE POLICY "Everyone can view market settings" ON public.market_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update market settings" ON public.market_settings;
CREATE POLICY "Admins can update market settings" ON public.market_settings
  FOR UPDATE USING (
    public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "Everyone can view game settings" ON public.game_settings;
CREATE POLICY "Everyone can view game settings" ON public.game_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage game settings" ON public.game_settings;
CREATE POLICY "Admins can manage game settings" ON public.game_settings
  FOR ALL USING (
    public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "Admins can view activity log" ON public.admin_activity_log;
CREATE POLICY "Admins can view activity log" ON public.admin_activity_log
  FOR SELECT USING (
    public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "System can insert activity log" ON public.admin_activity_log;
CREATE POLICY "System can insert activity log" ON public.admin_activity_log
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Everyone can view leaderboard" ON public.leaderboard;
CREATE POLICY "Everyone can view leaderboard" ON public.leaderboard
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can update leaderboard" ON public.leaderboard;
CREATE POLICY "System can update leaderboard" ON public.leaderboard
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Everyone can view artificial stock prices" ON public.artificial_stock_prices;
CREATE POLICY "Everyone can view artificial stock prices" ON public.artificial_stock_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage artificial stock prices" ON public.artificial_stock_prices;
CREATE POLICY "Admins can manage artificial stock prices" ON public.artificial_stock_prices
  FOR ALL USING (
    public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "Users can view their own queued orders" ON public.queued_orders;
CREATE POLICY "Users can view their own queued orders" ON public.queued_orders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own queued orders" ON public.queued_orders;
CREATE POLICY "Users can insert their own queued orders" ON public.queued_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own queued orders" ON public.queued_orders;
CREATE POLICY "Users can update their own queued orders" ON public.queued_orders
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own queued orders" ON public.queued_orders;
CREATE POLICY "Users can delete their own queued orders" ON public.queued_orders
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Everyone can read latest prices" ON public.latest_stock_prices;
CREATE POLICY "Everyone can read latest prices" ON public.latest_stock_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can upsert latest prices" ON public.latest_stock_prices;
CREATE POLICY "Authenticated can upsert latest prices" ON public.latest_stock_prices
  FOR INSERT WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Authenticated can update latest prices" ON public.latest_stock_prices;
CREATE POLICY "Authenticated can update latest prices" ON public.latest_stock_prices
  FOR UPDATE USING (auth.role() IN ('authenticated')) WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Everyone can view monthly performance" ON public.monthly_performance;
CREATE POLICY "Everyone can view monthly performance" ON public.monthly_performance
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can upsert monthly performance" ON public.monthly_performance;
CREATE POLICY "Authenticated can upsert monthly performance" ON public.monthly_performance
  FOR INSERT WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Authenticated can update monthly performance" ON public.monthly_performance;
CREATE POLICY "Authenticated can update monthly performance" ON public.monthly_performance
  FOR UPDATE USING (auth.role() IN ('authenticated')) WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Users can view their own portfolio history" ON public.portfolio_history;
CREATE POLICY "Users can view their own portfolio history" ON public.portfolio_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert portfolio history" ON public.portfolio_history;
CREATE POLICY "System can insert portfolio history" ON public.portfolio_history
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 4. FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, balance, starting_balance)
  VALUES (new.id, 100000.00, 100000.00);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE role = 'SUPER_ADMIN'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_all_stock_prices()
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
    FOR portfolio_record IN 
        SELECT DISTINCT symbol, price
        FROM public.portfolios 
        ORDER BY symbol
    LOOP
        SELECT ASCII(LEFT(portfolio_record.symbol, 1)) + 
               ASCII(COALESCE(SUBSTRING(portfolio_record.symbol, 2, 1), 'A')) + 
               ASCII(COALESCE(SUBSTRING(portfolio_record.symbol, 3, 1), 'A'))
        INTO symbol_hash;

        volatility := 0.02 + (symbol_hash % 10) * 0.001;
        random_change := (RANDOM() - 0.48) * volatility;
        new_price := GREATEST(1.00, portfolio_record.price * (1 + random_change));
        new_price := ROUND(new_price, 2);

        price_change := new_price - portfolio_record.price;
        change_percent := CASE 
            WHEN portfolio_record.price > 0 THEN (price_change / portfolio_record.price) * 100
            ELSE 0
        END;

        UPDATE public.portfolios 
        SET 
            price = new_price,
            change = ROUND(price_change, 2),
            change_percent = ROUND(change_percent, 2),
            total_value = shares * new_price
        WHERE symbol = portfolio_record.symbol;
    END LOOP;

    INSERT INTO public.admin_activity_log (
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
            'stocks_updated', (SELECT COUNT(DISTINCT symbol) FROM public.portfolios)
        ),
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.upsert_latest_stock_price(
  p_symbol TEXT,
  p_name TEXT,
  p_price NUMERIC,
  p_change NUMERIC,
  p_change_percent NUMERIC,
  p_is_artificial BOOLEAN,
  p_source TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.latest_stock_prices(symbol, name, price, change, change_percent, is_artificial, source, updated_at)
  VALUES (UPPER(p_symbol), p_name, p_price, p_change, p_change_percent, p_is_artificial, p_source, NOW())
  ON CONFLICT (symbol) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    change = EXCLUDED.change,
    change_percent = EXCLUDED.change_percent,
    is_artificial = EXCLUDED.is_artificial,
    source = EXCLUDED.source,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.mirror_artificial_price_into_cache() RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.upsert_latest_stock_price(
    NEW.symbol::TEXT,
    COALESCE(NEW.name, NEW.symbol)::TEXT,
    NEW.artificial_price,
    COALESCE(NEW.price_change_percent, 0),
    COALESCE(NEW.price_change_percent, 0),
    TRUE,
    'artificial_table'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_stock_price(stock_symbol TEXT)
RETURNS TABLE(
  symbol TEXT,
  name TEXT,
  price DECIMAL(10,2),
  is_artificial BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lsp.symbol::TEXT,
    lsp.name::TEXT,
    lsp.price::DECIMAL(10,2),
    lsp.is_artificial
  FROM public.latest_stock_prices lsp
  WHERE UPPER(lsp.symbol) = UPPER(stock_symbol)
  ORDER BY lsp.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      UPPER(stock_symbol)::TEXT,
      'Unknown'::TEXT,
      0.00::DECIMAL(10,2),
      false as is_artificial;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_portfolios_from_latest_prices()
RETURNS void AS $$
BEGIN
  UPDATE public.portfolios p
  SET
    change = ROUND((lsp.price - p.price)::numeric, 2),
    change_percent = CASE WHEN p.price > 0 THEN ROUND((((lsp.price - p.price) / p.price) * 100)::numeric, 2) ELSE 0 END,
    price = lsp.price,
    total_value = (lsp.price * p.shares)
  FROM public.latest_stock_prices lsp
  WHERE UPPER(lsp.symbol) = UPPER(p.symbol);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_current_total(uid UUID)
RETURNS DECIMAL AS $$
DECLARE
  bal NUMERIC := 0;
  port NUMERIC := 0;
BEGIN
  SELECT COALESCE(balance, 0) INTO bal FROM public.profiles WHERE id = uid;
  SELECT COALESCE(SUM(total_value), 0) INTO port FROM public.portfolios WHERE user_id = uid;
  RETURN COALESCE(bal,0) + COALESCE(port,0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.ensure_monthly_baseline_for_user(uid UUID)
RETURNS VOID AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
  cur_total NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.monthly_performance WHERE user_id = uid AND year = y AND month = m
  ) THEN
    cur_total := public.get_user_current_total(uid);
    INSERT INTO public.monthly_performance(user_id, year, month, start_total_value, end_total_value, return_percent)
    VALUES(uid, y, m, cur_total, cur_total, 0);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_monthly_performance_all_users()
RETURNS VOID AS $$
DECLARE
  rec RECORD;
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
  cur_total NUMERIC;
  start_total NUMERIC;
  pct NUMERIC;
BEGIN
  FOR rec IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_monthly_baseline_for_user(rec.id);
    cur_total := public.get_user_current_total(rec.id);
    SELECT start_total_value INTO start_total FROM public.monthly_performance WHERE user_id = rec.id AND year = y AND month = m;
    IF start_total IS NULL THEN
      start_total := 0;
    END IF;
    IF start_total > 0 THEN
      pct := ((cur_total - start_total) / start_total) * 100;
    ELSE
      pct := 0;
    END IF;
    UPDATE public.monthly_performance
    SET end_total_value = cur_total,
        return_percent = pct,
        updated_at = NOW()
    WHERE user_id = rec.id AND year = y AND month = m;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_leaderboard_with_usernames()
RETURNS void AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
BEGIN
  PERFORM public.update_portfolios_from_latest_prices();
  PERFORM public.update_monthly_performance_all_users();

  DELETE FROM public.leaderboard;

  INSERT INTO public.leaderboard (user_id, username, display_name, total_value, total_gain_loss, total_gain_loss_percent, rank, updated_at)
  SELECT 
    p.id AS user_id,
    COALESCE(p.username, 'User' || RIGHT(p.id::TEXT, 4)) AS username,
    COALESCE(p.display_name, p.username, 'Anonymous') AS display_name,
    (COALESCE(p.balance, 0) + COALESCE(pf.total_value, 0)) AS total_value,
    ((COALESCE(p.balance, 0) + COALESCE(pf.total_value, 0)) - COALESCE(mp.start_total_value, 0)) AS mtd_gain_loss,
    CASE WHEN COALESCE(mp.start_total_value, 0) > 0 THEN (((COALESCE(p.balance, 0) + COALESCE(pf.total_value, 0)) - mp.start_total_value) / mp.start_total_value) * 100 ELSE 0 END AS mtd_return_percent,
    ROW_NUMBER() OVER (
      ORDER BY CASE WHEN COALESCE(mp.start_total_value, 0) > 0 THEN (((COALESCE(p.balance, 0) + COALESCE(pf.total_value, 0)) - mp.start_total_value) / mp.start_total_value) ELSE 0 END DESC
    ) AS rank,
    NOW() AS updated_at
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id, SUM(total_value) AS total_value FROM public.portfolios GROUP BY user_id
  ) pf ON pf.user_id = p.id
  LEFT JOIN public.monthly_performance mp ON mp.user_id = p.id AND mp.year = y AND mp.month = m;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trigger_update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.leaderboard (user_id, username, display_name, total_value, total_gain_loss, total_gain_loss_percent)
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

CREATE OR REPLACE FUNCTION public.record_portfolio_snapshot(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_cash_balance DECIMAL(12,2);
  v_portfolio_value DECIMAL(15,2);
  v_total_value DECIMAL(15,2);
  v_starting_balance DECIMAL(12,2);
  v_total_gain_loss DECIMAL(15,2);
  v_total_gain_loss_percent DECIMAL(8,4);
BEGIN
  SELECT balance, starting_balance 
  INTO v_cash_balance, v_starting_balance
  FROM public.profiles 
  WHERE id = p_user_id;

  SELECT COALESCE(SUM(total_value), 0)
  INTO v_portfolio_value
  FROM public.portfolios
  WHERE user_id = p_user_id;

  v_total_value := v_cash_balance + v_portfolio_value;
  v_total_gain_loss := v_total_value - v_starting_balance;
  v_total_gain_loss_percent := CASE 
    WHEN v_starting_balance > 0 THEN (v_total_gain_loss / v_starting_balance) * 100
    ELSE 0
  END;

  INSERT INTO public.portfolio_history (
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

CREATE OR REPLACE FUNCTION public.record_all_portfolio_snapshots()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  v_user_count INTEGER;
BEGIN
  FOR user_record IN
    SELECT id FROM public.profiles
  LOOP
    PERFORM public.record_portfolio_snapshot(user_record.id);
  END LOOP;

  IF auth.uid() IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_count FROM public.profiles;

    INSERT INTO public.admin_activity_log (
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
-- 5. TRIGGERS
-- =============================================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS update_leaderboard_on_profile_change ON public.profiles;
CREATE TRIGGER update_leaderboard_on_profile_change
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_leaderboard();

DROP TRIGGER IF EXISTS trg_artificial_price_cache_ins ON public.artificial_stock_prices;
CREATE TRIGGER trg_artificial_price_cache_ins
  AFTER INSERT OR UPDATE ON public.artificial_stock_prices
  FOR EACH ROW EXECUTE PROCEDURE public.mirror_artificial_price_into_cache();

-- =============================================================================
-- 6. INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS profiles_id_idx ON public.profiles(id);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON public.profiles(display_name);
CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON public.portfolios(user_id);
CREATE INDEX IF NOT EXISTS portfolios_symbol_idx ON public.portfolios(symbol);
CREATE INDEX IF NOT EXISTS admin_roles_user_id_idx ON public.admin_roles(user_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_admin_id_idx ON public.admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_created_at_idx ON public.admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS leaderboard_rank_idx ON public.leaderboard(rank);
CREATE INDEX IF NOT EXISTS leaderboard_total_value_idx ON public.leaderboard(total_value DESC);
CREATE INDEX IF NOT EXISTS leaderboard_username_idx ON public.leaderboard(username);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_symbol_idx ON public.artificial_stock_prices(symbol);
CREATE INDEX IF NOT EXISTS artificial_stock_prices_active_idx ON public.artificial_stock_prices(is_active);
CREATE INDEX IF NOT EXISTS queued_orders_user_id_idx ON public.queued_orders(user_id);
CREATE INDEX IF NOT EXISTS queued_orders_status_idx ON public.queued_orders(status);
CREATE INDEX IF NOT EXISTS queued_orders_symbol_idx ON public.queued_orders(symbol);
CREATE INDEX IF NOT EXISTS latest_stock_prices_symbol_idx ON public.latest_stock_prices(symbol);
CREATE INDEX IF NOT EXISTS latest_stock_prices_updated_at_idx ON public.latest_stock_prices(updated_at DESC);
CREATE INDEX IF NOT EXISTS monthly_performance_user_idx ON public.monthly_performance(user_id);
CREATE INDEX IF NOT EXISTS monthly_performance_period_idx ON public.monthly_performance(year, month);
CREATE INDEX IF NOT EXISTS portfolio_history_user_id_idx ON public.portfolio_history(user_id);
CREATE INDEX IF NOT EXISTS portfolio_history_snapshot_date_idx ON public.portfolio_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS portfolio_history_user_date_idx ON public.portfolio_history(user_id, snapshot_date DESC);

-- =============================================================================
-- 7. DEFAULT DATA
-- =============================================================================

INSERT INTO public.market_settings (market_open_time, market_close_time, timezone, trading_days)
VALUES ('09:30:00', '16:00:00', 'America/New_York', '[1,2,3,4,5]')
ON CONFLICT DO NOTHING;

INSERT INTO public.game_settings (setting_key, setting_value, description) VALUES
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

INSERT INTO public.artificial_stock_prices (symbol, name, artificial_price, original_price, is_active) VALUES
('DEMO', 'Demo Stock for Testing', 150.00, 145.50, true),
('TEST', 'Test Company Inc', 75.25, 72.00, true)
ON CONFLICT (symbol) DO NOTHING;

-- =============================================================================
-- 8. GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_super_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_price(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_leaderboard_with_usernames() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_all_stock_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_latest_stock_price(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_portfolios_from_latest_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_current_total(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ensure_monthly_baseline_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_monthly_performance_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_portfolio_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_all_portfolio_snapshots() TO authenticated;
GRANT SELECT ON public.latest_stock_prices TO authenticated, anon;
GRANT SELECT ON public.artificial_stock_prices TO authenticated, anon;
GRANT SELECT ON public.portfolio_history TO authenticated;

-- =============================================================================
-- 9. CREATE ADMIN USER (greencheez@proton.me / SecureTrader01!)
-- =============================================================================
DO $$
DECLARE
  v_email TEXT := 'greencheez@proton.me';
  v_password TEXT := 'SecureTrader01!';
  v_user_id UUID;
  v_instance_id UUID;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_user_id, v_instance_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, false
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email', NOW(), NOW(), NOW()
    );
  END IF;

  INSERT INTO public.profiles (id, balance, starting_balance, username, display_name)
  VALUES (v_user_id, 1000000.00, 1000000.00, 'greencheez', 'Green Cheez')
  ON CONFLICT (id) DO UPDATE SET
    balance = 1000000.00,
    starting_balance = 1000000.00,
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name;

  INSERT INTO public.admin_roles (user_id, role, permissions, created_by)
  VALUES (v_user_id, 'SUPER_ADMIN', '["all"]'::jsonb, v_user_id)
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'SUPER_ADMIN',
    permissions = '["all"]'::jsonb;

  INSERT INTO public.admin_activity_log (admin_id, action, details)
  VALUES (v_user_id, 'ADMIN_ACCOUNT_CREATED', jsonb_build_object('type','default_admin','email',v_email));
END $$;

-- Initial rebuild tasks
SELECT public.update_leaderboard_with_usernames();
SELECT public.record_all_portfolio_snapshots();

COMMIT;
