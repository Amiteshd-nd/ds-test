import ReactGA from 'react-ga4';

// Track external link clicks
export const trackExternalLink = (label) => {
  ReactGA.event({
    category: 'External Links',
    action: 'Click',
    label: label
  });
};

// Track project view
export const trackProjectView = (projectName) => {
  ReactGA.event({
    category: 'Projects',
    action: 'View',
    label: projectName
  });
};

// Track scroll depth
export const trackScrollDepth = (projectName, depth) => {
  ReactGA.event({
    category: 'Engagement',
    action: 'Scroll Depth',
    label: projectName,
    value: depth
  });
};

// Track time spent on page
export const trackTimeOnPage = (projectName, seconds) => {
  ReactGA.event({
    category: 'Engagement',
    action: 'Time on Page',
    label: projectName,
    value: seconds
  });
};

// Track resume download
export const trackResumeDownload = () => {
  ReactGA.event({
    category: 'Actions',
    action: 'Download',
    label: 'Resume'
  });
};

// Track contact action
export const trackContactAction = (method) => {
  ReactGA.event({
    category: 'Actions',
    action: 'Contact',
    label: method
  });
};

// Track email copy
export const trackEmailCopy = () => {
  ReactGA.event({
    category: 'Actions',
    action: 'Copy Email',
    label: 'Email Copied'
  });
};
