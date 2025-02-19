
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
        // Get the secret key from Supabase
        const { data: secretData } = await supabase
          .from('secrets')
          .select('value')
          .eq('name', 'FINNHUB_API_KEY')
          .single();

        if (!secretData) {
          console.error('Failed to get API key');
          return;
        }

        // Configure Finnhub client using the REST API pattern
        const api_key = finnhub.ApiClient.instance.authentications['api_key'];
        api_key.apiKey = secretData.value;
        const finnhubClient = new finnhub.DefaultApi();

        // Function to fetch data for a single symbol
        const fetchSymbol = async (symbol: string) => {
          return new Promise<void>((resolve, reject) => {
            finnhubClient.quote(symbol, (error, data, response) => {
              if (error) {
                console.error(`Error fetching data for ${symbol}:`, error);
                reject(error);
                return;
              }

              setStockUpdates(prev => ({
                ...prev,
                [symbol]: {
                  symbol,
                  currentPrice: data.c,
                  timestamp: new Date(),
                }
              }));
              resolve();
            });
          });
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
