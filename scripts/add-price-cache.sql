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
