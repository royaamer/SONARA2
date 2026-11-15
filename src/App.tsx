import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import Home from './pages/home';
import { lazy, Suspense } from 'react';
import { EarthSessionProvider, useEarthSession } from './earth/session';
import './observatory.css';
import MissionControl from './pages/mission-control';
import { IntroSoundscape } from './observatory/ambient';
const LivingOcean = lazy(() => import('./pages/living-ocean'));
const ElectricSky = lazy(() => import('./pages/electric-sky'));
const Temperature = lazy(() => import('./pages/temperature'));

const queryClient = new QueryClient();
// Stable route identity: context updates must not recreate the WebGL homepage.
function MissionControlRoute() { return <MissionControl />; }

function Router() {
  const [location] = useLocation();
  const { setMissionEntered, cinematicTransition } = useEarthSession();
  useEffect(() => { if (location === '/') setMissionEntered(false); }, [location, setMissionEntered]);
  const forward = cinematicTransition === 'forward' && location === '/';
  const route = <RoutedErrorBoundary>
    <Suspense fallback={<div role="status">SONARA / ...</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/mission-control/living-ocean" component={LivingOcean} />
        <Route path="/mission-control/electric-sky" component={ElectricSky} />
        <Route path="/mission-control/temperature" component={Temperature} />
        <Route path="/mission-control" component={MissionControlRoute} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  </RoutedErrorBoundary>;
  return <>
    <IntroSoundscape />
    <div className={forward ? 'nav-transition-current' : undefined} style={forward ? { opacity: 'calc(1 - var(--nav-crossfade, 0))' } : undefined} aria-hidden={forward ? true : undefined}>
      {route}
    </div>
    {forward && <div className="nav-transition-layer nav-transition-mission" style={{ opacity: 'var(--nav-crossfade, 0)' }} aria-hidden="true"><MissionControl transitionPreview /></div>}
  </>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={new URL(import.meta.env.BASE_URL, document.baseURI).pathname.replace(/\/$/, '')}>
          <EarthSessionProvider><Router /></EarthSessionProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
