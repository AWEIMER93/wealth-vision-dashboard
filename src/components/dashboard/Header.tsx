
import { Button } from '@/components/ui/button';

interface HeaderProps {
  username: string;
  onSignOut: () => void;
}

const Header = ({ username, onSignOut }: HeaderProps) => {
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-2xl font-medium">Welcome, {username}</h1>
        <p className="text-gray-400">Here's your stock portfolio overview</p>
      </div>
      <Button variant="outline" onClick={onSignOut} className="border-white/10">
        Sign out
      </Button>
    </div>
  );
};

export default Header;
