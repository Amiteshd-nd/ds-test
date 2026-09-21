import { motion, useReducedMotion } from '@cloud-march/motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import BlurImage from '../components/BlurImage';
import useDragCarousel from '../hooks/useDragCarousel';
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

const INITIAL_TILES = {
  anime1: interestsAnime1,
  festival: interestsFestival,
  jeep: interestsJeep,
  pingpong: interestsPingpong,
  chess: interestsChess,
  suit: interestsSuit,
  woman1: interestsWoman1,
  beach1: interestsBeach1,
  beach2: interestsBeach2,
  food: interestsFood,
  woman2: interestsWoman2,
  anime2: interestsAnime2,
  shooting: interestsShooting,
  tv: interestsTv,
  anime3: interestsAnime3,
};

const TILE_KEYS = Object.keys(INITIAL_TILES);

/* Taller than they are wide, so they can only trade places with each other
   without the grid reflowing. */
const PORTRAIT_TILES = ['anime1', 'chess', 'suit', 'woman1', 'woman2', 'tv'];
const LANDSCAPE_TILES = TILE_KEYS.filter((k) => !PORTRAIT_TILES.includes(k));
const TILE_ANIMATIONS = ['flip', 'bounce', 'rotate', 'slide'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* Two distinct members of a list. The old version looped `while (b === a)`,
   which never terminates on a single-element list. */
function pickPair(list) {
  if (list.length < 2) return null;
  const a = pick(list);
  const rest = list.filter((k) => k !== a);
  return [a, pick(rest)];
}

const About = () => {
  const flexingImages = [flexing1, flexing2, flexing3, flexing4, flexing5, flexing6];
  const bookImages = [book1, book2, book3, book4, book5, book6, book7];

  /* Both carousels now come from one hook. This used to be twelve useState and
     useRef declarations plus two copies of ~150 lines of drag, momentum and
     auto-scroll logic, which had already drifted apart. */
  const flexing = useDragCarousel({ direction: 1 });
  const books = useDragCarousel({ direction: -1 });

  // Toast state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimer = useRef(null);

  const setToast = useCallback((message) => {
    setToastMessage(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* The clipboard write can reject: no clipboard on an insecure origin, an
     unfocused document, a denied permission. The old version showed "Email
     copied!" regardless, so a visitor was told it worked, pasted nothing, and
     had no other way to reach the address. */
  const handleCopyEmail = useCallback(async () => {
    const address = 'amiteshdebnath98@gmail.com';

    try {
      await navigator.clipboard.writeText(address);
      setToast('Email copied!');
      trackEmailCopy();
    } catch {
      setToast(address);
    }
  }, [setToast]);

  // State for dynamic tile animations
  const [tileAnimations, setTileAnimations] = useState({});
  const [swappingTiles, setSwappingTiles] = useState([]);

  /* Slot key to image. It used to be { image, name } where `name` always
     repeated the key it was filed under, and the render then looked animations
     up by `name` while looking the fade up by the key. Once content swaps
     between slots those two stop agreeing, so the flip landed on a different
     tile than the fade. One key, used everywhere. */
  const [tileOrder, setTileOrder] = useState(INITIAL_TILES);

  /*
   * The tile shuffle.
   *
   * Previously this listed `tileOrder` as a dependency while its own callback
   * replaced `tileOrder`, so every swap tore down and rebuilt the interval and
   * the cadence drifted: 5s, then 5.3s, then 10.6s. The slot keys never change,
   * so the effect needs no dependencies at all and the timer keeps a fixed beat.
   *
   * Its three nested timeouts also held no handles, so leaving the page
   * mid-swap left callbacks firing into an unmounted component. They are
   * tracked and cleared now, along with the interval.
   */
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return undefined;

    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    const shuffle = () => {
      /* Two or three tiles get an animation. The old loop could return fewer
         than it asked for, because a duplicate draw was skipped rather than
         retried; drawing from a shuffled copy cannot repeat. */
      const count = 2 + Math.floor(Math.random() * 2);
      const shuffled = [...TILE_KEYS].sort(() => Math.random() - 0.5);
      setTileAnimations(
        Object.fromEntries(shuffled.slice(0, count).map((key) => [key, pick(TILE_ANIMATIONS)])),
      );

      /* Portrait tiles only trade with portrait tiles, so the grid holds. */
      const pair = pickPair(Math.random() > 0.5 ? PORTRAIT_TILES : LANDSCAPE_TILES);
      if (!pair) return;
      const [a, b] = pair;

      setSwappingTiles(pair);

      later(() => {
        setTileOrder((prev) => ({ ...prev, [a]: prev[b], [b]: prev[a] }));
        later(() => setSwappingTiles([]), 50);
      }, 300);

      later(() => setTileAnimations({}), 1000);
    };

    const interval = setInterval(shuffle, 5000);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [reducedMotion]);

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
                      <div className={`bento-tile bento-tile-animated w-[187px] h-[248px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.anime1 ? `tile-${tileAnimations.anime1}` : ''} ${swappingTiles.includes('anime1') ? 'swapping' : ''}`} style={{ animationDelay: '0.1s' }}>
                        <BlurImage src={tileOrder.anime1} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated flex-1 h-[248px] rounded-lg overflow-hidden ${tileAnimations.festival ? `tile-${tileAnimations.festival}` : ''} ${swappingTiles.includes('festival') ? 'swapping' : ''}`} style={{ animationDelay: '0.2s' }}>
                        <BlurImage src={tileOrder.festival} alt="" className="w-full h-full" />
                      </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-3 w-[320px]">
                        <div className={`bento-tile bento-tile-animated w-full h-[205px] rounded-lg overflow-hidden ${tileAnimations.jeep ? `tile-${tileAnimations.jeep}` : ''} ${swappingTiles.includes('jeep') ? 'swapping' : ''}`} style={{ animationDelay: '0.3s' }}>
                          <BlurImage src={tileOrder.jeep} alt="" className="w-full h-full" />
                        </div>
                        <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[184px] rounded-lg overflow-hidden ${tileAnimations.pingpong ? `tile-${tileAnimations.pingpong}` : ''} ${swappingTiles.includes('pingpong') ? 'swapping' : ''}`} style={{ animationDelay: '0.4s' }}>
                          <BlurImage src={tileOrder.pingpong} alt="" className="w-full h-full" />
                        </div>
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[198px] h-[401px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.chess ? `tile-${tileAnimations.chess}` : ''} ${swappingTiles.includes('chess') ? 'swapping' : ''}`} style={{ animationDelay: '0.5s' }}>
                        <BlurImage src={tileOrder.chess} alt="" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-3 w-[218px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[327px] rounded-lg overflow-hidden ${tileAnimations.suit ? `tile-${tileAnimations.suit}` : ''} ${swappingTiles.includes('suit') ? 'swapping' : ''}`} style={{ animationDelay: '0.6s' }}>
                      <BlurImage src={tileOrder.suit} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[322px] rounded-lg overflow-hidden ${tileAnimations.woman1 ? `tile-${tileAnimations.woman1}` : ''} ${swappingTiles.includes('woman1') ? 'swapping' : ''}`} style={{ animationDelay: '0.7s' }}>
                      <BlurImage src={tileOrder.woman1} alt="" className="w-full h-full" />
                    </div>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="flex gap-3">
                  {/* Left Column */}
                  <div className="flex flex-col gap-3 w-[462px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[260px] rounded-lg overflow-hidden ${tileAnimations.beach1 ? `tile-${tileAnimations.beach1}` : ''} ${swappingTiles.includes('beach1') ? 'swapping' : ''}`} style={{ animationDelay: '0.8s' }}>
                      <BlurImage src={tileOrder.beach1} alt="" className="w-full h-full" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-3 w-[163px]">
                        <div className={`bento-tile bento-tile-animated w-full h-[107px] rounded-lg overflow-hidden ${tileAnimations.beach2 ? `tile-${tileAnimations.beach2}` : ''} ${swappingTiles.includes('beach2') ? 'swapping' : ''}`} style={{ animationDelay: '0.9s' }}>
                          <BlurImage src={tileOrder.beach2} alt="" className="w-full h-full" />
                        </div>
                        <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[168px] rounded-lg overflow-hidden ${tileAnimations.food ? `tile-${tileAnimations.food}` : ''} ${swappingTiles.includes('food') ? 'swapping' : ''}`} style={{ animationDelay: '1s' }}>
                          <BlurImage src={tileOrder.food} alt="" className="w-full h-full" />
                        </div>
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[287px] h-[287px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.woman2 ? `tile-${tileAnimations.woman2}` : ''} ${swappingTiles.includes('woman2') ? 'swapping' : ''}`} style={{ animationDelay: '1.1s' }}>
                        <BlurImage src={tileOrder.woman2} alt="" className="w-full h-full" />
                      </div>
                    </div>
                    <div className={`bento-tile bento-tile-animated w-full h-[259px] rounded-lg overflow-hidden ${tileAnimations.anime2 ? `tile-${tileAnimations.anime2}` : ''} ${swappingTiles.includes('anime2') ? 'swapping' : ''}`} style={{ animationDelay: '1.2s' }}>
                      <BlurImage src={tileOrder.anime2} alt="" className="w-full h-full" />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-3 w-[286px]">
                    <div className={`bento-tile bento-tile-animated w-full h-[161px] rounded-lg overflow-hidden ${tileAnimations.shooting ? `tile-${tileAnimations.shooting}` : ''} ${swappingTiles.includes('shooting') ? 'swapping' : ''}`} style={{ animationDelay: '1.3s' }}>
                      <BlurImage src={tileOrder.shooting} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated bento-tile-pulse w-full h-[430px] rounded-lg overflow-hidden ${tileAnimations.tv ? `tile-${tileAnimations.tv}` : ''} ${swappingTiles.includes('tv') ? 'swapping' : ''}`} style={{ animationDelay: '1.4s' }}>
                      <BlurImage src={tileOrder.tv} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-full h-[215px] rounded-lg overflow-hidden ${tileAnimations.anime3 ? `tile-${tileAnimations.anime3}` : ''} ${swappingTiles.includes('anime3') ? 'swapping' : ''}`} style={{ animationDelay: '1.5s' }}>
                      <BlurImage src={tileOrder.anime3} alt="" className="w-full h-full" />
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
                    <div className={`bento-tile bento-tile-animated w-[137px] h-[182px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.anime1 ? `tile-${tileAnimations.anime1}` : ''} ${swappingTiles.includes('anime1') ? 'swapping' : ''}`} style={{ animationDelay: '0.1s' }}>
                      <BlurImage src={tileOrder.anime1} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[241px] h-[182px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.festival ? `tile-${tileAnimations.festival}` : ''} ${swappingTiles.includes('festival') ? 'swapping' : ''}`} style={{ animationDelay: '0.2s' }}>
                      <BlurImage src={tileOrder.festival} alt="" className="w-full h-full" />
                    </div>
                  </div>

                  {/* Frame 8 */}
                  <div className="flex gap-3">
                    {/* Frame 2 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[216px] h-[121px] rounded-lg overflow-hidden ${tileAnimations.beach1 ? `tile-${tileAnimations.beach1}` : ''} ${swappingTiles.includes('beach1') ? 'swapping' : ''}`} style={{ animationDelay: '0.3s' }}>
                        <BlurImage src={tileOrder.beach1} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[216px] h-[325px] rounded-lg overflow-hidden ${tileAnimations.tv ? `tile-${tileAnimations.tv}` : ''} ${swappingTiles.includes('tv') ? 'swapping' : ''}`} style={{ animationDelay: '0.4s' }}>
                        <BlurImage src={tileOrder.tv} alt="" className="w-full h-full" />
                      </div>
                    </div>
                    {/* Frame 3 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[162px] h-[283px] rounded-lg overflow-hidden ${tileAnimations.chess ? `tile-${tileAnimations.chess}` : ''} ${swappingTiles.includes('chess') ? 'swapping' : ''}`} style={{ animationDelay: '0.5s' }}>
                        <BlurImage src={tileOrder.chess} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[162px] h-[163px] rounded-lg overflow-hidden ${tileAnimations.suit ? `tile-${tileAnimations.suit}` : ''} ${swappingTiles.includes('suit') ? 'swapping' : ''}`} style={{ animationDelay: '0.6s' }}>
                        <BlurImage src={tileOrder.suit} alt="" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Frame 4 */}
                  <div className="flex gap-3">
                    <div className={`bento-tile bento-tile-animated w-[147px] h-[148px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.woman2 ? `tile-${tileAnimations.woman2}` : ''} ${swappingTiles.includes('woman2') ? 'swapping' : ''}`} style={{ animationDelay: '0.7s' }}>
                      <BlurImage src={tileOrder.woman2} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[231px] h-[148px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.jeep ? `tile-${tileAnimations.jeep}` : ''} ${swappingTiles.includes('jeep') ? 'swapping' : ''}`} style={{ animationDelay: '0.8s' }}>
                      <BlurImage src={tileOrder.jeep} alt="" className="w-full h-full" />
                    </div>
                  </div>

                  {/* Frame 9 */}
                  <div className="flex gap-3">
                    {/* Frame 5 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[130px] rounded-lg overflow-hidden ${tileAnimations.pingpong ? `tile-${tileAnimations.pingpong}` : ''} ${swappingTiles.includes('pingpong') ? 'swapping' : ''}`} style={{ animationDelay: '0.9s' }}>
                        <BlurImage src={tileOrder.pingpong} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[110px] rounded-lg overflow-hidden ${tileAnimations.beach2 ? `tile-${tileAnimations.beach2}` : ''} ${swappingTiles.includes('beach2') ? 'swapping' : ''}`} style={{ animationDelay: '1s' }}>
                        <BlurImage src={tileOrder.beach2} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[226px] h-[127px] rounded-lg overflow-hidden ${tileAnimations.anime2 ? `tile-${tileAnimations.anime2}` : ''} ${swappingTiles.includes('anime2') ? 'swapping' : ''}`} style={{ animationDelay: '1.1s' }}>
                        <BlurImage src={tileOrder.anime2} alt="" className="w-full h-full" />
                      </div>
                    </div>
                    {/* Frame 6 */}
                    <div className="flex flex-col gap-3">
                      <div className={`bento-tile bento-tile-animated w-[152px] h-[156px] rounded-lg overflow-hidden ${tileAnimations.food ? `tile-${tileAnimations.food}` : ''} ${swappingTiles.includes('food') ? 'swapping' : ''}`} style={{ animationDelay: '1.2s' }}>
                        <BlurImage src={tileOrder.food} alt="" className="w-full h-full" />
                      </div>
                      <div className={`bento-tile bento-tile-animated w-[152px] h-[223px] rounded-lg overflow-hidden ${tileAnimations.woman1 ? `tile-${tileAnimations.woman1}` : ''} ${swappingTiles.includes('woman1') ? 'swapping' : ''}`} style={{ animationDelay: '1.3s' }}>
                        <BlurImage src={tileOrder.woman1} alt="" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Frame 7 */}
                  <div className="flex gap-3">
                    <div className={`bento-tile bento-tile-animated w-[152px] h-[128px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.anime3 ? `tile-${tileAnimations.anime3}` : ''} ${swappingTiles.includes('anime3') ? 'swapping' : ''}`} style={{ animationDelay: '1.4s' }}>
                      <BlurImage src={tileOrder.anime3} alt="" className="w-full h-full" />
                    </div>
                    <div className={`bento-tile bento-tile-animated w-[227px] h-[128px] rounded-lg overflow-hidden flex-shrink-0 ${tileAnimations.shooting ? `tile-${tileAnimations.shooting}` : ''} ${swappingTiles.includes('shooting') ? 'swapping' : ''}`} style={{ animationDelay: '1.5s' }}>
                      <BlurImage src={tileOrder.shooting} alt="" className="w-full h-full" />
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
              ref={flexing.ref}
              {...flexing.handlers}
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
              ref={books.ref}
              {...books.handlers}
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
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50"
          style={{ background: 'var(--site-fg)', color: 'var(--site-bg)' }}
        >
          <p className="font-space font-bold text-base">
            {toastMessage === 'Email copied!' ? toastMessage : `Copy failed. ${toastMessage}`}
          </p>
        </motion.div>
      )}
    </motion.main>
  );
};

export default About;
