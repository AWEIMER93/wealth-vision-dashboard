
import { supabase } from "@/integrations/supabase/client";
import { getStockData } from "./stock-service";

interface TradeContext {
  portfolio: any;
  symbol: string;
  shares: number;
  type: 'BUY' | 'SELL';
  userId: string;
}

export const executeTrade = async (context: TradeContext) => {
  const { portfolio, symbol, shares, type, userId } = context;

  // Get real-time stock data
  const stockData = await getStockData(symbol);
  
  if (!stockData.price) {
    throw new Error(`Could not get current price for ${symbol}`);
  }

  // For sell orders, verify user has enough shares
  if (type === 'SELL') {
    const { data: userPortfolio } = await supabase
      .from('portfolios')
      .select('*, stocks(*)')
      .eq('user_id', userId)
      .single();

    const userStock = userPortfolio?.stocks?.find(s => s.symbol === symbol);
    if (!userStock || userStock.shares < shares) {
      throw new Error(`Insufficient shares. You only have ${userStock?.shares || 0} shares of ${symbol}`);
    }
  }

  // Get or create stock record
  let existingStock;
  const { data: stockRecord, error: stockError } = await supabase
    .from('stocks')
    .select('*')
    .eq('symbol', symbol)
    .eq('portfolio_id', portfolio.id)
    .single();

  if (stockError) {
    if (type === 'SELL') {
      throw new Error('Cannot sell a stock that is not in your portfolio');
    }
    // Create new stock record for buying with both company name and symbol
    const companyName = stockData.companyName || stockData.description || 'Unknown Company';
    const stockName = `${companyName} (${symbol})`;
    
    const { data: newStock, error: createError } = await supabase
      .from('stocks')
      .insert({
        symbol,
        name: stockName,
        current_price: stockData.price,
        shares: 0,
        price_change: stockData.percentChange || 0,
        market_cap: stockData.marketCap || 0,
        volume: stockData.volume || 0,
        portfolio_id: portfolio.id
      })
      .select()
      .single();
    
    if (createError) throw createError;
    existingStock = newStock;
  } else {
    existingStock = stockRecord;
  }

  // Calculate trade amount using current stock price
  const tradeAmount = stockData.price * shares;
  
  // Create transaction
  const { error: transactionError } = await supabase
    .from('transactions')
    .insert({
      type,
      shares,
      price_per_unit: stockData.price,
      total_amount: tradeAmount,
      portfolio_id: portfolio.id,
      stock_id: existingStock.id,
    });
  
  if (transactionError) throw transactionError;

  // Update stock holding
  const newShares = type === 'BUY' 
    ? (existingStock.shares || 0) + shares 
    : (existingStock.shares || 0) - shares;

  if (newShares > 0) {
    const { error: updateError } = await supabase
      .from('stocks')
      .update({ 
        shares: newShares,
        current_price: stockData.price,
        price_change: stockData.percentChange || 0,
        market_cap: stockData.marketCap || 0,
        volume: stockData.volume || 0
      })
      .eq('id', existingStock.id);
    
    if (updateError) throw updateError;
  } else {
    // Remove stock if no shares left
    const { error: deleteError } = await supabase
      .from('stocks')
      .delete()
      .eq('id', existingStock.id);
    
    if (deleteError) throw deleteError;
  }

  // Update portfolio total
  const newTotal = type === 'BUY'
    ? (portfolio.total_holding || 0) + tradeAmount
    : (portfolio.total_holding || 0) - tradeAmount;

  await supabase
    .from('portfolios')
    .update({
      total_holding: newTotal,
      active_stocks: type === 'BUY' && !stockRecord
        ? (portfolio.active_stocks || 0) + 1
        : type === 'SELL' && newShares === 0
        ? (portfolio.active_stocks || 0) - 1
        : portfolio.active_stocks
    })
    .eq('id', portfolio.id);

  return {
    success: true,
    price: stockData.price,
    total: tradeAmount,
    stockData
  };
};
