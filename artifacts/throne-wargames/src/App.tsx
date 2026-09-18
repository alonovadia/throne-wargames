import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { recordVisitor } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import HomePage from '@/pages/home';
import LeaderboardPage from '@/pages/leaderboard';
import PlayersPage from '@/pages/players';
import PlayerProfilePage from '@/pages/player-profile';
import MatchesPage from '@/pages/matches';
import ApplyPage from '@/pages/apply';
import AdminPage from '@/pages/admin';
import { WargamesShell } from '@/components/wargames-shell';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();

  useEffect(() => {
    const storageKey = `visit:${new Date().toISOString().slice(0, 10)}:${location}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
    void recordVisitor({
      path: location,
      ...(document.referrer ? { referrer: document.referrer } : {}),
    }).catch(() => {
      // Analytics must never block public browsing.
    });
  }, [location]);

  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <WargamesShell>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route path="/players" component={PlayersPage} />
          <Route path="/players/:playerId" component={PlayerProfilePage} />
          <Route path="/matches" component={MatchesPage} />
          <Route path="/apply" component={ApplyPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
      </WargamesShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
