
import { Card, CardContent } from '@/components/ui/card';
import { MonitorSmartphone } from 'lucide-react';

interface StockCardProps {
  symbol: string;
  name: string;
  units: number;
  price: number;
  change: number;
  Icon: React.ComponentType<any>;
}

const StockCard = ({ symbol, name, units, price, change, Icon = MonitorSmartphone }: StockCardProps) => (
  <Card className="bg-[#1A1A1A] border-none">
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Icon className="h-6 w-6" />
        <p className="text-sm text-gray-400">Units {units}</p>
      </div>
      <div>
        <p className="text-sm text-gray-400 mb-1">{symbol}</p>
        <p className="text-lg font-medium">${price.toLocaleString()}</p>
        <p className={`text-sm ${change > 0 ? 'text-green-500' : 'text-red-500'}`}>
          {change > 0 ? '+' : ''}{change}%
        </p>
      </div>
    </CardContent>
  </Card>
);

export default StockCard;
