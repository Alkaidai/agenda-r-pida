import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, XCircle, CheckCircle, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, addWeeks, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAYS: Record<number, string> = { 2: 'Terça', 3: 'Quarta', 4: 'Quinta' };
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado', cancelled: 'Cancelado', completed: 'Concluído', absent: 'Ausente',
};
const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-primary/10 text-primary',
  cancelled: 'bg-destructive/10 text-destructive',
  completed: 'bg-slot-available/10 text-slot-available',
  absent: 'bg-slot-booked/10 text-slot-booked',
};

export default function AdminBookings() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentWeekStart = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(monday, weekOffset);
  }, [weekOffset]);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  const { data: bookings = [] } = useQuery({
    queryKey: ['admin-bookings', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('week_start', weekStartStr)
        .order('day_of_week')
        .order('time_slot');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const cancelBooking = useMutation({
    mutationFn: async ({ bookingId, refund }: { bookingId: string; refund: boolean }) => {
      const { error } = await supabase.rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_refund: refund,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      toast({ title: 'Agendamento cancelado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const markAttendance = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: string }) => {
      const { error } = await supabase.rpc('mark_attendance', {
        p_booking_id: bookingId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      toast({ title: 'Presença registrada!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const getProfileName = (userId: string) => {
    const p = profiles.find((p: any) => p.user_id === userId);
    return p?.display_name || 'Sem nome';
  };

  const filtered = bookings.filter((b: any) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (dayFilter !== 'all' && b.day_of_week !== Number(dayFilter)) return false;
    if (search) {
      const name = getProfileName(b.user_id).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-heading font-bold text-foreground">Gestão de Reservas</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">
              Semana de {format(currentWeekStart, "dd/MM/yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar aluno..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="absent">Ausente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="2">Terça</SelectItem>
              <SelectItem value="3">Quarta</SelectItem>
              <SelectItem value="4">Quinta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bookings list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum agendamento encontrado</CardContent></Card>
          ) : (
            filtered.map((b: any) => (
              <Card key={b.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">{getProfileName(b.user_id)}</span>
                      <Badge className={`${STATUS_COLORS[b.status] || ''} border-0 text-xs`}>
                        {STATUS_LABELS[b.status] || b.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {DAYS[b.day_of_week]} · {b.time_slot} · Semana {b.week_start}
                    </p>
                  </div>

                  {b.status === 'scheduled' && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => markAttendance.mutate({ bookingId: b.id, status: 'completed' })}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Presente
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => markAttendance.mutate({ bookingId: b.id, status: 'absent' })}
                      >
                        <UserX className="h-4 w-4 mr-1" /> Ausente
                      </Button>
                      <Button
                        variant="destructive" size="sm"
                        onClick={() => cancelBooking.mutate({ bookingId: b.id, refund: true })}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
