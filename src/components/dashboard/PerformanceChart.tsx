
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, XAxis, YAxis, Tooltip, Line } from 'recharts';

interface PerformanceChartProps {
  data: {
    time: string;
    value: number;
  }[];
}

export const PerformanceChart = ({ data }: PerformanceChartProps) => {
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
        <div className="h-[300px] w-full">
          {data.length > 0 && (
            <LineChart 
              width={800} 
              height={300} 
              data={data}
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <XAxis 
                dataKey="time" 
                stroke="#666"
                tick={{ fill: '#666' }}
              />
              <YAxis 
                stroke="#666"
                tick={{ fill: '#666' }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                width={60}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1A1A1A',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff'
                }}
                formatter={(value: any) => [`$${value.toLocaleString()}`, 'Value']}
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
  );
};
