import * as THREE from "three";

/*
  The "system field": a night landscape of instanced pillars with an avenue that
  leads to a stacked core tower under a vermilion moon. Data pulses travel along
  the lanes toward the core. Inspired by the camera-per-chapter structure of the
  ThreeUI "Kage" landing page (MIT, Meng To), rebuilt from scratch for this site.

  Two renderers share one camera:
    back  - field, core, moon, pulses (behind the giant name)
    front - a few near pillars and drifting embers (in front of the giant name)
*/

export type CameraKey = { pos: [number, number, number]; look: [number, number, number] };

const BG = new THREE.Color("#07080a");
const ACCENT = new THREE.Color("#e2492f");
const WARM = new THREE.Color("#f0c48a");

// Smooth value noise, good enough for terrain heights.
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  return noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.12;
}

function makeRenderer(canvas: HTMLCanvasElement, dpr: number) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(dpr);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

export class SystemField {
  private back: THREE.WebGLRenderer;
  private front: THREE.WebGLRenderer;
  private backScene = new THREE.Scene();
  private frontScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private look = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private targetLook = new THREE.Vector3();
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private uniforms = { uTime: { value: 0 }, uPixel: { value: 1 } };
  private last = 0;
  private running = false;
  private raf = 0;
  private keys: CameraKey[];
  private reduced: boolean;

