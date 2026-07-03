# Amitesh Debnath - Product Designer Portfolio

A beautiful, responsive portfolio website built from Figma design, showcasing product design work.

## Tech Stack

- **React 18** - UI Library
- **Vite 5** - Build Tool & Dev Server
- **Tailwind CSS** - Utility-first CSS Framework
- **Framer Motion** - Animation Library
- **React Router DOM** - Client-side Routing

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <your-repo-url>
cd portfolio
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in terminal (usually `http://localhost:5173`)

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
portfolio/
├── src/
│   ├── assets/
│   │   ├── images/          # Project images
│   │   │   ├── hours-of-service.png
│   │   │   ├── vehicle-health.png
│   │   │   └── gazebo-ds.png
│   │   └── icons/           # SVG icons
│   │       ├── logo.svg
│   │       ├── readcv-logo-bg.svg
│   │       └── readcv-logo-fg.svg
│   ├── components/          # Reusable components
│   │   ├── Navbar.jsx
│   │   ├── BottomNav.jsx
│   │   ├── Button.jsx
│   │   ├── Hero.jsx
│   │   └── ProjectCard.jsx
│   ├── pages/              # Page components
│   │   ├── Home.jsx
│   │   ├── Works.jsx
│   │   └── About.jsx
│   ├── styles/             # Additional styles (if needed)
│   ├── App.jsx             # Main app component with routing
│   ├── main.jsx            # App entry point
│   └── index.css           # Global styles & Tailwind imports
├── public/                 # Static assets
├── tailwind.config.js      # Tailwind configuration with design tokens
├── postcss.config.js       # PostCSS configuration
└── vite.config.js          # Vite configuration
```

## Design Tokens

All design tokens are configured in `tailwind.config.js` to match the Figma design exactly.

### Colors

```js
// Primary Colors
dark: '#05100E'              // Background
light: '#FFFFFF'             // Primary text
light-yellow: '#FAFFD8'      // Accent yellow

// Text Colors
text-primary: '#FFFFFF'
text-secondary: '#9A9CAD'
text-tertiary: '#90A2C3'
text-quaternary: '#5D6C87'

// UI Colors
ui-gray: '#232832'
```

### Gradients

```css
.gradient-pink    /* Hours of Service card */
.gradient-gray    /* Vehicle Health card */
.gradient-yellow  /* Gazebo DS card */
```

### Typography

- **Rancho** - Handwritten welcome message
- **Roboto Slab** - Headings, buttons, navigation
- **Trispace** - Body text, project names

### Spacing

- Section gap: `48px`
- Card border-radius: `20px`
- Nav border-radius: `16px`

## Features

- Fully responsive design (mobile-first approach)
- Smooth page transitions with Framer Motion
- Interactive animations on hover/click
- Live time display (Bengaluru timezone)
- Clean component architecture
- Matches Figma design pixel-perfect

## Development Guidelines

1. **Components** - Keep components small and reusable
2. **Styling** - Use Tailwind utility classes, refer to design tokens in config
3. **Animations** - Use Framer Motion for all animations
4. **Responsive** - Mobile-first approach, test on multiple screen sizes
5. **Performance** - Optimize images, lazy load when needed

## Pages

- **Home** (`/`) - Landing page with hero and featured projects
- **Works** (`/works`) - Full portfolio of work (coming soon)
- **About** (`/about`) - About me page (coming soon)

## Assets

All images and icons are extracted from the original Figma design:
- Project images are in `src/assets/images/`
- SVG icons are in `src/assets/icons/`

## Design Reference

Figma Design:
- Desktop: [View Design](https://www.figma.com/design/kUmKZfzv4OjMw2D774tAfw/Amitesh-Debnath-PF?node-id=322-3473&m=dev)
- Mobile: [View Design](https://www.figma.com/design/kUmKZfzv4OjMw2D774tAfw/Amitesh-Debnath-PF?node-id=2290-4072&m=dev)
- Workflow: [View Design](https://www.figma.com/design/kUmKZfzv4OjMw2D774tAfw/Amitesh-Debnath-PF?node-id=2106-638&t=NblmbMTnv9RVftR5-4)

## License

All rights reserved - Amitesh Debnath
