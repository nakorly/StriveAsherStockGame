-- Function to simulate stock price updates for all portfolios
CREATE OR REPLACE FUNCTION update_all_stock_prices()
RETURNS void AS $$
DECLARE
  stock_record RECORD;
  new_price DECIMAL(10,2);
  price_change DECIMAL(10,2);
  change_percent DECIMAL(5,2);
  volatility DECIMAL(5,4);
  symbol_hash INTEGER;
BEGIN
  -- Loop through all unique stocks in portfolios
  FOR stock_record IN 
    SELECT DISTINCT symbol, AVG(price) as avg_price 
    FROM portfolios 
    GROUP BY symbol
  LOOP
    -- Create volatility based on symbol for consistency
    symbol_hash := 0;
    FOR i IN 1..LENGTH(stock_record.symbol) LOOP
      symbol_hash := symbol_hash + ASCII(SUBSTRING(stock_record.symbol FROM i FOR 1));
    END LOOP;
    
    volatility := 0.02 + (symbol_hash % 10) * 0.001; -- 2-3% volatility
    
    -- Generate new price with random walk (slight upward bias)
    new_price := stock_record.avg_price * (1 + (RANDOM() - 0.48) * volatility);
    
    -- Ensure price doesn't go below $1
    new_price := GREATEST(1.00, new_price);
    
    -- Calculate changes
    price_change := new_price - stock_record.avg_price;
    change_percent := CASE 
      WHEN stock_record.avg_price > 0 THEN (price_change / stock_record.avg_price) * 100
      ELSE 0
    END;
    
    -- Update all portfolios with this symbol
    UPDATE portfolios 
    SET 
      price = new_price,
      change = price_change,
      change_percent = change_percent,
      total_value = shares * new_price
    WHERE symbol = stock_record.symbol;
    
  END LOOP;
  
  RAISE NOTICE 'Updated stock prices for all portfolios';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_all_stock_prices TO authenticated;
