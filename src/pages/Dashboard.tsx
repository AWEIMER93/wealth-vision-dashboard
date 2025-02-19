
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Portfolio Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                ${portfolio?.total_holding?.toLocaleString() ?? '0.00'}
              </p>
              <div className="flex items-center gap-2">
                <p className={portfolio?.total_profit && portfolio.total_profit > 0 ? 'text-green-500' : 'text-red-500'}>
                  {portfolio?.total_profit ? (portfolio.total_profit > 0 ? '+' : '') : ''}
                  ${portfolio?.total_profit?.toLocaleString() ?? '0.00'}
                </p>
                <p className="text-muted-foreground">Total Profit</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Investment Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Investment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                ${portfolio?.total_investment?.toLocaleString() ?? '0.00'}
              </p>
              <p className="text-muted-foreground">Total Investment</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Stocks Card */}
        <Card>
          <CardHeader>
            <CardTitle>Active Stocks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                {portfolio?.active_stocks ?? 0}
              </p>
              <p className="text-muted-foreground">Stocks in Portfolio</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stocks List */}
      {portfolio?.stocks && portfolio.stocks.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Your Stocks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {portfolio.stocks.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center p-4 bg-muted rounded-lg">
                  <div>
                    <h3 className="font-semibold">{stock.name}</h3>
                    <p className="text-sm text-muted-foreground">{stock.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{stock.units} units</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
