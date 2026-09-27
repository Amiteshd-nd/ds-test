import { motion, useScroll, useMotionValueEvent } from '@cloud-march/motion/react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { ThemeSwitcher } from '../design';
/* The switcher is dressed in `lg-*` classes. That stylesheet used to arrive
   only with Home 2.2, which is lazy — so on any other route the control would
   have rendered unstyled until you had visited that page once. */
import '../styles/liquid-glass.css';
import Logo from '../assets/icons/logo.svg';
import ReadCvLogoBg from '../assets/icons/readcv-logo-bg.svg';
import ReadCvLogoFg from '../assets/icons/readcv-logo-fg.svg';

const Navbar = () => {
  const [time, setTime] = useState('');
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      };
      const timeString = now.toLocaleTimeString('en-US', options);
      setTime(`Bengaluru, IN ${timeString}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious();
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  return (
    <motion.nav
      variants={{
        visible: { y: 0 },
        hidden: { y: "-100%" },
      }}
      animate={hidden ? "hidden" : "visible"}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-none"
      /* `--site-ground`, not `--site-bg`. Two themes describe their ground as
         something other than a colour — Realism with a brushed-metal texture,
         Y2K with a gradient — and a `url()` or a gradient in a colour stop
         makes the whole declaration invalid, which left the bar with no scrim
         at all and the logo sitting on whatever scrolled under it. The ground
         token is the flat stand-in that exists for exactly this. */
      style={{
        background:
          'linear-gradient(to bottom, var(--site-ground, var(--site-bg)), transparent)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link to="/">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 cursor-pointer"
            >
              <img src={Logo} alt="Logo" className="w-full h-full" />
            </motion.div>
          </Link>

          {/* Right section */}
          <div className="flex items-center gap-4">
            {/* Time - hidden on mobile */}
            <span
              className="hidden md:block text-base leading-[1.34em] font-outfit"
              style={{ letterSpacing: '-0.32px', color: 'var(--site-fg-2)' }}
            >
              {time}
            </span>

            <ThemeToggle />

            {/* Resume Button */}
            <motion.a
              href="/Amitesh_SPD.pdf"
              download="Amitesh_SPD.pdf"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center md:gap-1 md:px-8 md:py-5 bg-transparent hover:bg-ui-gray/30 transition-colors rounded-lg"
            >
              <div className="relative w-10 h-10 md:w-6 md:h-6 site-invert-asset">
                <img
                  src={ReadCvLogoBg}
                  alt=""
                  className="absolute inset-0 w-full h-full opacity-20"
                />
                <img
                  src={ReadCvLogoFg}
                  alt="ReadCV"
                  className="absolute inset-0 w-full h-full"
                />
              </div>
              <span
                className="hidden md:inline text-xl leading-[1.319em] font-roboto font-medium"
                style={{ letterSpacing: '-1px', color: 'var(--site-fg)' }}
              >
                Resume
              </span>
            </motion.a>

            {/* The theme drawer, site-wide. It does not replace the light/dark
                toggle: that one is the one-tap flip between modes, this is the
                choice of thirteen. It sits last because it is the only control
                here that opens something — a drawer anchored to the bar's own
                right edge has the whole width to fall into, where one parked
                mid-row would have had to reach back across the Resume link. */}
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
