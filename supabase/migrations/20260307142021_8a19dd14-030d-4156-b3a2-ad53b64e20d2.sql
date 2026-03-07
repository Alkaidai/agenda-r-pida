
-- Enforce max 3 bookings per user per week at DB level
CREATE OR REPLACE FUNCTION public.check_weekly_booking_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.bookings WHERE user_id = NEW.user_id AND week_start = NEW.week_start) >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 aulas semanais atingido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_weekly_limit
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_weekly_booking_limit();
