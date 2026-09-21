import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from '@cloud-march/motion/react';
import { useEffect, lazy, Suspense } from 'react';
import ReactGA from 'react-ga4';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import BackgroundLoader from './components/BackgroundLoader';
import Home from './pages/Home';
import Works from './pages/Works';
import About from './pages/About';
import HoursOfService from './pages/projects/HoursOfService';
import HoursOfServiceV2 from './pages/projects/HoursOfServiceV2';
import VehicleHealth from './pages/projects/VehicleHealth';
import VehicleHealthV2 from './pages/projects/VehicleHealthV2';
import GazeboComplexOrganisms from './pages/projects/GazeboComplexOrganisms';
import GazeboComplexOrganismsV2 from './pages/projects/GazeboComplexOrganismsV2';
import VendingAnalytics from './pages/projects/VendingAnalytics';
import VendingAnalyticsV2 from './pages/projects/VendingAnalyticsV2';
import TeluguStreaming from './pages/projects/TeluguStreaming';
import TeluguStreamingV2 from './pages/projects/TeluguStreamingV2';

// Home 2.2 — the chat-native surface. Lazy so its canvas material and chat
// bundle stay off the critical path for everyone landing on the classic home.
const HomeV22 = lazy(() => import('./pages/HomeV22'));

// Museum renders the same live canvases, so it is split out for the same reason.
const Museum = lazy(() => import('./pages/Museum'));

// Lazy-loaded from the game package so Phaser (~1MB) only downloads when the
// game route is opened.
const BangaloreTimes = lazy(() =>
  import('@cloud-march/game').then((m) => ({ default: m.BangaloreTimes })),
);

const FULL_SHELL_ROUTES = ['/home-2.2', '/museum'];

// Initialize Google Analytics
ReactGA.initialize('G-HN2NX8DVHC');

function App() {
  const location = useLocation();
  const isProjectPage = location.pathname.startsWith('/projects/');
  const isGamePage = location.pathname.startsWith('/game/');
  // These bring their own header and dark shell, so the site chrome steps aside.
  const isFullShell = FULL_SHELL_ROUTES.includes(location.pathname);
  const hideChrome = isProjectPage || isGamePage || isFullShell;

  // Scroll to top on route change and send pageview to GA
  useEffect(() => {
    window.scrollTo(0, 0);
    ReactGA.send({ hitType: 'pageview', page: location.pathname });
  }, [location.pathname]);

  return (
    // `reducedMotion="user"` defers every Framer Motion animation below this point
    // to the OS setting. The CSS `@media (prefers-reduced-motion)` blocks in
    // themes.css only reach CSS animation — transforms driven from JS need this.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen site-bg site-fg">
        {/* Background Image Prefetcher */}
        <BackgroundLoader />

        {/* Top Navigation - Hide on project pages */}
        {!hideChrome && <Navbar />}

        {/* Main Content with Page Transitions */}
        <AnimatePresence>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route
              path="/home-2.2"
              element={
                <Suspense fallback={<div className="fixed inset-0 bg-[#060609]" />}>
                  <HomeV22 />
                </Suspense>
              }
            />
            <Route
              path="/museum"
              element={
                <Suspense fallback={<div className="fixed inset-0 bg-[#060609]" />}>
                  <Museum />
                </Suspense>
              }
            />
            <Route path="/works" element={<Works />} />
            <Route path="/about" element={<About />} />
            <Route path="/projects/hours-of-service" element={<HoursOfService />} />
            <Route path="/projects/hours-of-service-2" element={<HoursOfServiceV2 />} />
            <Route path="/projects/vehicle-health" element={<VehicleHealth />} />
            <Route path="/projects/vehicle-health-2" element={<VehicleHealthV2 />} />
            <Route path="/projects/gazebo-complex-organisms" element={<GazeboComplexOrganisms />} />
            <Route path="/projects/gazebo-complex-organisms-2" element={<GazeboComplexOrganismsV2 />} />
            <Route path="/projects/vending-analytics" element={<VendingAnalytics />} />
            <Route path="/projects/vending-analytics-2" element={<VendingAnalyticsV2 />} />
            <Route path="/projects/telugu-streaming" element={<TeluguStreaming />} />
            <Route path="/projects/telugu-streaming-2" element={<TeluguStreamingV2 />} />
            <Route
              path="/game/bangalore-times"
              element={
                <Suspense fallback={<div className="fixed inset-0 bg-[#0e0f13]" />}>
                  <BangaloreTimes backSlot={<Link to="/works">← Back</Link>} />
                </Suspense>
              }
            />
          </Routes>
        </AnimatePresence>

        {/* Bottom Navigation - Hide on project pages */}
        {!hideChrome && <BottomNav />}
      </div>
    </MotionConfig>
  );
}

export default App;
