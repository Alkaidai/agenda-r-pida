import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBookings } from '@/hooks/useBookings';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { LogOut, ChevronLeft, ChevronRight, Users, Clock, Ticket, Shield } from 'lucide-react';
import { startOfWeek, addWeeks, format, setDay, isBefore, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DAYS = [
  { dayOfWeek: 2, label: 'Terça-feira' },
  { dayOfWeek: 3, label: 'Quarta-feira' },
  { dayOfWeek: 4, label: 'Quinta-feira' },
];

const TIME_SLOTS = [
  { id: '15:00-16:00', start: '15:00', end: '16:00', startHour: 15, startMin: 0 },
  { id: '16:05-17:00', start: '16:05', end: '17:00', startHour: 16, startMin: 5 },
  { id: '17:05-18:00', start: '17:05', end: '18:00', startHour: 17, startMin: 5 },
  { id: '18:00-19:00', start: '18:00', end: '19:00', startHour: 18, startMin: 0 },
  { id: '19:00-20:00', start: '19:00', end: '20:00', startHour: 19, startMin: 0 },
];

const MAX_PER_SLOT = 6;

export default function Schedule() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useRole();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = useMemo(() => {
    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    return addWeeks(monday, weekOffset);
  }, [weekOffset]);

  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  const { bookings, isLoading, book, unbook } = useBookings(weekStartStr);

  // Get user profile for weekly_credits
  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const MAX_WEEKLY_CREDITS = (profile as any)?.weekly_credits ?? 3;

  const getSlotDate = (dayOfWeek: number) => {
    return setDay(currentWeekStart, dayOfWeek, { weekStartsOn: 1 });
  };

  const isWithinCutoff = (dayOfWeek: number, slot: typeof TIME_SLOTS[0]) => {
    const slotDate = getSlotDate(dayOfWeek);
    const slotDateTime = new Date(slotDate);
    slotDateTime.setHours(slot.startHour, slot.startMin, 0, 0);
    const cutoff = addMinutes(slotDateTime, -30);
    return isBefore(new Date(), cutoff);
  };

  const getSlotBookings = (dayOfWeek: number, slotId: string) => {
    return bookings.filter(b => b.day_of_week === dayOfWeek && b.time_slot === slotId);
  };

  const isUserBooked = (dayOfWeek: number, slotId: string) => {
    return bookings.some(b => b.day_of_week === dayOfWeek && b.time_slot === slotId && b.user_id === user?.id);
  };

  const userBookingsThisWeek = bookings.filter(b => b.user_id === user?.id).length;
  const remainingCredits = MAX_WEEKLY_CREDITS - userBookingsThisWeek;

  const handleToggle = async (dayOfWeek: number, slotId: string) => {
    const slot = TIME_SLOTS.find(s => s.id === slotId)!;
    if (!isWithinCutoff(dayOfWeek, slot)) {
      toast({ title: 'Prazo expirado', description: 'Só é possível agendar/desagendar até 30 minutos antes da aula.', variant: 'destructive' });
      return;
    }

    const booked = isUserBooked(dayOfWeek, slotId);
    try {
      if (booked) {
        const booking = bookings.find(b => b.day_of_week === dayOfWeek && b.time_slot === slotId && b.user_id === user?.id);
        if (booking) {
          await unbook(booking.id);
          toast({ title: 'Desagendado!', description: 'Seu horário foi liberado e crédito devolvido.' });
        }
      } else {
        if (remainingCredits <= 0) {
          toast({ title: 'Sem créditos', description: `Você já usou suas ${MAX_WEEKLY_CREDITS} aulas desta semana.`, variant: 'destructive' });
          return;
        }
        const count = getSlotBookings(dayOfWeek, slotId).length;
        if (count >= MAX_PER_SLOT) {
          toast({ title: 'Horário lotado', description: 'Este horário já atingiu o máximo de pessoas.', variant: 'destructive' });
          return;
        }
        const classDate = format(getSlotDate(dayOfWeek), 'yyyy-MM-dd');
        await book(dayOfWeek, slotId, classDate);
        toast({ title: 'Agendado!', description: `Seu horário foi reservado. Créditos restantes: ${remainingCredits - 1}` });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-heading font-bold text-foreground">Agenda de Aulas</h1>
            <p className="text-sm text-muted-foreground">Olá, {user?.user_metadata?.display_name || user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin">
                  <Shield className="h-4 w-4 mr-1" />
                  Admin
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="text-sm text-muted-foreground">Semana</p>
            <p className="font-heading font-semibold text-foreground">
              {format(currentWeekStart, "dd/MM", { locale: ptBR })} - {format(addWeeks(currentWeekStart, 1), "dd/MM", { locale: ptBR })}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm">
            <Ticket className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Créditos: <span className={remainingCredits === 0 ? 'text-destructive' : 'text-primary'}>{remainingCredits}</span> / {MAX_WEEKLY_CREDITS}
            </span>
            <div className="flex gap-1 ml-1">
              {Array.from({ length: MAX_WEEKLY_CREDITS }).map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < userBookingsThisWeek ? 'bg-slot-booked' : 'bg-muted'}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DAYS.map((day, dayIdx) => (
            <Card key={day.dayOfWeek} className="border-border/50 shadow-sm animate-fade-in" style={{ animationDelay: `${dayIdx * 100}ms` }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-heading flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                  {day.label}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {format(getSlotDate(day.dayOfWeek), "dd 'de' MMMM", { locale: ptBR })}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {TIME_SLOTS.map(slot => {
                  const slotBookings = getSlotBookings(day.dayOfWeek, slot.id);
                  const count = slotBookings.length;
                  const userBooked = isUserBooked(day.dayOfWeek, slot.id);
                  const canModify = isWithinCutoff(day.dayOfWeek, slot);
                  const isFull = count >= MAX_PER_SLOT;
                  const noCredits = remainingCredits <= 0 && !userBooked;

                  return (
                    <button
                      key={slot.id}
                      onClick={() => handleToggle(day.dayOfWeek, slot.id)}
                      disabled={isLoading || (!userBooked && (isFull || noCredits)) || !canModify}
                      className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 transition-all text-left
                        ${userBooked
                          ? 'border-slot-booked bg-slot-booked/10 hover:bg-slot-booked/20'
                          : isFull
                            ? 'border-slot-full/30 bg-slot-full/5 opacity-60 cursor-not-allowed'
                            : canModify
                              ? 'border-border hover:border-primary hover:bg-primary/5 cursor-pointer'
                              : 'border-border opacity-50 cursor-not-allowed'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className={`h-4 w-4 ${userBooked ? 'text-slot-booked' : 'text-muted-foreground'}`} />
                        <span className="font-medium text-sm text-foreground">{slot.start} - {slot.end}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={`text-xs font-medium ${isFull ? 'text-slot-full' : 'text-muted-foreground'}`}>
                            {count}/{MAX_PER_SLOT}
                          </span>
                        </div>
                        {userBooked && (
                          <Badge variant="secondary" className="text-xs bg-slot-booked/20 text-slot-booked border-0">Agendado</Badge>
                        )}
                        {!canModify && <Badge variant="secondary" className="text-xs">Encerrado</Badge>}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-border" />
            Disponível
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slot-booked/20 border border-slot-booked/30" />
            Seu agendamento
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slot-full/10 border border-slot-full/30" />
            Lotado
          </div>
        </div>
      </div>
    </div>
  );
}