  constructor(backCanvas: HTMLCanvasElement, frontCanvas: HTMLCanvasElement, keys: CameraKey[], reduced: boolean) {
    this.keys = keys;
    this.reduced = reduced;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    this.uniforms.uPixel.value = dpr;
    this.back = makeRenderer(backCanvas, dpr);
    this.front = makeRenderer(frontCanvas, dpr);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    const k = keys[0];
    this.camera.position.set(...k.pos);
    this.look.set(...k.look);
    this.targetPos.copy(this.camera.position);
    this.targetLook.copy(this.look);

    this.backScene.background = null;
    this.backScene.fog = new THREE.FogExp2(BG, 0.02);
    this.frontScene.fog = new THREE.FogExp2(BG, 0.02);

    this.buildLights();
    this.buildField(small);
    this.buildCore();
    this.buildMoon();
    this.buildPulses(small);
    this.buildForeground();
    this.buildEmbers(small);

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private buildLights() {
    for (const scene of [this.backScene, this.frontScene]) {
      scene.add(new THREE.HemisphereLight(0x3a4152, 0x050506, 0.9));
      const moonLight = new THREE.DirectionalLight(0xff7a5c, 1.5);
      moonLight.position.set(30, 34, -110);
      scene.add(moonLight);
      const fill = new THREE.DirectionalLight(0x8090b0, 0.35);
      fill.position.set(-30, 20, 30);
      scene.add(fill);
    }
    const coreGlow = new THREE.PointLight(0xffb070, 60, 40, 1.6);
    coreGlow.position.set(0, 6, -40);
    this.backScene.add(coreGlow);
  }

  // Instanced pillars on a grid, low along the central avenue, lit caps on a few.
  private buildField(small: boolean) {
    const cols = small ? 46 : 64;
    const rows = small ? 50 : 66;
    const step = 1.25;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85, metalness: 0.15 });
    const mesh = new THREE.InstancedMesh(geo, mat, cols * rows);
    const capGeo = new THREE.BoxGeometry(1, 0.06, 1);
    const capMat = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.85 });
    const caps = new THREE.InstancedMesh(capGeo, capMat, cols * rows);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let n = 0, c = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i - cols / 2) * step;
        const z = 12 - j * step;
        const ax = Math.abs(x);
        // Keep the avenue and the plaza around the core clear.
        const plaza = Math.hypot(x, z + 42) < 9;
        if (ax < 2.6 || plaza) continue;
        const avenue = THREE.MathUtils.smoothstep(ax, 2.6, 16);
        const h = 0.25 + Math.pow(fbm(x * 0.06 + 3, z * 0.06 + 7), 2.2) * 9 * avenue + avenue * 0.6;
        const w = step * (0.72 + hash(i, j) * 0.12);
        s.set(w, h, w);
        p.set(x, 0, z);
        m.compose(p, q, s);
        mesh.setMatrixAt(n++, m);
        if (hash(i * 3.1, j * 1.7) > 0.93 && h > 1.2) {
          s.set(w * 0.86, 1, w * 0.86);
          p.set(x, h + 0.04, z);
          m.compose(p, q, s);
          caps.setMatrixAt(c++, m);
        }
      }
    }
    mesh.count = n;
    caps.count = c;
    this.backScene.add(mesh, caps);

    // Ground plane with a faint lane grid, so the pulses read as moving along wires.
    const groundMat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAccent: { value: ACCENT } }]),
      vertexShader: /* glsl */ `
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent;
        varying vec3 vW;
        #include <fog_pars_fragment>
        void main() {
          vec2 g = abs(fract(vW.xz / 1.25 + 0.5) - 0.5) / fwidth(vW.xz / 1.25);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float avenue = 1.0 - smoothstep(0.6, 2.4, abs(vW.x));
          vec3 col = vec3(0.028, 0.03, 0.036) + line * vec3(0.05, 0.055, 0.065);
          col += avenue * uAccent * 0.05;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -40);
    this.backScene.add(ground);
  }

  // The core: a stack of thin slabs with lit seams, standing at the end of the avenue.
  private buildCore() {
    const group = new THREE.Group();
    group.position.set(0, 0, -42);
    const slab = new THREE.MeshStandardMaterial({ color: 0x262a32, roughness: 0.55, metalness: 0.3 });
    const seam = new THREE.MeshBasicMaterial({ color: WARM.clone().multiplyScalar(0.62) });
    const seamRed = new THREE.MeshBasicMaterial({ color: ACCENT });
    let y = 0;
    const levels = 14;
    for (let i = 0; i < levels; i++) {
      const t = i / (levels - 1);
      const w = THREE.MathUtils.lerp(7.5, 3.2, Math.pow(t, 0.8));
      const h = 0.95 + (i % 3 === 0 ? 0.35 : 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), slab);
      b.position.y = y + h / 2;
      group.add(b);
      y += h;
      // Lit seam between levels: a thin rim, so from above it reads as a frame, not a plate.
      if (i < levels - 1) {
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 1.012, 0.07, w * 1.012), seam);
        glow.position.y = y + 0.035;
        group.add(glow);
      }
      y += 0.16;
    }
    // Antenna.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6, 6), slab);
    mast.position.y = y + 3;
    group.add(mast);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), seamRed);
    tip.position.y = y + 6.1;
    group.add(tip);

    // Plaza rings around the base.
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(5.8 + r * 1.3, 5.86 + r * 1.3, 96),
        new THREE.MeshBasicMaterial({ color: r === 0 ? ACCENT : 0x3a3f4a, transparent: true, opacity: r === 0 ? 0.55 : 0.4 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      group.add(ring);
    }
    this.backScene.add(group);
  }

  private buildMoon() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: this.uniforms.uTime, uColor: { value: ACCENT } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float disc = 1.0 - smoothstep(0.48, 0.495, r);
          vec2 sp = p * 4.0 + vec2(uTime * 0.01, 0.0);
          float m = n(sp) * 0.55 + n(sp * 2.3) * 0.3 + n(sp * 5.1) * 0.15;
          float limb = smoothstep(0.5, 0.1, r);
          vec3 col = uColor * (0.55 + 0.35 * limb) * (0.75 + 0.35 * m);
          float halo = exp(-max(r - 0.48, 0.0) * 7.0) * 0.35 * (1.0 - disc);
          float a = disc * 0.96 + halo;
          gl_FragColor = vec4(col * (disc + halo * 1.6), a);
        }`,
    });
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    moon.scale.setScalar(46);
    moon.position.set(30, 34, -150);
    moon.renderOrder = -1;
    this.backScene.add(moon);
  }

  // Pulses: points that travel along lanes toward the core, then fade at the plaza.
  private buildPulses(small: boolean) {
    const count = small ? 220 : 420;
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const lane = Math.random() < 0.32 ? 0 : 1;
      let x: number;
      if (lane === 0) x = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.2);
      else x = (Math.round((Math.random() - 0.5) * 50) + 0.5) * 1.25;
      pos[i * 3] = x;
      pos[i * 3 + 1] = 0.08;
      pos[i * 3 + 2] = 0;
      data[i * 4] = Math.random(); // phase
      data[i * 4 + 1] = 0.035 + Math.random() * 0.05; // speed
      data[i * 4 + 2] = Math.random() < 0.18 ? 1 : 0; // accent
      data[i * 4 + 3] = 0.6 + Math.random() * 0.8; // size
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aData", new THREE.BufferAttribute(data, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.uniforms.uTime, uPixel: this.uniforms.uPixel, uAccent: { value: ACCENT }, uWarm: { value: WARM } },
      vertexShader: /* glsl */ `
        attribute vec4 aData;
        uniform float uTime;
        uniform float uPixel;
        varying float vA;
        varying float vAccent;
        void main() {
          float t = fract(aData.x + uTime * aData.y);
          vec3 p = position;
          p.z = mix(14.0, -36.0, t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aData.w * 7.0 * uPixel / -mv.z * 6.0;
          vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t)) * clamp(1.0 - (-mv.z - 10.0) / 90.0, 0.0, 1.0);
          vAccent = aData.z;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent;
        uniform vec3 uWarm;
        varying float vA;
        varying float vAccent;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 c = mix(uWarm, uAccent, vAccent);
          gl_FragColor = vec4(c * a * vA, a * vA);
        }`,
    });
    this.backScene.add(new THREE.Points(g, mat));
  }

  // A few near pillars that overlap the bottom of the giant name in the hero view.
  private buildForeground() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.7, metalness: 0.25 });
    // A jagged low skyline close to the camera, like grass over the letters.
    const spots: [number, number, number, number][] = [];
    for (let i = 0; i < 40; i++) {
      const x = -14 + i * 0.55 + (hash(i, 2) - 0.5) * 0.3;
      if (Math.abs(x + 2.6) < 0.9) continue; // keep a gap on the avenue axis
      const z = 1.5 + hash(i, 7) * 3;
      const h = 1.05 + Math.pow(hash(i, 11), 1.4) * 0.55;
      spots.push([x, z, 0.42 + hash(i, 5) * 0.26, h]);
    }
    const cap = new THREE.MeshBasicMaterial({ color: WARM });
    const capGeo = new THREE.BoxGeometry(1, 0.05, 1);
    for (const [x, z, w, h] of spots) {
      const b = new THREE.Mesh(geo, mat);
      b.scale.set(w, h, w);
      b.position.set(x, 0, z);
      this.frontScene.add(b);
      if (h > 1.45) {
        const c = new THREE.Mesh(capGeo, cap);
        c.scale.set(w * 0.9, 1, w * 0.9);
        c.position.set(x, h + 0.03, z);
        this.frontScene.add(c);
      }
    }
  }

  private buildEmbers(small: boolean) {
    const count = small ? 90 : 170;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = 12 - Math.random() * 70;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.uniforms.uTime, uPixel: this.uniforms.uPixel, uAccent: { value: ACCENT } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixel;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.25 + aSeed * 0.35);
          p.y = mod(p.y + t, 18.0);
          p.x += sin(t * 0.7 + aSeed * 20.0) * 1.4;
          p.z += cos(t * 0.5 + aSeed * 11.0) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 + aSeed * 2.2) * uPixel * 18.0 / -mv.z;
          vA = (0.35 + 0.65 * aSeed) * smoothstep(0.0, 2.0, p.y) * (1.0 - smoothstep(14.0, 18.0, p.y));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA;
          gl_FragColor = vec4(uAccent * a * 1.2, a);
        }`,
    });
    this.frontScene.add(new THREE.Points(g, mat));
  }

  /** Continuous chapter position: 0 = first key, 1.5 = halfway between key 1 and key 2. */
  setProgress(t: number) {
    const max = this.keys.length - 1;
    const c = THREE.MathUtils.clamp(t, 0, max);
    const i = Math.min(Math.floor(c), max - 1);
    const f = c - i;
    const e = f * f * (3 - 2 * f);
    const a = this.keys[i], b = this.keys[i + 1];
    this.targetPos.set(...a.pos).lerp(new THREE.Vector3(...b.pos), e);
    this.targetLook.set(...a.look).lerp(new THREE.Vector3(...b.look), e);
    if (this.reduced) {
      this.camera.position.copy(this.targetPos);
      this.look.copy(this.targetLook);
      this.render();
    }
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // Keep the core framed on narrow screens.
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.back.setSize(w, h, false);
    this.front.setSize(w, h, false);
    if (this.reduced) this.render();
  };

  private render() {
    this.camera.lookAt(this.look);
    this.back.render(this.backScene, this.camera);
    this.front.render(this.frontScene, this.camera);
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.uniforms.uTime.value += dt;
    const k = 1 - Math.pow(0.0025, dt);
    this.camera.position.lerp(this.targetPos, k);
    this.look.lerp(this.targetLook, k);
    this.pointerSmooth.lerp(this.pointer, 1 - Math.pow(0.02, dt));
    const base = this.camera.position.clone();
    this.camera.position.x += this.pointerSmooth.x * 0.6;
    this.camera.position.y -= this.pointerSmooth.y * 0.35;
    this.render();
    this.camera.position.copy(base);
  };

  start() {
    if (this.reduced) {
      this.render();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
