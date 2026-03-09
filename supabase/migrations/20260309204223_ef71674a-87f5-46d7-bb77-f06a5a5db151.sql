
-- Drop old trigger/function
DROP TRIGGER IF EXISTS enforce_weekly_limit ON public.bookings;
DROP FUNCTION IF EXISTS public.check_weekly_booking_limit();

-- 1. Role system
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "users_view_own_roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins_select_roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_delete_roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Profile updates
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_credits integer NOT NULL DEFAULT 3;

CREATE POLICY "admins_select_profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Time slots table
CREATE TABLE public.time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 6,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_time_slot_weekday()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.weekday NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Weekday must be 2, 3, or 4';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_weekday BEFORE INSERT OR UPDATE ON public.time_slots
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_slot_weekday();

CREATE POLICY "anyone_view_slots" ON public.time_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins_insert_slots" ON public.time_slots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_slots" ON public.time_slots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_delete_slots" ON public.time_slots FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.time_slots (weekday, start_time, end_time, capacity) VALUES
  (2, '15:00', '16:00', 6), (2, '16:05', '17:00', 6), (2, '17:05', '18:00', 6), (2, '18:00', '19:00', 6), (2, '19:00', '20:00', 6),
  (3, '15:00', '16:00', 6), (3, '16:05', '17:00', 6), (3, '17:05', '18:00', 6), (3, '18:00', '19:00', 6), (3, '19:00', '20:00', 6),
  (4, '15:00', '16:00', 6), (4, '16:05', '17:00', 6), (4, '17:05', '18:00', 6), (4, '18:00', '19:00', 6), (4, '19:00', '20:00', 6);

-- 4. Update bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS class_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_booking_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'cancelled', 'completed', 'absent') THEN
    RAISE EXCEPTION 'Invalid booking status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_booking_status BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_status();

CREATE POLICY "admins_select_bookings" ON public.bookings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_bookings" ON public.bookings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_delete_bookings" ON public.bookings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Blocked slots
CREATE TABLE public.blocked_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_slot_id uuid REFERENCES public.time_slots(id) ON DELETE CASCADE NOT NULL,
  class_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(time_slot_id, class_date)
);
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_blocked" ON public.blocked_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins_insert_blocked" ON public.blocked_slots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_update_blocked" ON public.blocked_slots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_delete_blocked" ON public.blocked_slots FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Credit transactions
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  reason text,
  related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_credit_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type NOT IN ('debit', 'refund', 'reset', 'manual_adjustment') THEN
    RAISE EXCEPTION 'Invalid credit type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_credit_type BEFORE INSERT OR UPDATE ON public.credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_type();

CREATE POLICY "users_view_own_credits" ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins_select_credits" ON public.credit_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins_insert_credits" ON public.credit_transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. RPC: book_class (atomic, race-condition safe)
CREATE OR REPLACE FUNCTION public.book_class(
  p_day_of_week integer,
  p_time_slot text,
  p_week_start date,
  p_class_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_user_id uuid := auth.uid();
  v_weekly_credits integer;
  v_active_bookings integer;
  v_slot_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_user_id AND active = true) THEN
    RAISE EXCEPTION 'Usuário inativo';
  END IF;

  SELECT weekly_credits INTO v_weekly_credits FROM profiles WHERE user_id = v_user_id;

  SELECT COUNT(*) INTO v_active_bookings
  FROM bookings WHERE user_id = v_user_id AND week_start = p_week_start AND status = 'scheduled';

  IF v_active_bookings >= v_weekly_credits THEN
    RAISE EXCEPTION 'Sem créditos disponíveis';
  END IF;

  SELECT COUNT(*) INTO v_slot_count
  FROM bookings
  WHERE day_of_week = p_day_of_week AND time_slot = p_time_slot AND week_start = p_week_start AND status = 'scheduled'
  FOR UPDATE;

  IF v_slot_count >= 6 THEN
    RAISE EXCEPTION 'Horário lotado';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE user_id = v_user_id AND day_of_week = p_day_of_week AND time_slot = p_time_slot AND week_start = p_week_start AND status = 'scheduled') THEN
    RAISE EXCEPTION 'Já agendado neste horário';
  END IF;

  INSERT INTO bookings (user_id, day_of_week, time_slot, week_start, class_date, status)
  VALUES (v_user_id, p_day_of_week, p_time_slot, p_week_start, p_class_date, 'scheduled')
  RETURNING id INTO v_booking_id;

  INSERT INTO credit_transactions (user_id, type, amount, reason, related_booking_id, week_start)
  VALUES (v_user_id, 'debit', -1, 'Agendamento de aula', v_booking_id, p_week_start);

  RETURN v_booking_id;
END;
$$;

-- 8. RPC: cancel_booking (atomic)
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_refund boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;

  v_is_admin := public.has_role(v_user_id, 'admin');

  IF NOT v_is_admin AND v_booking.user_id != v_user_id THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF v_booking.status != 'scheduled' THEN
    RAISE EXCEPTION 'Agendamento não pode ser cancelado';
  END IF;

  UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = p_booking_id;

  IF p_refund THEN
    INSERT INTO credit_transactions (user_id, type, amount, reason, related_booking_id, week_start)
    VALUES (v_booking.user_id, 'refund', 1, 'Cancelamento de aula', p_booking_id, v_booking.week_start);
  END IF;
END;
$$;

-- 9. RPC: mark attendance
CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_booking_id uuid,
  p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_status NOT IN ('completed', 'absent') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  UPDATE bookings SET status = p_status WHERE id = p_booking_id AND status = 'scheduled';
END;
$$;

-- 10. RPC: admin stats
CREATE OR REPLACE FUNCTION public.get_admin_stats(p_week_start date)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'active_users', (SELECT COUNT(*) FROM profiles WHERE active = true),
    'week_bookings', (SELECT COUNT(*) FROM bookings WHERE week_start = p_week_start AND status = 'scheduled'),
    'week_cancellations', (SELECT COUNT(*) FROM bookings WHERE week_start = p_week_start AND status = 'cancelled'),
    'week_completed', (SELECT COUNT(*) FROM bookings WHERE week_start = p_week_start AND status = 'completed'),
    'week_absent', (SELECT COUNT(*) FROM bookings WHERE week_start = p_week_start AND status = 'absent')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 11. RPC: reset weekly credits (called by edge function)
CREATE OR REPLACE FUNCTION public.reset_weekly_credits(p_week_start date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO credit_transactions (user_id, type, amount, reason, week_start)
  SELECT p.user_id, 'reset', p.weekly_credits, 'Reset semanal de créditos', p_week_start
  FROM profiles p
  WHERE p.active = true;
END;
$$;

-- 12. Update handle_new_user to also create role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

-- 13. Backfill existing users with student role
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'student'::app_role FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;
