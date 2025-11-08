-- Create a unified cache for latest stock prices (real or artificial)
-- This table allows the app to serve recent prices without external API calls

CREATE TABLE IF NOT EXISTS latest_stock_prices (
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

ALTER TABLE latest_stock_prices ENABLE ROW LEVEL SECURITY;

-- Everyone can read cached prices; only authenticated can write (frontends write via RLS policies)
DROP POLICY IF EXISTS "Everyone can read latest prices" ON latest_stock_prices;
CREATE POLICY "Everyone can read latest prices" ON latest_stock_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can upsert latest prices" ON latest_stock_prices;
CREATE POLICY "Authenticated can upsert latest prices" ON latest_stock_prices
  FOR INSERT WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Authenticated can update latest prices" ON latest_stock_prices;
CREATE POLICY "Authenticated can update latest prices" ON latest_stock_prices
  FOR UPDATE USING (auth.role() IN ('authenticated')) WITH CHECK (auth.role() IN ('authenticated'));

CREATE INDEX IF NOT EXISTS latest_stock_prices_symbol_idx ON latest_stock_prices(symbol);
CREATE INDEX IF NOT EXISTS latest_stock_prices_updated_at_idx ON latest_stock_prices(updated_at DESC);

-- Helper function to upsert a price row
CREATE OR REPLACE FUNCTION upsert_latest_stock_price(
  p_symbol TEXT,
  p_name TEXT,
  p_price NUMERIC,
  p_change NUMERIC,
  p_change_percent NUMERIC,
  p_is_artificial BOOLEAN,
  p_source TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO latest_stock_prices(symbol, name, price, change, change_percent, is_artificial, source, updated_at)
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

GRANT EXECUTE ON FUNCTION upsert_latest_stock_price(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT) TO authenticated, anon;

-- Optional: keep compatibility with existing artificial_stock_prices by syncing into latest cache
-- Create trigger to mirror artificial prices into latest cache
CREATE OR REPLACE FUNCTION mirror_artificial_price_into_cache() RETURNS TRIGGER AS $$
BEGIN
  PERFORM upsert_latest_stock_price(
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

DO $$ BEGIN
  IF to_regclass('public.artificial_stock_prices') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_artificial_price_cache_ins ON artificial_stock_prices;
    CREATE TRIGGER trg_artificial_price_cache_ins
      AFTER INSERT OR UPDATE ON artificial_stock_prices
      FOR EACH ROW EXECUTE PROCEDURE mirror_artificial_price_into_cache();
  END IF;
END $$;

-- Update get_stock_price() to use the cache when artificial price not present
-- If a newer version already exists, replace its fallback behavior
CREATE OR REPLACE FUNCTION get_stock_price(stock_symbol TEXT)
RETURNS TABLE(
  symbol TEXT,
  name TEXT,
  price DECIMAL(10,2),
  is_artificial BOOLEAN
) AS $$
BEGIN
  -- First check the unified cache for the newest price (artificial or not)
  RETURN QUERY
  SELECT 
    lsp.symbol::TEXT,
    lsp.name::TEXT,
    lsp.price::DECIMAL(10,2),
    lsp.is_artificial
  FROM latest_stock_prices lsp
  WHERE UPPER(lsp.symbol) = UPPER(stock_symbol)
  ORDER BY lsp.updated_at DESC
  LIMIT 1;

  -- If not found, return placeholder indicating missing price
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

GRANT SELECT ON latest_stock_prices TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_stock_price(TEXT) TO authenticated, anon;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'latest_stock_prices cache ready and get_stock_price updated.';
END $$;

-- Recalculate all portfolio prices from latest_stock_prices before leaderboard refresh
CREATE OR REPLACE FUNCTION update_portfolios_from_latest_prices()
RETURNS void AS $$
BEGIN
  -- Update current prices, per-position change (vs previous price), and total value
  UPDATE portfolios p
  SET
    change = ROUND((lsp.price - p.price)::numeric, 2),
    change_percent = CASE WHEN p.price > 0 THEN ROUND((((lsp.price - p.price) / p.price) * 100)::numeric, 2) ELSE 0 END,
    price = lsp.price,
    total_value = (lsp.price * p.shares)
  FROM latest_stock_prices lsp
  WHERE UPPER(lsp.symbol) = UPPER(p.symbol);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_portfolios_from_latest_prices() TO authenticated;

-- Monthly performance tracking: baseline-per-month and MTD return
CREATE TABLE IF NOT EXISTS monthly_performance (
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

ALTER TABLE monthly_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view monthly performance" ON monthly_performance;
CREATE POLICY "Everyone can view monthly performance" ON monthly_performance
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can upsert monthly performance" ON monthly_performance;
CREATE POLICY "Authenticated can upsert monthly performance" ON monthly_performance
  FOR INSERT WITH CHECK (auth.role() IN ('authenticated'));

DROP POLICY IF EXISTS "Authenticated can update monthly performance" ON monthly_performance;
CREATE POLICY "Authenticated can update monthly performance" ON monthly_performance
  FOR UPDATE USING (auth.role() IN ('authenticated')) WITH CHECK (auth.role() IN ('authenticated'));

CREATE INDEX IF NOT EXISTS monthly_performance_user_idx ON monthly_performance(user_id);
CREATE INDEX IF NOT EXISTS monthly_performance_period_idx ON monthly_performance(year, month);

-- Helper: current total value for a user
CREATE OR REPLACE FUNCTION get_user_current_total(uid UUID)
RETURNS DECIMAL AS $$
DECLARE
  bal NUMERIC := 0;
  port NUMERIC := 0;
BEGIN
  SELECT COALESCE(balance, 0) INTO bal FROM profiles WHERE id = uid;
  SELECT COALESCE(SUM(total_value), 0) INTO port FROM portfolios WHERE user_id = uid;
  RETURN COALESCE(bal,0) + COALESCE(port,0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_current_total(UUID) TO authenticated, anon;

-- Ensure baseline row for current month for a user
CREATE OR REPLACE FUNCTION ensure_monthly_baseline_for_user(uid UUID)
RETURNS VOID AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
  cur_total NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM monthly_performance WHERE user_id = uid AND year = y AND month = m
  ) THEN
    cur_total := get_user_current_total(uid);
    INSERT INTO monthly_performance(user_id, year, month, start_total_value, end_total_value, return_percent)
    VALUES(uid, y, m, cur_total, cur_total, 0);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION ensure_monthly_baseline_for_user(UUID) TO authenticated;

-- Update MTD end_value and percent for all users
CREATE OR REPLACE FUNCTION update_monthly_performance_all_users()
RETURNS VOID AS $$
DECLARE
  rec RECORD;
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
  cur_total NUMERIC;
  start_total NUMERIC;
  pct NUMERIC;
BEGIN
  FOR rec IN SELECT id FROM profiles LOOP
    PERFORM ensure_monthly_baseline_for_user(rec.id);
    cur_total := get_user_current_total(rec.id);
    SELECT start_total_value INTO start_total FROM monthly_performance WHERE user_id = rec.id AND year = y AND month = m;
    IF start_total IS NULL THEN
      start_total := 0;
    END IF;
    IF start_total > 0 THEN
      pct := ((cur_total - start_total) / start_total) * 100;
    ELSE
      pct := 0;
    END IF;
    UPDATE monthly_performance
    SET end_total_value = cur_total,
        return_percent = pct,
        updated_at = NOW()
    WHERE user_id = rec.id AND year = y AND month = m;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_monthly_performance_all_users() TO authenticated;

-- Replace leaderboard update to rank by month-to-date percent
CREATE OR REPLACE FUNCTION update_leaderboard_with_usernames()
RETURNS void AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM NOW())::INT;
  m INT := EXTRACT(MONTH FROM NOW())::INT;
BEGIN
  -- Sync portfolios with latest cache first (if function exists)
  PERFORM 1 FROM pg_proc WHERE proname = 'update_portfolios_from_latest_prices';
  IF FOUND THEN
    PERFORM update_portfolios_from_latest_prices();
  END IF;

  -- Update monthly performance from current totals
  PERFORM update_monthly_performance_all_users();

  -- Clear and rebuild leaderboard ranked by monthly return percent
  DELETE FROM leaderboard;

  INSERT INTO leaderboard (user_id, username, display_name, total_value, total_gain_loss, total_gain_loss_percent, rank, updated_at)
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
  FROM profiles p
  LEFT JOIN (
    SELECT user_id, SUM(total_value) AS total_value FROM portfolios GROUP BY user_id
  ) pf ON pf.user_id = p.id
  LEFT JOIN monthly_performance mp ON mp.user_id = p.id AND mp.year = y AND mp.month = m;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_leaderboard_with_usernames() TO authenticated;
