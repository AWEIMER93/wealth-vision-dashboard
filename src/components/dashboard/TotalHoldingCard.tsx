
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface TotalHoldingCardProps {
  totalHolding: number;
  profitPercentage: number;
}

const TotalHoldingCard = ({ totalHolding, profitPercentage }: TotalHoldingCardProps) => {
  return (
    <Card className="bg-[#1A1A1A] border-none mb-6">
      <CardContent className="p-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-gray-400 mb-2">Total Holding</p>
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-bold">${totalHolding?.toLocaleString() ?? '0.00'}</h2>
              <span className={`flex items-center gap-1 ${profitPercentage > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {profitPercentage > 0 ? '+' : '-'}
                {Math.abs(profitPercentage).toFixed(2)}% 
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
  );
};

export default TotalHoldingCard;
