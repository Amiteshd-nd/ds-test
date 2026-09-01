import { useState, useRef, useEffect } from 'react';

/**
 * ImageGrid Component
 *
 * A grid layout for images with staggered lazy loading using Intersection Observer.
 * Each image loads independently as it enters the viewport.
 *
 * @param {Array} images - Array of image objects: [{ src, alt, className }]
 * @param {string} className - Container CSS classes
 * @param {string} imageClassName - Default CSS classes for all images
 * @param {number} staggerDelay - Delay between image loads (ms)
 */
const ImageGrid = ({
  images = [],
  className = '',
  imageClassName = '',
  staggerDelay = 100,
  columns = 3,
  gap = 4,
}) => {
  return (
    <div
      className={`grid ${className}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap * 4}px`,
      }}
    >
      {images.map((image, index) => (
        <GridImage
          key={image.src || index}
          src={image.src}
          alt={image.alt || ''}
          className={image.className || imageClassName}
          style={image.style}
          delay={index * staggerDelay}
        />
      ))}
    </div>
  );
};

/**
 * Individual grid image with lazy loading
 */
const GridImage = ({ src, alt, className, style, delay }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef(null);

  // Intersection Observer
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          // Add stagger delay
          setTimeout(() => {
            setShouldLoad(true);
          }, delay);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px',
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* Skeleton loader */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}

      {/* Image */}
      {shouldLoad && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-500 ${
            isLoaded
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-105'
          }`}
        />
      )}
    </div>
  );
};

export default ImageGrid;
