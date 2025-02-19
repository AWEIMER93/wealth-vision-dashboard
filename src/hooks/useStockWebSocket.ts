
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import finnhub from 'finnhub';

interface StockUpdate {
  symbol: string;
  currentPrice: number;
  timestamp: Date;
}

interface FinnhubQuoteResponse {
  c: number;  // Current price
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

export const useStockWebSocket = (symbols: string[]) => {
  const [stockUpdates, setStockUpdates] = useState<Record<string, StockUpdate>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchStockData = async () => {
      try {
        // Get API key from Supabase secrets
        const { data, error } = await supabase.rpc('get_secret', {
          name: 'FINNHUB_API_KEY'
        });

        if (error) {
          console.error('Failed to get API key:', error);
          return;
        }

        // Configure Finnhub client
        const finnhubClient = new finnhub.DefaultApi();
        finnhubClient.setApiKey(data);

        // Function to fetch data for a single symbol
        const fetchSymbol = async (symbol: string) => {
          try {
            const data = await new Promise<FinnhubQuoteResponse>((resolve, reject) => {
              finnhubClient.quote(symbol, (error, data, response) => {
                if (error) reject(error);
                else resolve(data as FinnhubQuoteResponse);
              });
            });

            setStockUpdates(prev => ({
              ...prev,
              [symbol]: {
                symbol,
                currentPrice: data.c,
                timestamp: new Date(),
              }
            }));
          } catch (error) {
            console.error(`Error fetching data for ${symbol}:`, error);
          }
        };

        // Fetch data for all symbols
        setIsConnected(true);
        await Promise.all(symbols.map(fetchSymbol));

      } catch (error) {
        console.error('Failed to fetch stock data:', error);
        setIsConnected(false);
      }
    };

    // Initial fetch
    fetchStockData();

    // Set up polling interval (every 10 seconds)
    interval = setInterval(fetchStockData, 10000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      setIsConnected(false);
    };
  }, [symbols]);

  return { stockUpdates, isConnected };
};
