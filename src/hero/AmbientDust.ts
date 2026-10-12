import * as THREE from "three";
import { HERO_CONFIG } from "./config";
import type { SharedUniforms } from "./HeroBackground";

const D = HERO_CONFIG.dust;

/*
  Faint dust across the whole background. It lives in world space (not in the
  rotating network), so pointer parallax gives it depth.
*/
export class AmbientDust {
  readonly object: THREE.Points;

  constructor(shared: SharedUniforms, mobile: boolean) {
    const count = mobile ? D.count.mobile : D.count.desktop;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const [sx, sy, sz] = D.spread;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * sx;
      pos[i * 3 + 1] = (Math.random() - 0.5) * sy;
      pos[i * 3 + 2] = (Math.random() - 0.5) * sz - 2;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.object = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: shared.uTime,
          uIntro: shared.uIntro,
          uPixel: shared.uPixel,
          uSpeed: { value: D.speed },
          uHeight: { value: sy },
          uColor: { value: new THREE.Color(HERO_CONFIG.colors.highlight) },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uPixel;
          uniform float uSpeed;
          uniform float uHeight;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            // Slow upward drift with a little sway, wrapping top to bottom.
            float t = uTime * uSpeed * (0.5 + aSeed);
            p.y = mod(p.y + t + uHeight * 0.5, uHeight) - uHeight * 0.5;
            p.x += sin(uTime * 0.1 + aSeed * 30.0) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (0.6 + aSeed * 1.2) * uPixel * 16.0 / -mv.z;
            // Fade at the wrap edges so particles never pop.
            float edge = 1.0 - smoothstep(0.38, 0.5, abs(p.y / uHeight));
            vAlpha = (0.05 + aSeed * 0.1) * edge;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uIntro;
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            float appear = smoothstep(0.0, 1.0, uIntro);
            gl_FragColor = vec4(uColor * (1.0 - d) * vAlpha * appear, 1.0);
          }`,
      })
    );
  }
}
