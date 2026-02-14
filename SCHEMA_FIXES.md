# Database Schema Fixes - February 14, 2026

## Overview
This document describes the schema mismatches that were identified and fixed to ensure the application works correctly when deployed to different environments.

## Issues Fixed

### 1. **Audit Logs Table**
**Problem:** The `audit_logs` table was missing the `meta` column and had a NOT NULL constraint on `action_type` that the application wasn't providing.

**Fix:** 
- Added `meta JSONB` column to store additional audit information
- Made `action_type` nullable if it exists (the application uses `action` column instead)

**Migration:** `20260219_fix_schema_mismatches.sql`

### 2. **Sales Table**
**Problem:** The `sales` table was missing the `customer_id` column that the application queries were expecting.

**Fix:**
- Added `customer_id BIGINT` column with foreign key reference to `customers(customer_id)`

**Migration:** `20260219_fix_schema_mismatches.sql`

### 3. **Products Table**
**Problem:** The `products` table was missing several columns:
- `barcode` - Required for product identification
- `sku` - Required for stock keeping unit tracking
- `updated_at` - Required for tracking product updates

**Fix:**
- Added `barcode VARCHAR(80) UNIQUE` column
- Added `sku VARCHAR(100)` column with index
- Added `updated_at TIMESTAMPTZ` column

**Migration:** `20260219_fix_schema_mismatches.sql`

### 4. **Inventory Movements Table**
**Problem:** The `inventory_movements` table was missing the `product_id` column.

**Fix:**
- Added `product_id BIGINT NOT NULL` column with foreign key reference to `products(product_id)`

**Migration:** `20260219_fix_schema_mismatches.sql`

### 5. **Migration Issues**
**Problem:** Several earlier migrations were failing due to:
- Missing enum types
- Missing tables being referenced
- Missing columns in conditional updates

**Fixes:**
- `20260210_add_products_price_cost_stock.sql` - Made conditional on column existence
- `20260216_inventory_triggers.sql` - Added enum type creation and conditional table checks
- `20260218_stock_module_seed.sql` - Made all inserts conditional on table/column existence

## How to Apply These Fixes

### For Existing Deployments
If you're pulling these changes and have an existing database:

1. **Pull the latest code:**
   ```bash
   git pull origin main
   ```

2. **Restart the Docker containers:**
   ```bash
   docker-compose down
   docker-compose up --build -d
   ```

3. **The migrations will run automatically** on server startup

### For New Deployments
For fresh installations, the complete schema will be created correctly from the start.

## Verification

After applying the fixes, verify the schema is correct:

```bash
docker-compose exec server bash
cd /app
PGPASSWORD=postgres psql -h db -U postgres -d inventorydb -f sql/check_schema.sql
```

This will display all columns in the critical tables and confirm they exist.

## Affected API Endpoints

The following API endpoints were affected by these schema issues and should now work correctly:

- `GET /api/sales` - Was failing due to missing `customer_id` column
- `GET /api/inventory/stock` - Was failing due to missing `barcode` column
- `GET /api/inventory/movements` - Was failing due to missing `product_id` column
- `PATCH /api/notifications/read-all` - Was failing due to missing `meta` column in audit logs

## Database Schema Compatibility

All migrations are designed to be:
- **Idempotent:** Can be run multiple times safely
- **Backward Compatible:** Won't break existing data
- **Conditional:** Only add columns/tables if they don't exist

## Testing After Deployment

After deploying these changes, test the following:

1. **Sales Module:**
   - Create a new sale
   - List all sales
   - View sale details

2. **Inventory Module:**
   - View stock levels
   - View inventory movements
   - Create stock adjustments

3. **Audit Logs:**
   - Perform any action that triggers audit logging
   - Verify no errors in the server logs

4. **Notifications:**
   - Mark notifications as read
   - Mark all notifications as read

## Notes for Team Members

- **DO NOT** manually modify the database schema
- **DO** use migrations for all schema changes
- **DO** test migrations locally before pushing
- **DO** check server logs after deployment for any migration errors

## Support

If you encounter any issues after pulling these changes:

1. Check the server logs: `docker-compose logs server --tail=100`
2. Verify the migration ran: Look for "Applying migration 20260219_fix_schema_mismatches.sql"
3. If issues persist, contact the development team

## Migration History

| Date | Migration File | Purpose |
|------|---------------|---------|
| 2026-02-19 | 20260219_fix_schema_mismatches.sql | Fix all schema mismatches |
| 2026-02-18 | 20260218_stock_module_seed.sql | Seed initial stock data |
| 2026-02-16 | 20260216_inventory_triggers.sql | Add inventory triggers |
| 2026-02-15 | 20260215_expand_audit_logs.sql | Expand audit log fields |
| 2026-02-10 | 20260210_add_products_price_cost_stock.sql | Add product pricing fields |
