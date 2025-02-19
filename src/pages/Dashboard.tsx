
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Chat } from "@/components/Chat";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!user && isLoaded) {
      navigate("/login");
    }
    setIsLoaded(true);
  }, [user, isLoaded, navigate]);

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <Chat />
    </div>
  );
};

export default Dashboard;
