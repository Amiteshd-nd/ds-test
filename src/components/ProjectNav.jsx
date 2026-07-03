import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useState } from 'react';

const ProjectNav = () => {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

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
      className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-white to-transparent backdrop-blur-0"
    >
      <div className="flex items-center gap-2.5 px-8 py-4 h-[114px]">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center gap-3 px-8 py-5 hover:opacity-80 transition-opacity"
        >
          {/* Arrow Circle Left Icon */}
          <div className="relative w-6 h-6">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer circle with opacity */}
              <circle cx="12" cy="12" r="9" stroke="#232832" strokeWidth="2" opacity="0.2" />
              {/* Arrow */}
              <path
                d="M12 8L8 12L12 16M8 12H16"
                stroke="#232832"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Return Text */}
          <span className="font-roboto font-medium text-xl leading-[1.32em] text-ui-gray" style={{ letterSpacing: '-5%' }}>
            Return
          </span>
        </button>
      </div>
    </motion.nav>
  );
};

export default ProjectNav;
