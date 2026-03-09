
CREATE OR REPLACE FUNCTION public.validate_time_slot_weekday()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.weekday NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Weekday must be 2, 3, or 4';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_booking_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'cancelled', 'completed', 'absent') THEN
    RAISE EXCEPTION 'Invalid booking status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_credit_type()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.type NOT IN ('debit', 'refund', 'reset', 'manual_adjustment') THEN
    RAISE EXCEPTION 'Invalid credit type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;
