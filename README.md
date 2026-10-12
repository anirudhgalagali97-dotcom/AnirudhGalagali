# Anirudh Galagali | Portfolio

Personal portfolio for Anirudh Galagali, AI engineer. A dark, cinematic single page with a live three.js scene: an avenue of pillars leading to a stacked "core" under a vermilion moon, with data pulses flowing toward it. The camera moves to a new view for each section as you scroll.

The scroll-chapter structure and the giant name sitting between two 3D layers are inspired by the [Kage landing page](https://threeui.com/landing-pages/kage-landing-page) from [ThreeUI](https://github.com/MengTo/threeui) (MIT, Meng To). The scene, layout and code here are original.

## Stack

- Vite + TypeScript, no framework
- three.js for the scene (loaded as a separate chunk)
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
- Camera views per section: `KEYS` in `src/main.ts`
- Colors and type: CSS variables at the top of `src/style.css`

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Enable it once under **Settings > Pages > Build and deployment > Source: GitHub Actions**.

## Accessibility and performance

- Respects `prefers-reduced-motion`: no smooth scrolling, no scroll animations, and the scene renders a still frame per section.
- Falls back to a CSS background when WebGL is unavailable.
- Rendering pauses when the tab is hidden; pixel ratio is capped on small screens.
