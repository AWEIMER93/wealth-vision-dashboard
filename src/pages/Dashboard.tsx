import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  Home, 
  LineChart, 
  BarChart2, 
  Users, 
  HelpCircle, 
  ChevronDown,
  Apple, 
  Car, 
  Monitor,
  Globe2, 
  Cpu
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Apple, Tesla, Microsoft, Globe2, MonitorSmartphone } from 'lucide-react';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['portfolio', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*, stocks(*)')
        .eq('user_id', user?.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

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

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-[#1A1A1A] p-6 border-r border-white/10">
        <h1 className="text-2xl font-bold mb-8">Stovest</h1>
        
        <div className="space-y-2 mb-8">
          <h2 className="text-sm text-gray-400 mb-4">Main Menu</h2>
          <Button variant="ghost" className="w-full justify-start gap-3 text-blue-500 bg-blue-500/10">
            <Home className="h-5 w-5" />
            Dashboard
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-gray-400">
            <LineChart className="h-5 w-5" />
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
            <h1 className="text-2xl font-medium">Welcome, {user.name}</h1>
            <p className="text-gray-400">Here's your stock portfolio overview</p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="border-white/10">
            Sign out
          </Button>
        </div>

        {/* Total Holding Card */}
        <Card className="bg-[#1A1A1A] border-none mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 mb-2">Total Holding</p>
                <div className="flex items-center gap-4">
                  <h2 className="text-4xl font-bold">${portfolio?.total_holding?.toLocaleString() ?? '0.00'}</h2>
                  <span className="text-green-500 flex items-center gap-1">
                    +3.5% <ChevronDown className="h-4 w-4 transform rotate-180" />
                  </span>
                </div>
              </div>
              <Button variant="outline" className="border-white/10">
                6M <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stock Cards Grid */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StockCard symbol="AAPL" name="Apple" units={104} price={1721.3} change={0.74} Icon={Apple} />
          <StockCard symbol="TSLA" name="Tesla" units={124} price={1521.3} change={0.74} Icon={Car} />
          <StockCard symbol="MSFT" name="Microsoft" units={10} price={1721.3} change={0.74} Icon={Monitor} />
          <StockCard symbol="GOOG" name="Google" units={110} price={1721.3} change={0.74} Icon={Globe2} />
          <StockCard symbol="NVDA" name="NVIDIA" units={104} price={1721.3} change={0.74} Icon={Cpu} />
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
                    variant={period === '6M' ? 'default' : 'ghost'}
                    className={period === '6M' ? 'bg-blue-500' : 'text-gray-400'}
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-[300px] w-full bg-gradient-to-b from-blue-500/20 to-transparent rounded-lg" />
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
                {portfolio?.stocks?.map((stock) => (
                  <tr key={stock.id} className="border-t border-white/10">
                    <td className="py-4 flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      {stock.symbol}
                    </td>
                    <td className="py-4">${stock.units.toLocaleString()}</td>
                    <td className="py-4 text-green-500">+3.4%</td>
                    <td className="py-4">$564.06B</td>
                    <td className="py-4">$3.97B</td>
                    <td className="py-4">
                      <div className="h-6 w-20 bg-gradient-to-r from-green-500/20 to-green-500/10 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

interface StockCardProps {
  symbol: string;
  name: string;
  units: number;
  price: number;
  change: number;
  Icon: React.ComponentType<any>;
}

const StockCard = ({ symbol, name, units, price, change, Icon }: StockCardProps) => (
  <Card className="bg-[#1A1A1A] border-none">
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Icon className="h-6 w-6" />
        <p className="text-sm text-gray-400">Units {units}</p>
      </div>
      <div>
        <p className="text-sm text-gray-400 mb-1">{symbol}</p>
        <p className="text-lg font-medium">${price.toLocaleString()}</p>
        <p className="text-sm text-green-500">+{change}%</p>
      </div>
    </CardContent>
  </Card>
);

export default Dashboard;
