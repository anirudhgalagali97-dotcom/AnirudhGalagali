import * as THREE from "three";
import { HERO_CONFIG } from "./config";
import type { SharedUniforms } from "./HeroBackground";
import { LEFT_FADE_GLSL, type NodeNetwork } from "./NodeNetwork";

const P = HERO_CONFIG.pulses;

type Pulse = {
  path: number[]; // node indices from an outer node to the core
  s: number; // position along the path, in edges
  dir: 1 | -1; // 1 = toward the core, -1 = back out
  speed: number;
  wait: number; // seconds before it (re)starts
};

/*
  Requests travelling through the network: bright heads with short fading
  trails that run inward along the path tree to the core, and sometimes back.
  All pulses and their trails are one Points object updated in a single loop.
*/
export class DataPulses {
  readonly object: THREE.Points;
  private pulses: Pulse[] = [];
  private positions: Float32Array;
  private alpha: Float32Array;
  private geo = new THREE.BufferGeometry();
  private samples = P.trail + 1;
  private outer: number[];
  private rand = Math.random;

  constructor(
    shared: SharedUniforms,
    accent: THREE.Color,
    private network: NodeNetwork,
    mobile: boolean,
    private onArrive: () => void
  ) {
    const count = mobile ? P.count.mobile : P.count.desktop;
    this.positions = new Float32Array(count * this.samples * 3);
    this.alpha = new Float32Array(count * this.samples);
    const head = new Float32Array(count * this.samples);
    for (let p = 0; p < count; p++) {
      for (let k = 0; k < this.samples; k++) head[p * this.samples + k] = 1 - k / this.samples;
    }
    // Pulses start on the middle and outer shells, so they have somewhere to travel.
    this.outer = [...Array(network.count).keys()].filter((i) => network.radial[i] > 0.38);
    for (let p = 0; p < count; p++) {
      const pulse: Pulse = { path: [], s: 0, dir: 1, speed: 0, wait: 0 };
      this.respawn(pulse);
      pulse.wait = this.rand() * 2.5; // stagger the first wave
      this.pulses.push(pulse);
    }

    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aHead", new THREE.BufferAttribute(head, 1));
    this.object = new THREE.Points(
      this.geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uIntro: shared.uIntro,
          uDim: shared.uDim,
          uPixel: shared.uPixel,
          uLeft: shared.uLeftFade,
          uAccent: { value: accent },
          uHighlight: { value: new THREE.Color(HERO_CONFIG.colors.highlight) },
        },
        vertexShader: /* glsl */ `
          attribute float aAlpha;  // 0 when the pulse is idle
          attribute float aHead;   // 1 at the head, falling along the trail
          uniform float uIntro;
          uniform float uPixel;
          uniform float uLeft;
          varying float vAlpha;
          varying float vHead;
          ${LEFT_FADE_GLSL}
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (0.6 + aHead * 1.6) * uPixel * 30.0 / -mv.z;
            // Pulses start once the network has drawn in.
            float on = smoothstep(1.25, 1.6, uIntro);
            vAlpha = aAlpha * aHead * aHead * on * leftFade(gl_Position.xy / gl_Position.w, uLeft);
            vHead = aHead;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uDim;
          uniform vec3 uAccent;
          uniform vec3 uHighlight;
          varying float vAlpha;
          varying float vHead;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            float a = exp(-d * d * 4.0);
            // Warm-white head fading into an accent-coloured trail.
            vec3 col = mix(uAccent * 1.3, uHighlight * 1.8, smoothstep(0.75, 1.0, vHead));
            gl_FragColor = vec4(col * a * vAlpha * uDim, 1.0);
          }`,
      })
    );
    this.object.frustumCulled = false;
  }

  private respawn(p: Pulse) {
    const start = this.outer[Math.floor(this.rand() * this.outer.length)];
    const path = [start];
    for (let n = start; n !== this.network.coreIndex; ) {
      n = this.network.parent[n];
      if (n < 0) break;
      path.push(n);
    }
    p.path = path;
    p.dir = 1;
    p.s = 0;
    p.speed = P.speed * (0.7 + this.rand() * 0.6);
    p.wait = 0.2 + this.rand() * 1.2;
  }

  // Position at parameter s (in edges) along a path, from the network's live positions.
  private sample(path: number[], s: number, out: Float32Array, o: number) {
    const last = path.length - 1;
    const c = Math.min(Math.max(s, 0), last);
    const i = Math.min(Math.floor(c), last - 1);
    const f = c - i;
    const pos = this.network.positions;
    const a = path[i] * 3, b = path[Math.min(i + 1, last)] * 3;
    out[o] = pos[a] + (pos[b] - pos[a]) * f;
    out[o + 1] = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * f;
    out[o + 2] = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * f;
  }

  update(dt: number, speedBoost: number) {
    const n = this.samples;
    this.pulses.forEach((p, idx) => {
      const base = idx * n;
      if (p.wait > 0) {
        p.wait -= dt;
        for (let k = 0; k < n; k++) this.alpha[base + k] = 0;
        return;
      }
      const len = p.path.length - 1;
      p.s += p.dir * p.speed * speedBoost * dt;
      if (p.dir === 1 && p.s >= len) {
        this.onArrive();
        // About half of the requests return a response outward.
        if (this.rand() < 0.5) {
          p.dir = -1;
          p.s = len;
        } else this.respawn(p);
      } else if (p.dir === -1 && p.s <= 0) {
        this.respawn(p);
      }
      for (let k = 0; k < n; k++) {
        this.sample(p.path, p.s - p.dir * k * P.trailSpacing, this.positions, (base + k) * 3);
        this.alpha[base + k] = p.wait > 0 ? 0 : 1;
      }
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
