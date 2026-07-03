import { motion } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import BlurImage from '../components/BlurImage';
import { trackEmailCopy, trackExternalLink } from '../utils/analytics';

// Profile Image
import profileImg from '../assets/images/about/profile.webp';

// Interests Images
import interestsAnime1 from '../assets/images/about/interests-anime-1.webp';
import interestsFestival from '../assets/images/about/interests-festival.webp';
import interestsJeep from '../assets/images/about/interests-jeep.webp';
import interestsPingpong from '../assets/images/about/interests-pingpong.webp';
import interestsChess from '../assets/images/about/interests-chess.webp';
import interestsSuit from '../assets/images/about/interests-suit.webp';
import interestsWoman1 from '../assets/images/about/interests-woman-1.webp';
import interestsBeach1 from '../assets/images/about/interests-beach-1.webp';
import interestsBeach2 from '../assets/images/about/interests-beach-2.webp';
import interestsFood from '../assets/images/about/interests-food.webp';
import interestsWoman2 from '../assets/images/about/interests-woman-2.webp';
import interestsAnime2 from '../assets/images/about/interests-anime-2.webp';
import interestsShooting from '../assets/images/about/interests-shooting.webp';
import interestsTv from '../assets/images/about/interests-tv.webp';
import interestsAnime3 from '../assets/images/about/interests-anime-3.webp';

// Flexing Images
import flexing1 from '../assets/images/about/flexing-1.webp';
import flexing2 from '../assets/images/about/flexing-2.webp';
import flexing3 from '../assets/images/about/flexing-3.webp';
import flexing4 from '../assets/images/about/flexing-4.webp';
import flexing5 from '../assets/images/about/flexing-5.webp';
import flexing6 from '../assets/images/about/flexing-6.webp';

// Book Images
import book1 from '../assets/images/about/book-1.webp';
import book2 from '../assets/images/about/book-2.webp';
import book3 from '../assets/images/about/book-3.webp';
import book4 from '../assets/images/about/book-4.webp';
import book5 from '../assets/images/about/book-5.webp';
import book6 from '../assets/images/about/book-6.webp';
import book7 from '../assets/images/about/book-7.webp';

