import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Lock, Unlock, Users, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { startOfWeek, addWeeks, format, setDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAYS_MAP: Record<number, string> = { 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira' };

export default function AdminSchedule() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [blockReason, setBlockReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentWeekStart = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(monday, weekOffset);
  }, [weekOffset]);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  const { data: timeSlots = [] } = useQuery({
    queryKey: ['admin-time-slots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .order('weekday')
        .order('start_time');
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ['admin-schedule-bookings', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('week_start', weekStartStr)
        .eq('status', 'scheduled');
      if (error) throw error;
      return data;
    },
  });

  const { data: blockedSlots = [] } = useQuery({
    queryKey: ['admin-blocked-slots', weekStartStr],
    queryFn: async () => {
      // Get dates for this week's Tue, Wed, Thu
      const dates = [2, 3, 4].map(d => format(setDay(currentWeekStart, d, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      const { data, error } = await supabase
        .from('blocked_slots')
        .select('*')
        .in('class_date', dates);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const updateCapacity = useMutation({
    mutationFn: async ({ slotId, capacity }: { slotId: string; capacity: number }) => {
      const { error } = await supabase
        .from('time_slots')
        .update({ capacity } as any)
        .eq('id', slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-time-slots'] });
      toast({ title: 'Capacidade atualizada!' });
    },
  });

  const blockSlot = useMutation({
    mutationFn: async ({ timeSlotId, classDate, reason }: { timeSlotId: string; classDate: string; reason: string }) => {
      const { error } = await supabase
        .from('blocked_slots')
        .insert({ time_slot_id: timeSlotId, class_date: classDate, reason } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots'] });
      toast({ title: 'Horário bloqueado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const unblockSlot = useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.from('blocked_slots').delete().eq('id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots'] });
      toast({ title: 'Horário desbloqueado!' });
    },
  });

  const getSlotBookings = (dayOfWeek: number, startTime: string) => {
    const slotId = `${startTime.replace(':', ':')}-${getEndTime(startTime)}`;
    return bookings.filter((b: any) => b.day_of_week === dayOfWeek && b.time_slot === slotId);
  };

  const getEndTime = (start: string) => {
    const map: Record<string, string> = {
      '15:00': '16:00', '16:05': '17:00', '17:05': '18:00', '18:00': '19:00', '19:00': '20:00',
    };
    return map[start] || '';
  };

  const isBlocked = (slotId: string, dayOfWeek: number) => {
    const classDate = format(setDay(currentWeekStart, dayOfWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return blockedSlots.find((b: any) => b.time_slot_id === slotId && b.class_date === classDate);
  };

  const groupedByDay = useMemo(() => {
    const groups: Record<number, any[]> = { 2: [], 3: [], 4: [] };
    timeSlots.forEach((s: any) => {
      if (groups[s.weekday]) groups[s.weekday].push(s);
    });
    return groups;
  }, [timeSlots]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-heading font-bold text-foreground">Gestão de Agenda</h2>
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

        <div className="grid md:grid-cols-3 gap-4">
          {[2, 3, 4].map(day => {
            const dayDate = setDay(currentWeekStart, day, { weekStartsOn: 1 });
            const classDate = format(dayDate, 'yyyy-MM-dd');
            const slots = groupedByDay[day] || [];

            return (
              <Card key={day}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-heading">
                    {DAYS_MAP[day]}
                    <span className="block text-sm text-muted-foreground font-normal">
                      {format(dayDate, "dd 'de' MMMM", { locale: ptBR })}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {slots.map((slot: any) => {
                    const startStr = slot.start_time?.substring(0, 5);
                    const endStr = slot.end_time?.substring(0, 5);
                    const slotLabel = `${startStr}-${endStr}`;
                    const slotBookings = getSlotBookings(day, startStr);
                    const blocked = isBlocked(slot.id, day);
                    const isFull = slotBookings.length >= slot.capacity;

                    return (
                      <div key={slot.id} className={`border rounded-lg p-3 space-y-2 ${blocked ? 'bg-destructive/5 border-destructive/20' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-foreground">{startStr} - {endStr}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isFull ? 'text-destructive' : 'text-muted-foreground'}`}>
                              <Users className="h-3 w-3 inline mr-1" />
                              {slotBookings.length}/{slot.capacity}
                            </span>
                            {blocked && <Badge variant="destructive" className="text-xs">Bloqueado</Badge>}
                          </div>
                        </div>

                        {/* Capacity control */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Cap:</span>
                          <div className="flex items-center gap-1 border rounded">
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => updateCapacity.mutate({ slotId: slot.id, capacity: Math.max(1, slot.capacity - 1) })}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-xs font-medium w-5 text-center">{slot.capacity}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => updateCapacity.mutate({ slotId: slot.id, capacity: slot.capacity + 1 })}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {blocked ? (
                            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs"
                              onClick={() => unblockSlot.mutate(blocked.id)}>
                              <Unlock className="h-3 w-3 mr-1" /> Desbloquear
                            </Button>
                          ) : (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs">
                                  <Lock className="h-3 w-3 mr-1" /> Bloquear
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Bloquear Horário</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3">
                                  <p className="text-sm text-muted-foreground">
                                    {DAYS_MAP[day]} - {startStr}-{endStr} ({classDate})
                                  </p>
                                  <Input
                                    placeholder="Motivo (opcional)"
                                    value={blockReason}
                                    onChange={e => setBlockReason(e.target.value)}
                                  />
                                  <Button onClick={() => {
                                    blockSlot.mutate({ timeSlotId: slot.id, classDate, reason: blockReason });
                                    setBlockReason('');
                                  }}>
                                    Confirmar Bloqueio
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>

                        {/* Students list */}
                        {slotBookings.length > 0 && (
                          <div className="border-t pt-2 mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Alunos:</p>
                            {slotBookings.map((b: any) => {
                              const p = profiles.find((p: any) => p.user_id === b.user_id);
                              return (
                                <div key={b.id} className="text-xs text-foreground py-0.5">
                                  • {p?.display_name || 'Sem nome'}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
