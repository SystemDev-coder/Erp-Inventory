-- Clear sidebar cache so new Purchased Items menu appears
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'ims' AND table_name = 'sidebar_menu_cache') THEN
    DELETE FROM ims.sidebar_menu_cache;
  END IF;
END$$;
