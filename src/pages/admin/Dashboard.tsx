import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CalendarDays, XCircle, CheckCircle, Clock } from 'lucide-react';
import { startOfWeek, format, addWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

const DAYS: Record<number, string> = { 2: 'Terça', 3: 'Quarta', 4: 'Quinta' };
const MAX_PER_SLOT = 6;

export default function Dashboard() {
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(monday, weekOffset);
  }, [weekOffset]);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  const { data: stats } = useQuery({
    queryKey: ['admin-stats', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_stats', { p_week_start: weekStartStr });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: weekBookings = [] } = useQuery({
    queryKey: ['admin-week-bookings', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('week_start', weekStartStr)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: recentBookings = [] } = useQuery({
    queryKey: ['admin-recent-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Slot occupancy
  const slotOccupancy = useMemo(() => {
    const map: Record<string, number> = {};
    weekBookings.forEach((b: any) => {
      const key = `${b.day_of_week}-${b.time_slot}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [weekBookings]);

  const fullSlots = Object.entries(slotOccupancy).filter(([, count]) => count >= MAX_PER_SLOT);

  // User credit usage
  const userCreditUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    weekBookings.forEach((b: any) => {
      usage[b.user_id] = (usage[b.user_id] || 0) + 1;
    });
    return Object.entries(usage)
      .map(([userId, count]) => {
        const profile = profiles.find((p: any) => p.user_id === userId);
        return { userId, count, name: profile?.display_name || 'Sem nome', weekly_credits: (profile as any)?.weekly_credits || 3 };
      })
      .sort((a, b) => b.count - a.count);
  }, [weekBookings, profiles]);

  const statCards = [
    { label: 'Total Usuários', value: stats?.total_users || 0, icon: Users, color: 'text-primary' },
    { label: 'Agendamentos', value: stats?.week_bookings || 0, icon: CalendarDays, color: 'text-slot-booked' },
    { label: 'Cancelamentos', value: stats?.week_cancellations || 0, icon: XCircle, color: 'text-destructive' },
    { label: 'Completados', value: stats?.week_completed || 0, icon: CheckCircle, color: 'text-primary' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Week nav */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-heading font-bold text-foreground">Dashboard</h2>
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

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`h-8 w-8 ${s.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Full slots */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Horários Lotados</CardTitle>
            </CardHeader>
            <CardContent>
              {fullSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horário lotado</p>
              ) : (
                <div className="space-y-2">
                  {fullSlots.map(([key]) => {
                    const [day, slot] = key.split('-');
                    return (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span>{DAYS[Number(day)]} - {slot}</span>
                        <Badge variant="destructive">Lotado</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Credit usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Uso de Créditos</CardTitle>
            </CardHeader>
            <CardContent>
              {userCreditUsage.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum agendamento esta semana</p>
              ) : (
                <div className="space-y-2">
                  {userCreditUsage.slice(0, 10).map(u => (
                    <div key={u.userId} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{u.name}</span>
                      <span className="text-muted-foreground">{u.count}/{u.weekly_credits} créditos usados</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Slot occupancy grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vagas por Horário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Horário</th>
                    {Object.entries(DAYS).map(([d, label]) => (
                      <th key={d} className="text-center py-2 text-muted-foreground font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {['15:00-16:00', '16:05-17:00', '17:05-18:00', '18:00-19:00', '19:00-20:00'].map(slot => (
                    <tr key={slot} className="border-b border-border/50">
                      <td className="py-2 font-medium text-foreground">{slot}</td>
                      {[2, 3, 4].map(d => {
                        const count = slotOccupancy[`${d}-${slot}`] || 0;
                        const isFull = count >= MAX_PER_SLOT;
                        return (
                          <td key={d} className="text-center py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isFull ? 'bg-destructive/10 text-destructive' : count > 0 ? 'bg-slot-booked/10 text-slot-booked' : 'text-muted-foreground'}`}>
                              {count}/{MAX_PER_SLOT}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent bookings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Últimos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentBookings.map((b: any) => {
                const profile = profiles.find((p: any) => p.user_id === b.user_id);
                const statusColors: Record<string, string> = {
                  scheduled: 'bg-primary/10 text-primary',
                  cancelled: 'bg-destructive/10 text-destructive',
                  completed: 'bg-slot-available/10 text-slot-available',
                  absent: 'bg-slot-booked/10 text-slot-booked',
                };
                return (
                  <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                    <div>
                      <span className="font-medium text-foreground">{profile?.display_name || 'Sem nome'}</span>
                      <span className="text-muted-foreground ml-2">{DAYS[b.day_of_week]} {b.time_slot}</span>
                    </div>
                    <Badge className={`${statusColors[b.status] || ''} border-0`}>{b.status}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
