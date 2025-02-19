
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PortfolioPerformanceChart = () => {
  return (
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
        <div className="h-[300px] w-full bg-gradient-to-b from-blue-500/20 to-transparent rounded-lg" />
      </CardContent>
    </Card>
  );
};

export default PortfolioPerformanceChart;
