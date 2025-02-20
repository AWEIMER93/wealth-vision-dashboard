
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Stock } from "@/types/portfolio";
import { MonitorSmartphone, Apple, Car, Monitor, Globe2, Cpu } from "lucide-react";

interface PortfolioTableProps {
  stocks: Stock[];
}

export const PortfolioTable = ({ stocks }: PortfolioTableProps) => {
  const stockIcons = {
    AAPL: Apple,
    TSLA: Car,
    MSFT: Monitor,
    GOOG: Globe2,
    NVDA: Cpu
  } as const;

  return (
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
            {stocks?.map((stock) => {
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
  );
};
