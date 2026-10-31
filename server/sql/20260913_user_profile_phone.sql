-- profile.service.ts selects u.phone but ims.users never had a phone column,
-- so GET /api/profile has been throwing a DB error on every call. Add the
-- column for real so View/Edit Profile can actually read and save a phone number.
ALTER TABLE ims.users ADD COLUMN IF NOT EXISTS phone character varying(40);
