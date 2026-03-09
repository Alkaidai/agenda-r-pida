import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { setDay, format } from 'date-fns';

export function useBookings(weekStart: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['bookings', weekStart];

  const { data: bookings = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('week_start', weekStart)
        .eq('status', 'scheduled');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const bookMutation = useMutation({
    mutationFn: async ({ dayOfWeek, timeSlot, classDate }: { dayOfWeek: number; timeSlot: string; classDate: string }) => {
      const { error } = await supabase.rpc('book_class', {
        p_day_of_week: dayOfWeek,
        p_time_slot: timeSlot,
        p_week_start: weekStart,
        p_class_date: classDate,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const unbookMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_refund: true,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    bookings,
    isLoading,
    book: (dayOfWeek: number, timeSlot: string, classDate: string) =>
      bookMutation.mutateAsync({ dayOfWeek, timeSlot, classDate }),
    unbook: (bookingId: string) => unbookMutation.mutateAsync(bookingId),
  };
}
