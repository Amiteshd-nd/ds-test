import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import ReactGA from 'react-ga4';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import BackgroundLoader from './components/BackgroundLoader';
import Home from './pages/Home';
import Works from './pages/Works';
import About from './pages/About';
import HoursOfService from './pages/projects/HoursOfService';
import VehicleHealth from './pages/projects/VehicleHealth';
import GazeboComplexOrganisms from './pages/projects/GazeboComplexOrganisms';
import VendingAnalytics from './pages/projects/VendingAnalytics';
import TeluguStreaming from './pages/projects/TeluguStreaming';

// Initialize Google Analytics
ReactGA.initialize('G-HN2NX8DVHC');

function App() {
  const location = useLocation();
  const isProjectPage = location.pathname.startsWith('/projects/');

  // Scroll to top on route change and send pageview to GA
  useEffect(() => {
    window.scrollTo(0, 0);
    // Send pageview to Google Analytics
    ReactGA.send({ hitType: 'pageview', page: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-dark text-light-DEFAULT">
      {/* Background Image Prefetcher */}
      <BackgroundLoader />

      {/* Top Navigation - Hide on project pages */}
      {!isProjectPage && <Navbar />}

      {/* Main Content with Page Transitions */}
      <AnimatePresence>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/works" element={<Works />} />
          <Route path="/about" element={<About />} />
          <Route path="/projects/hours-of-service" element={<HoursOfService />} />
          <Route path="/projects/vehicle-health" element={<VehicleHealth />} />
          <Route path="/projects/gazebo-complex-organisms" element={<GazeboComplexOrganisms />} />
          <Route path="/projects/vending-analytics" element={<VendingAnalytics />} />
          <Route path="/projects/telugu-streaming" element={<TeluguStreaming />} />
        </Routes>
      </AnimatePresence>

      {/* Bottom Navigation - Hide on project pages */}
      {!isProjectPage && <BottomNav />}
    </div>
  );
}

export default App;
