
import { supabase } from "@/integrations/supabase/client";

export const getStockData = async (symbol: string) => {
  try {
    console.log('Requesting stock data for:', symbol);
    const result = await supabase.functions.invoke('get-stock-data', {
      body: { symbol }
    });
    
    console.log('Stock data response:', result);

    if (result.error) {
      console.error('Stock data error:', result.error);
      throw new Error(result.error.message);
    }

    if (!result.data) {
      console.error('No stock data received');
      throw new Error('No stock data available');
    }

    return result.data;
  } catch (error) {
    console.error('getStockData error:', error);
    throw error;
  }
};
