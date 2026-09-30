-- Products page has 6 in-page tabs (Products, Store, Inventory Transaction, Products
-- State, Categories, Units), but every one of them is currently gated server-side by
-- items.* only - even though categories.*, units.*, stores.*, store_items.* already
-- exist as real rows in ims.permissions (auto-seeded per-table by the legacy
-- sp_generate_all_permissions() procedure elsewhere in this file), nothing ever checks
-- them. This means there is no way today to grant/deny e.g. just the Units tab
-- independently of the rest of Products.
--
-- This migration:
--   1) seeds two brand-new permission rows for the Inventory Transaction tab, which has
--      no backing table of its own (its data is a UNION of stock_adjustment +
--      inventory_movements + sales tables, so nothing to derive a key from);
--   2) backfills every role AND every user that already holds the matching items.*
--      action so that switching the route guards (see products.routes.ts,
--      stores.routes.ts, inventory.routes.ts) from items.* to these specific keys does
--      not silently take tabs away from anyone who can use them today. This must run
--      BEFORE the stricter backend checks are deployed, never after.

INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
VALUES
  ('inventory_transactions.view', 'View Inventory Transactions', 'Inventory', 'Transactions', 'view', 'View the combined inventory transaction log'),
  ('inventory_transactions.create', 'Create Inventory Transactions', 'Inventory', 'Transactions', 'create', 'Post a new inventory transaction')
ON CONFLICT (perm_key) DO NOTHING;

-- Role-level backfill: grant target_key to every role that already has source_key.
INSERT INTO ims.role_permissions (role_id, perm_id)
SELECT rp.role_id, p2.perm_id
  FROM (VALUES
    ('items.view',   'categories.view'),
    ('items.create', 'categories.create'),
    ('items.update', 'categories.update'),
    ('items.delete', 'categories.delete'),
    ('items.view',   'units.view'),
    ('items.create', 'units.create'),
    ('items.update', 'units.update'),
    ('items.delete', 'units.delete'),
    ('items.view',   'stores.view'),
    ('items.create', 'stores.create'),
    ('items.update', 'stores.update'),
    ('items.view',   'store_items.view'),
    ('items.create', 'store_items.create'),
    ('items.update', 'store_items.update'),
    ('items.delete', 'store_items.delete'),
    ('items.view',   'inventory_transactions.view'),
    ('items.create', 'inventory_transactions.create'),
    ('items.update', 'inventory_transactions.create')
  ) AS mapping(source_key, target_key)
  JOIN ims.permissions p1 ON p1.perm_key = mapping.source_key
  JOIN ims.permissions p2 ON p2.perm_key = mapping.target_key
  JOIN ims.role_permissions rp ON rp.perm_id = p1.perm_id
ON CONFLICT DO NOTHING;

-- User-level backfill: same mapping, for direct per-user grants (ims.user_permissions),
-- which role-level backfill alone would miss.
INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
SELECT up.user_id, p2.perm_id, up.granted_by
  FROM (VALUES
    ('items.view',   'categories.view'),
    ('items.create', 'categories.create'),
    ('items.update', 'categories.update'),
    ('items.delete', 'categories.delete'),
    ('items.view',   'units.view'),
    ('items.create', 'units.create'),
    ('items.update', 'units.update'),
    ('items.delete', 'units.delete'),
    ('items.view',   'stores.view'),
    ('items.create', 'stores.create'),
    ('items.update', 'stores.update'),
    ('items.view',   'store_items.view'),
    ('items.create', 'store_items.create'),
    ('items.update', 'store_items.update'),
    ('items.delete', 'store_items.delete'),
    ('items.view',   'inventory_transactions.view'),
    ('items.create', 'inventory_transactions.create'),
    ('items.update', 'inventory_transactions.create')
  ) AS mapping(source_key, target_key)
  JOIN ims.permissions p1 ON p1.perm_key = mapping.source_key
  JOIN ims.permissions p2 ON p2.perm_key = mapping.target_key
  JOIN ims.user_permissions up ON up.perm_id = p1.perm_id
ON CONFLICT DO NOTHING;
