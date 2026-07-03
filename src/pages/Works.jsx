import { motion } from 'framer-motion';
import ProjectLink from '../components/ProjectLink';
import hoursOfService from '../assets/images/hours-of-service.webp';
import vehicleHealth from '../assets/images/vehicle-health.webp';
import gazeboDs from '../assets/images/gazebo-ds.webp';
import vendingAnalytics from '../assets/images/vending-analytics.webp';
import teluguStreaming from '../assets/images/telugu-streaming.webp';
import behanceProfile from '../assets/images/behance-profile.webp';

const Works = () => {
  const projects = [
    {
      title: 'Hours of Service',
      description: 'A Unified Design System & Component Library for Gazebo  Platform',
      image: hoursOfService,
      gradient: 'pink',
      link: '/projects/hours-of-service',
    },
    {
      title: 'Vehicle Health',
      description: 'Maintenance of vehicle and defect management Dashboard',
      image: vehicleHealth,
      gradient: 'gray',
      link: '/projects/vehicle-health',
    },
    {
      title: 'Gazebo Design System',
      description: 'A Unified Design System & Component Library for Gazebo  Platform',
      image: gazeboDs,
      gradient: 'yellow',
      link: '#',
    },
    {
      title: 'Gazebo Complex Organisms',
      description: 'A Unified Design System & Component Library for Gazebo  Platform',
      image: gazeboDs,
      gradient: 'green',
      link: '/projects/gazebo-complex-organisms',
    },
    {
      title: 'Vending Analytics Dashboard',
      description: 'Maintenance of vehicle and defect management Dashboard',
      image: vendingAnalytics,
      gradient: 'gray',
      link: '/projects/vending-analytics',
    },
    {
      title: 'Telugu Streaming Platform',
      description: 'Maintenance of vehicle and defect management Dashboard',
      image: teluguStreaming,
      gradient: 'gray',
      link: '/projects/telugu-streaming',
    },
    {
      title: 'Behnace Profile',
      description: 'My Previous works which are not listed here.',
      image: behanceProfile,
      gradient: 'blue',
      link: 'https://www.behance.net/archisapien',
    },
  ];

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pt-32 pb-32 px-8"
    >
      <div className="max-w-[1135px] mx-auto">
        {/* Projects Container */}
        <div className="max-w-[760px] mx-auto flex flex-col gap-8">
          {projects.map((project, index) => (
            <ProjectLink
              key={project.title}
              title={project.title}
              description={project.description}
              image={project.image}
              gradient={project.gradient}
              link={project.link}
              index={index}
            />
          ))}
        </div>

        {/* Footer */}
        <footer className="text-center mt-16">
          <p className="font-outfit text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
            © 2025 Made with ❤️ by Amitesh using Claude code and Figma MCP
          </p>
        </footer>
      </div>
    </motion.main>
  );
};

export default Works;
