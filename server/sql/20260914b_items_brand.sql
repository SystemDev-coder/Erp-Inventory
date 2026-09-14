-- Free-text brand field for items, shown in the redesigned Items table/form.
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS brand character varying(120);
