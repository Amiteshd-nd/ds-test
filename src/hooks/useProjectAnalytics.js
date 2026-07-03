import { useEffect, useRef } from 'react';
import { trackScrollDepth, trackTimeOnPage, trackProjectView } from '../utils/analytics';

const useProjectAnalytics = (projectName) => {
  const startTimeRef = useRef(Date.now());
  const maxScrollRef = useRef(0);
  const scrollMilestonesRef = useRef(new Set());

  useEffect(() => {
    // Track project view
    trackProjectView(projectName);

    // Reset refs
    startTimeRef.current = Date.now();
    maxScrollRef.current = 0;
    scrollMilestonesRef.current = new Set();

    // Scroll depth tracking
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      // Track milestones: 25%, 50%, 75%, 100%
      const milestones = [25, 50, 75, 100];
      milestones.forEach(milestone => {
        if (scrollPercent >= milestone && !scrollMilestonesRef.current.has(milestone)) {
          scrollMilestonesRef.current.add(milestone);
          trackScrollDepth(projectName, milestone);
        }
      });

      maxScrollRef.current = Math.max(maxScrollRef.current, scrollPercent);
    };

    window.addEventListener('scroll', handleScroll);

    // Track time on page when leaving
    return () => {
      window.removeEventListener('scroll', handleScroll);

      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (timeSpent > 5) { // Only track if user spent more than 5 seconds
        trackTimeOnPage(projectName, timeSpent);
      }
    };
  }, [projectName]);
};

export default useProjectAnalytics;
