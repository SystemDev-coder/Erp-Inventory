-- Apply context functions directly
SET search_path TO ims, public;

-- Function to set current context
CREATE OR REPLACE FUNCTION ims.set_current_context(p_user_id BIGINT, p_branch_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
  PERFORM set_config('app.current_branch_id', p_branch_id::text, false);
END;
$$;

-- Function to get current branch
CREATE OR REPLACE FUNCTION ims.get_current_branch()
RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_value TEXT;
BEGIN
  v_value := current_setting('app.current_branch_id', true);
  IF v_value IS NULL OR v_value = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_value::BIGINT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Function to get current user
CREATE OR REPLACE FUNCTION ims.get_current_user()
RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_value TEXT;
BEGIN
  v_value := current_setting('app.current_user_id', true);
  IF v_value IS NULL OR v_value = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_value::BIGINT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

SELECT 'Context functions created successfully!' as result;
