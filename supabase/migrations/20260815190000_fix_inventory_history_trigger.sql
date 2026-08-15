-- Fix the log_inventory_history trigger function to use correct columns and fields
CREATE OR REPLACE FUNCTION public.log_inventory_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  -- If we are in sync mode, bypass logging history
  IF current_setting('mobitech.is_sync', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_history (item_id, old_location, new_location, old_status, new_status)
    VALUES (NEW.id, NULL, NEW.location, NULL, NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.location IS DISTINCT FROM NEW.location OR OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.inventory_history (item_id, old_location, new_location, old_status, new_status)
      VALUES (NEW.id, OLD.location, NEW.location, OLD.status, NEW.status);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
