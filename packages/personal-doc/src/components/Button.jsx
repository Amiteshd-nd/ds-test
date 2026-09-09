import { motion } from 'framer-motion';

const Button = ({ children, variant = 'primary', onClick, href, className = '' }) => {
  const baseStyles = 'px-6 sm:px-8 py-4 sm:py-5 rounded-lg font-roboto font-medium text-nav transition-all duration-300';

  const variants = {
    primary: 'bg-light-DEFAULT text-ui-gray hover:bg-light-DEFAULT/90',
    secondary: 'bg-ui-gray text-light-DEFAULT hover:bg-ui-gray/80',
    outline: 'border-2 border-light-DEFAULT text-light-DEFAULT hover:bg-light-DEFAULT hover:text-ui-gray',
  };

  const combinedStyles = `${baseStyles} ${variants[variant]} ${className}`;

  const MotionComponent = motion(href ? 'a' : 'button');

  return (
    <MotionComponent
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      className={combinedStyles}
    >
      {children}
    </MotionComponent>
  );
};

export default Button;
