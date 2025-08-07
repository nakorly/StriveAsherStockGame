-- Update existing portfolio entries to have default values for new columns
UPDATE portfolios 
SET 
  shares = COALESCE(shares, 1),
  purchase_price = COALESCE(purchase_price, price),
  total_value = COALESCE(total_value, price * COALESCE(shares, 1))
WHERE 
  shares IS NULL 
  OR purchase_price IS NULL 
  OR total_value IS NULL;

-- Make sure all columns have NOT NULL constraints with defaults
ALTER TABLE portfolios 
  ALTER COLUMN shares SET DEFAULT 1,
  ALTER COLUMN shares SET NOT NULL;

ALTER TABLE portfolios 
  ALTER COLUMN purchase_price SET NOT NULL;

ALTER TABLE portfolios 
  ALTER COLUMN total_value SET NOT NULL;
