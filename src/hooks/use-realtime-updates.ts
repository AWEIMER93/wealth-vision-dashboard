
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const useRealtimeUpdates = (userId: string | undefined) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    const stockChannel = supabase
      .channel('stock-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stocks'
        },
        (payload) => {
          console.log('Stock change:', payload);
          queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
        }
      )
      .subscribe();

    const transactionChannel = supabase
      .channel('transaction-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('Transaction:', payload);
          queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
          
          if (payload.eventType === 'INSERT') {
            const { type, units, symbol, price_per_unit, total_amount } = payload.new;
            toast({
              title: `Trade Executed`,
              description: `Successfully ${type.toLowerCase()}ed ${units} shares of ${symbol} at $${price_per_unit} per share. Total: $${total_amount}`,
              variant: "default",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(transactionChannel);
    };
  }, [userId, queryClient, toast]);
};
