-- Create queued_orders table
CREATE TABLE IF NOT EXISTS queued_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
  shares INTEGER NOT NULL,
  order_price DECIMAL(10,2), -- Price when order was placed (for reference)
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'CANCELLED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_price DECIMAL(10,2), -- Actual execution price
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL -- For sell orders
);

-- Enable Row Level Security
ALTER TABLE queued_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own queued orders" ON queued_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queued orders" ON queued_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queued orders" ON queued_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queued orders" ON queued_orders
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS queued_orders_user_id_idx ON queued_orders(user_id);
CREATE INDEX IF NOT EXISTS queued_orders_status_idx ON queued_orders(status);
CREATE INDEX IF NOT EXISTS queued_orders_symbol_idx ON queued_orders(symbol);
