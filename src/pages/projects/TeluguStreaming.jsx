import { motion } from 'framer-motion';
import ProjectNav from '../../components/ProjectNav';
import BlurImage from '../../components/BlurImage';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';

// Hero images
import imgHomeScreen from '../../assets/images/projects/telugu-streaming/home-selected.webp';
import imgMobileView from '../../assets/images/projects/telugu-streaming/mobile-homepage.webp';

// Style Guide and Features images
import imgStyleGuide from '../../assets/images/projects/telugu-streaming/style-guide.webp';
import imgSubscriptionFlow1 from '../../assets/images/projects/telugu-streaming/subscription-flow-1.webp';
import imgSubscriptionFlow2 from '../../assets/images/projects/telugu-streaming/subscription-flow-2.webp';
import imgMobileHome from '../../assets/images/projects/telugu-streaming/mobile-homepage.webp';
import imgSubscriptionWorkflow from '../../assets/images/projects/telugu-streaming/subscription-workflow.webp';
import imgLanguageOnboarding from '../../assets/images/projects/telugu-streaming/language-onboarding.webp';
import imgContentRepresentation from '../../assets/images/projects/telugu-streaming/content-4k-dolby.webp';
import imgSkipSong from '../../assets/images/projects/telugu-streaming/skip-song-player.webp';
import imgQuality from '../../assets/images/projects/telugu-streaming/quality-player.webp';

// NDA Badge
import imgLockKey from '../../assets/images/projects/telugu-streaming/nda-lock-icon.webp';

