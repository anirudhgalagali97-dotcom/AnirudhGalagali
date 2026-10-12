# Anirudh Galagali | Portfolio

Personal portfolio for Anirudh Galagali, AI engineer. A dark single page whose hero runs a live three.js scene, "Neural Core": a glowing AI core inside a living network of nodes, with data pulses travelling between them.

The page layout is loosely inspired by the [Kage landing page](https://threeui.com/landing-pages/kage-landing-page) from [ThreeUI](https://github.com/MengTo/threeui) (MIT, Meng To). The scene, layout and code here are original.

## Stack

- Vite + TypeScript, no framework
- three.js for the hero scene (loaded as a separate chunk), with bloom on desktop
- GSAP ScrollTrigger for the sticky project stack and scroll choreography, Lenis for smooth scrolling
- Geist and Geist Mono (self-hosted via Fontsource), Phosphor icons

## Develop

```bash
npm install
npm run dev        # local dev server
npm run typecheck
npm run build      # outputs to dist/
npm run preview    # serve the production build
```

## Edit content

- Page copy: `index.html`
- Contact details (email, LinkedIn, GitHub): `src/config.ts`
- Architecture diagrams for each project: `FLOWS` in `src/config.ts`
- Hero scene look (colours, node and pulse counts, speeds, bloom, core position): `src/hero/config.ts`
- Colors and type: CSS variables at the top of `src/style.css`

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Enable it once under **Settings > Pages > Build and deployment > Source: GitHub Actions**.

## Accessibility and performance

- Respects `prefers-reduced-motion`: no smooth scrolling, no scroll animations, and the hero scene renders one still frame.
- Falls back to a CSS glow when WebGL is unavailable.
- The hero scene only renders while the hero is on screen and the tab is visible; pixel ratio is capped (1.5 desktop, 1.25 mobile).
