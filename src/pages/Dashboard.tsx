import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Chat } from "@/components/Chat";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/login");
      } else {
        setIsLoaded(true);
      }
    }
  }, [user, loading, navigate]);

  if (loading || !isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome, {user.email}</h1>
      <div className="grid gap-6">
        {/* Example dashboard content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-6 bg-card rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">Portfolio Overview</h2>
            <p className="text-muted-foreground">Your portfolio summary will appear here</p>
          </div>
          <div className="p-6 bg-card rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">Recent Transactions</h2>
            <p className="text-muted-foreground">Your recent transactions will appear here</p>
          </div>
          <div className="p-6 bg-card rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">Market Overview</h2>
            <p className="text-muted-foreground">Market insights will appear here</p>
          </div>
        </div>
      </div>
      <Chat />
    </div>
  );
};

export default Dashboard;
