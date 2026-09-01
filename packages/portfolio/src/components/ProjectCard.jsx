import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import BlurImage from './BlurImage';

const ProjectCard = ({ title, image, gradient, index, route }) => {
  const gradientClasses = {
    pink: 'gradient-pink',
    gray: 'gradient-gray',
    yellow: 'gradient-yellow',
  };

  return (
    <Link to={route} className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6, delay: index * 0.1 }}
        whileHover={{ y: -8 }}
        className="flex flex-col items-center gap-3 group cursor-pointer w-full"
      >
      {/* Card */}
      <div className={`${gradientClasses[gradient]} rounded-card w-full aspect-square max-w-[200px] md:max-w-none md:h-48 relative overflow-hidden transition-all duration-300 group-hover:shadow-2xl`}>
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <motion.div
            className={title === 'Vehicle Health' ? 'w-[120%] h-[120%]' : 'w-full h-full'}
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.3 }}
          >
            <BlurImage
              src={image}
              alt={title}
              className="w-full h-full"
              objectFit="contain"
            />
          </motion.div>
        </div>
      </div>

      {/* Title */}
      <motion.p
        className="text-body font-outfit text-text-secondary text-center transition-colors duration-300 group-hover:text-light-DEFAULT"
      >
        {title}
      </motion.p>
    </motion.div>
    </Link>
  );
};

export default ProjectCard;
