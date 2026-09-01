import { motion } from 'framer-motion';
import Hero from '../components/Hero';
import ProjectCard from '../components/ProjectCard';
import hoursOfService from '../assets/images/hours-of-service.webp';
import vehicleHealth from '../assets/images/vehicle-health.webp';
import gazeboDs from '../assets/images/gazebo-ds.webp';

const Home = () => {
  const projects = [
    {
      title: 'Hours of Service',
      image: hoursOfService,
      gradient: 'pink',
      route: '/projects/hours-of-service',
    },
    {
      title: 'Vehicle Health',
      image: vehicleHealth,
      gradient: 'gray',
      route: '/projects/vehicle-health',
    },
    {
      title: 'Gazebo DS',
      image: gazeboDs,
      gradient: 'yellow',
      route: '/projects/gazebo-complex-organisms',
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
      <div className="max-w-[1400px] mx-auto">
        {/* Hero Section */}
        <div className="mb-12 md:mb-section">
          <Hero />
        </div>

        {/* Works Section */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-section max-w-[672px] mx-auto">
          {projects.map((project, index) => (
            <ProjectCard
              key={project.title}
              title={project.title}
              image={project.image}
              gradient={project.gradient}
              index={index}
              route={project.route}
            />
          ))}
        </div>
      </div>
    </motion.main>
  );
};

export default Home;
