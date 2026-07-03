import { useState, useRef, useEffect } from 'react';

/**
 * BlurImage Component
 *
 * Progressive image loading with tiny blurred placeholder.
 *
 * Features:
 * - Shows tiny placeholder (< 1KB) first with blur
 * - Loads full image in background
 * - Smooth transition when loaded
 * - Intersection Observer for lazy loading
 * - Loading states and error handling
 *
 * @param {string} src - Full image source URL
 * @param {string} alt - Alt text for accessibility
 * @param {string} className - Container CSS classes
 * @param {boolean} priority - If true, loads eagerly
 * @param {string} objectFit - CSS object-fit value
 * @param {string} placeholderSrc - Custom placeholder URL (auto-generated if not provided)
 */
const BlurImage = ({
  src,
  alt = '',
  className = '',
  priority = false,
  style = {},
  objectFit = 'cover',
  placeholderSrc,
  threshold = 0.1,
  rootMargin = '50px',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const containerRef = useRef(null);

  // Check if image is external (Figma, etc.)
  const isExternal = src?.startsWith('http://') || src?.startsWith('https://');

  // Generate placeholder path for local images
  const getPlaceholderPath = (originalSrc) => {
    if (!originalSrc || isExternal) return null;
    if (placeholderSrc) return placeholderSrc;

    // Replace extension with -placeholder.jpg
    return originalSrc.replace(/\.(png|jpe?g)$/i, '-placeholder.jpg');
  };

  const placeholder = getPlaceholderPath(src);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority, threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const handlePlaceholderLoad = () => {
    setPlaceholderLoaded(true);
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* Skeleton loader - shows before placeholder loads */}
      {!placeholderLoaded && !isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Failed to load</span>
        </div>
      )}

      {/* Placeholder image - tiny blurred version */}
      {placeholder && isInView && !hasError && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          onLoad={handlePlaceholderLoad}
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
            isLoaded ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            objectFit,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Full resolution image */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full transition-opacity duration-500 ease-out ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ objectFit }}
          {...props}
        />
      )}

      {/* External images - use CSS blur effect as placeholder */}
      {isExternal && isInView && !isLoaded && !hasError && (
        <div
          className="absolute inset-0 bg-gray-300 animate-pulse"
          style={{
            backdropFilter: 'blur(10px)',
          }}
        />
      )}
    </div>
  );
};

export default BlurImage;
