
import { Button } from "@/components/ui/button";
import { Portfolio } from "@/types/portfolio";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PortfolioHeaderProps {
  portfolio: Portfolio;
  userFirstName: string;
  onSignOut: () => void;
}

export const PortfolioHeader = ({ portfolio, userFirstName, onSignOut }: PortfolioHeaderProps) => {
  const profitPercentage = portfolio?.total_profit || 0;

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-medium">Welcome, {userFirstName}</h1>
          <p className="text-gray-400">Here's your stock portfolio overview</p>
        </div>
        <Button variant="outline" onClick={onSignOut} className="border-white/10">
          Sign out
        </Button>
      </div>

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
    </>
  );
};
