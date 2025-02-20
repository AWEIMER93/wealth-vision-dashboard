
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/chat/ChatBot";
import { Portfolio } from "@/types/portfolio";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PortfolioHeader } from "@/components/dashboard/PortfolioHeader";
import { StockCards } from "@/components/dashboard/StockCards";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { PortfolioTable } from "@/components/dashboard/PortfolioTable";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [performanceData, setPerformanceData] = useState<{
    time: string;
    value: number;
  }[]>([]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      toast({
        title: "Error signing out",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

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
            shares,
            current_price,
            price_change,
            market_cap,
            volume
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      
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
              shares,
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

      const totalHolding = data.stocks?.reduce((sum, stock) => 
        sum + (stock.current_price || 0) * stock.shares, 0) || 0;

      const totalDailyChange = data.stocks?.reduce((change, stock) => {
        const stockValue = (stock.current_price || 0) * stock.shares;
        const stockDailyChange = (stockValue * (stock.price_change || 0)) / 100;
        return change + stockDailyChange;
      }, 0) || 0;

      const totalHoldingPercentChange = totalHolding > 0 
        ? (totalDailyChange / (totalHolding - totalDailyChange)) * 100 
        : 0;

      const activeStocks = data.stocks?.length || 0;

      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          total_holding: totalHolding,
          total_profit: totalHoldingPercentChange,
          active_stocks: activeStocks,
        })
        .eq('id', data.id);

      if (updateError) throw updateError;
      
      return {
        ...data,
        stocks: data.stocks || [],
        total_holding: totalHolding,
        total_profit: totalHoldingPercentChange,
        active_stocks: activeStocks,
      } as Portfolio;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user?.id || !portfolio) return;

    const updatePerformanceData = () => {
      setPerformanceData(prev => {
        const currentTime = new Date().toLocaleTimeString();
        const newData = [...prev, { 
          time: currentTime, 
          value: portfolio.total_holding || 0 
        }];
        return newData.slice(-20);
      });
    };

    // Initial update
    updatePerformanceData();

    // Subscribe to portfolio changes
    const portfolioChannel = supabase
      .channel('portfolio-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portfolios',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
        }
      )
      .subscribe();

    // Subscribe to stock changes
    const stockChannel = supabase
      .channel('stock-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stocks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
        }
      )
      .subscribe();

    // Subscribe to transaction changes
    const transactionChannel = supabase
      .channel('transaction-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
          
          if (payload.eventType === 'INSERT') {
            const { type, shares } = payload.new;
            toast({
              title: "Trade Executed",
              description: `Successfully ${type.toLowerCase()}ed ${shares} shares`,
              variant: "default",
            });
          }
        }
      )
      .subscribe();

    // Update stock prices
    const updateStockPrices = async () => {
      try {
        const { error } = await supabase.functions.invoke('update-stock-prices');
        if (error) {
          console.error('Failed to update stock prices:', error);
          toast({
            title: "Error updating stocks",
            description: "Failed to fetch latest stock prices",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error('Error invoking function:', err);
      }
    };

    // Update stock prices immediately and every minute
    updateStockPrices();
    const updateInterval = setInterval(updateStockPrices, 60000);
    const performanceInterval = setInterval(updatePerformanceData, 30000);

    // Cleanup function
    return () => {
      clearInterval(updateInterval);
      clearInterval(performanceInterval);
      supabase.removeChannel(portfolioChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(transactionChannel);
    };
  }, [user?.id, portfolio, queryClient, toast]);

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-xl mb-4">Failed to load portfolio</p>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] })}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const userFirstName = user?.email?.split('@')[0].replace(/^\w/, c => c.toUpperCase()) || '';

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Sidebar />
      
      <div className="ml-64 p-8">
        <PortfolioHeader 
          portfolio={portfolio!} 
          userFirstName={userFirstName}
          onSignOut={handleSignOut}
        />
        
        <StockCards stocks={portfolio?.stocks || []} />
        
        <PerformanceChart data={performanceData} />
        
        <PortfolioTable stocks={portfolio?.stocks || []} />
      </div>
      
      <ChatBot />
    </div>
  );
};

export default Dashboard;
