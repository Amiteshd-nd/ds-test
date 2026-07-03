import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { useState } from 'react';

const BottomNav = () => {
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Works', path: '/works' },
    { name: 'About me', path: '/about' },
  ];

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
        hidden: { y: "150%" },
      }}
      animate={hidden ? "hidden" : "visible"}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="flex items-center gap-1 p-2 bg-dark-nav backdrop-blur-lg rounded-nav">
        {navItems.map((item, index) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `w-[100px] md:w-[150px] px-6 py-3 rounded-nav-item transition-all duration-300 flex items-center justify-center ${
                isActive
                  ? 'bg-light text-ui-gray'
                  : 'text-light hover:bg-light/10'
              }`
            }
          >
            {({ isActive }) => (
              <motion.span
                initial={false}
                animate={{ scale: isActive ? 1 : 1 }}
                className="font-roboto font-medium text-base leading-[1.319em] whitespace-nowrap"
                style={{ letterSpacing: '-0.8px' }}
              >
                {item.name}
              </motion.span>
            )}
          </NavLink>
        ))}
      </div>
    </motion.nav>
  );
};

export default BottomNav;
