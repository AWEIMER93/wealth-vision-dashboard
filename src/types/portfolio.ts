
export interface Stock {
  id: string;
  symbol: string;
  name: string;
  units: number;
  current_price: number | null;
  price_change: number | null;
  market_cap: number | null;
  volume: number | null;
}

export interface Portfolio {
  id: string;
  user_id: string;
  total_holding: number | null;
  total_profit: number | null;
  total_investment: number | null;
  active_stocks: number | null;
  stocks: Stock[];
}
