import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { useState } from 'react';

const ProjectLink = ({ title, description, image, gradient, link, index }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  // Track project click
  const handleClick = () => {
    ReactGA.event({
      category: 'Projects',
      action: 'Click',
      label: title
    });
  };

  const gradientClasses = {
    pink: 'gradient-pink',
    gray: 'gradient-gray',
    yellow: 'gradient-yellow',
    green: 'gradient-green',
    blue: 'gradient-blue',
  };

  // Check if link is external
  const isExternal = link.startsWith('http') || link.startsWith('#');

  const Component = isExternal ? motion.a : motion(Link);
  const linkProps = isExternal
    ? { href: link, target: "_blank", rel: "noopener noreferrer" }
    : { to: link };

  return (
    <Component
      {...linkProps}
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      className="flex flex-col md:flex-row gap-6 p-6 border border-ui-gray rounded-2xl bg-dark-card hover:border-text-secondary transition-all duration-300 group"
    >
      {/* Image Card */}
      <div className={`${gradientClasses[gradient]} rounded-card w-full md:w-[140px] h-[140px] flex-shrink-0 relative overflow-hidden`}>
        <div className="absolute inset-0 flex items-center justify-center p-6">
          {/* Loading skeleton */}
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-800 animate-pulse rounded-card" />
          )}
          
          <img
            src={image}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col justify-between flex-1 gap-4">
        {/* Title and Description */}
        <div className="flex flex-col gap-3">
          <h3 className="font-space font-bold text-lg leading-[1.36em] text-light" style={{ letterSpacing: '-0.18px' }}>
            {title}
          </h3>
          <p className="font-outfit text-base leading-[1.34em] text-text-secondary" style={{ letterSpacing: '-0.32px' }}>
            {description}
          </p>
        </div>

        {/* Visit Button */}
        <div className="flex items-center gap-2.5 text-light group-hover:gap-4 transition-all duration-300">
          <span className="font-outfit text-base leading-[1.34em]" style={{ letterSpacing: '-0.32px' }}>
            Visit
          </span>
          <span className="font-inter font-medium text-base leading-[1.21em]" style={{ letterSpacing: '-0.8px' }}>
            →
          </span>
        </div>
      </div>
    </Component>
  );
};

export default ProjectLink;