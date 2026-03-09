import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useRole() {
  const { user } = useAuth();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data.map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  return {
    roles,
    isAdmin: roles.includes('admin'),
    isStudent: roles.includes('student'),
    isLoading,
  };
}
