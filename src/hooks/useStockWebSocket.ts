
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import finnhub from 'finnhub';

interface StockUpdate {
  symbol: string;
  currentPrice: number;
  timestamp: Date;
}

export const useStockWebSocket = (symbols: string[]) => {
  const [stockUpdates, setStockUpdates] = useState<Record<string, StockUpdate>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchStockData = async () => {
      try {
        // Get API key from Supabase
        const { data: secrets, error } = await supabase
          .from('portfolios')
          .select('*')
          .eq('name', 'FINNHUB_API_KEY')
          .single();

        if (error || !secrets?.value) {
          console.error('Failed to get API key:', error);
          return;
        }

        // Configure Finnhub client
        const finnhubClient = new finnhub.DefaultApi();
        finnhubClient.setApiKey(secrets.value);

        // Function to fetch data for a single symbol
        const fetchSymbol = async (symbol: string) => {
          try {
            const data = await new Promise((resolve, reject) => {
              finnhubClient.quote(symbol, (error, data, response) => {
                if (error) reject(error);
                else resolve(data);
              });
            });

            if (data) {
              setStockUpdates(prev => ({
                ...prev,
                [symbol]: {
                  symbol,
                  currentPrice: data.c,
                  timestamp: new Date(),
                }
              }));
            }
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
