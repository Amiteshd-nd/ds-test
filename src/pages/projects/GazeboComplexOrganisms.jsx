import { motion } from 'framer-motion';
import { useState } from 'react';
import ProjectNav from '../../components/ProjectNav';
import BlurImage from '../../components/BlurImage';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import coverPhoto from '../../assets/images/projects/gazebo-complex-organisms/cover-photo.webp';

// Top Navigation Bar images
import imgTopbarPreAuth from '../../assets/images/projects/gazebo-complex-organisms/topbar-pre-auth.webp';
import imgTopbarPostAuth from '../../assets/images/projects/gazebo-complex-organisms/topbar-post-auth.webp';
import imgTopbarSearch from '../../assets/images/projects/gazebo-complex-organisms/topbar-search.webp';

// Search Box images
import imgSearchDefault from '../../assets/images/projects/gazebo-complex-organisms/search-default.webp';
import imgSearchFocused from '../../assets/images/projects/gazebo-complex-organisms/search-focused.webp';
import imgSearchInteraction from '../../assets/images/projects/gazebo-complex-organisms/search-interaction.webp';

// Notification Bell images
import imgNotificationDefault from '../../assets/images/projects/gazebo-complex-organisms/notification-default.webp';
import imgNotificationHovered from '../../assets/images/projects/gazebo-complex-organisms/notification-hovered.webp';
import imgNotificationActive from '../../assets/images/projects/gazebo-complex-organisms/notification-active.webp';
import imgNotificationAction from '../../assets/images/projects/gazebo-complex-organisms/notification-action.webp';
import imgNotificationPanel from '../../assets/images/projects/gazebo-complex-organisms/notification-panel.webp';

// 9 Dot Mega Menu images
import imgMegaMenuDefault from '../../assets/images/projects/gazebo-complex-organisms/mega-menu-default.webp';
import imgMegaMenuFocus from '../../assets/images/projects/gazebo-complex-organisms/mega-menu-focus.webp';

// Job Application Dashboard images
import imgJobOpeningsDashboard from '../../assets/images/projects/gazebo-complex-organisms/job-openings-dashboard.webp';
import imgOngoingApplicationDashboard from '../../assets/images/projects/gazebo-complex-organisms/ongoing-application-dashboard.webp';

// Application Progress Status images
import imgProgressDefault from '../../assets/images/projects/gazebo-complex-organisms/progress-default.webp';
import imgProgressExpanded from '../../assets/images/projects/gazebo-complex-organisms/progress-expanded.webp';

// Recruiter Dashboard images
import imgRecruiterDash from '../../assets/images/projects/gazebo-complex-organisms/recruiter-dash.webp';
import imgJobItemBreakdown from '../../assets/images/projects/gazebo-complex-organisms/job-item-breakdown.webp';
import imgApplicationBadge from '../../assets/images/projects/gazebo-complex-organisms/application-badge.webp';
import imgJobTexts from '../../assets/images/projects/gazebo-complex-organisms/job-texts.webp';
import imgEnvelopeIcon from '../../assets/images/projects/gazebo-complex-organisms/envelope-icon.webp';

// Job Card Details images
import imgJobCardDetails from '../../assets/images/projects/gazebo-complex-organisms/job-card-details.webp';
import imgButtonStates from '../../assets/images/projects/gazebo-complex-organisms/button-states.webp';

// Bulk Management images
import imgBulkSelection from '../../assets/images/projects/gazebo-complex-organisms/bulk-selection.webp';
import imgBulkActionFlow from '../../assets/images/projects/gazebo-complex-organisms/bulk-action-flow.webp';
import imgBulkCompose from '../../assets/images/projects/gazebo-complex-organisms/bulk-compose.webp';

// Other Pages images
// Images - Backgrounds (using colors instead)
// const imgContentBg = "https://www.figma.com/api/mcp/asset/dc2351ae-4952-4db6-b482-89eb80da2dfb";
// const imgHeaderBg1 = "https://www.figma.com/api/mcp/asset/271f0029-5e32-4205-a0d9-959dd804d200";
// const imgHeaderBg2 = "https://www.figma.com/api/mcp/asset/e215fc81-2aa7-42e4-b610-5d7acf77e8d4";
// const imgGazeboThumbnail = "https://www.figma.com/api/mcp/asset/af57705a-5b5c-47d0-aa2e-3a4f3a62f40c";

