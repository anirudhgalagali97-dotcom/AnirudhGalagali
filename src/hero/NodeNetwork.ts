import * as THREE from "three";
import { HERO_CONFIG } from "./config";
import type { SharedUniforms } from "./HeroBackground";

const N = HERO_CONFIG.network;

// Deterministic random, so the network is the same on every load.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Keeps the text column (left) and the navbar strip (top) calm.
export const LEFT_FADE_GLSL = /* glsl */ `
  // ndc: -1..1 across the screen. On desktop nothing shows left of ~40% of the
  // width (full from ~62%), and everything fades out under the navbar.
  float leftFade(vec2 ndc, float strength) {
    float left = smoothstep(-0.2, 0.24, ndc.x);
    float top = 1.0 - smoothstep(0.72, 0.9, ndc.y);
    return mix(1.0, left * top, strength);
  }
`;

/*
  Nodes in loose spherical shells around the core, linked to their nearest
  neighbours. Links are computed once; per frame only positions drift.
  Index `count` is the core itself (fixed at the origin).
*/
export class NodeNetwork {
  readonly object = new THREE.Group();
  readonly count: number;
  readonly coreIndex: number;
  /** Current positions in network space, (count + 1) * 3, last entry is the core. */
  readonly positions: Float32Array;
  /** Next node on the shortest path to the core, per node. */
  readonly parent: Int32Array;
  /** Normalised distance from the core, 0 (inner) to 1 (outer), per node. */
  readonly radial: Float32Array;

  private base: Float32Array;
  private driftPhase: Float32Array;
  private edges: Uint16Array;
  private pointGeo = new THREE.BufferGeometry();
  private lineGeo = new THREE.BufferGeometry();
  private linePositions: Float32Array;

  constructor(shared: SharedUniforms, accent: THREE.Color, mobile: boolean) {
    const rand = rng(7);
    const count = mobile ? N.nodes.mobile : N.nodes.desktop;
    this.count = count;
    this.coreIndex = count;
    this.base = new Float32Array((count + 1) * 3);
    this.positions = new Float32Array((count + 1) * 3);
    this.radial = new Float32Array(count);
    this.driftPhase = new Float32Array(count * 3);
    this.parent = new Int32Array(count).fill(-1);

    // 1. Positions: Fibonacci spheres per shell with jitter, plus a few outliers.
    const outliers = Math.round(count * N.outliers);
    const perShell = Math.floor((count - outliers) / N.shells.length);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let i = 0;
    const put = (x: number, y: number, z: number) => {
      this.base.set([x, y, z], i * 3);
      i++;
    };
    N.shells.forEach((radius, s) => {
      const n = s === N.shells.length - 1 ? count - outliers - perShell * s : perShell;
      for (let k = 0; k < n; k++) {
        const y = 1 - ((k + 0.5) / n) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = k * golden + rand() * 0.6;
        const rad = radius + (rand() - 0.5) * 2 * N.shellJitter;
        put(Math.cos(theta) * r * rad, y * rad * 0.82, Math.sin(theta) * r * rad);
      }
    });
    while (i < count) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const rad = N.outlierRange[0] + rand() * (N.outlierRange[1] - N.outlierRange[0]);
      put(Math.cos(a) * r * rad, u * rad * 0.7, Math.sin(a) * r * rad);
    }
    const maxR = N.outlierRange[1];
    for (let k = 0; k < count; k++) {
      this.radial[k] = Math.hypot(this.base[k * 3], this.base[k * 3 + 1], this.base[k * 3 + 2]) / maxR;
      this.driftPhase[k * 3] = rand() * 100;
      this.driftPhase[k * 3 + 1] = rand() * 100;
      this.driftPhase[k * 3 + 2] = rand() * 100;
    }
    this.positions.set(this.base);

    // 2. Hubs: about 10% of nodes, biased toward the inner shells.
    const hub = new Uint8Array(count);
    const byRadius = [...Array(count).keys()].sort((a, b) => this.radial[a] - this.radial[b]);
    const hubCount = Math.round(count * N.hubShare);
    for (let k = 0, picked = 0; picked < hubCount && k < count; k++) {
      if (rand() < 0.35 || count - k <= hubCount - picked) {
        hub[byRadius[k]] = 1;
        picked++;
      }
    }

