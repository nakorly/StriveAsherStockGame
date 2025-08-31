-- Create the default admin user
-- Note: In production, you'd want to change this password immediately

-- First, we need to create the user in auth.users
-- This would typically be done through Supabase Auth, but for setup purposes:

-- Insert default admin into profiles (assuming the auth user exists)
-- You'll need to sign up with greencheez@proton.me / SecureTrader01! first, then run this script

-- Function to create admin user and role
CREATE OR REPLACE FUNCTION create_default_admin(admin_email TEXT, admin_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Create profile for admin user
  INSERT INTO profiles (id, balance)
  VALUES (admin_user_id, 1000000.00) -- Give admin a large balance
  ON CONFLICT (id) DO UPDATE SET balance = 1000000.00;
  
  -- Create admin role
  INSERT INTO admin_roles (user_id, role, permissions, created_by)
  VALUES (
    admin_user_id, 
    'SUPER_ADMIN', 
    '["all"]'::jsonb,
    admin_user_id
  )
  ON CONFLICT (user_id) DO UPDATE SET 
    role = 'SUPER_ADMIN',
    permissions = '["all"]'::jsonb;
  
  -- Log the admin creation
  INSERT INTO admin_activity_log (admin_id, action, details)
  VALUES (
    admin_user_id,
    'ADMIN_ACCOUNT_CREATED',
    ('{"type": "default_admin", "email": "' || admin_email || '"}')::jsonb
  );
  
  RAISE NOTICE 'Default admin account created for %', admin_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_default_admin TO authenticated;

-- Instructions for setup:
-- 1. First sign up with email: greencheez@proton.me and password: SecureTrader01!
-- 2. Check greencheez@proton.me for confirmation email and confirm your account
-- 3. Then run: SELECT create_default_admin('greencheez@proton.me', 'USER_ID_FROM_AUTH');
-- 4. Or use the admin setup function in the app
