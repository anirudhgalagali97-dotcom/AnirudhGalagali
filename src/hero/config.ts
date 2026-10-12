/*
  Neural Core: every tunable value for the hero background lives here.
  Colours are CSS strings. The accent is read from the page's --accent
  variable at runtime; ACCENT_FALLBACK is only used if that is missing.
*/
export const HERO_CONFIG = {
  colors: {
    accentVar: "--accent",
    accentFallback: "#E8452C",
    bgTop: "#120D0B", // background gradient, lighter at the top
    bgBottom: "#0B0908",
    secondary: "#3A302C", // inactive lines and nodes
    highlight: "#F3E6DC", // pulse heads and the brightest nodes
  },

  // Where the core sits, as a fraction of the viewport (0,0 = top left).
  corePosition: { desktop: { x: 0.68, y: 0.38 }, mobile: { x: 0.5, y: 0.2 } },
  mobileBreakpoint: 768,
  mobileCoreOpacity: 0.42,

  camera: { fov: 40, distance: 16, parallax: 0.3, scrollPullBack: 6 },

  core: {
    radius: 1.2,
    breathSeconds: 4, // one full breath
    breathAmount: 0.18, // how much the emissive intensity swings
    flashPerPulse: 0.22, // brightness added when a pulse arrives
    hoverBoost: 0.35, // brightness added while the pointer is over the core
    haloSize: 7.5,
    haloStrength: 0.38,
    rings: [
      { radius: 1.75, tilt: [1.15, 0.2], speed: 0.09, opacity: 0.22 },
      { radius: 2.2, tilt: [-0.55, 0.9], speed: -0.06, opacity: 0.14 },
    ],
  },

  network: {
    nodes: { desktop: 160, mobile: 70 },
    shells: [2.4, 3.5, 4.7], // radii of the loose spherical shells
    shellJitter: 0.55,
    outliers: 0.08, // share of nodes that drift further out
    outlierRange: [5.6, 7.0],
    hubShare: 0.1, // share of nodes that are larger, brighter hubs
    neighbours: [2, 3], // each node links to 2 or 3 nearest neighbours
    rotationSeconds: 105, // one full turn of the whole network
    drift: 0.12, // how far each node wanders
    scrollExpand: 0.4, // extra scale as the hero scrolls away
    lineOpacityNear: 0.36,
    lineOpacityFar: 0.035,
  },

  pulses: {
    count: { desktop: 34, mobile: 16 },
    speed: 1.6, // edges per second
    hoverSpeedBoost: 1.8,
    trail: 6, // trail samples behind each head
    trailSpacing: 0.07, // in edges
  },

  dust: { count: { desktop: 400, mobile: 180 }, spread: [34, 22, 18], speed: 0.06 },

  bloom: { strength: 0.75, radius: 0.55, threshold: 0.78 },

  dpr: { desktop: 1.5, mobile: 1.25 },

  intro: { seconds: 1.6 },
} as const;

export type HeroConfig = typeof HERO_CONFIG;