const About = () => {
  const flexingImages = [flexing1, flexing2, flexing3, flexing4, flexing5, flexing6];
  const bookImages = [book1, book2, book3, book4, book5, book6, book7];

  // Refs for carousels
  const flexingRef = useRef(null);
  const bookRef = useRef(null);

  // States to control pausing
  const [isFlexingPaused, setIsFlexingPaused] = useState(false);
  const [isBookPaused, setIsBookPaused] = useState(false);

  // Toast state
  const [showToast, setShowToast] = useState(false);

  // Handle email copy
  const handleCopyEmail = () => {
    navigator.clipboard.writeText('amiteshdebnath98@gmail.com');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
    trackEmailCopy();
  };

  // States for drag scrolling
  const [isFlexingDragging, setIsFlexingDragging] = useState(false);
  const [isBookDragging, setIsBookDragging] = useState(false);
  const [flexingStartX, setFlexingStartX] = useState(0);
  const [bookStartX, setBookStartX] = useState(0);
  const [flexingScrollLeft, setFlexingScrollLeft] = useState(0);
  const [bookScrollLeft, setBookScrollLeft] = useState(0);

  // Physics states for momentum
  const flexingVelocityRef = useRef(0);
  const bookVelocityRef = useRef(0);
  const flexingLastMoveRef = useRef({ x: 0, time: 0 });
  const bookLastMoveRef = useRef({ x: 0, time: 0 });
  const flexingMomentumRef = useRef(null);
  const bookMomentumRef = useRef(null);

  // State for dynamic tile animations
  const [tileAnimations, setTileAnimations] = useState({});
  const [swappingTiles, setSwappingTiles] = useState([]);

  // State for tile positions
  const [tileOrder, setTileOrder] = useState({
    anime1: { image: interestsAnime1, name: 'anime1' },
    festival: { image: interestsFestival, name: 'festival' },
    jeep: { image: interestsJeep, name: 'jeep' },
    pingpong: { image: interestsPingpong, name: 'pingpong' },
    chess: { image: interestsChess, name: 'chess' },
    suit: { image: interestsSuit, name: 'suit' },
    woman1: { image: interestsWoman1, name: 'woman1' },
    beach1: { image: interestsBeach1, name: 'beach1' },
    beach2: { image: interestsBeach2, name: 'beach2' },
    food: { image: interestsFood, name: 'food' },
    woman2: { image: interestsWoman2, name: 'woman2' },
    anime2: { image: interestsAnime2, name: 'anime2' },
    shooting: { image: interestsShooting, name: 'shooting' },
    tv: { image: interestsTv, name: 'tv' },
    anime3: { image: interestsAnime3, name: 'anime3' }
  });

  // Random tile animation and position swap trigger
  useEffect(() => {
    const animateAndSwapTiles = () => {
      const tileKeys = Object.keys(tileOrder);

      // Define portrait tiles (taller than wide)
      const portraitTiles = ['anime1', 'chess', 'suit', 'woman1', 'woman2', 'tv'];
      const otherTiles = tileKeys.filter(key => !portraitTiles.includes(key));

      // Pick 2-3 random tiles to animate
      const numToAnimate = Math.floor(Math.random() * 2) + 2;
      const selectedTiles = [];

      for (let i = 0; i < numToAnimate; i++) {
        const randomTile = tileKeys[Math.floor(Math.random() * tileKeys.length)];
        if (!selectedTiles.includes(randomTile)) {
          selectedTiles.push(randomTile);
        }
      }

      const newAnimations = {};
      selectedTiles.forEach(tile => {
        const animations = ['flip', 'bounce', 'rotate', 'slide'];
        newAnimations[tile] = animations[Math.floor(Math.random() * animations.length)];
      });

      setTileAnimations(newAnimations);

      // Pick tiles to swap - portrait tiles swap with portrait, others swap independently
      let tile1Key, tile2Key;

      // Randomly decide if we swap portrait or other tiles
      if (Math.random() > 0.5 && portraitTiles.length >= 2) {
        // Swap two portrait tiles
        tile1Key = portraitTiles[Math.floor(Math.random() * portraitTiles.length)];
        tile2Key = portraitTiles[Math.floor(Math.random() * portraitTiles.length)];
        while (tile2Key === tile1Key) {
          tile2Key = portraitTiles[Math.floor(Math.random() * portraitTiles.length)];
        }
      } else {
        // Swap two non-portrait tiles
        tile1Key = otherTiles[Math.floor(Math.random() * otherTiles.length)];
        tile2Key = otherTiles[Math.floor(Math.random() * otherTiles.length)];
        while (tile2Key === tile1Key) {
          tile2Key = otherTiles[Math.floor(Math.random() * otherTiles.length)];
        }
      }

      // Mark tiles as swapping (fade out)
      setSwappingTiles([tile1Key, tile2Key]);

      // Wait for fade out, then swap
      setTimeout(() => {
        setTileOrder(prev => {
          const newOrder = { ...prev };
          // Swap the tile data
          const temp = newOrder[tile1Key];
          newOrder[tile1Key] = newOrder[tile2Key];
          newOrder[tile2Key] = temp;
          return newOrder;
        });

        // Clear swapping state to trigger fade in
        setTimeout(() => {
          setSwappingTiles([]);
        }, 50);
      }, 300);

      // Clear animations after they complete
      setTimeout(() => {
        setTileAnimations({});
      }, 1000);
    };

    // Run animation and swap together every 5 seconds
    const interval = setInterval(() => {
      animateAndSwapTiles();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [tileOrder]);

  // Momentum scrolling for Flexing carousel
  const applyFlexingMomentum = () => {
    if (Math.abs(flexingVelocityRef.current) > 0.5) {
      if (flexingRef.current) {
        flexingRef.current.scrollLeft -= flexingVelocityRef.current;
      }
      // Apply friction
      flexingVelocityRef.current *= 0.95;
      flexingMomentumRef.current = requestAnimationFrame(applyFlexingMomentum);
    } else {
      flexingVelocityRef.current = 0;
      if (flexingMomentumRef.current) {
        cancelAnimationFrame(flexingMomentumRef.current);
        flexingMomentumRef.current = null;
      }
    }
  };

  // Drag handlers for Flexing carousel
  const handleFlexingMouseDown = (e) => {
    setIsFlexingDragging(true);
    setIsFlexingPaused(true);
    setFlexingStartX(e.pageX - flexingRef.current.offsetLeft);
    setFlexingScrollLeft(flexingRef.current.scrollLeft);
    flexingRef.current.style.cursor = 'grabbing';
    flexingRef.current.style.scrollBehavior = 'auto';

    // Cancel any ongoing momentum
    if (flexingMomentumRef.current) {
      cancelAnimationFrame(flexingMomentumRef.current);
      flexingMomentumRef.current = null;
    }
    flexingVelocityRef.current = 0;
    flexingLastMoveRef.current = { x: e.pageX, time: Date.now() };
  };

  const handleFlexingMouseMove = (e) => {
    if (!isFlexingDragging) return;
    e.preventDefault();

    const x = e.pageX - flexingRef.current.offsetLeft;
    const walk = (x - flexingStartX) * 2.5; // Increased scroll speed multiplier
    flexingRef.current.scrollLeft = flexingScrollLeft - walk;

    // Calculate velocity for momentum
    const now = Date.now();
    const timeDelta = now - flexingLastMoveRef.current.time;
    if (timeDelta > 0) {
      const distance = e.pageX - flexingLastMoveRef.current.x;
      flexingVelocityRef.current = (distance / timeDelta) * 16; // Convert to per-frame velocity
    }
    flexingLastMoveRef.current = { x: e.pageX, time: now };
  };

  const handleFlexingMouseUp = () => {
    setIsFlexingDragging(false);
    if (flexingRef.current) {
      flexingRef.current.style.cursor = 'grab';
    }

    // Start momentum scrolling
    if (Math.abs(flexingVelocityRef.current) > 1) {
      applyFlexingMomentum();
    }
  };

  const handleFlexingMouseLeave = () => {
    if (isFlexingDragging) {
      setIsFlexingDragging(false);
      if (flexingRef.current) {
        flexingRef.current.style.cursor = 'grab';
      }

      // Start momentum scrolling on leave as well
      if (Math.abs(flexingVelocityRef.current) > 1) {
        applyFlexingMomentum();
      }
    }
  };

  // Auto-scroll for Flexing carousel
  useEffect(() => {
    const scrollContainer = flexingRef.current;
    if (!scrollContainer) return;

    const scroll = () => {
      // Only auto-scroll if not paused, not dragging, and no momentum
      if (!isFlexingPaused && !isFlexingDragging && !flexingMomentumRef.current) {
        scrollContainer.scrollLeft += 1;

        // Reset to beginning when reaching end
        if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth) {
          scrollContainer.scrollLeft = 0;
        }
      }
    };

    const intervalId = setInterval(scroll, 20);
    return () => clearInterval(intervalId);
  }, [isFlexingPaused, isFlexingDragging]);

  // Momentum scrolling for Book carousel
  const applyBookMomentum = () => {
    if (Math.abs(bookVelocityRef.current) > 0.5) {
      if (bookRef.current) {
        bookRef.current.scrollLeft -= bookVelocityRef.current;
      }
      // Apply friction
      bookVelocityRef.current *= 0.95;
      bookMomentumRef.current = requestAnimationFrame(applyBookMomentum);
    } else {
      bookVelocityRef.current = 0;
      if (bookMomentumRef.current) {
        cancelAnimationFrame(bookMomentumRef.current);
        bookMomentumRef.current = null;
      }
    }
  };

  // Drag handlers for Book carousel
  const handleBookMouseDown = (e) => {
    setIsBookDragging(true);
    setIsBookPaused(true);
    setBookStartX(e.pageX - bookRef.current.offsetLeft);
    setBookScrollLeft(bookRef.current.scrollLeft);
    bookRef.current.style.cursor = 'grabbing';
    bookRef.current.style.scrollBehavior = 'auto';

    // Cancel any ongoing momentum
    if (bookMomentumRef.current) {
      cancelAnimationFrame(bookMomentumRef.current);
      bookMomentumRef.current = null;
    }
    bookVelocityRef.current = 0;
    bookLastMoveRef.current = { x: e.pageX, time: Date.now() };
  };

  const handleBookMouseMove = (e) => {
    if (!isBookDragging) return;
    e.preventDefault();

    const x = e.pageX - bookRef.current.offsetLeft;
    const walk = (x - bookStartX) * 2.5; // Increased scroll speed multiplier
    bookRef.current.scrollLeft = bookScrollLeft - walk;

    // Calculate velocity for momentum
    const now = Date.now();
    const timeDelta = now - bookLastMoveRef.current.time;
    if (timeDelta > 0) {
      const distance = e.pageX - bookLastMoveRef.current.x;
      bookVelocityRef.current = (distance / timeDelta) * 16; // Convert to per-frame velocity
    }
    bookLastMoveRef.current = { x: e.pageX, time: now };
  };

  const handleBookMouseUp = () => {
    setIsBookDragging(false);
    if (bookRef.current) {
      bookRef.current.style.cursor = 'grab';
    }

    // Start momentum scrolling
    if (Math.abs(bookVelocityRef.current) > 1) {
      applyBookMomentum();
    }
  };

  const handleBookMouseLeave = () => {
    if (isBookDragging) {
      setIsBookDragging(false);
      if (bookRef.current) {
        bookRef.current.style.cursor = 'grab';
      }

      // Start momentum scrolling on leave as well
      if (Math.abs(bookVelocityRef.current) > 1) {
        applyBookMomentum();
      }
    }
  };

  // Auto-scroll for Book carousel (reverse direction)
  useEffect(() => {
    const scrollContainer = bookRef.current;
    if (!scrollContainer) return;

    // Start from middle position for seamless loop
    if (scrollContainer.scrollLeft === 0) {
      scrollContainer.scrollLeft = scrollContainer.scrollWidth / 2;
    }

    const scroll = () => {
      // Only auto-scroll if not paused, not dragging, and no momentum
      if (!isBookPaused && !isBookDragging && !bookMomentumRef.current) {
        scrollContainer.scrollLeft -= 1;

        // Reset to middle when reaching beginning
        if (scrollContainer.scrollLeft <= 0) {
          scrollContainer.scrollLeft = scrollContainer.scrollWidth / 2;
        }
      }
    };

    const intervalId = setInterval(scroll, 20);
    return () => clearInterval(intervalId);
  }, [isBookPaused, isBookDragging]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pt-32 pb-16 px-8"
    >
      <div className="max-w-[1135px] mx-auto">
        {/* Content Block */}
        <div className="max-w-[760px] mx-auto flex flex-col gap-24">
          {/* Bio Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col md:flex-row items-center gap-8 md:gap-[31px]"
          >
            {/* Profile Image */}
            <BlurImage
              src={profileImg}
              alt="Amitesh Debnath"
              className="w-[231px] h-[309px] rounded-[8px] flex-shrink-0"
              priority
            />

            {/* Header Text */}
            <div className="flex flex-col gap-[8px] flex-1">
              <p className="font-space font-bold text-[24px] leading-[1.36] text-light" style={{ letterSpacing: '-0.24px' }}>
                Hi, I am
              </p>
              <h1
                className="font-space font-bold text-[32px] leading-[1.36] bg-clip-text bg-gradient-to-r from-[#b1292c] to-[#cd6115]"
                style={{
                  letterSpacing: '-0.32px',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                Amitesh Debnath,
              </h1>
              <p className="font-space font-bold text-[24px] leading-[1.36] text-light" style={{ letterSpacing: '-0.24px' }}>
                An Architect by Qualification, Designer by Disposition, focused on crafting experiences for the new internet users.
              </p>
            </div>
          </motion.section>

          {/* Interests Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col gap-8 overflow-x-hidden"
          >
            <h2 className="font-space font-bold text-2xl leading-[1.36em] text-text-secondary" style={{ letterSpacing: '-0.24px' }}>
              Interests
            </h2>

            {/* Bento Grid - Desktop */}
            <div className="hidden md:block w-full">
              <div className="flex flex-col gap-3">
                {/* Row 1 */}
                <div className="flex gap-3">
                  {/* Left Column */}
                  <div className="flex flex-col gap-3 w-[530px]">
                    {/* Top Row */}
                    <div className="flex gap-3">
                      <div className={`bento-tile bento-tile-animated w-[187px] h-[248px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.anime1?.name] ? `tile-${tileAnimations[tileOrder.anime1?.name]}` : ''} ${swappingTiles.includes('anime1') ? 'swapping' : ''}`} style={{ animationDelay: '0.1s' }}>
                        <BlurImage src={tileOrder.anime1?.image} alt={tileOrder.anime1?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated flex-1 h-[248px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.festival?.name] ? `tile-${tileAnimations[tileOrder.festival?.name]}` : ''} ${swappingTiles.includes('festival') ? 'swapping' : ''}`} style={{ animationDelay: '0.2s' }}>
                        <BlurImage src={tileOrder.festival?.image} alt={tileOrder.festival?.name} className="w-full h-full" />
                      </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-3 w-[320px]">
                        <div className={`bento-tile bento-tile-animated w-full h-[205px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.jeep?.name] ? `tile-${tileAnimations[tileOrder.jeep?.name]}` : ''} ${swappingTiles.includes('jeep') ? 'swapping' : ''}`} style={{ animationDelay: '0.3s' }}>
                          <BlurImage src={tileOrder.jeep?.image} alt={tileOrder.jeep?.name} className="w-full h-full" />
                        </div>
                        <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[184px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.pingpong?.name] ? `tile-${tileAnimations[tileOrder.pingpong?.name]}` : ''} ${swappingTiles.includes('pingpong') ? 'swapping' : ''}`} style={{ animationDelay: '0.4s' }}>
                          <BlurImage src={tileOrder.pingpong?.image} alt={tileOrder.pingpong?.name} className="w-full h-full" />
                        </div>
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[198px] h-[401px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.chess?.name] ? `tile-${tileAnimations[tileOrder.chess?.name]}` : ''} ${swappingTiles.includes('chess') ? 'swapping' : ''}`} style={{ animationDelay: '0.5s' }}>
                        <BlurImage src={tileOrder.chess?.image} alt={tileOrder.chess?.name} className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-3 w-[218px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[327px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.suit?.name] ? `tile-${tileAnimations[tileOrder.suit?.name]}` : ''} ${swappingTiles.includes('suit') ? 'swapping' : ''}`} style={{ animationDelay: '0.6s' }}>
                      <BlurImage src={tileOrder.suit?.image} alt={tileOrder.suit?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[322px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.woman1?.name] ? `tile-${tileAnimations[tileOrder.woman1?.name]}` : ''} ${swappingTiles.includes('woman1') ? 'swapping' : ''}`} style={{ animationDelay: '0.7s' }}>
                      <BlurImage src={tileOrder.woman1?.image} alt={tileOrder.woman1?.name} className="w-full h-full" />
                    </div>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="flex gap-3">
                  {/* Left Column */}
                  <div className="flex flex-col gap-3 w-[462px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[260px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.beach1?.name] ? `tile-${tileAnimations[tileOrder.beach1?.name]}` : ''} ${swappingTiles.includes('beach1') ? 'swapping' : ''}`} style={{ animationDelay: '0.8s' }}>
                      <BlurImage src={tileOrder.beach1?.image} alt={tileOrder.beach1?.name} className="w-full h-full" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-3 w-[163px]">
                        <div className={`bento-tile bento-tile-animated w-full h-[107px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.beach2?.name] ? `tile-${tileAnimations[tileOrder.beach2?.name]}` : ''} ${swappingTiles.includes('beach2') ? 'swapping' : ''}`} style={{ animationDelay: '0.9s' }}>
                          <BlurImage src={tileOrder.beach2?.image} alt={tileOrder.beach2?.name} className="w-full h-full" />
                        </div>
                        <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[168px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.food?.name] ? `tile-${tileAnimations[tileOrder.food?.name]}` : ''} ${swappingTiles.includes('food') ? 'swapping' : ''}`} style={{ animationDelay: '1s' }}>
                          <BlurImage src={tileOrder.food?.image} alt={tileOrder.food?.name} className="w-full h-full" />
                        </div>
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[287px] h-[287px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.woman2?.name] ? `tile-${tileAnimations[tileOrder.woman2?.name]}` : ''} ${swappingTiles.includes('woman2') ? 'swapping' : ''}`} style={{ animationDelay: '1.1s' }}>
                        <BlurImage src={tileOrder.woman2?.image} alt={tileOrder.woman2?.name} className="w-full h-full" />
                      </div>
                    </div>
                    <div className={`bento-tile bento-tile-animated w-full h-[259px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.anime2?.name] ? `tile-${tileAnimations[tileOrder.anime2?.name]}` : ''} ${swappingTiles.includes('anime2') ? 'swapping' : ''}`} style={{ animationDelay: '1.2s' }}>
                      <BlurImage src={tileOrder.anime2?.image} alt={tileOrder.anime2?.name} className="w-full h-full" />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-3 w-[286px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[161px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.shooting?.name] ? `tile-${tileAnimations[tileOrder.shooting?.name]}` : ''} ${swappingTiles.includes('shooting') ? 'swapping' : ''}`} style={{ animationDelay: '1.3s' }}>
                      <BlurImage src={tileOrder.shooting?.image} alt={tileOrder.shooting?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[430px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.tv?.name] ? `tile-${tileAnimations[tileOrder.tv?.name]}` : ''} ${swappingTiles.includes('tv') ? 'swapping' : ''}`} style={{ animationDelay: '1.4s' }}>
                      <BlurImage src={tileOrder.tv?.image} alt={tileOrder.tv?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-full h-[215px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.anime3?.name] ? `tile-${tileAnimations[tileOrder.anime3?.name]}` : ''} ${swappingTiles.includes('anime3') ? 'swapping' : ''}`} style={{ animationDelay: '1.5s' }}>
                      <BlurImage src={tileOrder.anime3?.image} alt={tileOrder.anime3?.name} className="w-full h-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bento Grid - Mobile */}
            <div className="block md:hidden w-full overflow-hidden">
              <div className="scale-[calc((100vw-4rem)/390)] origin-top-left w-[390px]">
                <div className="flex flex-col gap-3">
                  {/* Frame 1 */}
                  <div className="flex gap-3">
                    <div className={`bento-tile bento-tile-animated w-[137px] h-[182px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.anime1?.name] ? `tile-${tileAnimations[tileOrder.anime1?.name]}` : ''} ${swappingTiles.includes('anime1') ? 'swapping' : ''}`} style={{ animationDelay: '0.1s' }}>
                      <BlurImage src={tileOrder.anime1?.image} alt={tileOrder.anime1?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[241px] h-[182px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.festival?.name] ? `tile-${tileAnimations[tileOrder.festival?.name]}` : ''} ${swappingTiles.includes('festival') ? 'swapping' : ''}`} style={{ animationDelay: '0.2s' }}>
                      <BlurImage src={tileOrder.festival?.image} alt={tileOrder.festival?.name} className="w-full h-full" />
                    </div>
                  </div>

                  {/* Frame 8 */}
                  <div className="flex gap-3">
                    {/* Frame 2 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[216px] h-[121px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.beach1?.name] ? `tile-${tileAnimations[tileOrder.beach1?.name]}` : ''} ${swappingTiles.includes('beach1') ? 'swapping' : ''}`} style={{ animationDelay: '0.3s' }}>
                        <BlurImage src={tileOrder.beach1?.image} alt={tileOrder.beach1?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[216px] h-[325px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.tv?.name] ? `tile-${tileAnimations[tileOrder.tv?.name]}` : ''} ${swappingTiles.includes('tv') ? 'swapping' : ''}`} style={{ animationDelay: '0.4s' }}>
                        <BlurImage src={tileOrder.tv?.image} alt={tileOrder.tv?.name} className="w-full h-full" />
                      </div>
                    </div>
                    {/* Frame 3 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[162px] h-[283px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.chess?.name] ? `tile-${tileAnimations[tileOrder.chess?.name]}` : ''} ${swappingTiles.includes('chess') ? 'swapping' : ''}`} style={{ animationDelay: '0.5s' }}>
                        <BlurImage src={tileOrder.chess?.image} alt={tileOrder.chess?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[162px] h-[163px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.suit?.name] ? `tile-${tileAnimations[tileOrder.suit?.name]}` : ''} ${swappingTiles.includes('suit') ? 'swapping' : ''}`} style={{ animationDelay: '0.6s' }}>
                        <BlurImage src={tileOrder.suit?.image} alt={tileOrder.suit?.name} className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Frame 4 */}
                  <div className="flex gap-3">
                    <div className={`bento-tile bento-tile-animated w-[147px] h-[148px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.woman2?.name] ? `tile-${tileAnimations[tileOrder.woman2?.name]}` : ''} ${swappingTiles.includes('woman2') ? 'swapping' : ''}`} style={{ animationDelay: '0.7s' }}>
                      <BlurImage src={tileOrder.woman2?.image} alt={tileOrder.woman2?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[231px] h-[148px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.jeep?.name] ? `tile-${tileAnimations[tileOrder.jeep?.name]}` : ''} ${swappingTiles.includes('jeep') ? 'swapping' : ''}`} style={{ animationDelay: '0.8s' }}>
                      <BlurImage src={tileOrder.jeep?.image} alt={tileOrder.jeep?.name} className="w-full h-full" />
                    </div>
                  </div>

                  {/* Frame 9 */}
                  <div className="flex gap-3">
                    {/* Frame 5 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[130px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.pingpong?.name] ? `tile-${tileAnimations[tileOrder.pingpong?.name]}` : ''} ${swappingTiles.includes('pingpong') ? 'swapping' : ''}`} style={{ animationDelay: '0.9s' }}>
                        <BlurImage src={tileOrder.pingpong?.image} alt={tileOrder.pingpong?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[110px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.beach2?.name] ? `tile-${tileAnimations[tileOrder.beach2?.name]}` : ''} ${swappingTiles.includes('beach2') ? 'swapping' : ''}`} style={{ animationDelay: '1s' }}>
                        <BlurImage src={tileOrder.beach2?.image} alt={tileOrder.beach2?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[127px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.anime2?.name] ? `tile-${tileAnimations[tileOrder.anime2?.name]}` : ''} ${swappingTiles.includes('anime2') ? 'swapping' : ''}`} style={{ animationDelay: '1.1s' }}>
                        <BlurImage src={tileOrder.anime2?.image} alt={tileOrder.anime2?.name} className="w-full h-full" />
                      </div>
                    </div>
                    {/* Frame 6 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[152px] h-[156px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.food?.name] ? `tile-${tileAnimations[tileOrder.food?.name]}` : ''} ${swappingTiles.includes('food') ? 'swapping' : ''}`} style={{ animationDelay: '1.2s' }}>
                        <BlurImage src={tileOrder.food?.image} alt={tileOrder.food?.name} className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[152px] h-[223px] rounded-lg overflow-hidden ${tileAnimations[tileOrder.woman1?.name] ? `tile-${tileAnimations[tileOrder.woman1?.name]}` : ''} ${swappingTiles.includes('woman1') ? 'swapping' : ''}`} style={{ animationDelay: '1.3s' }}>
                        <BlurImage src={tileOrder.woman1?.image} alt={tileOrder.woman1?.name} className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Frame 7 */}
                  <div className="flex gap-3">
                    <div className={`bento-tile bento-tile-animated w-[152px] h-[128px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.anime3?.name] ? `tile-${tileAnimations[tileOrder.anime3?.name]}` : ''} ${swappingTiles.includes('anime3') ? 'swapping' : ''}`} style={{ animationDelay: '1.4s' }}>
                      <BlurImage src={tileOrder.anime3?.image} alt={tileOrder.anime3?.name} className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[227px] h-[128px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations[tileOrder.shooting?.name] ? `tile-${tileAnimations[tileOrder.shooting?.name]}` : ''} ${swappingTiles.includes('shooting') ? 'swapping' : ''}`} style={{ animationDelay: '1.5s' }}>
                      <BlurImage src={tileOrder.shooting?.image} alt={tileOrder.shooting?.name} className="w-full h-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Flexing Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col gap-8"
          >
            <h2 className="font-space font-bold text-2xl leading-[1.36em] text-text-secondary" style={{ letterSpacing: '-0.24px' }}>
              Flexing
            </h2>

            {/* Carousel */}
            <div
              ref={flexingRef}
              onMouseEnter={() => setIsFlexingPaused(true)}
              onMouseLeave={() => {
                setIsFlexingPaused(false);
                handleFlexingMouseLeave();
              }}
              onMouseDown={handleFlexingMouseDown}
              onMouseMove={handleFlexingMouseMove}
              onMouseUp={handleFlexingMouseUp}
              className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide cursor-grab select-none"
            >
              {/* Duplicate images for seamless loop */}
              {[...flexingImages, ...flexingImages].map((img, index) => (
                <BlurImage
                  key={index}
                  src={img}
                  alt={`Flexing ${(index % flexingImages.length) + 1}`}
                  className="flex-shrink-0 h-[300px] rounded-lg"
                  style={{ width: index % flexingImages.length === 1 ? '169px' : '380px' }}
                />
              ))}
            </div>
          </motion.section>

          {/* My Book Shelf Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col gap-8"
          >
            <h2 className="font-space font-bold text-2xl leading-[1.36em] text-text-secondary" style={{ letterSpacing: '-0.24px' }}>
              My Book Shelf
            </h2>

            {/* Carousel */}
            <div
              ref={bookRef}
              onMouseEnter={() => setIsBookPaused(true)}
              onMouseLeave={() => {
                setIsBookPaused(false);
                handleBookMouseLeave();
              }}
              onMouseDown={handleBookMouseDown}
              onMouseMove={handleBookMouseMove}
              onMouseUp={handleBookMouseUp}
              className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide cursor-grab select-none"
            >
              {/* Duplicate images for seamless loop */}
              {[...bookImages, ...bookImages].map((img, index) => (
                <BlurImage
                  key={index}
                  src={img}
                  alt={`Book ${(index % bookImages.length) + 1}`}
                  className="flex-shrink-0 w-[165px] h-[254px] rounded-lg"
                />
              ))}
            </div>
          </motion.section>

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col gap-6 mt-8"
          >
            {/* Row 1 */}
            <div className="flex items-center gap-3">
              <p className="font-space font-bold text-lg leading-[1.36em] text-light" style={{ letterSpacing: '-0.18px' }}>
                Hope you found my place interesting.
              </p>
              <a
                href="https://www.yourworldoftext.com/archisapien"
                target="_blank"
                rel="noopener noreferrer"
                className="font-roboto-sans text-base leading-[1.17em] text-light underline hover:text-text-secondary transition-colors"
                style={{ letterSpacing: '-0.32px' }}
                onClick={() => trackExternalLink('Your World of Text')}
              >
                Leave some thoughts anonymously
              </a>
            </div>

            {/* Row 2 */}
            <div className="flex items-center gap-3">
              <p className="font-space font-bold text-lg leading-[1.36em] text-light" style={{ letterSpacing: '-0.18px' }}>
                Want to Connect
              </p>
              <button
                className="font-roboto-sans text-base leading-[1.17em] text-light underline hover:text-text-secondary transition-colors"
                style={{ letterSpacing: '-0.32px' }}
                onClick={handleCopyEmail}
              >
                Copy Email
              </button>
            </div>

            {/* Row 3 */}
            <div className="flex gap-6">
              <a
                href="https://www.linkedin.com/in/amiteshdebnath"
                target="_blank"
                rel="noopener noreferrer"
                className="font-space font-bold text-lg leading-[1.36em] text-text-secondary hover:text-light transition-colors"
                style={{ letterSpacing: '-0.18px' }}
                onClick={() => trackExternalLink('LinkedIn')}
              >
                Linkedin
              </a>
            </div>
          </motion.footer>
        </div>

        {/* Bottom Footer */}
        <footer className="text-center mt-16">
          <p className="font-outfit text-base leading-[1.34em] text-text-quaternary" style={{ letterSpacing: '-0.32px' }}>
            © 2025 Made with ❤️ by Amitesh using Claude code and Figma MCP
          </p>
        </footer>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-light text-dark px-6 py-3 rounded-lg shadow-lg z-50"
        >
          <p className="font-space font-bold text-base">Email copied!</p>
        </motion.div>
      )}
    </motion.main>
  );
};

export default About;
