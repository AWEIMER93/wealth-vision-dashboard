
// Format helpers
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num);
};

// Trade parsing helpers
export const extractTradeDetails = (message: string): { type: 'BUY' | 'SELL' | null, shares: number, symbol: string } | null => {
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  
  if (buyMatch || sellMatch) {
    const match = buyMatch || sellMatch;
    return {
      type: buyMatch ? 'BUY' : 'SELL',
      shares: parseInt(match![1]),
      symbol: match![2].toUpperCase()
    };
  }
  return null;
};
