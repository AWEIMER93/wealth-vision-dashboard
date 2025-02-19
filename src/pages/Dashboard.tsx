import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  Home, 
  LineChart as LineChartIcon, 
  BarChart2, 
  Users, 
  HelpCircle, 
  ChevronDown,
  Apple, 
  Car, 
  Monitor,
  Globe2, 
  Cpu,
  MonitorSmartphone
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/chat/ChatBot";
import VoiceInterface from "@/components/VoiceInterface";
import { LineChart, XAxis, YAxis, Tooltip, Line } from 'recharts';

interface Stock {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  current_price: number | null;
  price_change: number | null;
  market_cap: number | null;
  volume: number | null;
}

interface Portfolio {
  id: string;
  user_id: string;
  total_holding: number | null;
  total_profit: number | null;
  total_investment: number | null;
  active_stocks: number | null;
  stocks: Stock[];
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
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

      // Use a regular object for headers instead of Headers instance
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

      // Calculate portfolio totals and daily change
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

      // Update performance data
      setPerformanceData(prev => {
        const currentTime = new Date().toLocaleTimeString();
        const newData = [...prev, { time: currentTime, value: totalHolding }];
        // Keep last 20 data points for the chart
        return newData.slice(-20);
      });

      // Update portfolio with calculated values
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
      };
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

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
        (payload) => {
          console.log('Portfolio change:', payload);
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
        (payload) => {
          console.log('Stock change:', payload);
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
          console.log('Transaction:', payload);
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
          
          // Show toast for new transactions
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

    // Initial stock price update
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

    // Cleanup function
    return () => {
      supabase.removeChannel(portfolioChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(transactionChannel);
      clearInterval(updateInterval);
    };
  }, [user?.id, queryClient, toast]);

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
    toast({
      title: "Error loading portfolio",
      description: error.message,
      variant: "destructive",
    });
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

  // Get the first 5 stocks for the stock cards, ensure we have an array
  const topStocks = portfolio?.stocks?.slice(0, 5) || [];
  const stockIcons = {
    AAPL: Apple,
    TSLA: Car,
    MSFT: Monitor,
    GOOG: Globe2,
    NVDA: Cpu
  };

  // Calculate total profit percentage
  const profitPercentage = portfolio?.total_profit || 0;

  const userFirstName = user?.email?.split('@')[0].replace(/^\w/, c => c.toUpperCase()) || '';

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-[#1A1A1A] p-6 border-r border-white/10">
        <h1 className="text-2xl font-bold mb-8">Wealth Management Company</h1>
        
        <div className="space-y-2 mb-8">
          <h2 className="text-sm text-gray-400 mb-4">Main Menu</h2>
          <Button variant="ghost" className="w-full justify-start gap-3 text-blue-500 bg-blue-500/10">
            <Home className="h-5 w-5" />
            Dashboard
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <LineChartIcon className="h-5 w-5" />
            Portfolio
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <BarChart2 className="h-5 w-5" />
            Analysis
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <Globe2 className="h-5 w-5" />
            Market
          </Button>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm text-gray-400 mb-4">Support</h2>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <Users className="h-5 w-5" />
            Community
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <HelpCircle className="h-5 w-5" />
            Help & Support
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium">Welcome, {userFirstName}</h1>
            <p className="text-gray-400">Here's your stock portfolio overview</p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="border-white/10">
            Sign out
          </Button>
        </div>

        {/* Total Holdings Card */}
        <Card className="bg-[#1A1A1A] border-none mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 mb-2">Total Holdings</p>
                <div className="flex items-center gap-4">
                  <h2 className="text-4xl font-bold">${portfolio?.total_holding?.toLocaleString() ?? '0.00'}</h2>
                  <span className={`flex items-center gap-1 ${profitPercentage > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {profitPercentage > 0 ? '+' : ''}
                    {profitPercentage.toFixed(2)}% 
                    <ChevronDown className={`h-4 w-4 ${profitPercentage > 0 ? 'transform rotate-180' : ''}`} />
                  </span>
                </div>
              </div>
              <Button variant="outline" className="border-white/10">
                1D <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stock Cards Grid */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {topStocks.map(stock => {
            const StockIcon = stockIcons[stock.symbol as keyof typeof stockIcons] || MonitorSmartphone;
            return (
              <Card key={stock.id} className="bg-[#1A1A1A] border-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <StockIcon className="h-6 w-6" />
                    <p className="text-sm text-gray-400">Shares {stock.shares}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{stock.symbol}</p>
                    <p className="text-lg font-medium">${stock.current_price?.toLocaleString()}</p>
                    <p className={`text-sm ${stock.price_change && stock.price_change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stock.price_change && stock.price_change > 0 ? '+' : ''}{stock.price_change}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Portfolio Performance Chart */}
        <Card className="bg-[#1A1A1A] border-none mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium">Portfolio Performance</h3>
              <div className="flex gap-2">
                {['1D', '1W', '1M', '6M', '1Y'].map((period) => (
                  <Button
                    key={period}
                    variant={period === '1D' ? 'default' : 'ghost'}
                    className={period === '1D' ? 'bg-blue-500' : 'text-gray-400'}
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-[300px] w-full">
              {performanceData.length > 0 && (
                <LineChart width={800} height={300} data={performanceData}>
                  <XAxis 
                    dataKey="time" 
                    stroke="#666"
                    tick={{ fill: '#666' }}
                  />
                  <YAxis 
                    stroke="#666"
                    tick={{ fill: '#666' }}
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Overview Table */}
        <Card className="bg-[#1A1A1A] border-none">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium">Portfolio Overview</h3>
              <div className="flex gap-2">
                <Button variant="default" className="bg-blue-500">All</Button>
                <Button variant="ghost" className="text-gray-400">Gainers</Button>
                <Button variant="ghost" className="text-gray-400">Losers</Button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-4">Stock</th>
                  <th className="pb-4">Last Price</th>
                  <th className="pb-4">Change</th>
                  <th className="pb-4">Market Cap</th>
                  <th className="pb-4">Volume</th>
                  <th className="pb-4">Last 7 days</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {portfolio?.stocks?.map((stock) => {
                  const StockIcon = stockIcons[stock.symbol as keyof typeof stockIcons] || MonitorSmartphone;
                  return (
                    <tr key={stock.id} className="border-t border-white/10">
                      <td className="py-4 flex items-center gap-2">
                        <StockIcon className="h-5 w-5" />
                        {stock.symbol}
                      </td>
                      <td className="py-4">${stock.current_price?.toLocaleString() ?? '0.00'}</td>
                      <td className={`py-4 ${stock.price_change && stock.price_change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stock.price_change && stock.price_change > 0 ? '+' : ''}{stock.price_change?.toFixed(2) ?? '0.00'}%
                      </td>
                      <td className="py-4">${((stock.market_cap || 0) / 1e9).toFixed(2)}B</td>
                      <td className="py-4">${((stock.volume || 0) / 1e9).toFixed(2)}B</td>
                      <td className="py-4">
                        <div className={`h-6 w-20 bg-gradient-to-r ${
                          stock.price_change && stock.price_change > 0 
                            ? 'from-green-500/20 to-green-500/10' 
                            : 'from-red-500/20 to-red-500/10'
                        } rounded`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <ChatBot />
      <VoiceInterface onSpeakingChange={setIsAiSpeaking} />
    </div>
  );
};

export default Dashboard;
