import { motion } from 'framer-motion';
import { useState } from 'react';
import LazyImage from '../../components/LazyImage';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import contextImage from '../../assets/images/projects/hours-of-service/context-image.webp';
import frameHeader from '../../assets/images/projects/hours-of-service/frame-header.webp';
import videoLogRecords from '../../assets/videos/log-records.mov';
import videoCertificationOfLogs from '../../assets/videos/hours-of-service-3.mov';
import videoInspectorMode from '../../assets/videos/hours-of-service-1.mov';
import videoAutoChangeEld from '../../assets/videos/auto-change-eld.mov';

// Cover photo images
import imgDasboard1 from '../../assets/images/projects/hours-of-service/dashboard-on-duty.webp';
import imgDasboard from '../../assets/images/projects/hours-of-service/dashboard-driving.webp';
import imgDasboard71001 from '../../assets/images/projects/hours-of-service/dashboard-logs.webp';

// GreenZone Score screen
import imgGreenZoneScore from '../../assets/images/projects/hours-of-service/green-zone-score.webp';

import businessCaseIcon from '../../assets/images/projects/hours-of-service/business-case-icon.webp';
import thirdPartyApp1 from '../../assets/images/projects/hours-of-service/third-party-app-1.webp';
import thirdPartyApp2 from '../../assets/images/projects/hours-of-service/third-party-app-2.webp';
import legacyIcon from '../../assets/images/projects/hours-of-service/legacy-icon.webp';
import homescreen1 from '../../assets/images/projects/hours-of-service/homescreen-1.webp';
import dashboard7101 from '../../assets/images/projects/hours-of-service/dashboard-7101.webp';
import thirdGen1 from '../../assets/images/projects/hours-of-service/3rd-gen-1.webp';
import driverBehaviorIcon from '../../assets/images/projects/hours-of-service/driver-behavior-icon.webp';
import driverBehaviorWorkflow from '../../assets/images/projects/hours-of-service/driver-behavior-workflow.webp';
import vehicleSelectionItems from '../../assets/images/projects/hours-of-service/vehicle-selection-items.webp';
import vehicleInspectionPhone from '../../assets/images/projects/hours-of-service/vehicle-inspection-phone.webp';
import vehicleInspectionItems from '../../assets/images/projects/hours-of-service/vehicle-inspection-items.webp';
import problemStatementIcon from '../../assets/images/projects/hours-of-service/problem-statement-icon.webp';
import problemStatementMain from '../../assets/images/projects/hours-of-service/problem-statement-main.webp';
import geotab1 from '../../assets/images/projects/hours-of-service/geotab-1.webp';
import geotab2 from '../../assets/images/projects/hours-of-service/geotab-2.webp';
import samsara1 from '../../assets/images/projects/hours-of-service/samsara-1.webp';
import samsara2 from '../../assets/images/projects/hours-of-service/samsara-2.webp';
import samsara3 from '../../assets/images/projects/hours-of-service/samsara-3.webp';
import lytx1 from '../../assets/images/projects/hours-of-service/lytx-1.webp';
import discoveryIcon from '../../assets/images/projects/hours-of-service/discovery-icon.webp';
import devicesIcon from '../../assets/images/projects/hours-of-service/devices-icon.webp';
import inCabMonitor from '../../assets/images/projects/hours-of-service/in-cab-monitor.webp';
import tablet from '../../assets/images/projects/hours-of-service/tablet.webp';
import mobilePhone from '../../assets/images/projects/hours-of-service/mobile-phone.webp';
import cabinEstablishmentIcon from '../../assets/images/projects/hours-of-service/cabin-establishment-icon.webp';
import cabinEstablishment1 from '../../assets/images/projects/hours-of-service/cabin-establishment-1.webp';
import cabinEstablishment2 from '../../assets/images/projects/hours-of-service/cabin-establishment-2.webp';
import driverPersonasIcon from '../../assets/images/projects/hours-of-service/driver-personas-icon.webp';
import personaGajeel from '../../assets/images/projects/hours-of-service/persona-gajeel.webp';
import personaLaxus from '../../assets/images/projects/hours-of-service/persona-laxus.webp';
import workflowsIcon from '../../assets/images/projects/hours-of-service/workflows-icon.webp';
import ProjectNav from '../../components/ProjectNav';

// Arc images
import imgF11 from '../../assets/images/projects/hours-of-service/f11-scene1.webp';
import imgF2 from '../../assets/images/projects/hours-of-service/f2.webp';
import imgF32 from '../../assets/images/projects/hours-of-service/f3-2.webp';
import imgF31 from '../../assets/images/projects/hours-of-service/f31-logs.webp';
import imgF6 from '../../assets/images/projects/hours-of-service/f6.webp';
import imgF10 from '../../assets/images/projects/hours-of-service/f10.webp';
import imgDasboard7103 from '../../assets/images/projects/hours-of-service/dasboard-7103.webp';
import imgF52 from '../../assets/images/projects/hours-of-service/f5-2.webp';
import imgImage44 from '../../assets/images/projects/hours-of-service/image-44.webp';
import imgF7 from '../../assets/images/projects/hours-of-service/f7.webp';
import imgDasboard7104 from '../../assets/images/projects/hours-of-service/dasboard-7104.webp';
import imgF9 from '../../assets/images/projects/hours-of-service/f9.webp';
import imgF12 from '../../assets/images/projects/hours-of-service/f12.webp';
import imgF15 from '../../assets/images/projects/hours-of-service/f15.webp';
import imgDasboard7105 from '../../assets/images/projects/hours-of-service/dasboard-7105.webp';
import imgEdits1 from '../../assets/images/projects/hours-of-service/edits-1.webp';
// Arc 4 images
import imgArc4Scene1B1 from '../../assets/images/projects/hours-of-service/arc4-scene1-b1.webp';
import imgF13 from '../../assets/images/projects/hours-of-service/f13-police.webp';
import imgF14 from '../../assets/images/projects/hours-of-service/f14-log-request.webp';
import imgDataTransfer1 from '../../assets/images/projects/hours-of-service/datatransfer-1.webp';
import imgEld11 from '../../assets/images/projects/hours-of-service/eld-1-1.webp';

// Use the already imported vehicleInspectionPhone instead of the old Figma link
const imgVehicleInspection = vehicleInspectionPhone;

