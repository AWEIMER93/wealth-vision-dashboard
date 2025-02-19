
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Apple, Car, Monitor, Globe2, Cpu, MonitorSmartphone } from "lucide-react";
import { useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { Portfolio } from '@/types/portfolio';

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login');
  }, [user, loading, navigate]);

  const { data: portfolios, isLoading } = useQuery<Portfolio[]>({
    queryKey: ['portfolios', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user?.id
  });

  if (isLoading) return <Loader2 />;

  return (
    <div>
      <h1 className="text-2xl font-bold">Your Portfolios</h1>
      {portfolios?.map((portfolio: Portfolio) => (
        <div key={portfolio.id}>
          <h2 className="text-xl">{portfolio.id}</h2>
          <p>Total Holding: {portfolio.total_holding}</p>
          <p>Total Profit: {portfolio.total_profit}</p>
          <p>Total Investment: {portfolio.total_investment}</p>
          <p>Active Stocks: {portfolio.active_stocks}</p>
        </div>
      ))}
    </div>
  );
};

export default Dashboard;
