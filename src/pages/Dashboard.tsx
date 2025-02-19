
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Apple, Car, Monitor, Globe2, Cpu, MonitorSmartphone } from "lucide-react";
import { useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { Portfolio } from '@/types/portfolio';

// Import components
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import TotalHoldingCard from '@/components/dashboard/TotalHoldingCard';
import StockCard from '@/components/dashboard/StockCard';
import PortfolioPerformanceChart from '@/components/dashboard/PortfolioPerformanceChart';
import PortfolioOverviewTable from '@/components/dashboard/PortfolioOverviewTable';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: portfolio, isLoading, error } = useQuery<Portfolio>({
    queryKey: ['portfolio', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('No user ID');

      const { data, error } = await supabase
        .from('portfolios')
        .select(`
          *,
          stocks (
            id,
            symbol,
            name,
            units,
            current_price,
            price_change,
            market_cap,
            volume
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      
      // Create a portfolio if it doesn't exist
      if (!data) {
        const { data: newPortfolio, error: createError } = await supabase
          .from('portfolios')
          .insert([
            { 
              user_id: user.id,
              total_holding: 0,
              total_profit: 0,
              total_investment: 0,
              active_stocks: 0
            }
          ])
          .select(`
            *,
            stocks (
              id,
              symbol,
              name,
              units,
              current_price,
              price_change,
              market_cap,
              volume
            )
          `)
          .single();
        
        if (createError) throw createError;
        return {
          ...newPortfolio,
          stocks: []
        };
      }

      // Calculate portfolio totals
      const totalHolding = data.stocks?.reduce((sum, stock) => 
        sum + (stock.current_price || 0) * stock.units, 0) || 0;

      const activeStocks = data.stocks?.length || 0;

      // Update portfolio with calculated values
      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          total_holding: totalHolding,
          active_stocks: activeStocks,
        })
        .eq('id', data.id);

      if (updateError) throw updateError;
      
      return {
        ...data,
        stocks: data.stocks || [],
        total_holding: totalHolding,
        active_stocks: activeStocks,
      };
    },
    enabled: !!user?.id
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('stock-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stocks'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
        }
      )