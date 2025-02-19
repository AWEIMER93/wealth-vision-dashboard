
import { Button } from "@/components/ui/button";
import { LineChart, Wallet, TrendingUp, AlertCircle, DollarSign } from "lucide-react";

const QUICK_ACTIONS = [
  { icon: Wallet, label: "Portfolio Summary", query: "Give me a quick summary of my portfolio performance" },
  { icon: TrendingUp, label: "Best Performers", query: "What are my best performing stocks?" },
  { icon: LineChart, label: "Market Analysis", query: "How is the market affecting my portfolio?" },
  { icon: AlertCircle, label: "Risk Assessment", query: "What's my portfolio risk level?" },
  { icon: DollarSign, label: "Execute Trade", query: "I'd like to make a trade" },
];

interface QuickActionsProps {
  onAction: (query: string) => void;
  disabled?: boolean;
}

export const QuickActions = ({ onAction, disabled }: QuickActionsProps) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUICK_ACTIONS.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className="flex items-center gap-2 h-auto py-3 border-white/10 hover:bg-white/5 text-white"
          onClick={() => onAction(action.query)}
          disabled={disabled}
        >
          <action.icon className="h-4 w-4" />
          <span className="text-sm">{action.label}</span>
        </Button>
      ))}
    </div>
  );
};