const GazeboComplexOrganisms = () => {
  // Track analytics for this project
  useProjectAnalytics('Gazebo Complex Organisms');

  return (
    <>
      <ProjectNav />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-white pt-32 pb-16 px-4 sm:px-8"
      >
        <div className="max-w-[1135px] mx-auto">
          {/* Content Container - max-width 760px centered */}
          <div className="max-w-[760px] mx-auto flex flex-col gap-12 sm:gap-[72px]">
            {/* Hero Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-8 sm:gap-16 w-full"
            >
              {/* Title */}
              <h1 className="font-roboto text-2xl sm:text-5xl leading-normal sm:leading-[1.32em] text-ui-gray text-center w-full" style={{ letterSpacing: '-1.2px' }}>
                Gazebo Complex Organisms Component Structures
              </h1>

              {/* Cover Photo */}
              <div className="relative w-full">
                {/* Main Container with green gradient background */}
                <div className="relative border-4 sm:border-8 border-[rgba(0,0,0,0.04)] rounded-lg sm:rounded-[12px] h-[160px] sm:h-[447px] w-full overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(128, 161, 127, 0.25) 0%, rgba(128, 161, 127, 0.25) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)' }}>
                  {/* Cover image positioned right-aligned */}
                  <div className="absolute top-2 sm:top-6 right-0 bottom-6 sm:bottom-8 left-auto w-[90%] sm:w-[92%]">
                    <BlurImage 
                      src={coverPhoto} 
                      alt="Gazebo Complex Organisms Cover" 
                      className="w-full h-full rounded-md sm:rounded-lg shadow-lg"
                      objectFit="cover"
                      style={{ objectPosition: 'right top' }}
                      priority 
                    />
                  </div>

                  {/* Bottom Footer - Reading Time Carousel */}
                  <div className="absolute bottom-0 left-0 right-0 bg-[#BDEBD7] py-1 overflow-hidden">
                    <div className="flex gap-3 items-center whitespace-nowrap animate-marquee">
                      {/* First set */}
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
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                      {/* Duplicate set for seamless loop */}
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
                      <span className="font-roboto-mono text-sm text-black tracking-[-0.7px]">1 min Skimming</span>
                      <span className="font-roboto text-sm text-black">•</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Scalable Design System Approach */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col gap-4 w-full"
            >
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Scalable Design System Approach
              </h2>
              <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                Repetitive elements converted as components which infact is the created by using multiple 'molecules' and 'organisms' of atomic design structure. Modular navigation components built from atomic design elements that scale across different user contexts. This navigation system adapts to authentication states while maintaining consistent functionality and visual hierarchy.
              </p>
            </motion.section>

            {/* Top Navigation Bar */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col gap-8 sm:gap-12 w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Top Navigation Bar
                </h2>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Adaptive navigation system built from modular components that respond to user authentication and interaction states.
                </p>
              </div>

              {/* States Section */}
              <div className="flex flex-col gap-8 sm:gap-16 w-full">
                {/* States Label */}
                <div className="flex gap-3 items-center">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    States
                  </p>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-[#90A2C3]" style={{ letterSpacing: '-0.28px' }}>
                    Scaled - 0.75:1
                  </p>
                </div>

                {/* Pre-Authentication */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Pre-Authentication
                  </p>
                  <div className="w-full aspect-[2820/180]">
                    <BlurImage src={imgTopbarPreAuth} alt="Pre-Authentication navigation state" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Post-Authentication */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Post-Authentication
                  </p>
                  <div className="w-full aspect-[2820/180]">
                    <BlurImage src={imgTopbarPostAuth} alt="Post-Authentication navigation state" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Clicked on Search */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Clicked on Search
                  </p>
                  <div className="w-full aspect-[2820/180]">
                    <BlurImage src={imgTopbarSearch} alt="Search active navigation state" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>

              {/* Content Sections */}
              <div className="flex flex-col gap-8 sm:gap-16 w-full">
                {/* User Need */}
                <div className="flex flex-col gap-4 w-full">
                  <h3 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    User Need
                  </h3>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    To navigate across the application to access the required functions. Placed on top based on the general thumbnail and years of user training where the users generally expects it's position to be. Persistent top navigation following web conventions for reliable access to core application functions.
                  </p>
                </div>

                {/* Parent Components */}
                <div className="flex flex-col gap-4 w-full">
                  <h3 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Parent Components
                  </h3>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    The navigation bar serves as a container for multiple child components including search functionality, user controls, and brand elements. This modular approach enables flexible customization while maintaining structural consistency across different application states.
                  </p>
                </div>

                {/* Brand Logo */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  <div className="flex flex-col gap-4">
                    <h3 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                      Brand Logo
                    </h3>
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Clickable brand identifier that provides instant recognition and serves as a homepage navigation shortcut. The logo maintains consistent sizing and positioning to reinforce brand presence and provide reliable navigation behaviour.
                    </p>
                  </div>

                  {/* Gazebo Logo */}
                  <div className="flex gap-1 items-start">
                    <p className="font-outfit font-medium text-[16.8px] leading-6 text-[#FCBF49] tracking-[0.16px]">
                      Gazebo
                    </p>
                    <div className="bg-[#4280FF] rounded-sm px-0.5 py-0.5 flex items-center justify-center">
                      <p className="font-redhat font-medium text-[6px] leading-[7.5px] text-white">
                        Beta
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Search Box */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-8 sm:gap-12 w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Search Box
                </h2>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Expandable search interface that transforms from compact to focused state when activated. The search functionality provides contextual suggestions and maintains user input while preserving the overall navigation structure and accessibility.
                </p>
              </div>

              {/* Default and Focused States */}
              <div className="flex flex-col sm:flex-row gap-8 sm:gap-10 items-start w-full">
                {/* Default State */}
                <div className="flex flex-col gap-4">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Default
                  </p>
                  <div className="w-[120px] sm:w-[188px]">
                    <BlurImage src={imgSearchDefault} alt="Search box default state" className="w-full h-auto object-contain" />
                  </div>
                </div>

                {/* Focused State */}
                <div className="flex flex-col gap-4 flex-1">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Focused
                  </p>
                  <div className="w-full sm:w-[469px]">
                    <BlurImage src={imgSearchFocused} alt="Search box focused state" className="w-full h-auto object-contain" />
                  </div>
                </div>
              </div>

              {/* Interaction State */}
              <div className="flex flex-col gap-4 w-full">
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Interaction
                </p>
                <div className="w-full sm:w-[505px]">
                  <BlurImage src={imgSearchInteraction} alt="Search box interaction with suggestions" className="w-full h-auto object-contain" />
                </div>
              </div>
            </motion.section>

            {/* Notification Bell */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col gap-8 sm:gap-12 w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Notification Bell
                </h2>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Alert indicator that communicates the presence of new notifications or messages. The bell icon provides immediate visual feedback about system updates and enables quick access to notification details through clear state variations.
                </p>
              </div>

              {/* States Section */}
              <div className="flex flex-col gap-8 w-full">
                {/* States Label */}
                <div className="flex gap-3 items-center">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    States
                  </p>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-[#90A2C3]" style={{ letterSpacing: '-0.28px' }}>
                    Scaled - 1:3
                  </p>
                </div>

                {/* Default, Hovered, Active States */}
                <div className="flex gap-6 sm:gap-10 items-center w-full">
                  {/* Default State */}
                  <div className="flex flex-col gap-3 w-auto sm:w-[110px]">
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Default
                    </p>
                    <div className="w-[60px] h-[60px] sm:w-[90px] sm:h-[90px]">
                      <BlurImage src={imgNotificationDefault} alt="Notification bell default state" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Hovered State */}
                  <div className="flex flex-col gap-3 w-auto sm:w-[110px]">
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Hovered
                    </p>
                    <div className="w-[60px] h-[60px] sm:w-[90px] sm:h-[90px]">
                      <BlurImage src={imgNotificationHovered} alt="Notification bell hovered state" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Active State */}
                  <div className="flex flex-col gap-3 w-auto sm:w-[101px]">
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Active
                    </p>
                    <div className="w-[60px] h-[60px] sm:w-[90px] sm:h-[90px]">
                      <BlurImage src={imgNotificationActive} alt="Notification bell active state" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>

                {/* Action State */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Action
                  </p>
                  <div className="w-[60px] h-[60px] sm:w-[90px] sm:h-[90px]">
                    <BlurImage src={imgNotificationAction} alt="Notification bell action state" className="w-full h-full object-cover" />
                  </div>
                  <div className="w-full sm:w-[545px] h-auto sm:h-[613px]">
                    <BlurImage src={imgNotificationPanel} alt="Notification panel dropdown" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            </motion.section>

            {/* 9 Dot Mega Menu */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 }}
              className="flex flex-col gap-6 sm:gap-8 w-full"
            >
              {/* Header */}
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  9 Dot Mega Menu
                </h2>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Application launcher that provides access to additional tools and services within the product ecosystem. The nine-dot grid follows established patterns from major platforms, offering familiar navigation for secondary applications and integrations.
                </p>
              </div>

              {/* States Label */}
              <div className="flex gap-3 items-center">
                <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  States
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-[#90A2C3]" style={{ letterSpacing: '-0.28px' }}>
                    Scaled - 1:3
                  </p>
                </div>

                {/* States */}
                <div className="flex gap-6 sm:gap-10 items-start">
                  {/* Default State */}
                  <div className="flex flex-col gap-3 w-auto sm:w-[110px]">
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Default
                    </p>
                    <div className="w-[60px] h-[60px] sm:w-[90px] sm:h-[90px]">
                      <BlurImage src={imgMegaMenuDefault} alt="9 dot mega menu default state" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Focus State */}
                  <div className="flex flex-col gap-3 w-auto sm:w-[110px]">
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                      Focus
                    </p>
                    <div className="w-[70px] h-[73px] sm:w-[106px] sm:h-[110px]">
                      <BlurImage src={imgMegaMenuFocus} alt="9 dot mega menu focus state" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Job Application Dashboard for Candidate */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.2 }}
                className="flex flex-col gap-8 sm:gap-12 w-full"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 w-full">
                  <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Job Application Dashboard for Candidate
                  </h2>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Application launcher that provides access to additional tools and services within the product ecosystem. The nine-dot grid follows established patterns from major platforms, offering familiar navigation for secondary applications and integrations.
                  </p>

                  {/* Types Label */}
                  <div className="flex gap-3 items-center py-3">
                    <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                      Types
                    </p>
                    <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-[#90A2C3]" style={{ letterSpacing: '-0.28px' }}>
                      Scaled - 0.75:1
                    </p>
                  </div>
                </div>

                {/* Dashboard Types */}
                <div className="flex flex-col gap-8 sm:gap-16 w-full">
                  {/* Dashboard for Job Openings */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Dashboard for Job Openings
                    </h3>
                    <div className="w-full aspect-[2868/1564]">
                      <BlurImage src={imgJobOpeningsDashboard} alt="Dashboard showing job openings with filters and application cards" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Dashboard Ongoing Application */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Dashboard Ongoing Application
                    </h3>
                    <div className="w-full aspect-[2868/2030]">
                      <BlurImage src={imgOngoingApplicationDashboard} alt="Dashboard showing ongoing applications with detailed progress tracking" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Application Progress Status */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 }}
                className="flex flex-col gap-8 sm:gap-16 w-full"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 w-full">
                  <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Application Progress Status
                  </h2>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Individual job application tracking component that displays current status, key details, and available actions. This card-based format enables quick scanning of application progress while providing access to detailed job information and next steps.
                  </p>
                </div>

                {/* Default State */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full sm:w-[515px]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Default
                  </p>
                  <div className="w-full sm:w-[515px] h-[77px] sm:h-[115px]">
                    <BlurImage src={imgProgressDefault} alt="Application progress card showing Site Engineer position in default collapsed state" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Expanded State */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full sm:w-[515px]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Expanded
                  </p>
                  <div className="w-full sm:w-[515px] h-[142px] sm:h-[213px]">
                    <BlurImage src={imgProgressExpanded} alt="Application progress card showing Architect position with expanded details and conversion probability" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Conversion Probability Explanation */}
                <div className="flex flex-col gap-2 w-full">
                  <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                    The 44% conversion probability value is typically calculated using a combination of data-driven factors and predictive algorithms. Example Calculation of Scoring -
                  </h3>
                  <div className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    <p className="leading-[1.34em] mb-0">Let's say a scoring algorithm looks like this:</p>
                    <ul className="list-disc mb-0">
                      <li className="mb-0 ml-6">
                        <span className="leading-[1.34em]">Pool-based normalization: 25% (based on 330 applications)</span>
                      </li>
                      <li className="mb-0 ml-6">
                        <span className="leading-[1.34em]">Stage elevated to "Viewed": +10%</span>
                      </li>
                      <li className="mb-0 ml-6">
                        <span className="leading-[1.34em]">Strong profile match: +5%</span>
                      </li>
                      <li className="mb-0 ml-6">
                        <span className="leading-[1.34em]">Recruiter pinned the job: +4%</span>
                      </li>
                      <li className="ml-6">
                        <span className="leading-[1.34em]">
                          Historic conversion at this stage: Weighted average adjustment ±0%
                          <br />
                          = Total: 44%
                        </span>
                      </li>
                    </ul>
                    <p className="leading-[1.34em]">Each factor contributes a weighted score. The sum indicates your real-time conversion probability.</p>
                  </div>
                </div>
              </motion.section>

              {/* Application Status Tags */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.6 }}
                className="flex flex-col gap-4 sm:gap-6 w-full"
              >
                {/* Title */}
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Application Status Tags
                </h2>

                {/* Applied */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#FFEAD5] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#EC4A0A]">
                        Applied
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Your job application has been successfully submitted and is awaiting review by the employer.
                  </p>
                </div>

                {/* Viewed */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#EBE9FE] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#6938EF]">
                        Viewed
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Your application has been opened and reviewed by the recruitment team or hiring manager.
                  </p>
                </div>

                {/* Shortlisted */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#F0FDE2] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#3B7C0F]">
                        Shortlisted
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Congratulations! Your profile matches the job requirements and has been moved forward for further consideration.
                  </p>
                </div>

                {/* Processing */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#E3FFF8] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#107569]">
                        Processing
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Your application has been opened and reviewed by the recruitment team or hiring manager.
                  </p>
                </div>

                {/* Selected */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#0BA5EC] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#F5F5F5]">
                        Selected
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    You have been chosen for the role. Expect follow-up communication regarding next steps or onboarding.
                  </p>
                </div>

                {/* Filled */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#667085] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#F5F5F5]">
                        Filled
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    The open position has been filled, and the application process for this role is now closed.
                  </p>
                </div>

                {/* Pending */}
                <div className="flex gap-2 items-start w-full">
                  <div className="flex flex-col gap-2.5 items-start w-[80px] sm:w-[100px]">
                    <div className="flex items-center justify-center px-[9px] py-[4.5px] bg-[#FEE4E2] rounded-[1123.875px] h-[27px] min-w-[45px]">
                      <p className="font-redhat font-semibold text-[13.5px] leading-[1.6] text-[#B42318]">
                        Pending
                      </p>
                    </div>
                  </div>
                  <p className="flex-1 font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Your application is awaiting further actions or additional information, and the next steps will be communicated soon.
                  </p>
                </div>
              </motion.section>

              {/* Candidate Application manager Recruiter Dashboard */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.8 }}
                className="flex flex-col gap-8 sm:gap-[53px] w-full"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 w-full">
                  <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Candidate Application manager Recruiter Dashboard
                  </h2>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Recruiter-focused dashboard built from modular components that enable efficient candidate pipeline management. This interface consolidates application tracking, job posting management, and candidate evaluation tools into a unified workflow for hiring teams.
                  </p>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-8 sm:gap-16 w-full">
                  {/* Job Listings by the Recruiter */}
                  <div className="flex flex-col gap-3 w-full">
                    <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Job Listings by the Recruiter
                    </h3>
                    <div className="w-full aspect-[2838/831]">
                      <BlurImage src={imgRecruiterDash} alt="Recruiter dashboard showing job listings with application counts and filters" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Job List Item Break down */}
                  <div className="flex flex-col gap-4 sm:gap-8 w-full">
                    {/* Breakdown Title and Image */}
                    <div className="flex flex-col gap-4 sm:gap-8 w-full">
                      <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                        Job List Item Break dowm
                      </h3>
                      <div className="w-full sm:w-[590px] h-[44px] sm:h-[65.318px]">
                        <BlurImage src={imgJobItemBreakdown} alt="Job list item component breakdown" className="w-full h-full object-cover" />
                      </div>
                    </div>

                    {/* Application Badge Explanation */}
                    <div className="flex gap-3 items-center w-full">
                      <div className="flex items-start w-[100px] sm:w-[150px] py-1">
                        <div className="w-[30px] h-[30px] sm:w-[45px] sm:h-[45px]">
                          <BlurImage src={imgApplicationBadge} alt="Application count badge showing 99+" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="font-roboto-sans text-sm sm:text-base text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                        <p className="mb-0">Tentative number of application received,</p>
                        <p className="mb-0">99 is the visual limit, further details  needs to be viewed on clicking the details.</p>
                      </div>
                    </div>

                    {/* Job Texts Explanation */}
                    <div className="flex gap-3 items-center w-full">
                      <div className="w-[100px] sm:w-[150px] h-[34px] sm:h-[51px]">
                        <BlurImage src={imgJobTexts} alt="Job role and location text fields" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex gap-3 items-center">
                        <p className="font-roboto-sans text-sm sm:text-base text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                          Job Role, Vacancy in respective Team, Location
                        </p>
                      </div>
                    </div>

                    {/* Envelope Icon Explanation */}
                    <div className="flex gap-3 items-center w-full">
                      <div className="w-[100px] sm:w-[150px] h-4 sm:h-6">
                        <BlurImage src={imgEnvelopeIcon} alt="Envelope icon with notification badge" className="w-full h-full object-cover" />
                      </div>
                      <p className="font-roboto-sans text-sm sm:text-base text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                        When Candidates will send response the envelope will display a badge.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* On Click Job Card Details */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 2.0 }}
                className="flex flex-col gap-4 sm:gap-8 w-full"
              >
                {/* Title */}
                <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                  On Click Job Card Details
                </h3>

                {/* Job Card Details Dashboard */}
                <div className="w-full aspect-[2898/1902]">
                  <BlurImage src={imgJobCardDetails} alt="Detailed view of job card showing candidate applications with filters and status options" className="w-full h-full object-cover" />
                </div>

                {/* Button States */}
                <div className="w-full aspect-[3000/744]">
                  <BlurImage src={imgButtonStates} alt="Mark As button states showing Fit, Unfit, and Onhold options with dropdown menus" className="w-full h-full object-cover" />
                </div>

                {/* Reset Note */}
                <div className="flex flex-col gap-4 sm:gap-8 h-auto sm:h-10 items-start w-full">
                  <div className="flex flex-1 flex-col justify-center items-center w-full">
                    <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-text-quaternary text-center" style={{ letterSpacing: '-0.08px' }}>
                      "Reset" will change the state of the Button to "Mark as"
                    </p>
                  </div>
                </div>
              </motion.section>

              {/* Management of Candidate in Bulk */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 2.2 }}
                className="flex flex-col gap-8 sm:gap-12 w-full"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 w-full">
                  <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Management of Candidate in Bulk
                  </h2>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Bulk candidate selection and management interface for efficient multi-candidate processing and communication workflows.
                  </p>
                </div>

                {/* Bulk Selection Interface */}
                <div className="w-full aspect-[2058/1452]">
                  <BlurImage src={imgBulkSelection} alt="Bulk candidate selection interface with checkboxes and status filters" className="w-full h-full object-cover" />
                </div>

                {/* Bulk Action Flow */}
                <div className="w-full aspect-[2805/1932]">
                  <BlurImage src={imgBulkActionFlow} alt="Bulk action flow showing candidate selection and routing path" className="w-full h-full object-cover" />
                </div>

                {/* Compose Description */}
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                  Compose interface for bulk candidate communication with rich text editing and recipient management capabilities.
                </p>

                {/* Bulk Compose Interface */}
                <div className="w-full aspect-[2058/1517]">
                  <BlurImage src={imgBulkCompose} alt="Compose interface for bulk candidate communication with rich text editor" className="w-full h-full object-cover" />
                </div>
              </motion.section>

              {/* Stacked Other Pages Section */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 2.4 }}
                className="flex flex-col items-start w-full"
              >
                {/* Job Application Dashboard for Candidate */}
                <div className="flex flex-col py-4 sm:py-6 w-full border-t border-ui-gray">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Job Application Dashboard for Candidate
                  </h3>
                </div>

                {/* Configuration Page */}
                <div className="flex flex-col py-4 sm:py-6 w-full border-t border-ui-gray">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Configuration Page
                  </h3>
                </div>

                {/* Recruiter Dashboard */}
                <div className="flex flex-col gap-2 sm:gap-3 py-4 sm:py-6 w-full border-t border-ui-gray">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Recruiter Dashboard
                  </h3>
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Repetitive elements converted as components which infact is the created by using multiple 'molecules' and 'organisms' of atomic design structure. Perplexity please generate some text content for here.
                  </p>
                </div>

                {/* Organization Profile Page */}
                <div className="flex flex-col gap-2 sm:gap-3 py-4 sm:py-6 w-full border-t border-ui-gray">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                    Organization Profile Page
                  </h3>
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    Repetitive elements converted as components which infact is the created by using multiple 'molecules' and 'organisms' of atomic design structure.
                  </p>
                </div>

                {/* Ellipsis Section */}
                <div className="flex flex-col gap-2 sm:gap-3 py-4 sm:py-6 w-full border-t border-ui-gray">
                  <p className="font-roboto font-medium text-lg sm:text-[24px] leading-normal text-ui-gray" style={{ letterSpacing: '-0.48px' }}>
                    •••
                  </p>
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                    ...
                  </p>
                </div>

                {/* All Components DS Card */}
                <div className="bg-[#FFF8E6] flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 rounded-[16px] sm:rounded-[24px] w-full mt-4 sm:mt-6 items-center sm:items-center overflow-visible">
                  <div className="bg-[#FEE4E2] rounded-2xl px-8 py-6 sm:px-6 sm:py-4 shrink-0">
                    <p className="font-roboto font-medium text-2xl sm:text-xl text-[#F04438]">Gazebo</p>
                    <p className="font-roboto-sans text-sm text-[#F04438]">Design System</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <h3 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-[#111111]" style={{ letterSpacing: '-0.08px' }}>
                      All Components DS
                    </h3>
                    <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-[#565C6F] break-words" style={{ letterSpacing: '-0.28px' }}>
                      The above components are the key ones I worked on. To view all, please check out this linked Figma file.
                    </p>
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <a
                        href="https://www.figma.com/design/7WfEeCID05qU0gdKCtJHHY/Gazebo-Design-System?node-id=10338-7383&t=SxTZJtDpaC5NWzcS-1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-roboto-sans font-medium text-sm sm:text-base leading-normal text-[#4A4AFC] underline cursor-pointer"
                        style={{ letterSpacing: '-0.32px', textUnderlinePosition: 'from-font' }}
                      >
                        Visit the File
                      </a>
                      <span className="font-inter font-medium text-sm sm:text-base leading-normal text-[#4A4AFC]" style={{ letterSpacing: '-0.8px' }}>
                        →
                      </span>
                    </div>
                  </div>
                </div>
              </motion.section>
            </div>
          </div>
        </motion.main>
      </>
    );
  };

export default GazeboComplexOrganisms;
