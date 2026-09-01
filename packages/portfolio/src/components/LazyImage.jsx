import { useState, useRef, useEffect } from 'react';

/**
 * LazyImage Component
 *
 * Features:
 * - Native lazy loading with loading="lazy"
 * - Async decoding for better performance
 * - Blur-up placeholder effect (CSS-based, no separate image needed)
 * - Skeleton loader while loading
 * - Intersection Observer for custom lazy loading
 * - Priority loading for critical images
 * - Picture element with WebP/AVIF fallbacks for local images
 *
 * @param {string} src - Image source URL
 * @param {string} alt - Alt text for accessibility
 * @param {string} className - Additional CSS classes
 * @param {boolean} priority - If true, loads eagerly with high fetch priority
 * @param {string} placeholder - 'blur' | 'skeleton' | 'none'
 * @param {number} threshold - Intersection Observer threshold (0-1)
 * @param {string} rootMargin - Intersection Observer root margin
 * @param {boolean} useModernFormats - Use WebP/AVIF variants if available
 */
const LazyImage = ({
  src,
  alt = '',
  className = '',
  priority = false,
  placeholder = 'blur',
  threshold = 0.1,
  rootMargin = '50px',
  style = {},
  objectFit = 'cover',
  objectPosition = 'center',
  useModernFormats = false,
  sizes = '100vw',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  // Check if image is external (Figma, etc.)
  const isExternal = src?.startsWith('http://') || src?.startsWith('https://');

  // Generate variant paths for local images
  const getVariantPath = (originalSrc, format) => {
    if (!originalSrc || isExternal || !useModernFormats) return null;
    const srcString = typeof originalSrc === 'string' ? originalSrc : originalSrc;
    return srcString.replace(/\.(png|jpe?g)$/i, `.${format}`);
  };

  // Get format variants
  const avifSrc = getVariantPath(src, 'avif');
  const webpSrc = getVariantPath(src, 'webp');

  // Intersection Observer for custom lazy loading
  useEffect(() => {
    if (priority || !imgRef.current) return;

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

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [priority, threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const imageClassName = `w-full h-full transition-all duration-500 ease-out ${
    isLoaded
      ? 'opacity-100 blur-0 scale-100'
      : placeholder === 'blur'
        ? 'opacity-60 blur-lg scale-105'
        : 'opacity-0'
  }`;

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* Skeleton loader */}
      {placeholder === 'skeleton' && !isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Failed to load</span>
        </div>
      )}

      {/* Image with optional picture element for modern formats */}
      {isInView && (
        useModernFormats && !isExternal && (avifSrc || webpSrc) ? (
          <picture>
            {avifSrc && (
              <source type="image/avif" srcSet={avifSrc} />
            )}
            {webpSrc && (
              <source type="image/webp" srcSet={webpSrc} />
            )}
            <img
              src={src}
              alt={alt}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              onLoad={handleLoad}
              onError={handleError}
              className={imageClassName}
              style={{ objectFit, objectPosition }}
              {...props}
            />
          </picture>
        ) : (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            className={imageClassName}
            style={{ objectFit, objectPosition }}
            {...props}
          />
        )
      )}
    </div>
  );
};

export default LazyImage;
