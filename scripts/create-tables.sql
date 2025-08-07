-- Create portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  change DECIMAL(10,2) NOT NULL,
  change_percent DECIMAL(5,2) NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Enable Row Level Security
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to only see their own portfolio items
CREATE POLICY "Users can view their own portfolio items" ON portfolios
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own portfolio items
CREATE POLICY "Users can insert their own portfolio items" ON portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own portfolio items
CREATE POLICY "Users can update their own portfolio items" ON portfolios
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own portfolio items
CREATE POLICY "Users can delete their own portfolio items" ON portfolios
  FOR DELETE USING (auth.uid() = user_id);

-- Create an index for better performance on user queries
CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON portfolios(user_id);

-- Create an index for symbol lookups
CREATE INDEX IF NOT EXISTS portfolios_symbol_idx ON portfolios(symbol);
