import * as THREE from "three";
import { HERO_CONFIG } from "./config";
import { SIMPLEX_3D } from "./noise";
import type { SharedUniforms } from "./HeroBackground";

const C = HERO_CONFIG.core;

/*
  The glowing AI core: a subdivided icosahedron with a molten noise interior
  and a fresnel rim, two faint orbital rings and a restrained halo.
*/
export class NeuralCore {
  readonly object = new THREE.Group();
  private sphere: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  private halo: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private rings: { mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; speed: number; opacity: number }[] = [];
  private energy = { value: 1 };
  private flash = 0;
  private hover = 0;
  private look = new THREE.Vector2();

  constructor(shared: SharedUniforms, accent: THREE.Color) {
    this.sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(C.radius, 6),
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: shared.uTime,
          uIntro: shared.uIntro,
          uDim: shared.uDim,
          uEnergy: this.energy,
          uAccent: { value: accent },
          uHighlight: { value: new THREE.Color(HERO_CONFIG.colors.highlight) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;    // view-space normal, for the fresnel term
          varying vec3 vViewDir;   // direction from the surface to the camera
          varying vec3 vObjPos;    // object-space position, samples the noise
          void main() {
            vObjPos = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewDir = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uIntro;   // seconds since the intro started
          uniform float uDim;     // global dimmer (mobile)
          uniform float uEnergy;  // 1 at rest; breath, pulse flashes and hover add to it
          uniform vec3 uAccent;
          uniform vec3 uHighlight;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vObjPos;
          ${SIMPLEX_3D}
          void main() {
            // Slowly moving FBM, warped once so it reads as molten, not static.
            vec3 p = vObjPos * 1.35;
            float t = uTime * 0.12;
            vec3 warp = vec3(fbm(p + t), fbm(p + 4.7 - t), fbm(p + 9.1 + t * 0.5));
            float n = fbm(p + warp * 0.9 + t);

            // Dark interior with hotter veins where the noise peaks.
            vec3 deep = uAccent * 0.08;
            vec3 interior = mix(deep, uAccent * 0.32, smoothstep(-0.1, 0.6, n));
            interior += uAccent * pow(max(n, 0.0), 3.0) * 1.1 * uEnergy;

            // Fresnel rim glow, pushed above the bloom threshold.
            float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.6);
            vec3 rim = mix(uAccent, uHighlight, fresnel * 0.35) * fresnel * 1.9 * uEnergy;

            float appear = smoothstep(0.0, 0.55, uIntro);
            gl_FragColor = vec4((interior + rim) * uDim, appear);
          }`,
      })
    );

    // Halo: a camera-facing quad with a soft radial falloff (additive).
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uIntro: shared.uIntro,
          uDim: shared.uDim,
          uEnergy: this.energy,
          uAccent: { value: accent },
          uSize: { value: C.haloSize },
          uStrength: { value: C.haloStrength },
        },
        vertexShader: /* glsl */ `
          uniform float uSize;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            // Billboard: offset the corners in view space so the quad always faces the camera.
            vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            gl_Position = projectionMatrix * (center + vec4(position.xy * uSize, 0.0, 0.0));
          }`,
        fragmentShader: /* glsl */ `
          uniform float uIntro;
          uniform float uDim;
          uniform float uEnergy;
          uniform vec3 uAccent;
          uniform float uStrength;
          varying vec2 vUv;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float glow = exp(-r * 4.2) * (1.0 - smoothstep(0.7, 1.0, r));
            float appear = smoothstep(0.1, 0.7, uIntro);
            gl_FragColor = vec4(uAccent * glow * uStrength * (0.75 + uEnergy * 0.3) * appear * uDim, 1.0);
          }`,
      })
    );
    this.halo.renderOrder = -1;
    this.object.add(this.halo, this.sphere);

    for (const r of C.rings) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(r.radius, 0.007, 6, 180),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.rotation.set(r.tilt[0], r.tilt[1], 0);
      this.rings.push({ mesh, speed: r.speed, opacity: r.opacity });
      this.object.add(mesh);
    }
  }

  /** A pulse reached the core. */
  pulseArrived() {
    this.flash = Math.min(this.flash + C.flashPerPulse, 0.8);
  }

  update(time: number, dt: number, intro: number, dim: number, hoverTarget: number, pointer: THREE.Vector2, animate: boolean) {
    const breath = animate ? Math.sin((time / C.breathSeconds) * Math.PI * 2) * C.breathAmount : 0;
    this.flash *= Math.exp(-dt * 3.5);
    this.hover += (hoverTarget - this.hover) * (1 - Math.exp(-dt * 6));
    this.energy.value = 1 + breath + this.flash + this.hover * C.hoverBoost;

    const ringIn = THREE.MathUtils.smoothstep(intro, 0.2, 0.8);
    for (const r of this.rings) {
      if (animate) r.mesh.rotation.z += r.speed * dt;
      r.mesh.material.opacity = r.opacity * ringIn * dim;
    }

    // Turn slightly toward the cursor.
    this.look.lerp(pointer, 1 - Math.exp(-dt * 2.5));
    this.sphere.rotation.y = this.look.x * 0.35;
    this.sphere.rotation.x = this.look.y * 0.25;
  }

  /** World-space radius used for hover hit-testing. */
  get radius() {
    return C.radius;
  }
}
