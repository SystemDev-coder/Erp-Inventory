-- Helper script to check if all required columns exist
-- Run this to verify schema after migrations
SET search_path TO ims, public;

\echo 'Checking audit_logs columns...'
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema='ims' AND table_name='audit_logs'
ORDER BY ordinal_position;

\echo '\nChecking sales columns...'
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema='ims' AND table_name='sales'
ORDER BY ordinal_position;

\echo '\nChecking products columns...'
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema='ims' AND table_name='products'
ORDER BY ordinal_position;

\echo '\nChecking inventory_movements columns...'
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema='ims' AND table_name='inventory_movements'
ORDER BY ordinal_position;
