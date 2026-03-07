import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
        .eq('week_start', weekStart);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const bookMutation = useMutation({
    mutationFn: async ({ dayOfWeek, timeSlot }: { dayOfWeek: number; timeSlot: string }) => {
      const { error } = await supabase.from('bookings').insert({
        user_id: user!.id,
        day_of_week: dayOfWeek,
        time_slot: timeSlot,
        week_start: weekStart,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const unbookMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    bookings,
    isLoading,
    book: (dayOfWeek: number, timeSlot: string) => bookMutation.mutateAsync({ dayOfWeek, timeSlot }),
    unbook: (bookingId: string) => unbookMutation.mutateAsync(bookingId),
  };
}
