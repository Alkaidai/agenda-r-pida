import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, UserCheck, UserX, Shield, GraduationCap, Minus, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { startOfWeek } from 'date-fns';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['admin-all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['admin-all-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: weekBookings = [] } = useQuery({
    queryKey: ['admin-user-bookings', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('week_start', weekStart)
        .eq('status', 'scheduled');
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ active } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-profiles'] });
      toast({ title: 'Status atualizado!' });
    },
  });

  const updateCredits = useMutation({
    mutationFn: async ({ userId, credits }: { userId: string; credits: number }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ weekly_credits: credits } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-profiles'] });
      toast({ title: 'Créditos atualizados!' });
    },
  });

  const toggleRole = useMutation({
    mutationFn: async ({ userId, currentRole }: { userId: string; currentRole: string }) => {
      const newRole = currentRole === 'admin' ? 'student' : 'admin';
      // Remove current role
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', currentRole as any);
      // Add new role
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-roles'] });
      toast({ title: 'Papel atualizado!' });
    },
  });

  const filtered = profiles.filter((p: any) =>
    !search || p.display_name?.toLowerCase().includes(search.toLowerCase()) || p.user_id?.includes(search)
  );

  const getUserRole = (userId: string) => {
    const r = roles.find((r: any) => r.user_id === userId);
    return r ? (r as any).role : 'student';
  };

  const getUserBookings = (userId: string) =>
    weekBookings.filter((b: any) => b.user_id === userId).length;

  // User history dialog
  const { data: userHistory = [] } = useQuery({
    queryKey: ['user-history', selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', selectedUser.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUser,
  });

  const { data: creditHistory = [] } = useQuery({
    queryKey: ['credit-history', selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', selectedUser.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUser,
  });

  const DAYS: Record<number, string> = { 2: 'Ter', 3: 'Qua', 4: 'Qui' };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-heading font-bold text-foreground">Gestão de Usuários</h2>
          <span className="text-sm text-muted-foreground">{profiles.length} usuários</span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-3">
          {filtered.map((p: any) => {
            const role = getUserRole(p.user_id);
            const usedCredits = getUserBookings(p.user_id);
            const wc = p.weekly_credits ?? 3;

            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${p.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {(p.display_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{p.display_name || 'Sem nome'}</span>
                          <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                            {role === 'admin' ? 'Admin' : 'Aluno'}
                          </Badge>
                          {!p.active && <Badge variant="destructive" className="text-xs">Inativo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Créditos: {usedCredits}/{wc} usados esta semana
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Credits adjustment */}
                      <div className="flex items-center gap-1 border rounded-md">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => updateCredits.mutate({ userId: p.user_id, credits: Math.max(0, wc - 1) })}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-6 text-center">{wc}</span>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => updateCredits.mutate({ userId: p.user_id, credits: wc + 1 })}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Button
                        variant="outline" size="sm"
                        onClick={() => toggleRole.mutate({ userId: p.user_id, currentRole: role })}
                      >
                        {role === 'admin' ? <GraduationCap className="h-4 w-4 mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
                        {role === 'admin' ? 'Tornar Aluno' : 'Tornar Admin'}
                      </Button>

                      <Button
                        variant={p.active ? 'destructive' : 'default'} size="sm"
                        onClick={() => toggleActive.mutate({ userId: p.user_id, active: !p.active })}
                      >
                        {p.active ? <UserX className="h-4 w-4 mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
                        {p.active ? 'Desativar' : 'Ativar'}
                      </Button>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedUser(p)}>
                            Histórico
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Histórico - {p.display_name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium text-sm mb-2">Agendamentos</h4>
                              {userHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhum agendamento</p>
                              ) : (
                                <div className="space-y-1 max-h-40 overflow-auto">
                                  {userHistory.map((b: any) => (
                                    <div key={b.id} className="text-xs flex justify-between py-1 border-b border-border/30">
                                      <span>{DAYS[b.day_of_week]} {b.time_slot} ({b.week_start})</span>
                                      <Badge variant="secondary" className="text-xs">{b.status}</Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium text-sm mb-2">Transações de Crédito</h4>
                              {creditHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhuma transação</p>
                              ) : (
                                <div className="space-y-1 max-h-40 overflow-auto">
                                  {creditHistory.map((c: any) => (
                                    <div key={c.id} className="text-xs flex justify-between py-1 border-b border-border/30">
                                      <span>{c.type}: {c.amount > 0 ? '+' : ''}{c.amount}</span>
                                      <span className="text-muted-foreground">{c.reason}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
