
import { Card, CardContent } from "@/components/ui/card";
import { Stock } from "@/types/portfolio";
import { MonitorSmartphone, Apple, Car, Monitor, Globe2, Cpu } from "lucide-react";

interface StockCardsProps {
  stocks: Stock[];
}

export const StockCards = ({ stocks }: StockCardsProps) => {
  const stockIcons = {
    AAPL: Apple,
    TSLA: Car,
    MSFT: Monitor,
    GOOG: Globe2,
    NVDA: Cpu
  } as const;

  const topStocks = stocks.slice(0, 5);

  return (
    <div className="grid grid-cols-5 gap-4 mb-8">
      {topStocks.map(stock => {
        const StockIcon = stockIcons[stock.symbol as keyof typeof stockIcons] || MonitorSmartphone;
        return (
          <Card key={stock.id} className="bg-[#1A1A1A] border-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <StockIcon className="h-6 w-6 text-gray-400" />
                </div>
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
  );
};
