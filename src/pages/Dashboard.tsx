
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>
      <div className="grid gap-4">
        {/* Portfolio Overview Card */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold mb-4">Portfolio Overview</h2>
          <p className="text-3xl font-bold">$12,304.11</p>
          <p className="text-green-500">+3.5% ($532)</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
