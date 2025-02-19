
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Trade {
  p: number;  // Last price
  s: string;  // Symbol
  t: number;  // Timestamp
  v: number;  // Volume
}

interface StockUpdate {
  symbol: string;
  currentPrice: number;
  timestamp: Date;
}

export const useStockWebSocket = (symbols: string[]) => {
  const [stockUpdates, setStockUpdates] = useState<Record<string, StockUpdate>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;

    const connectWebSocket = async () => {
      try {
        // Get the API key from Supabase
        const { data: { value: apiKey }, error } = await supabase
          .from('secrets')
          .select('value')
          .eq('name', 'FINNHUB_API_KEY')
          .single();

        if (error) throw error;

        // Create WebSocket connection
        ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

        ws.onopen = () => {
          setIsConnected(true);
          // Subscribe to symbols
          symbols.forEach(symbol => {
            ws.send(JSON.stringify({ type: 'subscribe', symbol: symbol }));
          });
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'trade') {
            data.data.forEach((trade: Trade) => {
              setStockUpdates(prev => ({
                ...prev,
                [trade.s]: {
                  symbol: trade.s,
                  currentPrice: trade.p,
                  timestamp: new Date(trade.t),
                }
              }));
            });
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Attempt to reconnect after a delay
          setTimeout(connectWebSocket, 5000);
        };
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        symbols.forEach(symbol => {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol: symbol }));
        });
        ws.close();
      }
    };
  }, [symbols]);

  return { stockUpdates, isConnected };
};
