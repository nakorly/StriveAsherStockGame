-- Add balance column to auth.users via a profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  balance DECIMAL(12,2) DEFAULT 100000.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Update portfolios table to support multiple shares
ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS portfolios_user_id_symbol_key;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 1;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2);
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS total_value DECIMAL(12,2);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS profiles_id_idx ON profiles(id);

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, balance)
  VALUES (new.id, 100000.00);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Update existing users to have profiles (if any exist)
INSERT INTO profiles (id, balance)
SELECT id, 100000.00 FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;
