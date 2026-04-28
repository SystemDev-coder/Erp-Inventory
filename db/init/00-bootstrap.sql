-- Bootstrap objects required for the app to start.
-- This runs only on the very first initialization of the Postgres volume.

-- Ensure the application schema exists.
CREATE SCHEMA IF NOT EXISTS ims;