const HoursOfService = () => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isLegacyAccordionOpen, setIsLegacyAccordionOpen] = useState(false);
  const [isDriverBehaviorAccordionOpen, setIsDriverBehaviorAccordionOpen] = useState(false);
  const [isProblemStatementAccordionOpen, setIsProblemStatementAccordionOpen] = useState(false);
  const [isDiscoveryAccordionOpen, setIsDiscoveryAccordionOpen] = useState(false);

  // Track analytics for this project
  useProjectAnalytics('Hours of Service');

  return (
    <>
      <ProjectNav />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-white pt-32 pb-16 px-8"
      >
      <div className="max-w-[1135px] mx-auto">
        {/* Main Block */}
        <div className="max-w-[760px] mx-auto flex flex-col gap-8 sm:gap-[72px]">
          {/* Main Title */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center gap-4 sm:gap-4 w-full"
          >
            {/* Frame Header Image */}
            <div className="w-full max-w-[500px]">
              <LazyImage src={frameHeader} alt="Hours of Service" className="w-full h-auto object-contain" />
            </div>

            <h1 className="font-roboto text-xl sm:text-5xl leading-[1.32em] text-ui-gray text-center w-full" style={{ letterSpacing: '-5%' }}>
              <span className="sm:hidden">ELD Hours-of-Service  flows for<br />drivers + manager web portal ,<br />improve compliance and visibility.</span>
              <span className="hidden sm:inline">ELD Hours-of-Service  flows for drivers + manager web portal , improve compliance and visibility.</span>
            </h1>
          </motion.section>

          {/* Cover Photo */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="w-full"
          >
            <div className="relative w-full">
              {/* Main Container */}
              <div className="relative border-4 sm:border-8 border-[rgba(0,0,0,0.04)] rounded-xl h-[180px] sm:h-[350px] w-full overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(161, 155, 127, 0.25) 0%, rgba(161, 155, 127, 0.25) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)' }}>
                {/* Dashboard Container - positioned at bottom */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[231px] sm:w-[532px] h-[130px] sm:h-[300px]">
                  {/* Dashboard Left - On Duty */}
                  <div className="absolute left-[calc(50%-78px)] sm:left-[calc(50%-180px)] top-0 -translate-x-1/2 w-[75px] sm:w-[172px] h-[152px] sm:h-[350px]">
                    <LazyImage src={imgDasboard1} alt="On Duty dashboard" className="w-full h-full object-cover" />
                  </div>

                  {/* Dashboard Center - Driving */}
                  <div className="absolute left-[calc(50%-0.5px)] sm:left-[calc(50%-1px)] top-0 -translate-x-1/2 w-[75px] sm:w-[172px] h-[152px] sm:h-[350px]">
                    <LazyImage src={imgDasboard} alt="Driving dashboard" className="w-full h-full object-cover" />
                  </div>

                  {/* Dashboard Right - Logs */}
                  <div className="absolute left-[calc(50%+77px)] sm:left-[calc(50%+178px)] top-0 -translate-x-1/2 w-[75px] sm:w-[172px] h-[152px] sm:h-[350px]">
                    <LazyImage src={imgDasboard71001} alt="Logs dashboard" className="w-full h-full object-cover" />
                  </div>
                </div>

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

          {/* Context Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col gap-6 sm:gap-8 w-full"
          >
            {/* Context Header */}
            <div className="flex flex-col gap-3">
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                Context
              </h2>
              <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                I designed and launched an in-house Hours-of-Service (HOS) feature in the Driveri app, replacing a $6/device third-party solution. The project balanced FMCSA compliance, driver usability, and cost savings, while also giving fleet managers better visibility and control through a dedicated web portal.
              </p>
            </div>

            {/* Summary Card 1 */}
            <div className="bg-[#EBF0F5] border border-[#E2E9F6] rounded-lg p-3 sm:p-6 w-full">
              <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                In-house ELD Hours-of-Service & Duty Status flows for drivers + manager web portal to meet FMCSA rules, <span className="text-ui-gray">reduce 3rd-party spend, and improve compliance and visibility.</span>
              </p>
            </div>

            {/* Context Image */}
            <div className="w-full h-auto sm:h-[507px] rounded-xl overflow-hidden">
              <LazyImage
                src={contextImage}
                alt="Hours of Service Context"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Summary Card 2 */}
            <div className="bg-[#EBF0F5] border border-[#E2E9F6] rounded-lg p-3 sm:p-6 w-full">
              <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                <span className="text-text-quaternary">"Replace external ELD vendor to </span>save $6/year, reduce log edit friction for drivers, and reduce HOS violations by ~20–35% per year (conservative, fleet-average estimate)<span className="text-text-quaternary"> through clearer flows, enforcement and manager visibility."</span>
              </p>
            </div>
          </motion.section>

          {/* Quantify Business Case Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col gap-6 sm:gap-12 w-full"
          >
            {/* Accordion Header */}
            <div
              className="flex items-center gap-3 sm:gap-8 w-full cursor-pointer"
              onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            >
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                <LazyImage src={businessCaseIcon} alt="Business Case" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                Quantify Business Case
              </h2>
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                {/* Caret Circle Down Icon */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                height: isAccordionOpen ? 'auto' : 0,
                opacity: isAccordionOpen ? 1 : 0
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-col gap-6 sm:gap-12">
                {/* Formula Text */}
                <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary w-full" style={{ letterSpacing: '-1%' }}>
                  collect # devices, monthly cost ($6/device), contract exit terms → compute monthly & annual savings.
                </p>

                {/* Calculation Example */}
                <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray sm:text-text-quaternary w-full list-disc pl-6 space-y-0" style={{ letterSpacing: '-2%' }}>
                  <li>Monthly saved = number_of_devices X $6</li>
                  <li>Annual saved = number_of_devices X $6 X 12</li>
                  <li>Example: 1,000 devices → monthly $6,000 → annual $72,000</li>
                </ul>

                {/* Condition Header */}
                <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray w-full" style={{ letterSpacing: '-1%' }}>
                  Condition of the Product and Feature when I started.
                </h3>

                {/* Condition Description */}
                <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray sm:text-text-quaternary w-full list-disc pl-6 space-y-0" style={{ letterSpacing: '-2%' }}>
                  <li>Driving data was being shared with the external vendor.</li>
                  <li>Vehicle and driver assignment in the native app was rudimentary.</li>
                  <li>The system served a large scale: ~270,000 drivers.</li>
                </ul>

                {/* Third Party App Screenshots */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-[12px] w-full sm:w-auto">
                  <div className="w-full sm:w-[255px] h-auto sm:h-[229px] overflow-hidden">
                    <LazyImage src={thirdPartyApp1} alt="Third Party App 1" className="w-full h-full object-cover" />
                  </div>
                  <div className="w-full sm:w-[284px] h-auto sm:h-[213px] overflow-hidden">
                    <LazyImage src={thirdPartyApp2} alt="Third Party App 2" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Final Description */}
                <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray w-full list-disc pl-6 space-y-0" style={{ letterSpacing: '-2%' }}>
                  <li>The fleet was relying on a third-party ELD integration for compliance. This came at a cost of $6 per driver per device, and despite having a native driver app, drivers spent most of their time on the Geotab mobile app to manage their Hours of Service (HoS).</li>
                  <li>The above shown is from the mentioned third party app, our app was not used by the Driver for this requirement.</li>
                </ul>
              </div>
            </motion.div>
          </motion.section>

          {/* Legacy Interface Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col gap-6 sm:gap-8 w-full"
          >
            {/* Accordion Header */}
            <div
              className="flex items-center gap-3 sm:gap-8 w-full cursor-pointer"
              onClick={() => setIsLegacyAccordionOpen(!isLegacyAccordionOpen)}
            >
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0 rounded-full overflow-hidden">
                <LazyImage src={legacyIcon} alt="Legacy Interface" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                Legacy Interface
              </h2>
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                {/* Caret Circle Down Icon */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isLegacyAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                height: isLegacyAccordionOpen ? 'auto' : 0,
                opacity: isLegacyAccordionOpen ? 1 : 0
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-col gap-6 sm:gap-8">
                {/* Description */}
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray sm:text-text-quaternary w-full" style={{ letterSpacing: '-2%' }}>
                  The Driver Dashboard UI had largely remained unchanged since launch. New features had been added piecemeal over the years, but the overall experience felt outdated.
                </p>

                {/* Screenshots Container */}
                <div className="flex flex-col gap-6 w-full">
                  {/* First two screenshots - side by side on all screen sizes, OR all three on desktop */}
                  <div className="flex flex-row gap-1 sm:gap-[24px] items-start w-full">
                    {/* Column 1 - HomeScreen 1 */}
                    <div className="flex flex-col gap-6 sm:gap-[24px] flex-1 sm:shrink-0 sm:w-[163px]">
                      <div className="w-full sm:w-[163px] h-auto sm:h-[332px] overflow-hidden">
                        <LazyImage src={homescreen1} alt="HomeScreen 1" className="w-full h-full object-cover" />
                      </div>
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        The main legacy Layout used for major years.
                      </p>
                    </div>

                    {/* Column 2 - Dashboard 7101 */}
                    <div className="flex flex-col gap-6 sm:gap-[24px] flex-1 sm:shrink-0 sm:w-[163px]">
                      <div className="w-full sm:w-[163px] h-auto sm:h-[332px] overflow-hidden">
                        <LazyImage src={dashboard7101} alt="Dashboard 7101" className="w-full h-full object-cover" />
                      </div>
                      <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                        Recent Update but not pushed to all tenants
                      </p>
                    </div>

                    {/* Column 3 - Third Generation - Hidden on mobile, shown on desktop */}
                    <div className="hidden sm:flex sm:flex-col sm:gap-[24px] sm:flex-[1_0_0]">
                      <div className="w-[156.878px] h-[327px] rounded-[12.224px] overflow-hidden shadow-[0px_0px_0px_4.075px_rgba(159,159,159,0.25)] bg-white">
                        <LazyImage src={thirdGen1} alt="3rd Generation" className="w-full h-full object-cover" />
                      </div>
                      <p className="font-outfit text-base leading-[1.34em] text-ui-gray w-[233px]" style={{ letterSpacing: '-2%' }}>
                        Proposed future update considering the DS refreshment and new feature integration
                      </p>
                    </div>
                  </div>

                  {/* Third screenshot - shown on mobile only, below the first two */}
                  <div className="flex flex-col gap-6 sm:hidden">
                    <div className="w-[150px] h-auto rounded-xl overflow-hidden shadow-[0px_0px_0px_4px_rgba(159,159,159,0.25)] bg-white">
                      <LazyImage src={thirdGen1} alt="3rd Generation" className="w-full h-full object-cover" />
                    </div>
                    <p className="font-outfit text-sm leading-[1.34em] text-ui-gray w-full" style={{ letterSpacing: '-2%' }}>
                      Proposed future update considering the DS refreshment and new feature integration
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* Understanding Driver Behavior Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col gap-6 sm:gap-8 w-full"
          >
            {/* Accordion Header */}
            <div
              className="flex items-center gap-3 sm:gap-8 w-full cursor-pointer"
              onClick={() => setIsDriverBehaviorAccordionOpen(!isDriverBehaviorAccordionOpen)}
            >
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0 rounded-xl overflow-hidden">
                <LazyImage src={driverBehaviorIcon} alt="Understanding Driver Behavior" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                Understanding Driver Behavior
              </h2>
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                {/* Caret Circle Down Icon */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isDriverBehaviorAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                height: isDriverBehaviorAccordionOpen ? 'auto' : 0,
                opacity: isDriverBehaviorAccordionOpen ? 1 : 0
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-col gap-6 sm:gap-16 sm:items-center">
                {/* Description */}
                <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary w-full" style={{ letterSpacing: '-2%' }}>
                  Drivers typically pick up a vehicle or trailer from the company yard, complete their service runs, and often take the truck home overnight. The next day, depending on the shipment, they may continue with the same vehicle or switch to a different one.
                </p>

                {/* Workflow Visual */}
                <div className="w-full sm:w-[426px] h-auto sm:h-[497px] overflow-hidden">
                    <LazyImage src={driverBehaviorWorkflow} alt="Driver Behavior Workflow" className="w-full h-full object-contain" />
                  </div>
                </div>

                {/* Subsection 1: Drivers about to get in the vehicle */}
                <div className="flex flex-col gap-12 w-full">
                  {/* Header */}
                  <div className="flex flex-col gap-3">
                    <p className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Current User Journey (Before ELD integration)
                    </p>
                  </div>

                  {/* Subtitle */}
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray w-full" style={{ letterSpacing: '-2%' }}>
                    Drivers about to get in the vehicle, they need to select the same in the app
                  </p>

                  {/* Phone and Items Images */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-[26px] w-full">
                    <div className="w-[240px] sm:w-[290px] h-[503px] sm:h-[608px] bg-white rounded-[12px] sm:rounded-[24px] overflow-hidden shadow-[0px_0px_0px_6px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_12px_rgba(159,159,159,0.25)]">
                      <LazyImage src={imgGreenZoneScore} alt="GreenZone Score Dashboard" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <LazyImage src={vehicleSelectionItems} alt="Vehicle Selection Items" className="w-full h-auto object-contain" />
                    </div>
                  </div>

                  {/* Corner Cases */}
                  <div className="flex flex-col gap-3 sm:gap-8 py-3 sm:py-0">
                    <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Corner Cases
                    </h3>

                    {/* Case Cards - 2x2 Grid */}
                    <div className="flex flex-col gap-2 sm:gap-8">
                      {/* Row 1 */}
                      <div className="flex gap-2 sm:gap-6 w-full">
                        {/* Note 1: Remove Selection */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-2 sm:p-6 flex flex-col gap-2 sm:gap-3 h-[150px] sm:h-auto justify-center">
                          <h4 className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                            Remove Selection
                          </h4>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                            Allow the driver to clear current selections, enhancing user experience.
                          </p>
                        </div>

                        {/* Note 2: Vehicle Already Selected */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-2 sm:p-6 flex flex-col gap-2 sm:gap-3 h-[150px] sm:h-auto justify-center">
                          <h4 className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.08px' }}>
                            Vehicle Already Selected
                          </h4>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                            Prevents double selection by informing the driver.
                          </p>
                        </div>
                      </div>

                      {/* Row 2 */}
                      <div className="flex gap-2 sm:gap-6 w-full">
                        {/* Note 4: Shipping Document Limit */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-2 sm:p-6 flex flex-col gap-2 sm:gap-3 h-[150px] sm:h-auto justify-center">
                          <h4 className="font-space font-bold text-lg sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                            Shipping Document Limit
                          </h4>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                            Enforce character limits for shipping documents
                          </p>
                        </div>

                        {/* Note 3: No Internet Connection */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-2 sm:p-6 flex flex-col gap-2 sm:gap-3 h-[150px] sm:h-auto justify-center">
                          <h4 className="font-space font-bold text-lg sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                            No Internet Connection
                          </h4>
                          <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                            Implements a retry mechanism to ensure data sync.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subsection 2: Vehicle inspection by the Driver */}
                <div className="flex flex-col gap-4 sm:gap-8 w-full pt-8 sm:pt-12">
                  {/* Title */}
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Vehicle inspection by the Driver
                  </h3>

                  {/* Description */}
                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary w-full" style={{ letterSpacing: '-2%' }}>
                    If mandated by the manager profile, the Driver needs to do a vehicle inspection. Otherwise on clicking the "Create DVIR" button the Driver will be shown the screen to →The driver needs to accept that the vehicle is safe to drive if the defects are repaired.
                  </p>

                  {/* Cases Types */}
                  <div className="flex flex-col gap-3 sm:gap-8 py-3 sm:py-0">
                    <h4 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                      Cases Types
                    </h4>

                    {/* Case Cards - 2x2 Grid */}
                    <div className="flex flex-col gap-2 sm:gap-8">
                      {/* Row 1 */}
                      <div className="flex gap-2 sm:gap-8 w-full">
                        {/* Note 1: No Defects */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-3">
                          <h5 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            No Defects
                          </h5>
                          <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                            We do not show anything if there are no defects.
                          </p>
                        </div>

                        {/* Note 2: Defects Not Repaired */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-3">
                          <h5 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            Defects Not Repaired
                          </h5>
                          <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                            If defects are present and the status is not repaired, the user shall not drive / call the support team.
                          </p>
                        </div>
                      </div>

                      {/* Row 2 */}
                      <div className="flex gap-2 sm:gap-8 w-full">
                        {/* Note 3: Defects Repaired */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-3">
                          <h5 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            Defects Repaired
                          </h5>
                          <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                            If defects are present but the status is safe to drive, the driver needs to approve and sign to start driving.
                          </p>
                        </div>

                        {/* Note 4: No Defects but Unsafe */}
                        <div className="flex-1 bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-3">
                          <h5 className="font-space font-bold text-base sm:text-lg leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                            No Defects but Unsafe
                          </h5>
                          <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                            If defects are not there and the status is repaired and safe, the driver needs to approve and sign,
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phone and Items Images */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-[26px] w-full py-[33px] sm:pt-8">
                    <div className="w-[240px] sm:w-[290px] h-[503px] sm:h-[608px] bg-white rounded-[12px] sm:rounded-[24px] overflow-hidden shadow-[0px_0px_0px_6px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_12px_rgba(159,159,159,0.25)]">
                      <LazyImage src={imgVehicleInspection} alt="Vehicle Inspection Phone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <LazyImage src={vehicleInspectionItems} alt="Vehicle Inspection Items" className="w-full h-auto object-contain" />
                    </div>
                  </div>
                </div>
            </motion.div>
          </motion.section>

          {/* Defining the Problem Statement and Expectations Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col gap-6 sm:gap-8 w-full pt-8"
          >
            {/* Accordion Header */}
            <div
              className="flex items-center gap-3 sm:gap-8 w-full cursor-pointer"
              onClick={() => setIsProblemStatementAccordionOpen(!isProblemStatementAccordionOpen)}
            >
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0 rounded-full overflow-hidden">
                <LazyImage src={problemStatementIcon} alt="Problem Statement" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-1%' }}>
                Defining the Problem and Expectations
              </h2>
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                {/* Caret Circle Down Icon */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isProblemStatementAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                height: isProblemStatementAccordionOpen ? 'auto' : 0,
                opacity: isProblemStatementAccordionOpen ? 1 : 0
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-col gap-8 sm:gap-16">
                {/* Main Description and Image */}
                <div className="flex flex-col gap-6 sm:gap-16">
                  <div className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary w-full" style={{ letterSpacing: '-2%' }}>
                    <p className="mb-0">Build a native ELD feature within the driver app, fully managed by the web dashboard for fleet managers, replacing the costly third-party system.</p>
                    <p className="mb-0">The goals:</p>
                    <ul className="list-disc pl-6">
                      <li>Give drivers a dedicated ELD dashboard for HoS and logs.</li>
                      <li>Preserve familiar patterns from the third-party app but improve usability.</li>
                      <li>Ensure FMCSA compliance for duty cycles, inspections, and roadside checks.</li>
                    </ul>
                  </div>

                  {/* Main Image */}
                  <div className="w-full h-[223px] sm:h-[473.5px] rounded-lg overflow-hidden">
                    <LazyImage src={problemStatementMain} alt="Problem Statement" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* North Star & Outcomes */}
                <div className="flex flex-col gap-6 sm:gap-16 py-4 sm:py-8">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    North Star & Outcomes
                  </h3>

                  <ul className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary w-full list-disc pl-6" style={{ letterSpacing: '-2%' }}>
                    <li>Seamless duty status management – easy to change, automated where possible.</li>
                    <li>Prominent notifications – violations, log edits, and duty transitions surfaced clearly.</li>
                    <li>Driver trust – transparent logs, editable mistakes, and smoother roadside inspections.</li>
                  </ul>

                  {/* Outcome Cards */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-[13px] sm:gap-8 w-full">
                    <div className="sm:flex-1 sm:min-w-[200px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-1 sm:gap-3">
                      <h4 className="font-space font-bold text-base leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Duty Status
                      </h4>
                      <p className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        Easily change duty status automatically.
                      </p>
                    </div>

                    <div className="sm:flex-1 sm:min-w-[200px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-1 sm:gap-3">
                      <h4 className="font-space font-bold text-base leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Notifications
                      </h4>
                      <p className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        Violations and duty changes are clearly displayed
                      </p>
                    </div>

                    <div className="sm:flex-1 sm:min-w-[200px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-1 sm:gap-3">
                      <h4 className="font-space font-bold text-base leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Driver Trust
                      </h4>
                      <p className="font-outfit text-sm leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                        Transparent logs and and easy mistake edits.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Key Pain Points */}
                <div className="flex flex-col gap-4 sm:gap-16">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Key Pain Points
                  </h3>

                  {/* Pain Point Cards */}
                  <div className="flex flex-col gap-3 sm:gap-0 w-full">
                    {/* Row 1 */}
                    <div className="flex gap-3 sm:gap-8 w-full">
                      <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col justify-center gap-1 sm:h-[150px]">
                        <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                          Missed or incorrect duty status changes → led to unassigned logs.
                        </p>
                      </div>

                      <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col justify-center gap-1 sm:h-[150px]">
                        <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                          Log certification was confusing and often skipped.
                        </p>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="flex gap-3 sm:gap-8 w-full sm:mt-8">
                      <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col justify-center gap-1 sm:h-[150px]">
                        <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                          Drivers had to juggle two apps (native + third-party).
                        </p>
                      </div>

                      <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col justify-center gap-1 sm:h-[150px]">
                        <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                          Managers lacked visibility into unassigned logs and edits.
                        </p>
                      </div>
                    </div>

                    {/* Row 3 - Full Width */}
                    <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col justify-center gap-1 sm:h-[150px] sm:mt-8">
                      <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                        Data transfer to govt. body was not smooth and stress rises when cops pull over on road.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Competitive Research and Benchmarking */}
                <div className="flex flex-col gap-6 sm:gap-16 py-4 sm:py-8">
                  <h3 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                    Competitive Research and Benchmarking
                  </h3>

                  <p className="text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    <span className="font-space font-bold" style={{ letterSpacing: '-0.5%' }}>Jacob's Law</span>
                    <span className="font-outfit"> : users expect familiar interaction patterns.</span>
                  </p>

                  {/* Jacob's Law Note */}
                  <div className="bg-[#EBF0F5] border border-ui-gray rounded-2xl p-3 sm:p-6 flex flex-col gap-1 sm:gap-3">
                    <h4 className="font-space font-bold text-base leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Here is a catch about Jacob's law here
                    </h4>
                    <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-2%' }}>
                      We tried to improve the experience which might alter the general user expected behaviour, if we do not train and correct it, then in future some other product might do we might lose customers.
                    </p>
                  </div>

                  <p className="font-outfit text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-2%' }}>
                    Reviewed other fleet management apps → noted limited competition, meaning switching costs for tenants are high.
                  </p>

                  {/* Geotab */}
                  <div className="flex flex-col gap-3 sm:gap-8">
                    <h4 className="font-space font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                      Geotab
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                      <div className="w-full h-[281px] sm:w-[195px] sm:h-[153px] rounded-lg overflow-hidden">
                        <LazyImage src={geotab1} alt="Geotab 1" className="w-full h-full object-cover" />
                      </div>
                      <div className="w-full h-[201px] sm:w-[272px] sm:h-[153px] rounded-lg overflow-hidden">
                        <LazyImage src={geotab2} alt="Geotab 2" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  </div>

                  {/* Samsara */}
                  <div className="flex flex-col gap-3 sm:gap-8">
                    <h4 className="font-space font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                      Samsara
                    </h4>
                    <div className="flex gap-[7px] sm:gap-6">
                      <div className="w-[124px] h-[191px] sm:w-[157px] sm:h-[232px] rounded-lg overflow-hidden">
                        <LazyImage src={samsara1} alt="Samsara 1" className="w-full h-full object-cover" />
                      </div>
                      <div className="w-[110px] h-[191px] sm:w-[158px] sm:h-[260px] rounded-lg overflow-hidden">
                        <LazyImage src={samsara2} alt="Samsara 2" className="w-full h-full object-cover" />
                      </div>
                      <div className="w-[109px] h-[191px] sm:w-[157px] sm:h-[261px] rounded-lg overflow-hidden">
                        <LazyImage src={samsara3} alt="Samsara 3" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  </div>

                  {/* Lytx */}
                  <div className="flex flex-col gap-3 sm:gap-8">
                    <h4 className="font-space font-bold text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.5%' }}>
                      Lytx
                    </h4>
                    <div className="w-[217px] h-[154px] rounded-lg overflow-hidden">
                      <LazyImage src={lytx1} alt="Lytx 1" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* Discovery Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col gap-4 sm:gap-8 w-full pt-8"
          >
            {/* Accordion Header */}
            <div
              className="flex items-center gap-4 sm:gap-6 w-full cursor-pointer"
              onClick={() => setIsDiscoveryAccordionOpen(!isDiscoveryAccordionOpen)}
            >
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                <LazyImage src={discoveryIcon} alt="Discovery" className="w-full h-full object-contain" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-0.32px' }}>
                Discovery
              </h2>
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                {/* Caret Circle Down Icon */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isDiscoveryAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                height: isDiscoveryAccordionOpen ? 'auto' : 0,
                opacity: isDiscoveryAccordionOpen ? 1 : 0
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-col gap-4 sm:gap-8">
                {/* Core Requirements */}
                <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                  Core Requirements
                </h3>

                {/* Core Requirements Cards */}
                <div className="flex flex-col gap-3 sm:gap-0 w-full sm:w-[602px]">
                  {/* Row 1 */}
                  <div className="flex gap-3 sm:gap-8">
                    <div className="w-[197px] sm:w-[250px] bg-[#EBF0F5] border border-ui-gray rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col justify-center">
                      <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Register working hours as logs, indexed by time.
                      </p>
                    </div>

                    <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col justify-center sm:h-[150px]">
                      <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Manage and certify logs.
                      </p>
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="flex gap-3 sm:gap-8 sm:mt-8">
                    <div className="flex-1 sm:w-[250px] sm:flex-initial bg-[#EBF0F5] border border-ui-gray rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col justify-center sm:h-[150px]">
                      <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Handle unassigned logs.
                      </p>
                    </div>

                    <div className="w-[195px] sm:w-[250px] bg-[#EBF0F5] border border-ui-gray rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col justify-center sm:h-[150px]">
                      <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                        Record diagnostics and violations.
                      </p>
                    </div>
                  </div>

                  {/* Row 3 - Full Width */}
                  <div className="bg-[#EBF0F5] border border-ui-gray rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col justify-center sm:w-[250px] sm:h-[150px] sm:mt-8">
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-1%' }}>
                      Enable roadside inspection view and log transfer.
                    </p>
                  </div>
                </div>

                {/* Affinity Mapping of features */}
                <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-1%' }}>
                  Affinity Mapping of features
                </h3>

                {/* Affinity Mapping Cards */}
                <div className="w-full sm:w-[602px] flex flex-col gap-3 sm:gap-0">
                  {/* Row 1: Two cards side by side */}
                  <div className="flex gap-3 sm:gap-8">
                    <div className="flex-1 sm:w-[250px] sm:flex-initial h-[180px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 flex flex-col justify-center gap-3 sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                      <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                        Logs:
                        <br />
                        duty status, timestamps, duration, location, comments.
                      </p>
                    </div>

                    <div className="flex-1 sm:w-[250px] sm:flex-initial h-[180px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 flex flex-col justify-center gap-3 sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                      <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                        Edits: prevent overlaps, allow recertification.
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Full width card with bulleted list */}
                  <div className="w-full sm:w-[533px] h-[300px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 flex flex-col justify-center gap-3 shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)] mt-3 sm:mt-8">
                    <ul className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray list-disc ml-6" style={{ letterSpacing: '-0.32px' }}>
                      <li>30-minute break required after 8 hours driving.</li>
                      <li>Max 11 hours Driving per shift, 14 hours On Duty.</li>
                      <li>10 consecutive hours Off Duty required after a shift.</li>
                      <li>Weekly cycle: 70 hrs/6 days or 80 hrs/7 days.</li>
                      <li>Violations flagged automatically.</li>
                    </ul>
                  </div>

                  {/* Row 3: Two cards side by side */}
                  <div className="flex gap-3 sm:gap-8 mt-3 sm:mt-8">
                    <div className="flex-1 sm:w-[250px] sm:flex-initial h-[150px] bg-[#EBF0F5] border border-ui-gray rounded-2xl p-6 flex flex-col justify-center gap-3 shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                      <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                        Manager log transfers → driver approval/rejection.
                      </p>
                    </div>

                    {/* Special card with gradient background and 50+ text overlay */}
                    <div className="flex-1 sm:w-[250px] sm:flex-initial h-[150px] relative">
                      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(5,16,14,0.7)] to-transparent rounded-2xl px-6 py-4 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" style={{ filter: 'blur(2.15px)' }}>
                        <p className="font-['Outfit'] font-normal text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                          Alerts for violations (hours, daily/weekly cycles).
                        </p>
                      </div>
                      <p className="absolute left-[30.5px] top-1/2 -translate-y-[62.5px] font-space font-bold text-[32px] leading-[1.36em] text-white" style={{ letterSpacing: '-0.32px' }}>
                        50+
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* Devices Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex flex-col gap-6 sm:gap-16 w-full"
          >
            {/* Header */}
            <div className="flex items-center gap-3 sm:gap-8 w-full">
              <div className="w-8 h-[26px] sm:w-[78px] sm:h-16 flex-shrink-0">
                <LazyImage src={devicesIcon} alt="Devices" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Devices
              </h2>
            </div>

            {/* Subtitle */}
            <p className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
              Primary users: Drivers (main driver + up to 2 co-drivers).
            </p>

            {/* Devices Container */}
            <div className="flex flex-col items-center gap-[70px] w-full">
              {/* Device 1: In-Cab Monitor */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-center gap-4 sm:gap-16 w-full">
                <div className="w-[96px] h-[79px] sm:w-[169px] sm:h-[139px]">
                  <LazyImage src={inCabMonitor} alt="In-Cab Monitor" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col gap-[3px]">
                  <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray sm:text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                    In-Cab Monitor (786px–1056px)
                  </p>
                  <p className="font-['Outfit'] font-normal sm:font-space sm:font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary sm:text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                    Exist in modern trucks.
                  </p>
                </div>
              </div>

              {/* Device 2: Tablets */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-center gap-4 sm:gap-16 w-full">
                <div className="w-16 h-[71px] sm:w-[168px] sm:h-auto sm:flex sm:justify-center sm:gap-[10px]">
                  <div className="w-full h-full sm:w-[130px] sm:h-[145px]">
                    <LazyImage src={tablet} alt="Tablet" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-[3px]">
                  <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray sm:text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                    Tablets (786px–1056px)
                  </p>
                  <p className="font-['Outfit'] font-normal sm:font-space sm:font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary sm:text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                    Given to the Driver by the fleet.
                  </p>
                </div>
              </div>

              {/* Device 3: Mobile Phones */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-center gap-3 sm:gap-16 w-full">
                <div className="w-12 h-[70px] sm:w-[168px] sm:h-auto sm:flex sm:justify-center sm:items-center sm:gap-[10px]">
                  <div className="w-full h-full sm:w-[79px] sm:h-[115px]">
                    <LazyImage src={mobilePhone} alt="Mobile Phone" className="w-full h-full object-cover rounded-xl" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-[3px]">
                  <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-ui-gray sm:text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                    Mobile phones (360px–786px)
                  </p>
                  <p className="font-['Outfit'] font-normal sm:font-space sm:font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary sm:text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                    Drivers log in to there own device to maintain their records.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Cabin Establishment Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-col gap-6 sm:gap-[58px] w-full"
          >
            {/* Header */}
            <div className="flex items-center gap-3 sm:gap-8 w-full">
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0 rounded overflow-hidden shadow-[inset_0px_0px_4px_0px_rgba(255,255,255,1)]">
                <LazyImage src={cabinEstablishmentIcon} alt="Cabin Establishment" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Cabin Establishment
              </h2>
            </div>

            {/* Image 1 */}
            <div className="w-full h-[223px] sm:h-[475px]">
              <LazyImage src={cabinEstablishment1} alt="Cabin Establishment 1" className="w-full h-full object-cover rounded-2xl sm:rounded-[32px] border-2 border-ui-gray" />
            </div>

            {/* Image 2 */}
            <div className="w-full h-[224px] sm:h-[475px]">
              <LazyImage src={cabinEstablishment2} alt="Cabin Establishment 2" className="w-full h-full object-cover rounded-xl sm:rounded-[32px] border-2 border-ui-gray" />
            </div>
          </motion.section>

          {/* Driver Personas Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="flex flex-col items-end gap-8 sm:gap-16 w-full"
          >
            {/* Header */}
            <div className="flex items-center gap-3 w-full">
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                <LazyImage src={driverPersonasIcon} alt="Driver Personas" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                Driver Personas
              </h2>
            </div>

            {/* Personas Container */}
            <div className="flex flex-col w-full gap-8 sm:gap-[53px]">
              {/* Persona 1: Gajeel - Active Driver */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-[78px] w-full">
                <div className="w-24 h-24 sm:w-[242px] sm:h-[242px] flex-shrink-0 rounded-full overflow-hidden">
                  <LazyImage src={personaGajeel} alt="Gajeel" className="w-full h-full object-cover" />
                </div>
                <div className="w-full sm:w-[450px] flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full">
                    <h3 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                      Gajeel
                    </h3>
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Active Driver
                    </p>
                  </div>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray w-full" style={{ letterSpacing: '-0.28px' }}>
                    The Maintenance Manager ensures fleet safety, reliability, and optimal performance through preventive maintenance programs, technician supervision and training, budget management, regulatory compliance, and data-driven decision-making to minimize downtime.
                  </p>
                </div>
              </div>

              {/* Persona 2: Laxus - Co-Driver */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-[78px] w-full">
                <div className="w-24 h-24 sm:w-[242px] sm:h-[242px] flex-shrink-0 rounded-full overflow-hidden">
                  <LazyImage src={personaLaxus} alt="Laxus" className="w-full h-full object-cover" />
                </div>
                <div className="w-full sm:w-[450px] flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full">
                    <h3 className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                      Laxus
                    </h3>
                    <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                      Co-Driver
                    </p>
                  </div>
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray w-full" style={{ letterSpacing: '-0.28px' }}>
                    The Maintenance Technician inspects, diagnoses, and repairs fleet vehicles, performing preventive maintenance to ensure safety, reliability, and compliance while minimizing downtime.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Workflows Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="flex flex-col gap-8 sm:gap-16 w-full pt-8"
          >
            {/* Header */}
            <div className="flex items-center gap-3 sm:gap-8 w-full">
              <div className="w-8 h-8 sm:w-16 sm:h-16 flex-shrink-0">
                <LazyImage src={workflowsIcon} alt="Workflows" className="w-full h-full object-cover" />
              </div>
              <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray flex-1" style={{ letterSpacing: '-0.18px' }}>
                Workflows
              </h2>
            </div>

            {/* Container */}
            <div className="flex flex-col gap-8 w-full">
              {/* First Time Use - One time in Day */}
              <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                First Time Use - One time in Day
              </h3>

              {/* Flow Cards - Vertical on mobile, horizontal on desktop */}
              <div className="w-full sm:w-[602px] flex flex-col sm:flex-row items-center gap-3 sm:gap-8">
                {/* Note 1: Authentication */}
                <div className="w-full sm:w-[231px] bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-center shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.28px' }}>
                    Authentication + permissions.
                  </p>
                </div>

                {/* Arrow - Rotated 90deg on mobile */}
                <div className="w-[49px] h-[49px] flex items-center justify-center">
                  <p className="font-inter font-bold text-4xl leading-[1.32em] text-[#9A9CAD] rotate-90 sm:rotate-0" style={{ letterSpacing: '-0.72px' }}>
                    --&gt;
                  </p>
                </div>

                {/* Note 2: Tooltips */}
                <div className="w-full sm:w-[235px] bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-center shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-lg leading-[1.34em] text-ui-gray text-center" style={{ letterSpacing: '-0.28px' }}>
                    Tooltips where necessary.
                  </p>
                </div>
              </div>

              {/* Regular Use */}
              <h3 className="font-space font-bold text-base sm:text-2xl leading-[1.34em] sm:leading-[1.36em] text-text-quaternary" style={{ letterSpacing: '-0.08px' }}>
                Regular Use
              </h3>

              {/* Regular Use Cards - Flex wrap */}
              <div className="flex flex-wrap content-start items-start gap-3 sm:gap-6 w-full">
                {/* Selecting Vehicle */}
                <div className="bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex flex-col items-center justify-center gap-[10px] sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                    Selecting Vehicle
                  </p>
                </div>

                {/* Selecting Trailer */}
                <div className="bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex flex-col items-center justify-center gap-[10px] sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                    Selecting Trailer
                  </p>
                </div>

                {/* Shipping Document */}
                <div className="bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex flex-col items-center justify-center gap-[10px] sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                    Shipping Document
                  </p>
                </div>

                {/* Prompt to perform Vehicle Inspection */}
                <div className="bg-white border border-text-quaternary rounded-[99px] px-4 sm:px-8 py-3 sm:py-4 flex flex-col items-center justify-center gap-[10px] sm:shadow-[0px_4px_12px_0px_rgba(249,249,249,0.25)]">
                  <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                    Prompt to perform Vehicle Inspection
                  </p>
                </div>
              </div>

              {/* Experience remains the same note */}
              <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.32px' }}>
                [Experience remains the same]
              </p>
            </div>
          </motion.section>

          {/* Arc 1: Drivers assemble for Duty */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="flex flex-col gap-4 sm:gap-8 w-full pt-12 sm:pt-16"
          >
            {/* Arc 1 Title */}
            <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray w-full" style={{ letterSpacing: '-0.18px' }}>
              Arc 1: Drivers assemble for Duty
            </h2>

            {/* Scene 1 */}
            <div className="flex flex-col gap-4 sm:gap-8 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 1.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Shift start at Dusk
                </p>
              </div>

              {/* Image placeholders for Scene 1 */}
              <div className="w-full h-[265px] sm:h-[563px] border-[5px] border-ui-gray relative overflow-hidden">
                <LazyImage src={imgF11} alt="Shift start at Dusk" className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-4 sm:bottom-5 sm:right-5 sm:left-auto bg-white border-2 border-ui-gray p-2 sm:px-3 sm:py-3">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray w-[87px] sm:w-auto" style={{ letterSpacing: '-0.07px' }}>
                    .. 06:30 pm
                  </p>
                </div>
              </div>

              <div className="w-full h-[230px] sm:h-[488px] relative overflow-hidden">
                <LazyImage src={imgF2} alt="Gajeel waiting" className="w-full h-full object-cover" />
                <div className="absolute bottom-[17px] left-1/2 -translate-x-1/2 sm:bottom-5 sm:left-1/4 sm:translate-x-0 bg-white border-2 border-ui-gray px-3 py-2 sm:py-3 w-[264px] sm:w-auto">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                    Gajeel waiting for Laxus to arrive.
                  </p>
                </div>
              </div>
            </div>

            {/* Scene 2 */}
            <div className="flex flex-col gap-8 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 2.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Gajeel logging himself in and sets himself as the Active Driver, as well as marking hims as onDuty
                </p>
              </div>

              <div className="w-full h-[256px] sm:h-[544px] relative overflow-hidden">
                <LazyImage src={imgF32} alt="Gajeel logging in" className="w-full h-full object-cover" />
                <div className="absolute top-[6px] left-1/2 -translate-x-1/2 sm:top-5 sm:left-5 sm:translate-x-0 bg-white border-2 border-ui-gray px-3 py-2 sm:py-3 w-[337px] sm:max-w-[358px]">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                    Both need to address pending tasks, certifying previous days logs, Inspecting the Vehicle.
                  </p>
                </div>
              </div>

              <div className="w-full h-[239px] sm:h-[507px] relative overflow-hidden">
                <LazyImage src={imgF6} alt="Laxus arriving" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-32 bg-white border-2 border-ui-gray px-3 py-2 sm:py-3">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                    Laxus to arrives...
                  </p>
                </div>
              </div>

              <div className="w-full h-[358px] sm:h-[760px] relative overflow-hidden">
                <LazyImage src={imgF10} alt="Laxus logs in" className="w-full h-full object-cover transform rotate-180 scale-y-[-1]" />
                <div className="absolute bottom-[281.69px] sm:bottom-5 left-[17px] sm:left-1/3 bg-white border-2 border-ui-gray p-3 w-[323px] sm:w-auto">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                    Laxus logs into the ELD and changes his log status to onDuty.
                  </p>
                </div>
              </div>
            </div>

            {/* Flow Details for Arc 1 */}
            <div className="flex flex-col gap-4 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7">
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Prompted vehicle inspection → automatically sets duty status to On Duty.
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <ul className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray list-disc ml-5" style={{ letterSpacing: '-0.28px' }}>
                  <li>Changing of Duty states</li>
                  <li>Personal Conveyance & Yard move annotations</li>
                </ul>
              </div>

              {/* Device mockups */}
              <div className="flex gap-4 sm:gap-8 items-center py-6">
                <div className="w-[161px] h-[330px] sm:w-[290px] sm:h-[592px] rounded-lg overflow-hidden">
                  <LazyImage src={imgDasboard7103} alt="Dashboard 7103" className="w-full h-full object-cover" />
                </div>
                <div className="w-[157px] h-[330px] sm:w-[274px] sm:h-[577px] rounded-xl overflow-hidden shadow-[0px_0px_0px_4px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_8px_rgba(159,159,159,0.25)] bg-white">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={videoAutoChangeEld}
                  />
                </div>
              </div>
            </div>
          </motion.section>

          {/* Arc 2: Driving status Automations */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.3 }}
            className="flex flex-col gap-4 sm:gap-8 w-full pt-12 sm:pt-16"
          >
            <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray w-full" style={{ letterSpacing: '-0.18px' }}>
              Arc 2: Driving status Automations
            </h2>

            {/* Scene 1 */}
            <div className="flex flex-col gap-8 sm:gap-[35px] w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 1.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Gajeel just made a stop to check the route.
                </p>
              </div>

              <div className="w-full h-[239px] sm:h-[507px] rounded-lg overflow-hidden">
                <LazyImage src={imgF52} alt="Stop to check route" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Scene 2 */}
            <div className="flex flex-col gap-8 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 2.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  They can see the system is asking them to change to On Duty since it detected the vehicle is not in motion.
                </p>
              </div>

              <div className="w-full h-[261px] sm:h-[555px] rounded-lg relative overflow-hidden">
                <LazyImage src={imgImage44} alt="System duty status prompt" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-44 bg-white border border-ui-gray sm:border-2 px-3 py-2 sm:py-3 rounded w-[334px] sm:max-w-md">
                  <p className="font-comic font-bold text-xs sm:text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.06px' }}>
                    60 seconds for them to make the choice or the system will make it for them..
                  </p>
                </div>
              </div>

              <div className="w-full h-[358px] sm:h-[760px] rounded-lg relative overflow-hidden">
                <LazyImage src={imgF7} alt="Laxus response" className="w-full h-full object-cover transform rotate-180 scale-y-[-1]" />
                <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 bg-white border border-ui-gray sm:border-2 px-3 py-2 sm:py-3 rounded w-[334px] sm:max-w-md">
                  <p className="font-comic font-bold text-sm leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.07px' }}>
                    Laxus knows what next to do, first time was a little surprise but not anymore..
                  </p>
                </div>
              </div>
            </div>

            {/* Flow Details for Arc 2 */}
            <div className="flex flex-col gap-3 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7" start={2}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Log Records
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                  User can view and maintain their logs from the HoS tab in the APP.
                </p>
              </div>

              <div className="flex gap-4 sm:gap-8 items-start pt-6">
                <div className="w-[172px] h-[350px] sm:w-[290px] sm:h-[592px] rounded-lg overflow-hidden">
                  <LazyImage src={imgDasboard7104} alt="Dashboard 7104" className="w-full h-full object-cover" />
                </div>
                <div className="w-[166px] h-[350px] sm:w-[275px] sm:h-[579px] rounded-lg sm:rounded-xl overflow-hidden shadow-[0px_0px_0px_6px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_8px_rgba(159,159,159,0.25)] bg-white">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={videoLogRecords}
                  />
                </div>
              </div>
            </div>
          </motion.section>

          {/* Arc 3: Break Cycles and switching places */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.4 }}
            className="flex flex-col gap-6 sm:gap-8 w-full pt-12 sm:pt-16"
          >
            <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray w-full" style={{ letterSpacing: '-0.18px' }}>
              Arc 3: Break Cycles and switching places
            </h2>

            {/* Scene 1 */}
            <div className="flex flex-col gap-8 w-full">
              <div className="flex flex-col gap-3 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 1.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Its been almost 8 hours, gajeel would like to rest, so Laxus now need to take the wheels
                </p>
              </div>

              <div className="w-full h-[358px] sm:h-[760px] rounded-lg overflow-hidden">
                <LazyImage src={imgF9} alt="Driver rest period" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Scene 2 */}
            <div className="flex flex-col gap-6 sm:gap-8 w-full">
              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 2.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Gajeels went on to the sleeper berth, after changing his Duty Status and Laxus marks himself as the active driver. Also, vice-versa
                </p>
              </div>

              <div className="w-full h-[254px] sm:h-[540px] rounded-lg overflow-hidden">
                <LazyImage src={imgF12} alt="Duty status change" className="w-full h-full object-cover" />
              </div>

              <div className="w-full h-[358px] sm:h-[760px] rounded-lg overflow-hidden">
                <LazyImage src={imgF15} alt="Active driver switch" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Flow Details for Arc 3 */}
            <div className="flex flex-col gap-4 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7" start={3}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Certification of Logs
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base sm:text-lg leading-[1.34em] sm:leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                  In the end of every 14 day cycle the driver needs to certify 14 days log as a mandatory action also they are able to certify each day's logs.
                </p>
              </div>

              <div className="flex gap-6 sm:gap-8 items-center pt-6">
                <div className="w-[166px] h-[342px] sm:w-[290px] sm:h-[592px] rounded-lg overflow-hidden">
                  <LazyImage src={imgDasboard7105} alt="Dashboard 7105" className="w-full h-full object-cover" />
                </div>
                <div className="w-[158px] h-[334px] sm:w-[275px] sm:h-[579px] rounded-lg sm:rounded-xl overflow-hidden shadow-[0px_0px_0px_6px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_8px_rgba(159,159,159,0.25)] bg-white">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={videoCertificationOfLogs}
                  />
                </div>
              </div>
            </div>

            {/* Flow Details - Editing / Managing the Logs */}
            <div className="flex flex-col gap-4 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7" start={4}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Editing / Managing the Logs
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base leading-[1.34em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                  Drivers can edit their logs, add annotations, and manage discrepancies.
                </p>
              </div>

              <div className="flex gap-4 sm:gap-8 items-center">
                <div className="w-[174px] h-[354px] sm:w-[290px] sm:h-[592px] rounded-lg overflow-hidden">
                  <LazyImage src={imgEdits1} alt="Edits" className="w-full h-full object-cover" />
                </div>
                <div className="w-[164px] h-[345px] sm:w-[275px] sm:h-[579px] rounded-lg sm:rounded-xl overflow-hidden shadow-[0px_0px_0px_6px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_8px_rgba(159,159,159,0.25)] bg-white">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={videoLogRecords}
                  />
                </div>
              </div>
            </div>
          </motion.section>

          {/* Arc 4: Random inspection for safety */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.5 }}
            className="flex flex-col gap-4 sm:gap-8 w-full pt-12 sm:pt-16"
          >
            <h2 className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray w-full h-[44px] sm:h-auto" style={{ letterSpacing: '-0.18px' }}>
              Arc 4: Random inspection for safety
            </h2>

            {/* Scene 1 */}
            <div className="flex flex-col gap-8 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 1.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  They are following their regular routine. Police car approachs and halts their trip.
                </p>
              </div>

              <div className="w-full h-[358px] sm:h-[760px] rounded-lg overflow-hidden">
                <LazyImage src={imgArc4Scene1B1} alt="Regular routine" className="w-full h-full object-cover" />
              </div>

              <div className="w-full h-[358px] sm:h-[760px] rounded-lg overflow-hidden">
                <LazyImage src={imgF13} alt="Police inspection" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Scene 2 */}
            <div className="flex flex-col gap-4 sm:gap-8 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-[#9A9CAD]" style={{ letterSpacing: '-0.18px' }}>
                  Scene 2.
                </p>
                <p className="font-space font-bold text-lg sm:text-2xl leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  officers requests to see their logs.
                </p>
              </div>

              <div className="w-full h-[238px] sm:h-[507px] rounded-lg overflow-hidden">
                <LazyImage src={imgF14} alt="Log request" className="w-full h-full object-cover" />
              </div>

              <div className="w-full h-[256px] sm:h-[544px] rounded-lg overflow-hidden">
                <LazyImage src={imgF31} alt="Showing logs" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Flow Details for Arc 4 - Inspector Mode */}
            <div className="flex flex-col gap-8 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7" start={4}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Inspector Mode
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base leading-[1.34em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                  When the Cops pull over the driver, they need to show their log records in a secure manner.
                </p>
              </div>

              <div className="flex gap-4 sm:gap-8 items-center">
                <div className="w-[163px] h-[343px] sm:w-[275px] sm:h-[579px] rounded-[6px] sm:rounded-[12px] overflow-hidden bg-white shadow-[0px_0px_0px_4px_rgba(159,159,159,0.25)] sm:shadow-[0px_0px_0px_8px_rgba(159,159,159,0.25)]">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={videoInspectorMode}
                  />
                </div>
                <div className="w-[172px] h-[351px] sm:w-[290px] sm:h-[592px]">
                  <LazyImage src={imgDataTransfer1} alt="Full Day ELD Record" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </motion.section>


          {/* In-Cab Monitor Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.6 }}
            className="flex flex-col gap-6 sm:gap-8 w-full pt-16"
          >
            <div className="flex flex-col gap-3 sm:gap-8 py-6 sm:border-y-2 sm:border-[#EBF0F5]">
              <div className="flex gap-2 items-center">
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver•i App</p>
                <div className="w-1 h-1 rounded-full bg-ui-gray"></div>
                <p className="font-['Outfit'] font-normal text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>Driver Persona</p>
              </div>

              <ol className="list-decimal ml-7" start={5}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  In-Cab Monitor
                </li>
              </ol>

              <div className="flex flex-col gap-3">
                <p className="font-space font-bold text-base leading-[1.34em] text-[#9A9CAD]" style={{ letterSpacing: '-0.08px' }}>
                  Flow Details
                </p>
                <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-ui-gray" style={{ letterSpacing: '-0.28px' }}>
                  ~50% of the Drivers use In Cab monitors as their Device, mostly a tab, which is portable. The Layout slightly changes from that of the Mobile layot.
                </p>
              </div>

              <div className="w-full h-[252px] sm:h-[535px] rounded-lg overflow-hidden">
                <LazyImage src={imgEld11} alt="In-Cab Monitor ELD" className="w-full h-full object-cover" />
              </div>
            </div>
          </motion.section>

          {/* Final Notes Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.7 }}
            className="flex flex-col gap-0 w-full pt-8 pb-5"
          >
            {/* Note 6: Unassigned Driving Log */}
            <div className="bg-white sm:border-2 sm:border-[#EBF0F5] sm:rounded-lg px-3 py-4 sm:p-6 mb-[-20px] sm:mb-0 shadow-[0px_2px_8px_0px_rgba(0,0,0,0.15)] flex flex-col gap-4">
              <ol className="list-decimal ml-7" start={6}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Unassigned Driving Log
                </li>
              </ol>
              <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                In an ideal world, good chances drivers make mistakes or misses to change the Duty status to start their shift, when the vehicle is in motion a log is recorded from data that is derived from the device, the log is technically not assigned to any driver.
              </p>
            </div>

            {/* Note 7: Log Updates from Web portals */}
            <div className="bg-white sm:border-2 sm:border-[#EBF0F5] sm:rounded-lg px-3 py-4 sm:p-6 mb-[-20px] sm:mb-0 shadow-[0px_-2px_8px_0px_rgba(0,0,0,0.15)] flex flex-col gap-4">
              <ol className="list-decimal ml-7" start={7}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Log Updates from Web portals
                </li>
              </ol>
              <p className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.28px' }}>
                From the Web Portal, when the fleet managers edit the logs, the Drivers can choose to accept/reject the logs. If they accept, their log records will be updated.
              </p>
            </div>

            {/* Note 8: Auto duty transitions */}
            <div className="bg-white sm:border-2 sm:border-[#EBF0F5] sm:rounded-lg px-3 py-4 sm:p-6 mb-[-20px] sm:mb-0 shadow-[0px_-2px_8px_0px_rgba(0,0,0,0.15)] flex flex-col gap-4">
              <ol className="list-decimal ml-7" start={8}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Auto duty transitions:
                </li>
              </ol>
              <ul className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary list-disc ml-[21px]" style={{ letterSpacing: '-0.28px' }}>
                <li>On Duty → Driving when vehicle motion detected (with 60-second override).</li>
                <li>Driving → On Duty when idle.</li>
              </ul>
            </div>

            {/* Note 9: Log Certification */}
            <div className="bg-white sm:border-2 sm:border-[#EBF0F5] sm:rounded-lg px-3 py-4 sm:p-6 mb-[-20px] sm:mb-0 shadow-[0px_-2px_8px_0px_rgba(0,0,0,0.15)] flex flex-col gap-4">
              <ol className="list-decimal ml-7" start={9}>
                <li className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray" style={{ letterSpacing: '-0.18px' }}>
                  Log Certification
                </li>
              </ol>
              <ul className="font-['Outfit'] font-normal text-sm sm:text-base leading-[1.34em] text-text-quaternary list-disc ml-[21px]" style={{ letterSpacing: '-0.28px' }}>
                <li>Drivers must certify previous day's logs daily.</li>
                <li>Recertification required after edits.</li>
                <li>14-day certification backlog compliance.</li>
              </ul>
            </div>

            {/* Final Note: More flows */}
            <div className="bg-white sm:border-2 sm:border-[#EBF0F5] sm:rounded-lg px-3 py-4 sm:p-6 mb-[-20px] sm:mb-0 shadow-[0px_-2px_8px_0px_rgba(0,0,0,0.15)] flex flex-col gap-2 sm:gap-4">
              <p className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray sm:text-center" style={{ letterSpacing: '-0.18px' }}>
                •••
              </p>
              <p className="font-space font-bold text-base leading-[1.34em] text-text-quaternary sm:text-center" style={{ letterSpacing: '-0.08px' }}>
                15+ more flows in the project including various device types
              </p>
              <p className="font-space font-bold text-lg sm:text-[32px] leading-[1.36em] text-ui-gray sm:text-center h-[45px] sm:h-auto" style={{ letterSpacing: '-0.18px' }}>
                •••
              </p>
            </div>
          </motion.section>
        </div>
      </div>
    </motion.main>
    </>
  );
};

export default HoursOfService;