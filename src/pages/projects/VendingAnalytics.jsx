import { motion } from 'framer-motion';
import ProjectNav from '../../components/ProjectNav';
import LazyImage from '../../components/LazyImage';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';

// Hero images
import imgDesktopView from '../../assets/images/projects/vending-analytics/desktop-view.webp';
import imgMobileScreen1 from '../../assets/images/projects/vending-analytics/mobile-screen-1.webp';
import imgMobileScreen2 from '../../assets/images/projects/vending-analytics/mobile-screen-2.webp';

// NDA and Logo images
import imgKelloggIcon from '../../assets/images/projects/vending-analytics/kellogg-icon.webp';
import imgLockKey from '../../assets/images/projects/vending-analytics/lock-key.webp';

const VendingAnalytics = () => {
  // Track analytics for this project
  useProjectAnalytics('Vending Analytics');

  return (
    <>
      <ProjectNav />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-white pt-32 pb-16 px-4 sm:px-8 relative"
      >
        <div className="max-w-[1135px] mx-auto">
          {/* Content Container - max-width 760px centered */}
          <div className="max-w-[760px] mx-auto flex flex-col gap-12 sm:gap-[72px]">
            {/* Hero Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col gap-12 sm:gap-16 w-full items-center"
            >
              {/* Title */}
              <h1 className="font-roboto text-2xl sm:text-5xl leading-normal text-black text-center w-full sm:w-[688px]" style={{ letterSpacing: '-1.2px' }}>
                Kellogg's Retail Analytics Dashboard: Mobile Optimization
              </h1>

              {/* Component Showcase Container */}
              <div className="relative w-full">
                {/* Shadow - hidden on mobile */}
                <div className="hidden sm:block absolute left-[38px] top-[247px] w-[691px] h-[151px] bg-white opacity-30 shadow-[0px_0px_250px_22px_rgba(0,0,0,0.25)]" />

                {/* Main Container */}
                <div className="relative border-4 sm:border-8 border-[rgba(0,0,0,0.04)] rounded-[12px] h-[194px] sm:h-[447px] w-full overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(255, 138, 183, 0.05) 0%, rgba(255, 138, 183, 0.05) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)' }}>
                  {/* Desktop View */}
                  <div className="absolute bottom-0 left-[calc(50%+0.5px)] -translate-x-1/2 w-[346px] sm:w-[679px] h-[178px] sm:h-[350px]">
                    <LazyImage
                      src={imgDesktopView}
                      alt="Kellogg's analytics dashboard desktop view"
                      className="w-full h-full"
                      objectFit="cover"
                      objectPosition="bottom"
                      priority
                    />
                  </div>

                  {/* Bottom Footer - Reading Time Carousel */}
                  <div className="absolute bottom-0 left-0 right-0 bg-[#FFF6FB] px-2 py-1 overflow-hidden z-10">
                    <div className="flex gap-3 items-center whitespace-nowrap animate-marquee">
                      {/* First set */}
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      {/* Duplicate set for seamless loop */}
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">4 mins read</span>
                      <span className="font-roboto text-sm text-black">•</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Description and Mobile Screens */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col gap-8 sm:gap-16 w-full"
            >
              {/* Header Description */}
              <div className="flex flex-col gap-6 w-full">
                <h2 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                  Converting dense desktop analytics into mobile screens while maintaining data integrity and usability for sales representatives who need quick access to critical performance metrics in the field.
                </h2>
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Impact: Enabled Kellogg's sales teams to monitor retail partner performance, identify replenishment opportunities, and make data-driven decisions directly from mobile devices during store visits and client meetings.
                </p>
              </div>

              {/* Mobile Screens */}
              <div className="flex gap-4 sm:gap-8 items-start justify-center sm:justify-between w-full">
                <LazyImage
                  src={imgMobileScreen1}
                  alt="Mobile analytics screen showing projected inventory and dispersion"
                  className="w-[168px] sm:w-[360px] h-[597px] sm:h-[1281px]"
                  placeholder="blur"
                />
                <LazyImage
                  src={imgMobileScreen2}
                  alt="Mobile retail execution screen showing sales targets and achievements"
                  className="w-[164px] sm:w-[360px] h-[597px] sm:h-[1307px]"
                  placeholder="blur"
                />
              </div>
            </motion.section>
          </div>
        </div>

        {/* Bottom Gradient Overlay with NDA Badge */}
        <div className="absolute bottom-0 left-0 right-0 h-[75px] sm:h-[253px] bg-gradient-to-t from-[#290c1d] to-transparent overflow-hidden pointer-events-none">
          {/* NDA Agreement Badge */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            <div className="bg-[#320732] border border-[#959595] rounded-[99px] px-3 py-2 sm:px-6 sm:py-[23px] flex items-center">
              <LazyImage
                src={imgLockKey}
                alt="Lock icon"
                className="w-[28px] h-[22px] sm:w-[48px] sm:h-[44.5px] shrink-0"
              />
              <p className="font-roboto font-medium text-xs sm:text-2xl text-white shrink-0" style={{ letterSpacing: '-0.24px' }}>
                NDA agreement
              </p>
            </div>
          </div>
        </div>
      </motion.main>
    </>
  );
};

export default VendingAnalytics;
