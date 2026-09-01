import { useState, useRef, useEffect } from 'react';

/**
 * ResponsiveImage Component
 *
 * Uses <picture> element with WebP and AVIF fallbacks.
 * Supports responsive srcset for different screen sizes.
 * Includes blur-up loading effect.
 *
 * For local images, expects these variants to exist:
 * - image.avif, image.webp (full size)
 * - image-sm.avif, image-sm.webp (640px)
 * - image-md.avif, image-md.webp (768px)
 * - image-lg.avif, image-lg.webp (1024px)
 * - image-xl.avif, image-xl.webp (1280px)
 *
 * @param {string} src - Image source (original format)
 * @param {string} alt - Alt text
 * @param {string} className - Container CSS classes
 * @param {boolean} priority - If true, loads eagerly
 * @param {string} sizes - Responsive sizes attribute (e.g., "(max-width: 768px) 100vw, 50vw")
 * @param {boolean} responsive - Generate responsive srcset (default: true for local images)
 * @param {string} objectFit - CSS object-fit value
 */
const ResponsiveImage = ({
  src,
  alt = '',
  className = '',
  priority = false,
  sizes = '100vw',
  responsive = true,
  objectFit = 'cover',
  style = {},
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef(null);

  // Check if image is external (Figma, etc.)
  const isExternal = src?.startsWith('http://') || src?.startsWith('https://');

  // Generate variant paths for local images
  const getVariantPath = (originalSrc, format, size = '') => {
    if (!originalSrc || isExternal) return null;

    // Handle Vite's asset imports (they become URLs after build)
    const srcString = typeof originalSrc === 'string' ? originalSrc : originalSrc;

    // Replace extension with new format
    const basePath = srcString.replace(/\.(png|jpe?g)$/i, '');
    const sizeSuffix = size ? `-${size}` : '';
    return `${basePath}${sizeSuffix}.${format}`;
  };

  // Generate srcset for responsive images
  const generateSrcset = (format) => {
    if (!responsive || isExternal) return null;

    const widths = [640, 768, 1024, 1280, 1536];
    const sizes = ['sm', 'md', 'lg', 'xl', '2xl'];

    const srcsetParts = sizes.map((size, index) => {
      const path = getVariantPath(src, format, size);
      return path ? `${path} ${widths[index]}w` : null;
    }).filter(Boolean);

    // Add full size
    const fullPath = getVariantPath(src, format);
    if (fullPath) {
      srcsetParts.push(`${fullPath} 1920w`);
    }

    return srcsetParts.length > 0 ? srcsetParts.join(', ') : null;
  };

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
        threshold: 0.1,
        rootMargin: '50px',
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  // Get format variants
  const avifSrc = getVariantPath(src, 'avif');
  const webpSrc = getVariantPath(src, 'webp');
  const avifSrcset = generateSrcset('avif');
  const webpSrcset = generateSrcset('webp');

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* Skeleton loader */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Failed to load</span>
        </div>
      )}

      {/* Picture element with formats and fallbacks */}
      {isInView && (
        <picture>
          {/* AVIF format (best compression) */}
          {avifSrc && (
            <source
              type="image/avif"
              srcSet={avifSrcset || avifSrc}
              sizes={responsive ? sizes : undefined}
            />
          )}

          {/* WebP format (good compression, wide support) */}
          {webpSrc && (
            <source
              type="image/webp"
              srcSet={webpSrcset || webpSrc}
              sizes={responsive ? sizes : undefined}
            />
          )}

          {/* Fallback to original format */}
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            className={`w-full h-full transition-all duration-500 ease-out ${
              isLoaded
                ? 'opacity-100 blur-0 scale-100'
                : 'opacity-60 blur-lg scale-105'
            }`}
            style={{ objectFit }}
            {...props}
          />
        </picture>
      )}
    </div>
  );
};

export default ResponsiveImage;
