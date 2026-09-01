import { motion } from 'framer-motion';

const Hero = () => {
  return (
    <section className="flex flex-col max-[500px]:items-start items-center gap-4 max-[500px]:text-left text-center max-w-[672px] mx-auto">
      {/* Welcome message */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.5, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="subheading-responsive text-text-secondary w-full md:whitespace-nowrap"
      >
        You could be anywhere in the internet but you are here, thank you!!
      </motion.h2>

      {/* Main heading */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="heading-responsive text-light-yellow w-full"
      >
        Some of my curated works in the platter.
      </motion.h1>
    </section>
  );
};

export default Hero;
