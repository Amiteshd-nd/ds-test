import { motion } from 'framer-motion';
import { useState } from 'react';
import ProjectNav from '../../components/ProjectNav';
import LazyImage from '../../components/LazyImage';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';

// Images from Figma

import imgWhyIcon from '../../assets/images/projects/vehicle-health/why-icon.webp';
import imgCurrentIssuesIcon from '../../assets/images/projects/vehicle-health/current-issues-icon.webp';
import imgCaretCircleDown from '../../assets/images/projects/vehicle-health/caret-circle-down.webp';
import imgPersonasIcon from '../../assets/images/projects/vehicle-health/personas-icon.webp';

// Cover photo images
import imgCoverPhoto from '../../assets/images/projects/vehicle-health/cover-photo.webp';

// Arc 1 images
import imgS1B1 from '../../assets/images/projects/vehicle-health/arc1-scene1-b1.webp';
import imgS1B2 from '../../assets/images/projects/vehicle-health/arc1-s1b2.webp';
import imgS1B3 from '../../assets/images/projects/vehicle-health/arc1-s1b3.webp';
import imgS1B4 from '../../assets/images/projects/vehicle-health/arc1-s1b4.webp';
import imgS2B1 from '../../assets/images/projects/vehicle-health/arc1-s2b1.webp';
import imgS2B2 from '../../assets/images/projects/vehicle-health/arc1-s2b2.webp';
import imgS2B3 from '../../assets/images/projects/vehicle-health/arc1-s2b3.webp';
import imgS2B4 from '../../assets/images/projects/vehicle-health/arc1-s2b4.webp';
import imgS2B5 from '../../assets/images/projects/vehicle-health/arc1-s2b5.webp';
import imgS2B61 from '../../assets/images/projects/vehicle-health/arc1-s2b61.webp';

// Arc 2 images
import imgS3B1 from '../../assets/images/projects/vehicle-health/arc2-s3b1.webp';
import imgS3B4 from '../../assets/images/projects/vehicle-health/arc2-s3b4.webp';
import imgImage6 from '../../assets/images/projects/vehicle-health/arc2-image6.webp';
import imgS3B2 from '../../assets/images/projects/vehicle-health/arc2-s3b2.webp';
import imgS3B5 from '../../assets/images/projects/vehicle-health/arc2-s3b5.webp';
import imgS3B6 from '../../assets/images/projects/vehicle-health/arc2-s3b6.webp';
import imgS4B1 from '../../assets/images/projects/vehicle-health/arc2-s4b1.webp';
import imgS4B2 from '../../assets/images/projects/vehicle-health/arc2-s4b2.webp';
import imgS4B3 from '../../assets/images/projects/vehicle-health/arc2-s4b3.webp';
import imgT1B1 from '../../assets/images/projects/vehicle-health/arc2-t1b1.webp';
import imgT1B5 from '../../assets/images/projects/vehicle-health/arc2-t1b5.webp';
import imgT1S2 from '../../assets/images/projects/vehicle-health/arc2-t1s2.webp';
import imgT1B4 from '../../assets/images/projects/vehicle-health/arc2-t1b4.webp';
import imgT3B1 from '../../assets/images/projects/vehicle-health/arc2-t3b1.webp';

// Device images
import imgDeviceDesktop from '../../assets/images/projects/vehicle-health/device-desktop.webp';
import imgDeviceTablet from '../../assets/images/projects/vehicle-health/device-tablet.webp';
import imgDeviceMobile from '../../assets/images/projects/vehicle-health/device-mobile.webp';

// Screen images and videos - Assigning Technician
import videoAssigningTechnicianDesktop from '../../assets/videos/assigning-technician-pmi.mov';
import videoAssigningTechnicianTablet from '../../assets/videos/assigning-technician-tablet.mov';
import videoAssigningTechnicianMobile from '../../assets/videos/assigning-technician-mobile.mov';
import videoAssigningTechnicianDashboard from '../../assets/videos/assigning-technician-dashboard.mov';
import videoTechnicianInspecting from '../../assets/videos/technician-inspecting-defects.mov';
import videoInspectionByManager from '../../assets/videos/inspection-by-manager.mov';
import videoApprovingInspection from '../../assets/videos/approving-inspection.mov';
import imgSchedulingMaintenance from '../../assets/images/projects/vehicle-health/scheduling-maintenance.webp';
import imgDefectStatus1 from '../../assets/images/projects/vehicle-health/defect-status-1.webp';
import imgDefectStatus2 from '../../assets/images/projects/vehicle-health/defect-status-2.webp';
import imgEllipse from '../../assets/images/projects/vehicle-health/ellipse.webp';

// Objective section icon
import imgObjectiveIcon from '../../assets/images/projects/vehicle-health/objective-icon.webp';

// Discovery section icons
import imgDiscoveryIcon from '../../assets/images/projects/vehicle-health/discovery-icon.webp';
import imgDiscoveryCaretDown from '../../assets/images/projects/vehicle-health/discovery-caret-down.webp';

// Local persona images
import imgNatsu from '../../assets/images/projects/vehicle-health/persona-natsu.webp';
import imgMacao from '../../assets/images/projects/vehicle-health/persona-macao.webp';
import imgGray from '../../assets/images/projects/vehicle-health/persona-gray.webp';

