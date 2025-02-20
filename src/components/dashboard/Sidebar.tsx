
import { Button } from "@/components/ui/button";
import { Home, LineChart as LineChartIcon, BarChart2, Globe2, Users, HelpCircle } from "lucide-react";

export const Sidebar = () => {
  return (
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
  );
};
