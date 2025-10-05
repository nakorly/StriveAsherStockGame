# Database Setup Instructions

The SQL scripts created for your stock market game need to be run manually in Supabase. Follow these steps:

## Step 1: Access Supabase SQL Editor

1. Go to [supabase.com](https://supabase.com) and sign in
2. Select your project: `xxwywhclbsebnpgdnwca` 
3. In the left sidebar, click on **"SQL Editor"**

## Step 2: Run Scripts in Order

**IMPORTANT**: Run these scripts in the exact order listed below:

### 1. First - Fix Admin RLS Issues
Copy and paste the contents of `scripts/fix-admin-roles-rls.sql` into the SQL editor and click **"Run"**

This fixes the "infinite recursion" error you encountered when setting up admin accounts.

### 2. Second - Add New Features  
Copy and paste the contents of `scripts/add-missing-features.sql` into the SQL editor and click **"Run"**

This adds:
- Username/display name fields
- Artificial stock prices table
- Registration control settings
- Updated leaderboard functions

## Step 3: Verify Setup

After running both scripts, you can verify everything worked by checking:

1. **Tables Created**: Go to **"Table Editor"** in Supabase sidebar
   - You should see new table: `artificial_stock_prices`
   - `profiles` table should have new columns: `username`, `display_name`

2. **Settings Added**: In SQL Editor, run:
   ```sql
   SELECT * FROM game_settings WHERE setting_key = 'allow_new_registrations';
   ```
   You should see a row with this setting.

3. **Functions Created**: In SQL Editor, run:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name IN ('get_stock_price', 'update_leaderboard_with_usernames');
   ```
   You should see both functions listed.

## Step 4: Test Admin Setup

1. Try the admin auto-setup again from your login page
2. If it still has issues, you can manually create the first admin by running in SQL Editor:
   ```sql
   SELECT create_first_admin('greencheez@proton.me', 'SecureTrader01!');
   ```

## Troubleshooting

- **Permission errors**: Make sure you're logged in as the project owner
- **Syntax errors**: Copy the entire script content exactly as written
- **Already exists errors**: These are usually safe to ignore if re-running scripts

## What Each Script Does

### `fix-admin-roles-rls.sql`:
- Fixes infinite recursion in admin role policies
- Creates helper functions `is_admin()` and `is_super_admin()`
- Enables safe admin account creation

### `add-missing-features.sql`:
- Adds username fields to profiles
- Creates artificial stock prices system
- Adds registration control
- Updates leaderboard to use usernames
- Creates all necessary indexes and policies

After running both scripts, your admin dashboard will have all the new features working!