const VehicleHealth = () => {
  const [isWhyAccordionOpen, setIsWhyAccordionOpen] = useState(false);
  const [isCurrentIssuesOpen, setIsCurrentIssuesOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

  // Track analytics for this project
  useProjectAnalytics('Vehicle Health');

  return (
    <>
      <ProjectNav />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-white pt-20 sm:pt-32 pb-8 sm:pb-16 px-4 sm:px-8"
      >
        <div className="max-w-[1135px] mx-auto">
          {/* Main Block */}
          <div className="w-full max-w-[760px] mx-auto flex flex-col gap-8 sm:gap-[72px]">
            {/* Hero Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-6 sm:gap-12 w-full"
            >
              {/* Main Title */}
              <h1 className="font-roboto text-2xl sm:text-5xl leading-[1.32em] text-ui-gray text-center w-full" style={{ letterSpacing: '-5%' }}>
                Integrated Fleet Management — Maintenance, Inspections & Defect Workflows for the Fleet Safety Dashboard
              </h1>

              {/* Cover Photo Showcase Container */}
              <div className="relative w-full">
                {/* Main Container */}
                <div className="relative border-4 sm:border-8 border-[rgba(0,0,0,0.04)] rounded-lg sm:rounded-xl overflow-hidden w-full">
                  <LazyImage src={imgCoverPhoto} alt="Vehicle maintenance dashboard" className="w-full h-auto object-cover" />

                  {/* Bottom Footer - Reading Time Carousel */}
                  <div className="absolute bottom-0 left-0 right-0 bg-[#F9F6DA] py-1 overflow-hidden">
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

            {/* Introduction Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex flex-col gap-4 sm:gap-8 w-full"
            >
              <h2 className="font-space font-bold text-2xl sm:text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                Introduction
              </h2>
              <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                Fleet operators manage vehicle inspections and maintenance in fragmented ways — smaller fleets still rely on pen-and-paper logs, while larger fleets depend on costly third-party tools. To address these inefficiencies, we designed an integrated solution that brings maintenance scheduling, mobile inspections, and defect lifecycle tracking into a single platform, improving operational efficiency while supporting long-term business goals.
              </p>
            </motion.section>

            {/* Why Maintenance Dashboard Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col gap-6 sm:gap-16 w-full"
            >
              {/* Accordion Header */}
              <div
                className="flex items-center gap-4 sm:gap-8 w-full cursor-pointer"
                onClick={() => setIsWhyAccordionOpen(!isWhyAccordionOpen)}
              >
                <div className="w-8 h-8 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden shadow-[inset_0px_0px_12px_2px_rgba(255,255,255,0.5),inset_0px_0px_6px_2px_rgba(153,153,153,0.25)]">
                  <LazyImage src={imgWhyIcon} alt="Why Icon" className="w-full h-full object-cover" />
                </div>
                <h2 className="font-space font-bold text-base sm:text-[32px] leading-[1.34em] text-ui-gray flex-1" style={{ letterSpacing: '-0.5%' }}>
                  Why Maintenance Dashboard is required?
                </h2>
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 64 64"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: isWhyAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s ease'
                    }}
                  >
                    <circle cx="32" cy="32" r="24" fill="#E2E9F6" stroke="#C3CEE2" strokeWidth="2"/>
                    <path d="M22 26L32 36L42 26" stroke="#232832" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              {/* Accordion Content */}
              <motion.div
                initial={false}
                animate={{
                  height: isWhyAccordionOpen ? 'auto' : 0,
                  opacity: isWhyAccordionOpen ? 1 : 0
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="flex flex-col gap-6 sm:gap-16">
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary w-full" style={{ letterSpacing: '-2%' }}>
                    Fleet operations involve dozens or even hundreds of vehicles, each with its own maintenance schedules, inspection histories, and defect records. Without a centralized dashboard, this information is often scattered across paper logs, spreadsheets, or third-party systems — making it difficult for managers to keep track of vehicle health and plan proactively.
                  </p>

                  {/* Key Benefits Cards */}
                  <div className="relative h-[222px] sm:h-[298px] w-full">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-wrap justify-center gap-3 sm:gap-4">
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-[99px] px-6 py-3 transform -rotate-6">
                        <p className="font-space font-bold text-sm text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Centralized Visibility
                        </p>
                      </div>
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-[99px] px-6 py-3 transform rotate-6">
                        <p className="font-space font-bold text-sm text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Proactive Maintenance Planning
                        </p>
                      </div>
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-[99px] px-6 py-3 transform -rotate-3">
                        <p className="font-space font-bold text-sm text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Defect Tracking & Resolution
                        </p>
                      </div>
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-[99px] px-6 py-3 transform rotate-3">
                        <p className="font-space font-bold text-sm text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Data-Driven Insights
                        </p>
                      </div>
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-[99px] px-6 py-3 transform -rotate-2">
                        <p className="font-space font-bold text-sm text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Compliance & Accountability
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.section>

            {/* Current Issues Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col gap-6 sm:gap-16 w-full"
            >
              {/* Accordion Header */}
              <div
                className="flex items-center gap-4 sm:gap-8 w-full cursor-pointer"
                onClick={() => setIsCurrentIssuesOpen(!isCurrentIssuesOpen)}
              >
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <LazyImage src={imgCurrentIssuesIcon} alt="Current Issues" className="w-full h-full object-cover" />
                </div>
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                  Current Issues
                </h2>
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 64 64"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: isCurrentIssuesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s ease'
                    }}
                  >
                    <circle cx="32" cy="32" r="24" fill="#E2E9F6" stroke="#C3CEE2" strokeWidth="2"/>
                    <path d="M22 26L32 36L42 26" stroke="#232832" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              {/* Accordion Content */}
              <motion.div
                initial={false}
                animate={{
                  height: isCurrentIssuesOpen ? 'auto' : 0,
                  opacity: isCurrentIssuesOpen ? 1 : 0
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="flex flex-col gap-6">
                  {/* Mobile Bullet Lists - Hidden on SM and up */}
                  <div className="flex flex-col gap-6 sm:hidden">
                    <ul className="list-disc list-outside ml-6 space-y-2">
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Lost / damaged records</span> → up to <span className="font-bold text-ui-gray">15–20%</span> of inspection <span className="font-bold text-ui-gray">sheets misplaced</span> monthly.
                      </li>
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Delayed visibility</span> → managers receive inspection data <span className="font-bold text-ui-gray">2–3 days late</span> on average.
                      </li>
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Missed repairs → ~10%</span> of reported defects never reach the technician due to manual handoffs.
                      </li>
                    </ul>

                    <ul className="list-disc list-outside ml-6 space-y-2">
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Fragmented workflow</span> → managers spend <span className="font-bold text-ui-gray">~30% more time switching</span> between safety and maintenance apps.
                      </li>
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Duplicated effort</span> → same vehicle/defect details entered twice across systems.
                      </li>
                      <li className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        <span className="font-bold text-ui-gray">Limited customization</span> → rigid workflows <span className="font-bold text-ui-gray">force operators to adapt to the tool</span> instead of the other way around.
                      </li>
                    </ul>
                  </div>

                  {/* Desktop Tiles - Hidden on mobile, shown on SM and up */}
                  <div className="hidden sm:flex flex-col gap-3">
                  {/* Row 1: Two tiles side by side */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
                    {/* Tile 1: Lost / damaged records */}
                    <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col gap-1">
                      <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Lost / damaged records
                      </h3>
                      <p className="font-space font-bold text-2xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        15-20%
                      </p>
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        sheets misplaced monthly
                      </p>
                    </div>

                    {/* Tile 2: Fragmented workflow */}
                    <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                      <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Fragmented workflow
                      </h3>
                      <p className="font-space font-bold text-2xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        ~30%
                      </p>
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        more time switching between safety and maintenance apps.
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Two columns */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
                    {/* Left Column: 2 tiles stacked */}
                    <div className="flex flex-col gap-2 sm:gap-3 flex-1">
                      {/* Tile 3: Delayed Visibility */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                        <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Delayed Visibility
                        </h3>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          managers receive inspection data late
                        </p>
                        <p className="font-space font-bold text-2xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          10hrs - 1 day
                        </p>
                      </div>

                      {/* Tile 4: Limited customization */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                        <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Limited customization
                        </h3>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          rigid workflows force operators to adapt to the tool instead of the other way around
                        </p>
                      </div>
                    </div>

                    {/* Right Column: 2 tiles stacked */}
                    <div className="flex flex-col gap-2 sm:gap-3 w-full sm:w-auto sm:flex-1">
                      {/* Tile 5: Missed Repairs */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                        <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Missed Repairs
                        </h3>
                        <p className="font-space font-bold text-2xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          ~10%
                        </p>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          of reported defects never reach the technician due to manual handoffs.
                        </p>
                      </div>

                      {/* Tile 6: Duplicated effort */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                        <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Duplicated effort
                        </h3>
                        <p className="font-space font-bold text-2xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          ~15%
                        </p>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          same vehicle/defect details entered twice across systems.
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>

                  {/* Mobile Tiles - Shown only on mobile */}
                  <div className="flex flex-col gap-2 sm:hidden w-full overflow-hidden">
                    {/* Row 1 */}
                    <div className="flex gap-2 w-full min-w-0">
                      <div className="flex-1 min-w-0 bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col gap-1">
                        <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Lost / damaged records
                        </p>
                        <p className="font-space font-bold text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          15-20%
                        </p>
                        <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          sheets misplaced monthly
                        </p>
                      </div>
                      <div className="flex-1 min-w-0 bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                        <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Fragmented workflow
                        </p>
                        <p className="font-space font-bold text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          ~30%
                        </p>
                        <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          more time switching between safety and maintenance apps.
                        </p>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="flex gap-2 w-full min-w-0">
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Delayed Visibility
                          </p>
                          <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            managers receive inspection data late
                          </p>
                          <p className="font-space font-bold text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            10hrs - 1 day
                          </p>
                        </div>
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Limited customization
                          </p>
                          <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            rigid workflows force operators to adapt to the tool instead of the other way around
                          </p>
                        </div>
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1">
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Limited customization
                          </p>
                          <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            rigid workflows force operators to adapt to the tool instead of the other way around
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 w-[35%] min-w-[120px] max-w-[141px]">
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1 min-h-[221px]">
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Missed Repairs
                          </p>
                          <p className="font-space font-bold text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            ~10%
                          </p>
                          <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            of reported defects never reach the technician due to manual handoffs.
                          </p>
                        </div>
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg p-3 flex flex-col justify-center gap-1 min-h-[202px]">
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Duplicated effort
                          </p>
                          <p className="font-space font-bold text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            ~15%
                          </p>
                          <p className="font-outfit text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            same vehicle/defect details entered twice across systems.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.section>

            {/* Personas Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col gap-6 w-full"
            >
              {/* Section Title */}
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 sm:w-12 sm:h-12 flex-shrink-0">
                  <LazyImage src={imgPersonasIcon} alt="Personas icon" className="w-full h-full object-cover" />
                </div>
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Maintenance Personas
                </h2>
              </div>

              {/* Personas List */}
              <div className="flex flex-col gap-6 sm:gap-16 w-full">
                {/* Persona: Macao G. */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 w-full">
                  <div className="w-16 h-16 sm:w-[240px] sm:h-[240px] flex-shrink-0 rounded-full overflow-hidden">
                    <LazyImage src={imgMacao} alt="Macao G." className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-2 sm:gap-3 flex-1">
                    <div className="flex flex-col gap-1">
                      <p className="font-space font-bold text-lg sm:text-2xl text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Macao G.
                      </p>
                      <p className="font-space text-lg sm:text-base text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                        Maintenance Manager
                      </p>
                    </div>
                    <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                      The Maintenance Manager ensures fleet safety, reliability, and optimal performance through preventive maintenance programs, technician supervision and training, budget management, regulatory compliance, and data-driven decision-making to minimize downtime.
                    </p>
                  </div>
                </div>

                {/* Persona: Gray F. */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 w-full">
                  <div className="w-16 h-16 sm:w-[240px] sm:h-[240px] flex-shrink-0 rounded-full overflow-hidden">
                    <LazyImage src={imgGray} alt="Gray F." className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-2 sm:gap-3 flex-1">
                    <div className="flex flex-col gap-1">
                      <p className="font-space font-bold text-lg sm:text-2xl text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Gray F.
                      </p>
                      <p className="font-space text-lg sm:text-base text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                        Maintenance Technician
                      </p>
                    </div>
                    <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                      The Maintenance Technician inspects, diagnoses, and repairs fleet vehicles, performing preventive maintenance to ensure safety, reliability, and compliance while minimizing downtime.
                    </p>
                  </div>
                </div>

                {/* Persona: Natsu D. */}
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 w-full">
                  <div className="w-16 h-16 sm:w-[240px] sm:h-[240px] flex-shrink-0 rounded-full overflow-hidden">
                    <LazyImage src={imgNatsu} alt="Natsu D." className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-2 sm:gap-3 flex-1">
                    <div className="flex flex-col gap-1">
                      <p className="font-space font-bold text-lg sm:text-2xl text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Natsu D.
                      </p>
                      <p className="font-space text-lg sm:text-base text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                        Maintenance Technician
                      </p>
                    </div>
                    <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                      The Maintenance Technician inspects, diagnoses, and repairs fleet vehicles, performing preventive maintenance to ensure safety, reliability, and compliance while minimizing downtime.
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Arc 1: The Daily Grind at Speedy Wheels Logistics */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-col gap-6 sm:gap-8 w-full"
            >
              {/* Arc Title */}
              <div className="flex flex-col gap-2 sm:gap-4">
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Arc 1 :
                </h2>
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  The Daily Grind at Speedy Wheels Logistics
                </h2>
              </div>

              {/* Comic Story Panels */}
              <div className="flex flex-col gap-3 sm:gap-5 w-full">
                {/* Scene 1: Morning Inspections */}
                <div className="flex flex-col gap-1">
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Scene 1:
                  </p>
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Morning Inspections - The Technician's Burden
                  </p>
                </div>

                {/* Panel B1 */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[698px] w-full overflow-hidden relative">
                  <LazyImage src={imgS1B1} alt="Morning inspections scene" className="w-full h-auto sm:absolute sm:top-0 sm:left-0" style={{ maxWidth: '760px' }} />
                </div>

                {/* Panel B2 */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[781px] w-full overflow-hidden relative">
                  <LazyImage src={imgS1B2} alt="Technician working" className="w-full h-auto sm:absolute" style={{ maxWidth: '760px' }} />
                </div>

                {/* Panel B3 and B4 Row */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full">
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[497px] w-full sm:w-[301px] sm:flex-shrink-0 overflow-hidden relative">
                    <LazyImage src={imgS1B3} alt="Manual logs" className="w-full h-auto sm:absolute" style={{ maxWidth: '301px' }} />
                    <div className="absolute bg-white border-2 border-ui-gray p-3 w-[140px] hidden sm:block" style={{ left: '16px', top: '362px' }}>
                      <p className="font-comic font-bold text-sm text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                        MANUAL LOGS - DETAILED INSPECTIONS WITH CLEAR STUTES
                      </p>
                    </div>
                  </div>
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[497px] w-full sm:w-[439px] sm:flex-shrink-0 overflow-hidden relative">
                    <LazyImage src={imgS1B4} alt="Inspection details" className="w-full h-auto sm:absolute" style={{ maxWidth: '439px' }} />
                  </div>
                </div>

                {/* Scene 2: Office Chaos */}
                <div className="flex flex-col gap-1 mt-2 sm:mt-3">
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Scene 2:
                  </p>
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Office Chaos - The Manager's Struggle
                  </p>
                </div>

                {/* Panel B5 */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[434px] w-full overflow-hidden relative">
                  <LazyImage src={imgS2B1} alt="Manager at office" className="w-full h-auto sm:absolute" style={{ maxWidth: '760px' }} />
                  <div className="absolute bg-white border-2 border-ui-gray p-3 w-[108px] h-[222px] items-center justify-center hidden sm:flex" style={{ left: '27px', top: '194px' }}>
                    <p className="font-comic font-bold text-sm text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                      LATER THAT DAY, MACAO TRIES TO MAKE SENSE OF THE INSPECTION RECORDS
                    </p>
                  </div>
                </div>

                {/* Panel B6 and B7 Row */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full">
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[537px] w-full sm:w-[350px] sm:flex-shrink-0 overflow-hidden relative">
                    <LazyImage src={imgS2B2} alt="Inspection records" className="w-full h-auto sm:absolute" style={{ maxWidth: '350px' }} />
                    <div className="absolute bg-white border-2 border-ui-gray p-3 w-[112px] h-[211px] items-center justify-center hidden sm:flex" style={{ left: '218px', top: '302px' }}>
                      <p className="font-comic font-bold text-sm text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                        DOZENS OF ROWS, MISSING ENTRIES, AND INCONSISTENT LOGS, THE STORY REPEATS.
                      </p>
                    </div>
                  </div>
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[537px] w-full sm:w-[390px] sm:flex-shrink-0 overflow-hidden relative">
                    <LazyImage src={imgS2B3} alt="Manager frustrated" className="w-full h-auto sm:absolute" style={{ maxWidth: '390px' }} />
                  </div>
                </div>

                {/* Panel B8 and B9 Row */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full">
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[459px] w-full sm:w-[430px] sm:flex-shrink-0 overflow-hidden relative">
                    <LazyImage src={imgS2B4} alt="Discussion" className="w-full h-auto sm:absolute" style={{ maxWidth: '430px' }} />
                  </div>
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[459px] w-full sm:flex-1 overflow-hidden relative">
                    <LazyImage src={imgS2B5} alt="Conversation" className="w-full h-auto sm:absolute" style={{ maxWidth: '310px' }} />
                  </div>
                </div>

                {/* Scene 3: Wish for Improvement */}
                <div className="flex flex-col gap-1 mt-2 sm:mt-3">
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Scene 3:
                  </p>
                  <p className="font-space font-bold text-sm sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Wish for Improvement
                  </p>
                </div>

                {/* Panel B9.1 */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[338px] w-full overflow-hidden relative">
                  <LazyImage src={imgS2B61} alt="Wish for improvement" className="w-full h-auto sm:absolute" style={{ maxWidth: '760px' }} />
                </div>
              </div>
            </motion.section>

            {/* Objective and User Journey Hypothesis Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-6 sm:gap-16 w-full"
            >
              {/* Section Header */}
              <div className="flex items-center gap-4 sm:gap-6 w-full">
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <LazyImage src={imgObjectiveIcon} alt="Objective Icon" className="w-full h-full object-contain" />
                </div>
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                  Objective and User Journey Hypothesis
                </h2>
              </div>

              {/* Objective Text */}
              <div className="flex flex-col gap-0">
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-2%' }}>
                  The objective of this project is to enable fleet operators to manage the complete maintenance lifecycle of their vehicles in a single platform. Users should be able to:
                </p>
                <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary list-disc pl-6 mt-2 space-y-1" style={{ letterSpacing: '-2%' }}>
                  <li>
                    Track the <span className="font-['Outfit'] font-bold text-ui-gray">maintenance status</span> of each vehicle.
                  </li>
                  <li>
                    Monitor <span className="font-['Outfit'] font-bold text-ui-gray">upcoming maintenance dates</span> and receive timely alerts.
                  </li>
                  <li>
                    Conduct vehicle inspections to <span className="font-['Outfit'] font-bold text-ui-gray">survey and identify defects</span>.
                  </li>
                  <li>
                    <span className="font-['Outfit'] font-bold text-ui-gray">Log, assign, and resolve defects</span> through structured workflows.
                  </li>
                </ul>
              </div>

              {/* Technician Manager - Current Journey */}
              <div className="flex flex-col gap-4 sm:gap-6 items-center w-full">
                <h3 className="font-space font-bold text-base sm:text-[32px] leading-[1.36em] text-ui-gray text-center" style={{ letterSpacing: '-1%' }}>
                  Technician Manager - User Current Journey / experience
                </h3>
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary text-center" style={{ letterSpacing: '-0.5%' }}>
                  The process takes 1-2 days
                </p>

                <div className="flex flex-col gap-4 sm:gap-7 items-center w-full max-w-[400px]">
                  {/* Step 1 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Wait for Technician to Submit Inspection
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 2 with pain point */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white border border-[#5D6C87] rounded-[99px] shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)] w-full max-w-[253px]" style={{ padding: '12px 24px' }}>
                      <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                        Manually reviews reports
                      </p>
                    </div>
                    <div className="bg-white border border-[#5D6C87] rounded-2xl shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)] w-full max-w-[290.53px] flex flex-col justify-center gap-2 sm:gap-3 sm:transform sm:rotate-[-4deg]" style={{ padding: '12px 24px' }}>
                      <p className="font-['Outfit'] font-bold text-sm sm:text-base text-[#FC4949]" style={{ letterSpacing: '-0.5%' }}>
                        Pain Point
                      </p>
                      <p className="font-outfit text-sm sm:text-base text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                        Repetitions , chances of missing Reports on a bad day.
                      </p>
                    </div>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 3 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[326px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Assigns repair tasks to technicians verbally
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 4 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[326px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Assigns repair tasks to technicians verbally
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 5 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[250px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Follows up with technician
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 6 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[168px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Resolve Defects
                    </p>
                  </div>
                </div>
              </div>

              {/* Technician Personal - Current Journey */}
              <div className="flex flex-col gap-4 sm:gap-6 items-start w-full">
                <h3 className="font-space font-bold text-base sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Technician Personal - User Current Journey / experience
                </h3>

                <div className="flex flex-col gap-4 sm:gap-7 items-center w-full">
                  {/* Step 1 with pain point */}
                  <div className="flex flex-col w-full max-w-[377px] gap-3">
                    <div className="bg-white border border-[#5D6C87] rounded-[99px] shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)] w-full" style={{ padding: '12px 24px' }}>
                      <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                        Conducts physical inspection with a checklist
                      </p>
                    </div>
                    <div className="bg-white border border-[#5D6C87] rounded-2xl shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)] w-full max-w-[325px] flex flex-col justify-center gap-2 sm:gap-3 sm:transform sm:rotate-[-3deg]" style={{ padding: '12px 24px' }}>
                      <p className="font-['Outfit'] font-bold text-sm sm:text-base text-[#FC4949]" style={{ letterSpacing: '-0.5%' }}>
                        Pain Point
                      </p>
                      <p className="font-outfit text-sm sm:text-base text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                        Totally relying on technician's integrity, no image capture exist.
                      </p>
                    </div>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 2 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[217px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Notes defects manually
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 3 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[294px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Submits sheet to manager
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 4 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[334px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Receives Repair tasks later (verbal/written)
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 5 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[250px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Completes repair
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 6 with pain point */}
                  <div className="flex flex-col gap-3 w-full max-w-[360px] items-center">
                    <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[250px]">
                      <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                        Submits Report
                      </p>
                    </div>
                    <div className="bg-white border border-text-quaternary rounded-2xl px-4 sm:px-6 py-2 sm:py-3 w-full max-w-[280px] sm:max-w-[216px] sm:transform sm:rotate-[3deg] sm:relative sm:left-[100px] sm:-top-12">
                      <p className="font-['Outfit'] font-bold text-sm sm:text-base text-[#FC4949] mb-2 sm:mb-3" style={{ letterSpacing: '-0.5%' }}>
                        Pain Point
                      </p>
                      <p className="font-outfit text-sm sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                        Submission is not immediate
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hypothesis Label */}
              <p className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                Hypothesis
              </p>

              {/* Technician Manager - Desired Journey */}
              <div className="flex flex-col gap-4 sm:gap-6 items-start w-full">
                <h3 className="font-space font-bold text-base sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Technician Manager - User Desied Journey / experience
                </h3>

                <div className="flex flex-col gap-4 sm:gap-7 items-center w-full">
                  {/* Step 1 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[204px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Opens mobile app
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 2 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[338px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      follows a guided digital inspection checklist
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 3 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[278px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Reviews defects, assigns tasks
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 4 with pain point */}
                  <div className="flex flex-col gap-3 w-full items-center">
                    <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[278px]">
                      <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                        Tracks repair progress live.
                      </p>
                    </div>
                    <div className="bg-white border border-text-quaternary rounded-2xl p-3 sm:p-4 w-full max-w-[280px] sm:max-w-[314px] sm:transform sm:rotate-[4deg] sm:relative sm:left-[80px] sm:-top-12">
                      <p className="font-['Outfit'] font-bold text-sm sm:text-base text-[#FC4949] mb-2 sm:mb-3" style={{ letterSpacing: '-0.5%' }}>
                        Pain Point
                      </p>
                      <p className="font-outfit text-sm sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                        dev difficulty impliment acc to current code infra.
                      </p>
                    </div>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 5 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[416px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Generates compliance/maintenance reports instantly.
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 6 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[225px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Completes Inspection
                    </p>
                  </div>
                </div>
              </div>

              {/* Technician Personal - Desired Journey */}
              <div className="flex flex-col gap-4 sm:gap-6 items-start w-full">
                <h3 className="font-space font-bold text-base sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Technician Personal - User Desired Journey / experience
                </h3>

                <div className="flex flex-col gap-4 sm:gap-7 items-center w-full">
                  {/* Step 1 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[204px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Opens dashboard
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 2 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[384px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      sees all vehicles with current maintenance status.
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 3 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[392px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Receives real-time inspection submissions from technicians.
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 4 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[204px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Reviews defects
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 5 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[315px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      assigns tasks with due dates in the system.
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 6 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[233px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Tracks repair progress live.
                    </p>
                  </div>
                  <div className="text-[#9A9CAD] text-2xl sm:text-4xl font-bold rotate-90">→</div>

                  {/* Step 7 */}
                  <div className="bg-white border border-text-quaternary rounded-[99px] px-6 sm:px-8 py-3 sm:py-4 w-full max-w-[400px]">
                    <p className="font-outfit text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      Generates compliance/maintenance reports instantly.
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Discovery Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="flex flex-col gap-6 sm:gap-16 w-full"
            >
              {/* Discovery Accordion Header */}
              <div
                className="flex items-center gap-4 sm:gap-6 w-full cursor-pointer"
                onClick={() => setIsDiscoveryOpen(!isDiscoveryOpen)}
              >
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <LazyImage src={imgDiscoveryIcon} alt="Discovery Icon" className="w-full h-full object-contain" />
                </div>
                <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-0.32px' }}>
                  Discovery
                </h2>
                <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                  <LazyImage
                    src={imgDiscoveryCaretDown}
                    alt="Toggle"
                    className="w-full h-full object-contain transition-transform duration-300"
                    style={{ transform: isDiscoveryOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </div>
              </div>

              {/* Discovery Accordion Content */}
              <motion.div
                initial={false}
                animate={{
                  height: isDiscoveryOpen ? 'auto' : 0,
                  opacity: isDiscoveryOpen ? 1 : 0
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="flex flex-col gap-12 sm:gap-24 w-full">
                  {/* Fleet Categories */}
                  <div className="flex flex-row flex-wrap gap-3 sm:gap-[22px] w-full">
                    <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 sm:py-4 flex-1 min-w-[calc(50%-6px)] sm:min-w-0 sm:w-[303px] min-h-[120px] sm:h-[169px] flex flex-col gap-2 sm:gap-3 justify-center">
                      <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Small Fleets
                      </h3>
                      <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        Often rely on pen and paper inspection logs or basic spread sheets.
                      </p>
                    </div>
                    <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 sm:py-4 flex-1 min-w-[calc(50%-6px)] sm:min-w-0 min-h-[120px] sm:h-[169px] flex flex-col gap-2 sm:gap-3 justify-center sm:flex-1">
                      <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Larger Fleets
                      </h3>
                      <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        Use third party fleet management tools. (geotab, samsara etc.)
                      </p>
                    </div>
                    <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 sm:py-4 w-full min-h-[120px] sm:h-[169px] flex flex-col gap-2 sm:gap-3 justify-center">
                      <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Emerging Trend
                      </h3>
                      <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        Predictive maintenance using telematics data (mileage, engine diagnostics, driver behavior) to forecast service needs.
                      </p>
                    </div>
                  </div>

                  {/* Regulatory Research */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Regulatory Reseach
                    </h3>
                    <div className="flex flex-col gap-0">
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-2%' }}>
                        <span className="font-['Outfit'] font-bold text-ui-gray">FMCSA</span> (US context) and similar transport authorities in other regions mandate:
                      </p>
                      <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary list-disc pl-6 mt-2" style={{ letterSpacing: '-2%' }}>
                        <li>Daily vehicle inspections by drivers.</li>
                        <li>Defect reporting and tracking for compliance.</li>
                        <li>Proper logging of maintenance and repair actions.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Affinity Mapping */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <div className="flex flex-col gap-4 sm:gap-6">
                      <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Affinity Mapping Based on User Journey
                      </h3>
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        After mapping the current and desired user journeys for both Technician Managers and Technicians, I conducted an affinity mapping exercise to synthesize insights from user interviews, observations, and workflow pain points.
                      </p>
                    </div>

                    <div className="flex flex-row gap-3 sm:gap-[36px_20px] w-full">
                      {/* Pain Points Column */}
                      <div className="flex flex-col gap-3 sm:gap-6 flex-1">
                        <h4 className="font-space font-bold text-xs sm:text-lg text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Pain Point
                        </h4>
                        <div className="flex flex-col gap-2 sm:gap-4">
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Managers had no real-time view of inspection or repair status.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Defects were logged but not always resolved or tracked to closure.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Technicians received assignments verbally or through scattered messages.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Paper logs and manual entries led to errors and missing data.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Possible Solutions Column */}
                      <div className="flex flex-col gap-3 sm:gap-6 flex-1">
                        <h4 className="font-space font-bold text-xs sm:text-lg text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Possible Solution
                        </h4>
                        <div className="flex flex-col gap-2 sm:gap-4">
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Create a central dashboard with live status updates for every vehicle and technician.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Introduce a defect lifecycle workflow with clear ownership and completion tracking.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Enable in-app task assignments and real-time notifications.
                            </p>
                          </div>
                          <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 sm:py-4 min-h-[80px] sm:h-[135px] flex items-center">
                            <p className="font-outfit text-xs sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                              Design digital inspection forms with mandatory fields and photo uploads.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Needs / Tenants organisation scales */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Customer Needs / Tenants organisation scales
                    </h3>

                    <div className="flex flex-col gap-4 sm:gap-6">
                      {/* Small Size Fleets */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 sm:p-8 py-6 sm:py-12 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Small Size Fleets
                        </h4>
                        <p className="font-space font-bold text-xl sm:text-[44px] text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                          1 - 25 vehicles
                        </p>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Rely on paper logs and spread sheets.
                        </p>
                        <ul className="font-outfit text-xs sm:text-base text-text-quaternary list-disc pl-5 sm:pl-6 space-y-1" style={{ letterSpacing: '-0.5%' }}>
                          <li>Simple, <span className="font-['Outfit'] font-bold text-ui-gray">low-effort</span> inspection process.</li>
                          <li>Clear view of <span className="font-['Outfit'] font-bold text-ui-gray">upcoming maintenance tasks</span>.</li>
                          <li>Basic <span className="font-['Outfit'] font-bold text-ui-gray">defect logging</span> and <span className="font-['Outfit'] font-bold text-ui-gray">closure tracking</span>.</li>
                          <li>Affordable solution — minimal cost overhead.</li>
                        </ul>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Provide a lightweight, mobile-first solution with essential workflows and minimal setup.
                        </p>
                      </div>

                      {/* Medium Size Fleets */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 sm:p-8 py-6 sm:py-12 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Medium Size Fleets
                        </h4>
                        <p className="font-space font-bold text-xl sm:text-[44px] text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                          25 - 100 vehicles
                        </p>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Mix of manual and third-party tools.
                        </p>
                        <ul className="font-outfit text-xs sm:text-base text-text-quaternary list-disc pl-5 sm:pl-6 space-y-1" style={{ letterSpacing: '-0.5%' }}>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Role-based access</span> (manager, technician).</li>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Real-time visibility</span> into ongoing maintenance.</li>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Historical tracking</span> of repairs and inspections.</li>
                          <li>Exportable reports for compliance and audits.</li>
                        </ul>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Enable structured dashboards and data-driven tracking while maintaining simplicity.
                        </p>
                      </div>

                      {/* Large Size Fleets */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 sm:p-8 py-6 sm:py-12 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Large Size Fleets
                        </h4>
                        <p className="font-space font-bold text-xl sm:text-[44px] text-ui-gray leading-[1.34em]" style={{ letterSpacing: '-0.5%' }}>
                          100+ vehicles
                        </p>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Use multiple integrated systems (safety + maintenance + telematics).
                        </p>
                        <ul className="font-outfit text-xs sm:text-base text-text-quaternary list-disc pl-5 sm:pl-6 space-y-1" style={{ letterSpacing: '-0.5%' }}>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Unified system</span> combining safety and maintenance.</li>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Integration</span> with existing <span className="font-['Outfit'] font-bold text-ui-gray">telematics</span> and ERP systems.</li>
                          <li>Detailed analytics and custom reports.</li>
                          <li><span className="font-['Outfit'] font-bold text-ui-gray">Permission-based controls</span> for large teams.</li>
                        </ul>
                        <p className="font-outfit text-xs sm:text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Design a scalable architecture with advanced dashboards, analytics, and integration flexibility.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Strategy-Based Insights */}
                  <div className="flex flex-col gap-4 sm:gap-6 w-full">
                    <h3 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Strategy-Based Insights / What we learned and how we'll approach it
                    </h3>

                    <div className="flex flex-col gap-4 sm:gap-6">
                      {/* Need for a Unified Operational View */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Need for a Unified Operational View
                        </h4>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Fleet managers frequently switch between multiple tools to track safety metrics, inspections, and maintenance, resulting in lost context and missed follow-ups.
                        </p>
                        <p className="font-['Outfit'] font-bold text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Consolidate maintenance and safety workflows into a single, integrated dashboard that gives managers end-to-end visibility — from defect identification to resolution.
                        </p>
                      </div>

                      {/* Role-Specific Context and Permissions */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Role-Specific Context and Permissions
                        </h4>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Technicians, drivers, and managers have distinct responsibilities, yet existing systems expose them to irrelevant information.
                        </p>
                        <p className="font-['Outfit'] font-bold text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Introduce role-based interfaces — simplifying the technician's experience for task execution, while providing managers with summary-level analytics, notifications, and controls.
                        </p>
                      </div>

                      {/* Simplified Inspection Workflows */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Simplified Inspection Workflows
                        </h4>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Technicians often skip or delay inspections due to lengthy, redundant forms and poor mobile usability.
                        </p>
                        <p className="font-['Outfit'] font-bold text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Create a mobile-first, quick-scan inspection flow with structured checklists, photo uploads, and voice-enabled inputs to improve completion rates.
                        </p>
                      </div>

                      {/* Defect Lifecycle Transparency */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Defect Lifecycle Transparency
                        </h4>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Defects logged during inspections often go untracked or unresolved, leading to repeated vehicle issues.
                        </p>
                        <p className="font-['Outfit'] font-bold text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Design a defect lifecycle tracker that captures each defect's journey — reported, assigned, repaired, verified, and closed — ensuring accountability across roles.
                        </p>
                      </div>

                      {/* Predictive Maintenance Opportunities */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-4 sm:p-8 flex flex-col gap-2 sm:gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Predictive Maintenance Opportunities
                        </h4>
                        <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Fleet operators want to move from reactive to preventive maintenance but lack the data and visibility to plan effectively.
                        </p>
                        <p className="font-['Outfit'] font-bold text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Implement historical trend analysis and maintenance scheduling that leverage inspection and defect data to predict upcoming repairs.
                        </p>
                      </div>

                      {/* Scalability Across Fleet Sizes (with "Good to have" callout) */}
                      <div className="relative pb-[59px]">
                        <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                          <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            Scalability Across Fleet Sizes
                          </h4>
                          <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                            Smaller fleets prefer simplicity and cost-effectiveness; larger fleets require analytics, integrations, and audit compliance.
                          </p>
                          <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                            Build a modular platform — lightweight for smaller fleets and extensible for enterprise tenants with advanced data and API integrations.
                          </p>
                        </div>
                        {/* Good to have callout */}
                        <div className="absolute bottom-0 right-0 transform rotate-[-6deg]">
                          <div className="bg-white border border-text-quaternary rounded-2xl px-8 py-4 w-[264px]">
                            <p className="font-['Outfit'] font-bold text-base text-[#AD7F00]" style={{ letterSpacing: '-0.5%' }}>
                              Good to have
                            </p>
                            <p className="font-outfit text-base text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                              but will decrease the velocity to MVP.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Data-Driven Accountability */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Data-Driven Accountability
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Maintenance performance metrics (missed inspections, delayed repairs) are not easily measurable in current setups.
                        </p>
                        <p className="font-['Outfit'] font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                          Integrate performance dashboards and KPIs for both managers and technicians, enabling data-driven review and accountability.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Brainstorming → How might we solve it? */}
                  <div className="flex flex-col gap-8 w-full">
                    <h3 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Brainstorming → How might we solve it?
                    </h3>

                    <div className="flex flex-col gap-6">
                      {/* HMW 1 */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          Help managers get a unified view of fleet safety and maintenance?
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Merge both modules into a shared dashboard with toggles between "Safety" and "Maintenance." Include quick-glance alerts for overdue inspections or unresolved defects.
                        </p>
                      </div>

                      {/* HMW 2 */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          make vehicle inspections faster and error-free for technicians?
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Introduce mobile-first checklists, auto-saved progress, photo & voice inputs, and quick "pass/fail" toggles.
                        </p>
                      </div>

                      {/* HMW 3 */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          help managers prioritize repairs across the fleet?
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Add filters by severity, downtime cost, or vehicle utilization. Show upcoming maintenance schedules.Email Notifiactions.
                        </p>
                      </div>

                      {/* HMW 4 */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          ensure defects are tracked through to resolution?
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Create a defect workflow — "Reported → Assigned → Fixed → Verified → Closed" — with status indicators and manager notifications.
                        </p>
                      </div>

                      {/* HMW 5 */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                          encourage accountability and transparency?
                        </h4>
                        <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                          Add technician dashboards, inspection history logs, and timestamps for every workflow stage.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* How might we (HMW) Summary */}
                  <div className="flex flex-col gap-4 w-full">
                    <h3 className="font-space font-bold text-xl sm:text-[32px] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      How might we (HMW) ..
                    </h3>
                    <ol className="font-outfit text-base text-ui-gray list-decimal pl-6 space-y-0" style={{ letterSpacing: '-2%' }}>
                      <li className="leading-[1.34em]">
                        Unified Fleet Health Dashboard – merges maintenance and safety data.
                      </li>
                      <li className="leading-[1.34em]">
                        Mobile Inspection & Defect Workflow – simplifies technician tasks and ensures end-to-end defect resolution.
                      </li>
                      <li className="leading-[1.34em]">
                        Data-Driven Maintenance Analytics – enables predictive insights and performance tracking.
                      </li>
                    </ol>
                  </div>

                  {/* Hypothesis Generation */}
                  <div className="flex flex-col gap-6 w-full">
                    <h3 className="font-space font-bold text-lg sm:text-[30px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                      Hypothesis Generation → What assumptions are we testing?
                    </h3>

                    <div className="flex flex-col gap-6">
                      {/* Hypothesis 1: Unified Dashboard Efficiency */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-base sm:text-[32px] leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                          Unified Dashboard Efficiency
                        </h4>
                        <div className="flex flex-col gap-0">
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Assumption:
                            <br />
                            If we consolidate fleet safety and maintenance modules into a single dashboard, managers will spend less time switching between tools and have better oversight.
                          </p>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mt-2 mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Expected outcome:
                          </p>
                          <ul className="font-['Outfit'] font-normal text-sm sm:text-base text-text-quaternary list-disc pl-6 mt-2 space-y-0" style={{ letterSpacing: '-0.28px' }}>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">30% reduction</span> in time spent navigating between applications.
                            </li>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">Improved accuracy in identifying vehicles requiring immediate attention.</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* Hypothesis 2: Mobile-First Inspection Adoption */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                          Mobile-First Inspection Adoption
                        </h4>
                        <div className="flex flex-col gap-0">
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Assumption:
                            <br />
                            If technicians can perform inspections via a simplified mobile workflow with photo and voice input, inspection completion rates will increase.
                          </p>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mt-2 mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Expected outcome:
                          </p>
                          <ul className="font-['Outfit'] font-normal text-sm sm:text-base text-text-quaternary list-disc pl-6 mt-2 space-y-0" style={{ letterSpacing: '-0.28px' }}>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">40% faster inspection completion.</span>
                            </li>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">25% increase in daily inspection compliance rate.</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* Hypothesis 3: Role-Based Dashboards Reduce Cognitive Load */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                          Role-Based Dashboards Reduce Cognitive Load
                        </h4>
                        <div className="flex flex-col gap-0">
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Assumption:
                            <br />
                            If managers and technicians have context-specific dashboards, overall task completion efficiency and user satisfaction will improve.
                          </p>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mt-2 mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Expected outcome:
                          </p>
                          <ul className="font-['Outfit'] font-normal text-sm sm:text-base text-text-quaternary list-disc pl-6 mt-2 space-y-0" style={{ letterSpacing: '-0.28px' }}>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">20% faster task completion.</span>
                            </li>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">Higher SUS (System Usability Scale) score in usability testing (&gt;80).</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* Hypothesis 4: Closed-Loop Defect Management */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                          Closed-Loop Defect Management
                        </h4>
                        <div className="flex flex-col gap-0">
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Assumption:
                            <br />
                            If every defect follows a structured status flow (Reported → Assigned → Repaired → Verified → Closed), defect resolution time will decrease significantly.
                          </p>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mt-2 mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Expected outcome:
                          </p>
                          <ul className="font-['Outfit'] font-normal text-sm sm:text-base text-text-quaternary list-disc pl-6 mt-2 space-y-0" style={{ letterSpacing: '-0.28px' }}>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">35% reduction in unresolved or recurring defects.</span>
                            </li>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">Higher accountability among technicians.</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* Hypothesis 5: Predictive Maintenance Planning */}
                      <div className="bg-[#EBF0F5] border border-ui-gray rounded-lg sm:rounded-2xl p-3 sm:p-8 flex flex-col gap-3">
                        <h4 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                          Predictive Maintenance Planning
                        </h4>
                        <div className="flex flex-col gap-0">
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Assumption:
                            <br />
                            If the system uses historical inspection and defect data to recommend upcoming maintenance, downtime will reduce and planning efficiency will improve.
                          </p>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary mt-2 mb-0" style={{ letterSpacing: '-0.28px' }}>
                            Expected outcome:
                          </p>
                          <ul className="font-['Outfit'] font-normal text-sm sm:text-base text-text-quaternary list-disc pl-6 mt-2 space-y-0" style={{ letterSpacing: '-0.28px' }}>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">15% reduction in unplanned downtime.</span>
                            </li>
                            <li className="leading-[1.34em]">
                              <span className="font-['Outfit'] font-bold text-ui-gray">Higher perceived system value by fleet managers.</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.section>

            {/* Arc 2: Macao brings in upgraded way */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-8 w-full"
            >
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                Arc 2: Macao brings in upgraded way of daily report submission to ensure smooth work flow
              </h2>

              {/* Scene 1: Macao explaining the upgrade to the technicians */}
              <div className="flex flex-col gap-1">
                <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                  Scene 1
                </p>
                <p className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Macao explaining the upgrade to the technicians
                </p>
              </div>

              {/* Scene 1 Comic Panels */}
              <div className="flex flex-col gap-3 sm:gap-5 w-full">
                {/* Panel B10 - Large top panel */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[707px] w-full overflow-hidden relative">
                  <LazyImage src={imgS3B1} alt="A week later - the team rolls out the new digital maintenance system" className="w-full h-auto sm:h-full sm:object-cover" />
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white border-2 border-ui-gray px-3 py-3 max-w-[322px] w-[90%]">
                    <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                      A WEEK LATER - THE TEAM ROLLS OUT THE NEW DIGITAL MAINTENANCE SYSTEM
                    </p>
                  </div>
                </div>

                {/* Two medium panels side by side on desktop, stack on mobile */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full">
                  {/* Panel B13 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[512px] w-full sm:w-[361px] overflow-hidden">
                    <LazyImage src={imgS3B4} alt="Technician with device" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>

                  {/* Panel B12 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[512px] w-full sm:w-[379px] overflow-hidden relative">
                    <LazyImage src={imgImage6} alt="Device with defect visibility" className="w-full h-auto sm:h-full sm:object-cover" />
                    <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-white border-2 border-ui-gray px-3 py-3 max-w-[324px] w-[90%]">
                      <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                        EVERY TECHNICIAN NOW HAS REAL-TIME DEFECT VISIBILITY ON THEIR DEVICE.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Panel B11 - Wide panel */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[450px] w-full overflow-hidden relative">
                  <LazyImage src={imgS3B2} alt="Digital maintenance system in action" className="w-full h-auto sm:h-full sm:object-cover" />
                  <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-ui-gray px-3 py-3 max-w-[297px] w-[90%] flex items-center justify-center">
                    <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.5%' }}>
                      THE NEW DIGITAL MAINTENANCE SYSTEM PROMPTS OPERATION, PUTTING VITAL INFORMATION AT THEIR FIGERTIPS.
                    </p>
                  </div>
                </div>
              </div>

              {/* Scene 2: Natsu and Gray in work with the upgrade */}
              <div className="flex flex-col gap-1 mt-3">
                <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                  Scene 2
                </p>
                <p className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Natsu and Gray in work with the upgrade and Macao receiving the update in real time.
                </p>
              </div>

              {/* Scene 2 Comic Panels */}
              <div className="flex flex-col gap-4 sm:gap-6 items-start sm:items-end w-full">
                {/* Panel B14 - Top wide panel */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[504px] w-full overflow-hidden relative">
                  <LazyImage src={imgS3B5} alt="Digital inspection in progress" className="w-full h-auto sm:h-full sm:object-cover" />
                  <div className="absolute bottom-3 sm:bottom-[12px] left-1/2 transform -translate-x-1/2 bg-white border-2 border-ui-gray px-3 py-3 max-w-[260px] sm:w-[358px]">
                    <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                      DIGITAL INSPECTION IN PROGRESS.
                    </p>
                  </div>
                </div>

                {/* Two panels - B15 (narrow) and B16 (wider) - stack on mobile */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 w-full">
                  {/* Panel B15 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[484px] w-full sm:w-[275px] overflow-hidden relative">
                    <LazyImage src={imgS3B6} alt="Instant submission" className="w-full h-auto sm:h-full sm:object-cover" />
                    <div className="absolute bottom-3 left-1/2 sm:left-[29px] transform -translate-x-1/2 sm:translate-x-0 bg-white border-2 border-ui-gray px-3 py-3 max-w-[260px] sm:w-[217px]">
                      <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                        INSTANT SUBMISSION - NO PAPER, NO DELAYS.
                      </p>
                    </div>
                  </div>

                  {/* Panel B16 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[484px] w-full sm:w-[465px] overflow-hidden">
                    <LazyImage src={imgS4B1} alt="Manager receiving updates" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>
                </div>

                {/* Two square-ish panels - B17 and B18 - stack on mobile */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 w-full">
                  {/* Panel B17 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray w-full sm:w-[366px] h-auto sm:h-[366px] overflow-hidden">
                    <LazyImage src={imgS4B2} alt="Real-time updates" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>

                  {/* Panel B18 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[366px] w-full sm:w-[372px] overflow-hidden relative">
                    <LazyImage src={imgS4B3} alt="Manager monitoring dashboard" className="w-full h-auto sm:h-full sm:object-cover" />
                    <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 bg-white border-2 border-ui-gray px-3 py-3 w-[90%] sm:w-[335px]">
                      <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                        MACAO VIEWS THEM IN HIS DASHBOARD
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scene 3: Gray spotted a repetition */}
              <div className="flex flex-col gap-1 mt-3">
                <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                  Scene 3
                </p>
                <p className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  Gray spotted a repetition of a repair task, he instantly reached out to Macao, decreasing trouble shooting time by 90%.
                </p>
              </div>

              {/* Scene 3 Comic Panels */}
              <div className="flex flex-col gap-4 sm:gap-5 w-full">
                {/* Row 1: B19 + B21 */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 w-full">
                  {/* Panel B19 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[566px] w-full sm:w-[430px] overflow-hidden">
                    <LazyImage src={imgT1B1} alt="Gray spotting pattern" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>

                  {/* Panel B21 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[566px] w-full sm:w-[310px] overflow-hidden">
                    <LazyImage src={imgT1B5} alt="Reaching out to Macao" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>
                </div>

                {/* Row 2: B22 - Wide panel */}
                <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[576px] w-full overflow-hidden">
                  <LazyImage src={imgT1S2} alt="Communication and resolution" className="w-full h-auto sm:h-full sm:object-cover" />
                </div>

                {/* Row 3: B20 + B26 */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 w-full">
                  {/* Panel B20 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[360px] w-full sm:w-[270px] overflow-hidden">
                    <LazyImage src={imgT1B4} alt="Quick resolution" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>

                  {/* Panel B26 */}
                  <div className="border-[3px] sm:border-[5px] border-ui-gray h-auto sm:h-[360px] w-full sm:w-[470px] overflow-hidden">
                    <LazyImage src={imgT3B1} alt="Time saved" className="w-full h-auto sm:h-full sm:object-cover" />
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Devices Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-11 w-full"
            >
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Considering the Devices the Technician and the Manger persona will be using
              </h2>

              <div className="flex flex-col gap-8 sm:gap-[70px] items-center justify-center w-full">
                {/* Desktop / PC */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-16 items-start sm:items-center justify-center w-full">
                  <div className="w-16 h-[67px] sm:h-[175px] sm:w-[168px] flex-shrink-0">
                    <LazyImage src={imgDeviceDesktop} alt="Desktop PC" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                      Desktop / PC
                    </p>
                    <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                      Mostly will be used by Macao as he will be monitoring the Dashboard.
                    </p>
                  </div>
                </div>

                {/* Tablet */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-16 items-start sm:items-center justify-center w-full">
                  <div className="w-12 h-[54px] sm:w-[168px] sm:h-auto flex items-center justify-center flex-shrink-0">
                    <div className="w-12 h-[54px] sm:h-[145px] sm:w-[130px]">
                      <LazyImage src={imgDeviceTablet} alt="Tablet" className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                      Tablet
                    </p>
                    <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                      Will be used by Natsu and Gray for portability purpose as they have to be on the maintenance floor, requires them to be around the vehicle
                    </p>
                  </div>
                </div>

                {/* Mobile */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-16 items-start sm:items-center justify-center w-full">
                  <div className="w-12 h-[70px] sm:w-[168px] sm:h-auto flex items-center justify-center flex-shrink-0">
                    <div className="w-12 h-[70px] sm:h-[115px] sm:w-[79px]">
                      <LazyImage src={imgDeviceMobile} alt="Mobile" className="w-full h-full object-contain rounded-[17px]" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                      Mobile
                    </p>
                    <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
                      Similar to the tablet, will also be used by the technicians for it's connivence and based on the device assigned to each.
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Screens Section - Assigning Technician */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-8 w-full"
            >
              {/* After NUX 2.0 Badge */}
              <div className="bg-[#FAFFD8] border border-ui-gray rounded-full px-6 py-2 inline-flex items-center justify-center w-fit">
                <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  After NUX 2.0
                </p>
              </div>

              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  <li>Assigning Technician to a PMI row.</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintanance Manager Hovers on a row to Select a Vehicle Inspection. Opens a Drawer from the Left Side to
                  </p>
                </div>
              </div>

              {/* Desktop View */}
              <div className="flex flex-col gap-3 w-full">
                <div className="bg-white border border-transparent rounded-[4px] h-auto w-full sm:w-[760px] overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                  <div className="overflow-hidden relative size-full">
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                      className="w-full h-full object-cover"
                    >
                      <source src={videoAssigningTechnicianDesktop} type="video/quicktime" />
                      <source src={videoAssigningTechnicianDesktop} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
                <p className="font-space font-bold text-lg leading-[1.36em] text-[#90A2C3]" style={{ letterSpacing: '-1%' }}>
                  Desktop View
                </p>
              </div>

              {/* Tablet and Mobile Views */}
              <div className="flex flex-col sm:flex-row gap-6 sm:gap-[84px] items-center sm:items-start justify-center w-full">
                {/* Tablet View */}
                <div className="flex flex-col gap-3 w-full sm:w-auto">
                  <div className="bg-white border border-transparent rounded-[4px] h-auto w-full sm:w-[322px] overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                    <div className="overflow-hidden relative size-full">
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      >
                        <source src={videoAssigningTechnicianTablet} type="video/quicktime" />
                        <source src={videoAssigningTechnicianTablet} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#90A2C3]" style={{ letterSpacing: '-1%' }}>
                    Tablet Responsive
                  </p>
                </div>

                {/* Mobile View */}
                <div className="flex flex-col gap-3 w-full sm:w-auto">
                  <div className="bg-white border border-transparent rounded-[4px] h-auto w-full max-w-[181px] mx-auto sm:mx-0 overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                    <div className="overflow-hidden relative size-full">
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      >
                        <source src={videoAssigningTechnicianMobile} type="video/quicktime" />
                        <source src={videoAssigningTechnicianMobile} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#90A2C3]" style={{ letterSpacing: '-1%' }}>
                    Mobile Responsive
                  </p>
                </div>
              </div>
            </motion.section>

            {/* Screen 2 - Assigning Technician from Dashboard and Removing */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-[22px] w-full"
            >
              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }} start={2}>
                  <li>Assigning Technician from Dashboard and Removing</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Hovers on a the Technician name to get the action for edit the assigned technician.
                  </p>
                </div>
              </div>

              {/* Screen Video */}
              <div className="bg-white border border-transparent rounded-[4px] h-auto w-full overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                <div className="overflow-hidden relative size-full">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                  >
                    <source src={videoAssigningTechnicianDashboard} type="video/quicktime" />
                    <source src={videoAssigningTechnicianDashboard} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </motion.section>

            {/* Screen 3 - Technician Inspecting and marking the Defects */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-10 items-center w-full"
            >
              {/* Before NUX 2.0 Badge */}
              <div className="flex flex-col gap-[10px] w-full">
                <div className="bg-[#FAFFD8] border border-ui-gray rounded-full px-6 py-2 inline-flex items-center justify-center w-fit">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Before NUX 2.0
                  </p>
                </div>
              </div>

              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Technician Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }} start={3}>
                  <li>Technician Inspecting and marking the Defects.</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Technician fills up the form marking the defects and submits it to the Manager.
                    <br />
                    The manager can view the details of the inspection in his dashboard
                  </p>
                </div>
              </div>

              {/* Screen Video - Mobile View */}
              <div className="bg-white border border-transparent rounded-[4px] h-auto w-full max-w-[210px] overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                <div className="overflow-hidden relative size-full">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                  >
                    <source src={videoTechnicianInspecting} type="video/quicktime" />
                    <source src={videoTechnicianInspecting} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </motion.section>

            {/* Screen 4 - Inspection Completed in the Desktop Dashboard */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-10 items-center w-full"
            >
              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }} start={4}>
                  <li>Inspection Completed in the Desktop Dashboard by manager when in need.</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    This is 1 in 10 times flow and a corner case, in general managers do not need to complete inspections.
                  </p>
                </div>
              </div>

              {/* Screen Video - Desktop View */}
              <div className="bg-white border border-transparent rounded-[4px] h-auto w-full sm:w-[760px] overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                <div className="overflow-hidden relative size-full">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                  >
                    <source src={videoInspectionByManager} type="video/quicktime" />
                    <source src={videoInspectionByManager} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </motion.section>

            {/* Screen 5 - Approving the Inspection */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-10 items-center w-full"
            >
              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Title without numbering */}
                <p className="font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                  5. Approving the Inspection
                </p>

                {/* Flow Details */}
                <div className="flex flex-col gap-2">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Manager needs to acknowledge and approve the inspection.
                  </p>
                </div>
              </div>

              {/* Screen Video - Desktop View */}
              <div className="bg-white border border-transparent rounded-[4px] h-auto w-full sm:w-[760px] overflow-clip relative shadow-[0_0_0_4px_#B6BBC5]">
                <div className="overflow-hidden relative size-full">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                  >
                    <source src={videoApprovingInspection} type="video/quicktime" />
                    <source src={videoApprovingInspection} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </motion.section>

            {/* Screen 6 - Scheduling Maintenance */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-3 w-full"
            >
              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }} start={6}>
                  <li>Scheduling Maintenance</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2 py-6">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Manager needs to acknowledge and approve the inspection.
                  </p>
                </div>

                {/* Comic Panel */}
                <div className="border-[5px] border-ui-gray h-[403px] w-full overflow-hidden">
                  <LazyImage src={imgSchedulingMaintenance} alt="Scheduling maintenance" className="w-full h-full object-cover" />
                </div>
              </div>
            </motion.section>

            {/* Screen 7 - Defect Status Updates */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-3 w-full py-6"
            >
              {/* Title Section */}
              <div className="flex flex-col gap-3 w-full">
                {/* Breadcrumb */}
                <div className="flex gap-2 items-center">
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Inspection Tab
                  </p>
                  <div className="w-1 h-1">
                    <LazyImage src={imgEllipse} alt="" className="w-full h-full" />
                  </div>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Maintenance Manager Persona
                  </p>
                </div>

                {/* Numbered Title */}
                <ol className="list-decimal pl-12 font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }} start={7}>
                  <li>Defect Status Updates</li>
                </ol>

                {/* Flow Details */}
                <div className="flex flex-col gap-2 py-6">
                  <p className="font-space font-bold text-lg leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-1%' }}>
                    Flow Details
                  </p>
                  <p className="font-outfit text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    After Inspection, identified defects are assigned to technicians for repair which they complete and update in the upgraded system.
                  </p>
                </div>

                {/* Two Comic Panels */}
                <div className="flex gap-5 items-center">
                  <div className="border-[5px] border-ui-gray h-[564px] w-[341px] overflow-hidden">
                    <LazyImage src={imgDefectStatus1} alt="Technician repairing defect" className="w-full h-full object-cover" />
                  </div>
                  <div className="border-[5px] border-ui-gray h-[564px] w-[399px] overflow-hidden">
                    <LazyImage src={imgDefectStatus2} alt="Updating defect status" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Closing Message */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col gap-3 h-[213px] items-start justify-center px-6 py-6 w-full"
            >
              <div className="font-space font-bold text-xl sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                <p className="mb-0">...</p>
                <p className="mb-0">&nbsp;</p>
                <p className="mb-0">10+ more flows and use cases</p>
              </div>
            </motion.section>
          </div>
        </div>
      </motion.main>
    </>
  );
};

export default VehicleHealth;
