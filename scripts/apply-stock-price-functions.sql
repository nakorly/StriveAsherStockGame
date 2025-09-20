-- Create function to update all stock prices with realistic simulation
CREATE OR REPLACE FUNCTION update_all_stock_prices()
RETURNS void
LANGUAGE plpgsql
AS $$
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
        SELECT DISTINCT symbol, price, user_id, id
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
    
    -- Log the bulk update in admin activity
    INSERT INTO admin_activity_log (
        admin_id, 
        action, 
        details, 
        created_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', -- System user
        'BULK_STOCK_PRICE_UPDATE',
        json_build_object(
            'updated_at', NOW(),
            'type', 'market_simulation',
            'stocks_updated', (SELECT COUNT(DISTINCT symbol) FROM portfolios)
        ),
        NOW()
    );
    
END;
$$;

-- Create function to simulate realistic stock price movement for a single symbol
CREATE OR REPLACE FUNCTION simulate_stock_price(current_price NUMERIC, stock_symbol TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    symbol_hash INTEGER;
    volatility NUMERIC;
    random_change NUMERIC;
    new_price NUMERIC;
BEGIN
    -- Create hash from symbol for consistent volatility
    SELECT ASCII(LEFT(stock_symbol, 1)) + 
           ASCII(COALESCE(SUBSTRING(stock_symbol, 2, 1), 'A')) + 
           ASCII(COALESCE(SUBSTRING(stock_symbol, 3, 1), 'A'))
    INTO symbol_hash;
    
    -- Calculate volatility (2-3% base + symbol variation)
    volatility := 0.02 + (symbol_hash % 10) * 0.001;
    
    -- Generate random change with slight upward bias
    random_change := (RANDOM() - 0.48) * volatility;
    
    -- Calculate new price (minimum $1.00)
    new_price := GREATEST(1.00, current_price * (1 + random_change));
    
    RETURN ROUND(new_price, 2);
END;
$$;

-- Create function to update leaderboard
CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Clear existing leaderboard
    DELETE FROM leaderboard;
    
    -- Calculate and insert new leaderboard data
    INSERT INTO leaderboard (user_id, rank, total_value, total_gain_loss, total_gain_loss_percent, updated_at)
    SELECT 
        user_id,
        ROW_NUMBER() OVER (ORDER BY total_account_value DESC) as rank,
        total_account_value as total_value,
        total_gain_loss,
        CASE 
            WHEN starting_balance > 0 THEN (total_gain_loss / starting_balance) * 100
            ELSE 0
        END as total_gain_loss_percent,
        NOW() as updated_at
    FROM (
        SELECT 
            p.id as user_id,
            p.balance + COALESCE(portfolio_value, 0) as total_account_value,
            (p.balance + COALESCE(portfolio_value, 0)) - COALESCE(gs.setting_value::NUMERIC, 100000) as total_gain_loss,
            COALESCE(gs.setting_value::NUMERIC, 100000) as starting_balance
        FROM profiles p
        LEFT JOIN (
            SELECT 
                user_id,
                SUM(total_value) as portfolio_value
            FROM portfolios 
            GROUP BY user_id
        ) pf ON p.id = pf.user_id
        LEFT JOIN game_settings gs ON gs.setting_key = 'starting_balance'
    ) user_totals
    ORDER BY total_account_value DESC;
END;
$$;

-- Create function to execute queued orders when market opens
CREATE OR REPLACE FUNCTION execute_queued_orders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    order_record RECORD;
    current_price NUMERIC;
    total_cost NUMERIC;
    user_balance NUMERIC;
    existing_stock RECORD;
    new_shares INTEGER;
    avg_purchase_price NUMERIC;
BEGIN
    -- Process all pending orders
    FOR order_record IN 
        SELECT * FROM queued_orders 
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
    LOOP
        -- Get current/simulated price for the stock
        SELECT simulate_stock_price(
            COALESCE(order_record.order_price, 100), 
            order_record.symbol
        ) INTO current_price;
        
        IF order_record.order_type = 'BUY' THEN
            -- Handle buy orders
            total_cost := current_price * order_record.shares;
            
            -- Check user balance
            SELECT balance INTO user_balance 
            FROM profiles 
            WHERE id = order_record.user_id;
            
            IF user_balance >= total_cost THEN
                -- Check if user already owns this stock
                SELECT * INTO existing_stock
                FROM portfolios 
                WHERE user_id = order_record.user_id 
                AND symbol = order_record.symbol;
                
                IF FOUND THEN
                    -- Update existing position
                    new_shares := existing_stock.shares + order_record.shares;
                    avg_purchase_price := (
                        (existing_stock.purchase_price * existing_stock.shares) + 
                        (current_price * order_record.shares)
                    ) / new_shares;
                    
                    UPDATE portfolios 
                    SET 
                        shares = new_shares,
                        price = current_price,
                        purchase_price = avg_purchase_price,
                        total_value = new_shares * current_price,
                        change = current_price - avg_purchase_price,
                        change_percent = ((current_price - avg_purchase_price) / avg_purchase_price) * 100
                    WHERE id = existing_stock.id;
                ELSE
                    -- Create new position
                    INSERT INTO portfolios (
                        user_id, symbol, name, price, change, change_percent,
                        shares, purchase_price, total_value
                    ) VALUES (
                        order_record.user_id, order_record.symbol, order_record.name,
                        current_price, 0, 0, order_record.shares, current_price,
                        total_cost
                    );
                END IF;
                
                -- Update user balance
                UPDATE profiles 
                SET balance = balance - total_cost 
                WHERE id = order_record.user_id;
                
                -- Mark order as executed
                UPDATE queued_orders 
                SET 
                    status = 'EXECUTED',
                    executed_at = NOW(),
                    execution_price = current_price
                WHERE id = order_record.id;
            ELSE
                -- Insufficient funds - cancel order
                UPDATE queued_orders 
                SET status = 'CANCELLED'
                WHERE id = order_record.id;
            END IF;
            
        ELSIF order_record.order_type = 'SELL' THEN
            -- Handle sell orders
            SELECT * INTO existing_stock
            FROM portfolios 
            WHERE user_id = order_record.user_id 
            AND symbol = order_record.symbol;
            
            IF FOUND AND existing_stock.shares >= order_record.shares THEN
                total_cost := current_price * order_record.shares;
                
                IF order_record.shares = existing_stock.shares THEN
                    -- Sell all shares - remove position
                    DELETE FROM portfolios WHERE id = existing_stock.id;
                ELSE
                    -- Partial sale - update position
                    new_shares := existing_stock.shares - order_record.shares;
                    UPDATE portfolios 
                    SET 
                        shares = new_shares,
                        price = current_price,
                        total_value = new_shares * current_price,
                        change = current_price - existing_stock.purchase_price,
                        change_percent = ((current_price - existing_stock.purchase_price) / existing_stock.purchase_price) * 100
                    WHERE id = existing_stock.id;
                END IF;
                
                -- Update user balance
                UPDATE profiles 
                SET balance = balance + total_cost 
                WHERE id = order_record.user_id;
                
                -- Mark order as executed
                UPDATE queued_orders 
                SET 
                    status = 'EXECUTED',
                    executed_at = NOW(),
                    execution_price = current_price
                WHERE id = order_record.id;
            ELSE
                -- Insufficient shares - cancel order
                UPDATE queued_orders 
                SET status = 'CANCELLED'
                WHERE id = order_record.id;
            END IF;
        END IF;
    END LOOP;
    
    -- Log the execution
    INSERT INTO admin_activity_log (
        admin_id, 
        action, 
        details, 
        created_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        'EXECUTE_QUEUED_ORDERS',
        json_build_object(
            'executed_at', NOW(),
            'orders_processed', (SELECT COUNT(*) FROM queued_orders WHERE status IN ('EXECUTED', 'CANCELLED'))
        ),
        NOW()
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_all_stock_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_stock_price(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION execute_queued_orders() TO authenticated;

-- Test the functions (optional)
-- SELECT update_all_stock_prices();
-- SELECT update_leaderboard();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Stock price functions have been successfully created and configured!';
    RAISE NOTICE 'Available functions:';
    RAISE NOTICE '- update_all_stock_prices(): Updates all stock prices with realistic simulation';
    RAISE NOTICE '- simulate_stock_price(price, symbol): Simulates price for a single stock';
    RAISE NOTICE '- update_leaderboard(): Recalculates user rankings';
    RAISE NOTICE '- execute_queued_orders(): Processes pending buy/sell orders';
END $$;
