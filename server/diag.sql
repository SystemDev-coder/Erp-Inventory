SELECT nspname FROM pg_namespace WHERE nspname = 'ims';
SELECT count(*) as companies FROM ims.company;
SELECT count(*) as branches FROM ims.branches;
SELECT count(*) as roles FROM ims.roles;
SELECT count(*) as users FROM ims.users;
SELECT username, role_id FROM ims.users;
