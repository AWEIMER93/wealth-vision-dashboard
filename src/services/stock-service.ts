
import { supabase } from "@/integrations/supabase/client";

export const getStockData = async (symbol: string) => {
  try {
    // Clean and uppercase the symbol
    const cleanSymbol = symbol.toUpperCase().trim();
    console.log('Requesting stock data for:', cleanSymbol);
    
    const result = await supabase.functions.invoke('get-stock-data', {
      body: { symbol: cleanSymbol }
    });
    
    console.log('Stock data response:', result);

    if (result.error) {
      console.error('Stock data error:', result.error);
      throw new Error(result.error.message || 'Failed to fetch stock data');
    }

    if (!result.data) {
      console.error('No stock data received');
      throw new Error('No stock data available');
    }

    // Validate the response
    if (!result.data.price || !result.data.companyName) {
      console.error('Invalid stock data received:', result.data);
      throw new Error(`Could not find valid data for stock symbol: ${cleanSymbol}`);
    }

    return result.data;
  } catch (error: any) {
    console.error('getStockData error:', error);
    // Provide a more user-friendly error message
    throw new Error(`Could not find the stock ${symbol.toUpperCase()}. Please verify the stock symbol and try again.`);
  }
};