    // 3. Links: 2-3 nearest neighbours per node, plus every hub to the core.
    const dist = (a: number, b: number) =>
      Math.hypot(this.base[a * 3] - this.base[b * 3], this.base[a * 3 + 1] - this.base[b * 3 + 1], this.base[a * 3 + 2] - this.base[b * 3 + 2]);
    const pairs = new Set<number>();
    const key = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a);
    for (let a = 0; a < count; a++) {
      const k = N.neighbours[0] + (rand() < 0.5 ? 0 : N.neighbours[1] - N.neighbours[0]);
      const near = [...Array(count).keys()].filter((b) => b !== a).sort((x, y) => dist(a, x) - dist(a, y));
      for (let j = 0; j < k; j++) pairs.add(key(a, near[j]));
      if (hub[a]) pairs.add(key(a, this.coreIndex));
    }

    // 4. Make sure every node can reach the core, then record the path tree.
    const adjacency: number[][] = Array.from({ length: count + 1 }, () => []);
    const link = (a: number, b: number) => {
      adjacency[a].push(b);
      adjacency[b].push(a);
    };
    for (const p of pairs) link(Math.floor(p / 4096), p % 4096);
    const reached = new Uint8Array(count + 1);
    const bfs = () => {
      reached.fill(0);
      reached[this.coreIndex] = 1;
      const queue = [this.coreIndex];
      while (queue.length) {
        const a = queue.shift()!;
        for (const b of adjacency[a]) {
          if (reached[b]) continue;
          reached[b] = 1;
          if (b < count) this.parent[b] = a;
          queue.push(b);
        }
      }
    };
    bfs();
    for (let a = 0; a < count; a++) {
      if (reached[a]) continue;
      let best = this.coreIndex;
      let bestD = Infinity;
      for (let b = 0; b < count; b++) {
        if (reached[b] && dist(a, b) < bestD) {
          bestD = dist(a, b);
          best = b;
        }
      }
      pairs.add(key(a, best));
      link(a, best);
      bfs();
    }
    this.edges = new Uint16Array(pairs.size * 2);
    let e = 0;
    for (const p of pairs) {
      this.edges[e++] = Math.floor(p / 4096);
      this.edges[e++] = p % 4096;
    }

    // 5. Nodes: one Points draw call.
    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      size[k] = hub[k] ? 2.2 + rand() * 0.8 : 0.8 + rand() * 0.7;
      seed[k] = rand();
    }
    this.pointGeo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointGeo.setDrawRange(0, count);
    this.pointGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    this.pointGeo.setAttribute("aHub", new THREE.BufferAttribute(Float32Array.from(hub), 1));
    this.pointGeo.setAttribute("aRadial", new THREE.BufferAttribute(this.radial, 1));
    this.pointGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const points = new THREE.Points(
      this.pointGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: shared.uTime,
          uIntro: shared.uIntro,
          uDim: shared.uDim,
          uPixel: shared.uPixel,
          uLeft: shared.uLeftFade,
          uAccent: { value: accent },
          uSecondary: { value: new THREE.Color(HERO_CONFIG.colors.secondary) },
          uHighlight: { value: new THREE.Color(HERO_CONFIG.colors.highlight) },
        },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aHub;
          attribute float aRadial;
          attribute float aSeed;
          uniform float uTime;
          uniform float uIntro;
          uniform float uPixel;
          uniform float uLeft;
          varying float vHub;
          varying float vAlpha;
          varying float vNear;
          ${LEFT_FADE_GLSL}
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixel * 34.0 / -mv.z;

            // Intro: nodes appear outward in waves (inner shells first).
            float delay = 0.35 + aRadial * 0.55;
            float appear = smoothstep(delay, delay + 0.3, uIntro);
            // Gentle twinkle so idle nodes are never frozen.
            float twinkle = 0.85 + 0.15 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
            // Sparser and dimmer toward the edges.
            float edge = 1.0 - smoothstep(0.55, 1.0, aRadial) * 0.6;
            vAlpha = appear * twinkle * edge * leftFade(gl_Position.xy / gl_Position.w, uLeft);
            vHub = aHub;
            vNear = 1.0 - aRadial;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uDim;
          uniform vec3 uAccent;
          uniform vec3 uSecondary;
          uniform vec3 uHighlight;
          varying float vHub;
          varying float vAlpha;
          varying float vNear;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            float body = smoothstep(1.0, 0.55, d);
            float glow = exp(-d * 3.0);
            // Regular nodes: dim warm grey, warming toward the core.
            vec3 regular = mix(uSecondary * 2.4, uAccent * 0.75, vNear * 0.55) * body;
            // Hubs: accent glow with a warm-white centre bright enough to bloom.
            vec3 hubCol = uAccent * glow * 1.4 + uHighlight * smoothstep(0.45, 0.0, d) * 1.3;
            vec3 col = mix(regular, hubCol, vHub);
            gl_FragColor = vec4(col * vAlpha * uDim, 1.0);
          }`,
      })
    );

    // 6. Links: one LineSegments draw call, opacity falls off with distance from the core.
    const segs = this.edges.length / 2;
    this.linePositions = new Float32Array(segs * 2 * 3);
    const lineAlpha = new Float32Array(segs * 2);
    const lineDelay = new Float32Array(segs * 2);
    for (let s = 0; s < segs; s++) {
      const a = this.edges[s * 2], b = this.edges[s * 2 + 1];
      const ra = a === this.coreIndex ? 0 : this.radial[a];
      const rb = b === this.coreIndex ? 0 : this.radial[b];
      const mid = (ra + rb) / 2;
      const alpha = THREE.MathUtils.lerp(N.lineOpacityNear, N.lineOpacityFar, THREE.MathUtils.smoothstep(mid, 0.2, 0.85));
      lineAlpha[s * 2] = lineAlpha[s * 2 + 1] = alpha;
      lineDelay[s * 2] = lineDelay[s * 2 + 1] = 0.7 + mid * 0.5;
    }
    this.lineGeo.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute("aAlpha", new THREE.BufferAttribute(lineAlpha, 1));
    this.lineGeo.setAttribute("aDelay", new THREE.BufferAttribute(lineDelay, 1));
    const lines = new THREE.LineSegments(
      this.lineGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uIntro: shared.uIntro,
          uDim: shared.uDim,
          uLeft: shared.uLeftFade,
          uAccent: { value: accent },
          uSecondary: { value: new THREE.Color(HERO_CONFIG.colors.secondary) },
        },
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          attribute float aDelay;
          uniform float uIntro;
          uniform float uLeft;
          varying float vAlpha;
          ${LEFT_FADE_GLSL}
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            // Intro: lines draw in after the nodes, inner links first.
            float appear = smoothstep(aDelay, aDelay + 0.3, uIntro);
            vAlpha = aAlpha * appear * leftFade(gl_Position.xy / gl_Position.w, uLeft);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uDim;
          uniform vec3 uAccent;
          uniform vec3 uSecondary;
          varying float vAlpha;
          void main() {
            // Brighter links (near the core) lean toward the accent.
            vec3 col = mix(uSecondary * 2.2, uAccent * 0.85, smoothstep(0.12, 0.36, vAlpha));
            gl_FragColor = vec4(col * vAlpha * uDim, 1.0);
          }`,
      })
    );
    this.object.add(lines, points);
    this.writeLines();
  }

  private writeLines() {
    const p = this.positions, out = this.linePositions;
    for (let e = 0; e < this.edges.length; e++) {
      const n = this.edges[e] * 3;
      out[e * 3] = p[n];
      out[e * 3 + 1] = p[n + 1];
      out[e * 3 + 2] = p[n + 2];
    }
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  update(time: number, dt: number, expand: number, animate: boolean) {
    this.object.scale.setScalar(expand);
    if (!animate) return;
    this.object.rotation.y += ((Math.PI * 2) / N.rotationSeconds) * dt;
    // Per-node drift from layered sines with random phases (cheap smooth noise).
    const d = N.drift, ph = this.driftPhase;
    for (let k = 0; k < this.count; k++) {
      const i = k * 3;
      this.positions[i] = this.base[i] + Math.sin(time * 0.31 + ph[i]) * d + Math.sin(time * 0.17 + ph[i + 1]) * d * 0.5;
      this.positions[i + 1] = this.base[i + 1] + Math.sin(time * 0.27 + ph[i + 1]) * d + Math.sin(time * 0.13 + ph[i + 2]) * d * 0.5;
      this.positions[i + 2] = this.base[i + 2] + Math.sin(time * 0.23 + ph[i + 2]) * d + Math.sin(time * 0.19 + ph[i]) * d * 0.5;
    }
    this.pointGeo.attributes.position.needsUpdate = true;
    this.writeLines();
  }
}
