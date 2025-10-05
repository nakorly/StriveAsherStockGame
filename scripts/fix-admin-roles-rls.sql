-- Fix the infinite recursion issue in admin_roles RLS policies

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Admins can view admin roles" ON admin_roles;
DROP POLICY IF EXISTS "Super admins can manage admin roles" ON admin_roles;

-- Temporarily disable RLS to allow initial admin setup
ALTER TABLE admin_roles DISABLE ROW LEVEL SECURITY;

-- Create a function to check if user is admin (this will be used by policies)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID DEFAULT auth.uid())
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_roles 
    WHERE admin_roles.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID DEFAULT auth.uid())
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_roles 
    WHERE admin_roles.user_id = $1 AND role = 'SUPER_ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely create first admin (bypasses RLS)
CREATE OR REPLACE FUNCTION create_first_admin(admin_email TEXT, admin_password TEXT)
RETURNS TEXT AS $$
DECLARE
  new_user_id UUID;
  existing_admin_count INTEGER;
BEGIN
  -- Check if any admin already exists
  SELECT COUNT(*) INTO existing_admin_count FROM admin_roles;
  
  IF existing_admin_count > 0 THEN
    RETURN 'Admin already exists. Cannot create first admin.';
  END IF;
  
  -- This function should be called after the user signs up through Supabase Auth
  -- We'll just create the admin role for the existing user
  
  -- Find user by email (this requires service role or would need to be done differently)
  -- For now, we'll assume the user_id is passed or we create the profile
  
  -- Create profile with admin balance
  INSERT INTO profiles (id, balance)
  SELECT id, 1000000.00 
  FROM auth.users 
  WHERE email = admin_email
  ON CONFLICT (id) DO UPDATE SET balance = 1000000.00;
  
  -- Get the user ID
  SELECT id INTO new_user_id FROM auth.users WHERE email = admin_email;
  
  IF new_user_id IS NULL THEN
    RETURN 'User with email ' || admin_email || ' not found. Please sign up first.';
  END IF;
  
  -- Create admin role
  INSERT INTO admin_roles (user_id, role, permissions, created_by)
  VALUES (
    new_user_id, 
    'SUPER_ADMIN', 
    '["all"]'::jsonb,
    new_user_id
  );
  
  -- Log the admin creation
  INSERT INTO admin_activity_log (admin_id, action, details)
  VALUES (
    new_user_id,
    'ADMIN_ACCOUNT_CREATED',
    ('{"type": "first_admin", "email": "' || admin_email || '"}')::jsonb
  );
  
  RETURN 'First admin account created successfully for ' || admin_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_admin TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_super_admin TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_first_admin TO authenticated, anon;

-- Re-enable RLS with better policies that don't cause recursion
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- Allow admins to view admin roles (using the function to avoid recursion)
CREATE POLICY "Admins can view admin roles" ON admin_roles
  FOR SELECT USING (is_admin());

-- Allow super admins to manage admin roles
CREATE POLICY "Super admins can insert admin roles" ON admin_roles
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update admin roles" ON admin_roles
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "Super admins can delete admin roles" ON admin_roles
  FOR DELETE USING (is_super_admin());

-- Allow users to view their own admin role
CREATE POLICY "Users can view their own admin role" ON admin_roles
  FOR SELECT USING (user_id = auth.uid());

-- Update other table policies to use the new functions
DROP POLICY IF EXISTS "Admins can view market settings" ON market_settings;
DROP POLICY IF EXISTS "Admins can update market settings" ON market_settings;
DROP POLICY IF EXISTS "Admins can view activity log" ON admin_activity_log;
DROP POLICY IF EXISTS "Admins can manage game settings" ON game_settings;

CREATE POLICY "Admins can view market settings" ON market_settings
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update market settings" ON market_settings
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can insert market settings" ON market_settings
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can view activity log" ON admin_activity_log
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can manage game settings" ON game_settings
  FOR ALL USING (is_admin());