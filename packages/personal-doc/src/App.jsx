import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from '@cloud-march/motion/react';
import { useEffect, lazy, Suspense } from 'react';
import ReactGA from 'react-ga4';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import BackgroundLoader from './components/BackgroundLoader';
import { ThemeProvider } from './design';
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
import BangaloreTimesComingSoon from './pages/BangaloreTimesComingSoon';
import PasswordGate from './components/PasswordGate';

// Home 2.2 — the chat-native surface. Lazy so its canvas material and chat
// bundle stay off the critical path for everyone landing on the classic home.
const HomeV22 = lazy(() => import('./pages/HomeV22'));

// Museum renders the same live canvases, so it is split out for the same reason.
const Museum = lazy(() => import('./pages/Museum'));

// The Bangalore Times build is parked behind a holding screen, so the game
// package is deliberately not imported here and Phaser stays out of the bundle.

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
      {/* Above everything, because the theme now dresses the whole site rather
          than one route, and it has to survive navigation between them. */}
      <ThemeProvider>
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
            {/* The two client case studies sit behind a passphrase. The gate
                renders the study only once it opens — though see lib/gate.js
                on what that is and is not worth on a static site. */}
            <Route
              path="/projects/hours-of-service-2"
              element={
                <PasswordGate title="Hours of Service is under wraps">
                  <HoursOfServiceV2 />
                </PasswordGate>
              }
            />
            <Route path="/projects/vehicle-health" element={<VehicleHealth />} />
            <Route
              path="/projects/vehicle-health-2"
              element={
                <PasswordGate title="Vehicle Health is under wraps">
                  <VehicleHealthV2 />
                </PasswordGate>
              }
            />
            <Route path="/projects/gazebo-complex-organisms" element={<GazeboComplexOrganisms />} />
            <Route path="/projects/gazebo-complex-organisms-2" element={<GazeboComplexOrganismsV2 />} />
            <Route path="/projects/vending-analytics" element={<VendingAnalytics />} />
            <Route path="/projects/vending-analytics-2" element={<VendingAnalyticsV2 />} />
            <Route path="/projects/telugu-streaming" element={<TeluguStreaming />} />
            <Route path="/projects/telugu-streaming-2" element={<TeluguStreamingV2 />} />
            <Route path="/game/bangalore-times" element={<BangaloreTimesComingSoon />} />
          </Routes>
        </AnimatePresence>

        {/* Bottom Navigation - Hide on project pages */}
        {!hideChrome && <BottomNav />}
      </div>
      </ThemeProvider>
    </MotionConfig>
  );
}

export default App;