const TeluguStreaming = () => {
  // Track analytics for this project
  useProjectAnalytics('Telugu Streaming');

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
          <div className="max-w-[760px] mx-auto flex flex-col gap-8 sm:gap-[72px]">
            {/* Hero Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col gap-12 sm:gap-16 w-full items-center"
            >
              {/* Title */}
              <h1 className="font-roboto text-2xl sm:text-5xl leading-normal text-black text-center w-full" style={{ letterSpacing: '-1.2px' }}>
                Designing seamless subscription flows and multilingual experiences for India's leading Telugu streaming platform
              </h1>

              {/* Component Showcase Container */}
              <div className="relative w-full">
                {/* Shadow - hidden on mobile */}
                <div className="hidden sm:block absolute left-[19px] top-[247px] w-[660px] h-[151px] bg-white opacity-30 shadow-[0px_0px_250px_22px_rgba(0,0,0,0.25)]" />

                {/* Main Container */}
                <div className="relative border-4 sm:border-8 border-[rgba(0,0,0,0.04)] rounded-xl h-[194px] sm:h-[447px] w-full overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(255, 202, 138, 0.25) 0%, rgba(255, 202, 138, 0.25) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)' }}>
                  {/* Home Screen */}
                  <BlurImage
                    src={imgHomeScreen}
                    alt="Aha Telugu streaming platform home screen"
                    className="absolute left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-[119px] top-[-20px] sm:top-[-48px] w-[306px] sm:w-[706px] h-[203px] sm:h-[469px]"
                    priority
                  />

                  {/* Mobile View */}
                  <BlurImage
                    src={imgMobileView}
                    alt="Mobile view of streaming platform"
                    className="absolute left-[16px] sm:left-[66px] top-[49px] sm:top-[113px] w-[95px] sm:w-[220px] h-[153px] sm:h-[354px] rounded-[8px] shadow-[0px_0px_8px_0px_rgba(255,255,255,0.75)]"
                    priority
                  />

                  {/* Bottom Footer - Reading Time Carousel */}
                  <div className="absolute bottom-0 left-0 right-0 bg-[#FFECD3] py-1 overflow-hidden">
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

            {/* Style Guide Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col gap-6 sm:gap-6 w-full"
            >
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Style Guide
              </h2>
              <BlurImage
                src={imgStyleGuide}
                alt="Aha Telugu streaming platform style guide showing colors, typography, and components"
                className="w-full aspect-[2949/1951]"
              />
            </motion.section>

            {/* Subscription Plan Selection */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col gap-8 sm:gap-8 w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-3 sm:gap-3 w-full">
                <h2 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Subscription Plan Selection
                </h2>
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  "Multi-tiered Pricing Strategy Interface" Designed a comprehensive plan selection flow featuring annual, quarterly, and combo subscription options with clear value propositions, pricing transparency, and mobile number verification integration to reduce subscription friction.
                </p>
              </div>

              {/* Subscription Flows */}
              <div className="flex flex-col gap-8 sm:gap-8 w-full">
                <BlurImage
                  src={imgSubscriptionFlow1}
                  alt="Subscription plan selection interface showing pricing tiers"
                  className="w-full aspect-[2955/1229]"
                />
                <BlurImage
                  src={imgSubscriptionFlow2}
                  alt="Subscription verification and payment flow"
                  className="w-full aspect-[2955/1229]"
                />
              </div>
            </motion.section>

            {/* Mobile Responsive Subscription Workflow */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-[43px] sm:gap-[43px] w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-3 sm:gap-3 w-full">
                <h2 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Mobile Responsive subscription workflow
                </h2>
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  The subscription flow emphasizes transparency and choice, with clear pricing structures and limited-time offer highlighting. The verification system reduces drop-off through streamlined OTP processes and multiple contact options. Payment integration supports both traditional and modern payment methods, including UPI, digital wallets, and QR codes.
                </p>
              </div>

              {/* Mobile Workflow Images */}
              <div className="flex flex-col gap-[41px] sm:flex-row sm:gap-10 items-center w-full">
                <BlurImage
                  src={imgMobileHome}
                  alt="Mobile home screen"
                  className="w-full sm:w-[295px] aspect-[684/1098] sm:aspect-auto sm:h-[474px] shrink-0"
                />
                <BlurImage
                  src={imgSubscriptionWorkflow}
                  alt="Mobile subscription workflow screens"
                  className="w-full sm:flex-1 aspect-[1722/1920]"
                />
              </div>
            </motion.section>

            {/* Language Preference Setup */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col gap-8 sm:gap-[35px] w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-6 sm:gap-6 w-full">
                <h2 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Language Preference Setup
                </h2>
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  "Regional Content Accessibility" Created an intuitive language selection flow supporting Telugu, Tamil, Malayalam, and English with dual-language content display options, ensuring regional content discoverability while maintaining cross-linguistic accessibility.
                </p>
              </div>

              {/* Language Features */}
              <div className="flex flex-col gap-8 sm:gap-[76px] items-end w-full">
                <BlurImage
                  src={imgLanguageOnboarding}
                  alt="Language preference onboarding screen"
                  className="w-full aspect-[962/542]"
                />
                <BlurImage
                  src={imgContentRepresentation}
                  alt="Content representation with 4K and Dolby quality indicators"
                  className="w-full aspect-[960/540]"
                />
                <BlurImage
                  src={imgSkipSong}
                  alt="Video player with skip song functionality"
                  className="w-full aspect-[2886/1624]"
                />
                <BlurImage
                  src={imgQuality}
                  alt="Video player quality settings"
                  className="w-full aspect-[962/542]"
                />
              </div>
            </motion.section>
          </div>
        </div>

        {/* Bottom Gradient Overlay with NDA Badge */}
        <div className="absolute bottom-0 left-0 right-0 h-[75px] sm:h-[253px] bg-gradient-to-t from-[#29160c] to-transparent overflow-hidden pointer-events-none">
          {/* NDA Agreement Badge */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            <div className="bg-[#321807] border border-[#959595] rounded-[99px] px-3 py-2 sm:px-6 sm:py-[21px] flex items-center">
              <BlurImage
                src={imgLockKey}
                alt="Lock icon"
                className="w-[28px] h-[22px] sm:w-[48px] sm:h-[48px] shrink-0"
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

export default TeluguStreaming;
