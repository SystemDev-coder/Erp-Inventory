-- Load the full schema on the very first initialization of the Postgres volume.
-- Requires `./server/sql` to be mounted into `/docker-entrypoint-initdb.d/sql`.

\i '/docker-entrypoint-initdb.d/sql/Full_complete_scheme.sql'

