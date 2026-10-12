import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HERO_CONFIG as CFG } from "./config";
import { NeuralCore } from "./NeuralCore";
import { NodeNetwork } from "./NodeNetwork";
import { DataPulses } from "./DataPulses";
import { AmbientDust } from "./AmbientDust";

/** Uniforms shared by every module, so one write updates all of them. */
export type SharedUniforms = {
  uTime: { value: number };
  uIntro: { value: number }; // intro clock on a 0-1.6 timeline; large once finished
  uDim: { value: number }; // 1 on desktop, lower on mobile
  uPixel: { value: number }; // device pixel ratio, for point sizes
  uLeftFade: { value: number }; // 1 keeps the text column calm (desktop)
};

function readAccent() {
  const v = getComputedStyle(document.documentElement).getPropertyValue(CFG.colors.accentVar).trim();
  try {
    return new THREE.Color(v || CFG.colors.accentFallback);
  } catch {
    return new THREE.Color(CFG.colors.accentFallback);
  }
}

/*
  Neural Core hero background: owns the renderer, camera, post-processing,
  resize, pointer, scroll, visibility and reduced-motion handling, and
  composes the NeuralCore, NodeNetwork, DataPulses and AmbientDust modules.
*/
export class HeroBackground {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group(); // core + network, placed at the core position on screen
  private core: NeuralCore;
  private network: NodeNetwork;
  private pulses: DataPulses | null;
  private dust: AmbientDust;
  private shared: SharedUniforms = {
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uDim: { value: 1 },
    uPixel: { value: 1 },
    uLeftFade: { value: 1 },
  };

  private mobile: boolean;
  private animate: boolean;
  private running = false;
  private heroVisible = true;
  private raf = 0;
  private last = 0;
  private introStart = -1;
  private scroll = 0;
  private pointer = new THREE.Vector2(); // -1..1, y up
  private pointerPx = new THREE.Vector2(-1e4, -1e4);
  private hoverTarget = 0;
  private camOffset = new THREE.Vector2();
  private observer: IntersectionObserver;
  private coreScreen = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, hero: HTMLElement, reducedMotion: boolean) {
    this.animate = !reducedMotion;
    this.mobile = window.innerWidth < CFG.mobileBreakpoint;
    const accent = readAccent();

    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? CFG.dpr.mobile : CFG.dpr.desktop);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.shared.uPixel.value = dpr;

    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.1, 80);
    this.camera.position.set(0, 0, CFG.camera.distance);

    this.scene.add(this.background());
    this.core = new NeuralCore(this.shared, accent);
    this.network = new NodeNetwork(this.shared, accent, this.mobile);
    this.pulses = this.animate ? new DataPulses(this.shared, accent, this.network, this.mobile, () => this.core.pulseArrived()) : null;
    this.dust = new AmbientDust(this.shared, this.mobile);
    if (this.pulses) this.network.object.add(this.pulses.object);
    this.rig.add(this.network.object, this.core.object);
    this.scene.add(this.rig, this.dust.object);

    // Post-processing: bloom on desktop only. OutputPass handles colour space.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.mobile) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    this.observer = new IntersectionObserver(([entry]) => {
      this.heroVisible = entry.isIntersecting;
      this.sync();
    });
    this.observer.observe(hero);
  }

  // Full-screen vertical gradient, drawn first. Too dark to bloom.
  private background() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(CFG.colors.bgTop) },
          uBottom: { value: new THREE.Color(CFG.colors.bgBottom) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          varying vec2 vUv;
          void main() { gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y)), 1.0); }`,
      })
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
  }

  private resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.mobile = w < CFG.mobileBreakpoint;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom?.resolution.set(w, h);

    // Place the rig so the core lands at the configured screen position.
    const pos = this.mobile ? CFG.corePosition.mobile : CFG.corePosition.desktop;
    const halfH = CFG.camera.distance * Math.tan(THREE.MathUtils.degToRad(CFG.camera.fov / 2));
    this.rig.position.set((pos.x * 2 - 1) * halfH * this.camera.aspect, (1 - pos.y * 2) * halfH, 0);
    this.shared.uDim.value = this.mobile ? CFG.mobileCoreOpacity : 1;
    this.shared.uLeftFade.value = this.mobile ? 0 : 1;
    if (!this.animate) this.renderOnce();
  };

  private onPointer = (e: PointerEvent) => {
    this.pointerPx.set(e.clientX, e.clientY);
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  private onVisibility = () => this.sync();

  /** 0 at the top of the hero, 1 once it has scrolled out of view. */
  setScroll(progress: number) {
    this.scroll = THREE.MathUtils.clamp(progress, 0, 1);
    if (!this.animate) this.renderOnce();
  }

  /** Start the intro (core, then nodes in waves, then lines, then pulses) and the loop. */
  start() {
    this.introStart = performance.now();
    if (!this.animate) {
      this.shared.uIntro.value = 10;
      this.renderOnce();
      return;
    }
    this.sync();
  }

  // Run the loop only when started, the tab is visible and the hero is on screen.
  private sync() {
    const should = this.animate && this.introStart >= 0 && !document.hidden && this.heroVisible;
    if (should && !this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!should && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.shared.uTime.value += dt;
    this.shared.uIntro.value = ((now - this.introStart) / 1000) * (1.6 / CFG.intro.seconds);
    this.step(dt);
    this.composer.render();
  };

  private step(dt: number) {
    const t = this.shared.uTime.value;
    const intro = this.shared.uIntro.value;
    const desktop = !this.mobile && this.animate;

    // Pointer parallax: the camera eases toward the cursor (desktop only).
    const target = desktop ? this.pointer : new THREE.Vector2();
    this.camOffset.lerp(target, 1 - Math.exp(-dt * 2));
    this.camera.position.set(
      this.camOffset.x * CFG.camera.parallax,
      this.camOffset.y * CFG.camera.parallax,
      CFG.camera.distance + this.scroll * CFG.camera.scrollPullBack
    );
    this.camera.lookAt(this.camOffset.x * CFG.camera.parallax * 0.5, this.camOffset.y * CFG.camera.parallax * 0.5, 0);

    // Hover on the core: compare the pointer with the core's projected circle.
    this.hoverTarget = 0;
    if (desktop) {
      this.core.object.getWorldPosition(this.coreScreen).project(this.camera);
      const cx = (this.coreScreen.x * 0.5 + 0.5) * window.innerWidth;
      const cy = (-this.coreScreen.y * 0.5 + 0.5) * window.innerHeight;
      const depth = this.camera.position.z;
      const rPx = (this.core.radius / (depth * Math.tan(THREE.MathUtils.degToRad(CFG.camera.fov / 2)))) * (window.innerHeight / 2);
      if (Math.hypot(this.pointerPx.x - cx, this.pointerPx.y - cy) < rPx * 1.25) this.hoverTarget = 1;
    }

    this.core.update(t, dt, intro, this.shared.uDim.value, this.hoverTarget, desktop ? this.pointer : new THREE.Vector2(), this.animate);
    this.network.update(t, dt, 1 + this.scroll * CFG.network.scrollExpand, this.animate);
    this.pulses?.update(dt, 1 + this.hoverTarget * (CFG.pulses.hoverSpeedBoost - 1));
  }

  // Reduced motion: one still, fully composed frame.
  private renderOnce() {
    if (this.introStart < 0) return;
    this.shared.uIntro.value = 10;
    this.step(0);
    this.composer.render();
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.bloom?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
