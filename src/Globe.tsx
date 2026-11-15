import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type Waypoint = { id: string; name: string; lat: number; lon: number; region: string };
export type EarthTextures = { surface: THREE.Texture; clouds: THREE.Texture; lights: THREE.Texture };
export type GlobeFailure = 'unavailable' | 'context-lost';

type GlobeProps = {
  textures: EarthTextures;
  onFailure: (reason: GlobeFailure) => void;
  /** Shared intro timeline. While owning.current is true the intro drives the camera from progress (0..1). */
  intro?: IntroLink;
  /** One-shot homepage-to-Mission-Control camera dolly. */
  travel?: TravelLink;
  /** Fired once after the first frames with real textures have rendered. */
  onReady?: () => void;
  rtl?: boolean;
  paused?: boolean;
  rotation?: MutableRefObject<[number, number, number, number]>;
  variant?: 'home' | 'mission';
  showClouds?: boolean;
  showOrbits?: boolean;
  labels?: { earth: string; controls: string; zoomIn: string; zoomOut: string };
};

export type IntroLink = { progress: MutableRefObject<number>; owning: MutableRefObject<boolean> };
export type TravelPose = { x: number; y: number; z: number; cx: number; cy: number };
export type TravelLink = { progress: MutableRefObject<number>; active: MutableRefObject<boolean>; reverse: MutableRefObject<boolean>; origin: MutableRefObject<TravelPose | null> };
export const INTRO_SECONDS = 7;
type Comp = { z: number; cx: number; cy: number; r: number; sz: number; sx: number; sy: number };
const MOBILE_HEADER = 104;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Screen composition of the Earth: final (main view) and opening (cinematic) poses, in canvas pixels. */
export function composition(w: number, h: number, rtl = false, mission = false): Comp {
  if (mission) {
    const r = Math.min(w * 0.34, h * 0.34);
    const z = (RADIUS * h) / (2 * r * Math.tan(THREE.MathUtils.degToRad(18)));
    return { z, cx: w / 2, cy: h / 2, r, sz: z, sx: w / 2, sy: h / 2 };
  }
  let cx: number; let cy: number; let r: number; let sx: number; let sy: number; let startScale: number;
  if (w < 861) {
    const win = Math.min(w, 520);
    cx = w / 2; cy = MOBILE_HEADER + win / 2; r = win * 0.42; sx = w * 0.78; sy = h * 0.88; startScale = 0.55;
  } else if (w < 1181) {
    cx = w * 0.64; cy = h * 0.54; r = Math.min(h * 0.36, w * 0.3); sx = w * 0.8; sy = h * 1.12; startScale = 0.59;
  } else {
    cx = w * 0.655; cy = h * 0.55; r = Math.min(h * 0.4, w * 0.29); sx = w * 0.78; sy = h * 1.15; startScale = 0.62;
  }
  if (rtl && w >= 861) { cx = w - cx; sx = w - sx; }
  const z = (RADIUS * h) / (2 * r * Math.tan(THREE.MathUtils.degToRad(18)));
  return { z, cx, cy, r, sz: z * startScale, sx, sy };
}

const RADIUS = 1.48;
/* Three's SphereGeometry places the equirectangular u=0.5 (lon 0) on +X and lon +90 on -Z.
   pointFor() places lon 0 on +Z and lon +90 on +X, so textured meshes need a -90deg yaw. */
const UV_SEAM_CORRECTION = -Math.PI / 2;
const SUN = new THREE.Vector3(-3.6, 1.5, 4.2).normalize();
const noRaycast = () => null;

function pointFor(lat: number, lon: number, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(radius * Math.cos(phi) * Math.sin(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(theta));
}

function focusQuaternion(lat: number, lon: number) {
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-lon));
  const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(lat));
  return pitch.multiply(yaw);
}

function useReducedMotion() {
  const ref = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => { ref.current = media.matches; };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return ref;
}

function EarthMaterial({ textures }: { textures: EarthTextures }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uDayMap: { value: textures.surface }, uNightMap: { value: textures.lights }, uSun: { value: SUN } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D uDayMap; uniform sampler2D uNightMap; uniform vec3 uSun;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() {
        vec3 n = normalize(vN);
        vec3 day = texture2D(uDayMap, vUv).rgb;
        vec3 night = texture2D(uNightMap, vUv).rgb;
        float s = dot(n, uSun);
        float lit = smoothstep(-0.12, 0.35, s);
        // deepen oceans slightly toward the palette navy
        float ocean = 1.0 - smoothstep(0.0, 0.08, day.r - day.b + 0.04);
        vec3 base = mix(day, day * vec3(0.78, 0.92, 1.08), ocean * 0.6);
        vec3 color = base * mix(0.035, 1.28, lit);
        // soft specular glint on water
        vec3 h = normalize(uSun + vView);
        color += vec3(0.62, 0.8, 0.88) * pow(max(dot(n, h), 0.0), 60.0) * ocean * lit * 0.35;
        // terminator warmth, thin
        color += vec3(0.25, 0.13, 0.05) * (1.0 - smoothstep(0.0, 0.2, abs(s))) * 0.18;
        vec3 delta = max(night - day, vec3(0.0));
        float cityMask = smoothstep(0.04, 0.2, max(delta.r, max(delta.g, delta.b)));
        float dark = 1.0 - smoothstep(-0.25, 0.08, s);
        color += min(delta * 2.6, vec3(0.7)) * vec3(1.0, 0.86, 0.62) * cityMask * dark;
        // inner limb haze
        float fres = pow(1.0 - max(dot(n, vView), 0.0), 3.0);
        color = mix(color, vec3(0.45, 0.75, 0.86), fres * 0.55 * (0.25 + lit));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [textures]);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}

function CloudLayer({ texture, segments, reduced }: { texture: THREE.Texture; segments: number; reduced: MutableRefObject<boolean> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uCloud: { value: texture }, uSun: { value: SUN } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D uCloud; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN;
      void main() {
        float d = dot(texture2D(uCloud, vUv).rgb, vec3(0.299, 0.587, 0.114));
        float lit = smoothstep(-0.1, 0.45, dot(normalize(vN), uSun));
        float a = smoothstep(0.12, 0.62, d) * mix(0.08, 0.72, lit);
        gl_FragColor = vec4(vec3(0.93, 0.96, 0.97) * mix(0.25, 1.0, lit), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [texture]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => { if (mesh.current && !reduced.current) mesh.current.rotation.y += delta * 0.006; });
  return (
    <group rotation-y={UV_SEAM_CORRECTION}>
      <mesh ref={mesh} scale={1.012} renderOrder={2} raycast={noRaycast}>
        <sphereGeometry args={[RADIUS, segments, segments]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}

function AtmosphereLimb({ warm }: { warm: MutableRefObject<number> }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN }, uWarm: { value: warm.current } },
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN; varying vec3 vView; varying vec3 vW;
      void main() { vec4 wp = modelMatrix * vec4(position,1.0); vW = normalize(wp.xyz); vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uWarm; varying vec3 vN; varying vec3 vView; varying vec3 vW;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 4.0);
        float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(vW, uSun));
        // restrained sunrise warmth only on the sun-facing horizon
        float w = pow(smoothstep(0.25, 0.95, dot(vW, uSun)), 2.0) * uWarm;
        vec3 col = mix(vec3(0.40, 0.70, 0.90), vec3(0.84, 0.65, 0.42), w * 0.55);
        gl_FragColor = vec4(col, rim * lit * 0.24 * (1.0 + w * 0.6));
      }`,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => { material.uniforms.uWarm.value = warm.current; });
  return (
    <mesh scale={1.035} renderOrder={3} raycast={noRaycast}>
      <sphereGeometry args={[RADIUS, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/** Opening-only sunrise: a world-anchored back-face shell just outside the limb. Depth-tested, so the Earth
    occludes it and nothing is drawn over the surface. Intensity is driven by uGlow (exactly 0 at the dolly end). */
function SunriseRim({ glow }: { glow: MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: glow.current } },
    transparent: true, side: THREE.BackSide, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying float vD; varying vec2 vVN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vD = dot(n, normalize(cameraPosition - wp.xyz));
        vVN = normalize((viewMatrix * vec4(n, 0.0)).xy + 1e-5);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uGlow; varying float vD; varying vec2 vVN;
      void main() {
        float d = abs(vD);
        float rim = exp(-pow((d - 0.16) / 0.16, 2.0)) * smoothstep(0.0, 0.10, d);
        float side = max(dot(normalize(vVN), normalize(vec2(-0.72, 0.69))), 0.0);
        float cool = rim * (0.25 + 0.75 * pow(side, 2.0));
        float warmG = rim * pow(side, 18.0);
        vec3 col = vec3(0.42, 0.72, 0.95) * cool * 0.55 + vec3(1.0, 0.68, 0.36) * warmG * 1.1;
        gl_FragColor = vec4(col * uGlow, 1.0);
      }`,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.uGlow.value = glow.current;
    if (mesh.current) mesh.current.visible = glow.current > 0;
  });
  return (
    <mesh ref={mesh} scale={1.035} renderOrder={1} raycast={noRaycast}>
      <sphereGeometry args={[RADIUS, 96, 96]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Starfield({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i += 1) {
      const r = 18 + rand() * 22;
      const u = rand() * Math.PI * 2;
      const v = Math.acos(2 * rand() - 1);
      pos.set([r * Math.sin(v) * Math.cos(u), r * Math.cos(v), -Math.abs(r * Math.sin(v) * Math.sin(u)) - 4], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points ref={points} geometry={geometry} raycast={noRaycast}>
      <pointsMaterial size={0.06} color="#DDE7EC" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function OrbitArcs({ reduced }: { reduced: MutableRefObject<boolean> }) {
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  const { arcA, arcB, dots } = useMemo(() => {
    const ring = (r: number, start: number, len: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i += 1) { const t = start + (len * i) / 160; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r)); }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };
    const dotGeo = new THREE.BufferGeometry();
    const p = new Float32Array(36 * 3);
    for (let i = 0; i < 36; i += 1) { const t = (i / 36) * Math.PI * 2; const r = 2.18 + Math.sin(i * 3.7) * 0.06; p.set([Math.cos(t) * r, Math.sin(i * 1.3) * 0.03, Math.sin(t) * r], i * 3); }
    dotGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return { arcA: ring(2.05, 0, Math.PI * 1.35), arcB: ring(2.4, 2.4, Math.PI * 0.9), dots: dotGeo };
  }, []);
  const [lineA, lineB] = useMemo(() => [
    new THREE.Line(arcA, new THREE.LineBasicMaterial({ color: '#9FD7E6', transparent: true, opacity: 0.22, depthWrite: false })),
    new THREE.Line(arcB, new THREE.LineBasicMaterial({ color: '#7AAFC0', transparent: true, opacity: 0.13, depthWrite: false })),
  ].map((l) => { l.raycast = () => undefined; return l; }), [arcA, arcB]);
  useEffect(() => () => {
    arcA.dispose(); arcB.dispose(); dots.dispose();
    [lineA, lineB].forEach((l) => (l.material as THREE.Material).dispose());
  }, [arcA, arcB, dots, lineA, lineB]);
  useFrame((_, d) => {
    if (reduced.current) return;
    if (a.current) a.current.rotation.y += d * 0.02;
    if (b.current) b.current.rotation.y -= d * 0.012;
  });
  return (
    <group rotation={[0.42, 0, -0.32]}>
      <group ref={a}>
        <primitive object={lineA} />
        <points geometry={dots} raycast={noRaycast}>
          <pointsMaterial size={0.018} color="#9FD7E6" transparent opacity={0.5} depthWrite={false} />
        </points>
      </group>
      <group ref={b} rotation-x={-0.2}>
        <primitive object={lineB} />
      </group>
    </group>
  );
}

type SceneProps = GlobeProps & { zoomLevel: number; small: boolean; pointer: MutableRefObject<{ x: number; y: number }>; compRef: MutableRefObject<Comp | null> };

function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  const frames = useRef(0);
  const cb = useRef(onReady);
  cb.current = onReady;
  useFrame(() => {
    if (fired.current) return;
    frames.current += 1;
    if (frames.current >= 3) { fired.current = true; cb.current?.(); }
  });
  return null;
}

function ContextMonitor({ onFailure }: Pick<GlobeProps, 'onFailure'>) {
  const { gl, setFrameloop } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      setFrameloop('never');
      onFailure('context-lost');
    };
    canvas.addEventListener('webglcontextlost', onLost);
    // A context can be lost between renderer creation and this effect.
    if (gl.getContext().isContextLost()) onFailure('context-lost');
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl, onFailure, setFrameloop]);
  return null;
}

function EarthScene({ textures, zoomLevel, small, pointer, intro, travel, rotation, rtl, compRef, variant, showClouds = true, showOrbits = true }: SceneProps) {
  const spin = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const warm = useRef(intro?.owning.current ? 1 : 0.32);
  const introOwned = useRef(Boolean(intro?.owning.current));
  const glow = useRef(intro?.owning.current ? 1 : 0);
  const center = useRef<{ x: number; y: number } | null>(null);
  const zoomOffset = useRef(0);
  const reduced = useReducedMotion();
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const idle = useRef(0);

  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const xAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const tmp = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => {
    const c = composition(size.width, size.height, rtl, variant === 'mission');
    if (intro?.owning.current) {
      // Intro owns the camera: start at the cinematic opening pose (partial lower-right Earth).
      camera.position.set(0, 0, c.sz);
      center.current = { x: c.sx, y: c.sy };
    } else if (travel?.origin.current) {
      const pose = travel.origin.current;
      camera.position.set(pose.x, pose.y, pose.z);
      center.current = { x: pose.cx, y: pose.cy };
    } else {
      camera.position.set(0, 0, c.z);
      center.current = { x: c.cx, y: c.cy };
    }
    if (spin.current) { if (rotation) spin.current.quaternion.fromArray(rotation.current); else spin.current.quaternion.copy(focusQuaternion(18, 20)); }
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    zoomOffset.current = -zoomLevel * 0.3;
  }, [zoomLevel]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const g = spin.current;
    if (!g) return;
    if (!dragging.current && idle.current <= 0 && !reduced.current) {
      g.quaternion.multiply(tmp.setFromAxisAngle(yAxis, delta * 0.02));
    }
    if (!dragging.current && idle.current > 0) idle.current -= delta;
    if (rotation) rotation.current = [g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w];
    const { width: w, height: h } = state.size;
    const c = composition(w, h, rtl, variant === 'mission');
    compRef.current = c;
    if (!center.current) center.current = { x: c.cx, y: c.cy };
    if (travel?.active.current) {
      introOwned.current = false;
      const zoomedZ = Math.max(c.z * 0.58, RADIUS + 0.15);
      const reverse = travel.reverse.current;
      if (!reverse && !travel.origin.current) travel.origin.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z, cx: center.current.x, cy: center.current.y };
      const origin = travel.origin.current ?? { x: 0, y: 0, z: c.z, cx: c.cx, cy: c.cy };
      const p = easeInOutCubic(clamp01(travel.progress.current));
      camera.position.x = THREE.MathUtils.lerp(reverse ? 0 : origin.x, reverse ? origin.x : 0, p);
      camera.position.y = THREE.MathUtils.lerp(reverse ? 0 : origin.y, reverse ? origin.y : 0, p);
      camera.position.z = THREE.MathUtils.lerp(reverse ? zoomedZ : origin.z, reverse ? origin.z : zoomedZ, p);
      center.current.x = THREE.MathUtils.lerp(reverse ? w / 2 : origin.cx, reverse ? origin.cx : w / 2, p);
      center.current.y = THREE.MathUtils.lerp(reverse ? h / 2 : origin.cy, reverse ? origin.cy : h / 2, p);
      glow.current = 0;
    } else {
    if (intro?.owning.current) {
      // Single timeline source: camera pose is a pure function of intro progress.
      introOwned.current = true; // replay can re-take ownership on the same canvas
      const s = intro.progress.current * INTRO_SECONDS;
      const pre = clamp01(s / 1.5);
      const e = easeInOutCubic(clamp01((s - 1.5) / 4));
      const z0 = c.sz * (1 + 0.02 * (1 - pre));
      // Welcome is alive: restrained pointer parallax that fades out as the dolly carries the camera in.
      const par = reduced.current ? 0 : 1 - e;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.current.x * 0.08 * par, 1.6, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, pointer.current.y * 0.05 * par, 1.6, delta);
      camera.position.z = THREE.MathUtils.lerp(z0, c.z, e);
      center.current.x = THREE.MathUtils.lerp(c.sx, c.cx, e);
      center.current.y = THREE.MathUtils.lerp(c.sy, c.cy, e);
      warm.current = THREE.MathUtils.lerp(1, 0.32, clamp01((s - 3) / 2.5));
      // Sunrise decays with the dolly ease: 1 at s<=1.5, exactly 0 at s>=5.5 (camera endpoint).
      glow.current = e >= 1 ? 0 : 1 - e;
    } else {
      // Main interactions continue from wherever the camera is: no reset.
      if (introOwned.current) {
        // Skip must settle immediately, rather than replaying the remaining dolly.
        // Keep x/y and orientation continuous; only the dolly endpoint is settled.
        camera.position.z = c.z;
        center.current = { x: c.cx, y: c.cy };
        introOwned.current = false;
      }
      const targetZoom = THREE.MathUtils.clamp(c.z * (1 + zoomOffset.current / 5.2), c.z * 0.55, c.z * 1.4);
      const px = reduced.current ? 0 : pointer.current.x * 0.22;
      const py = reduced.current ? 0 : pointer.current.y * 0.14;
      const k = reduced.current ? 20 : 2.2;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, px, k, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, py, k, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZoom, reduced.current ? 20 : 1.8, delta);
      center.current.x = THREE.MathUtils.damp(center.current.x, c.cx, reduced.current ? 20 : 3, delta);
      center.current.y = THREE.MathUtils.damp(center.current.y, c.cy, reduced.current ? 20 : 3, delta);
      warm.current = THREE.MathUtils.damp(warm.current, 0.32, 2, delta);
      glow.current = 0; // main view and Skip/reduced-motion: instantly zero
    }
    }
    (camera as THREE.PerspectiveCamera).setViewOffset(w, h, w / 2 - center.current.x, h / 2 - center.current.y, w, h);
    camera.lookAt(0, 0, 0);
  });

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    idle.current = 6;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current || !spin.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const q = spin.current.quaternion;
    q.premultiply(tmp.setFromAxisAngle(xAxis, dy * 0.0045));
    q.multiply(tmp.setFromAxisAngle(yAxis, dx * 0.005));
    q.normalize();
  };
  const handleUp = () => { drag.current = null; dragging.current = false; idle.current = 6; };
  const seg = small ? 64 : 112;
  return (
    <>
      <Starfield count={small ? 260 : 620} />
      <group rotation-z={THREE.MathUtils.degToRad(-8)}>
        <group ref={spin}>
          <mesh rotation-y={UV_SEAM_CORRECTION} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp}>
            <sphereGeometry args={[RADIUS, seg, seg]} />
            <EarthMaterial textures={textures} />
          </mesh>
          {showClouds && <CloudLayer texture={textures.clouds} segments={small ? 56 : 96} reduced={reduced} />}
        </group>
      </group>
      <SunriseRim glow={glow} />
      <AtmosphereLimb warm={warm} />
      {showOrbits && <OrbitArcs reduced={reduced} />}
    </>
  );
}

export default function Globe(props: GlobeProps) {
  const [zoomLevel, setZoomLevel] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const compRef = useRef<Comp | null>(null);
  const [small] = useState(() => typeof window !== 'undefined' && window.innerWidth < 800);
  const changeZoom = (amount: number) => setZoomLevel((l) => THREE.MathUtils.clamp(l + amount, -3, 5));
  const zoomRef = useRef(changeZoom);
  zoomRef.current = changeZoom;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (small && !e.ctrlKey) return;
      const c = compRef.current;
      const r = el.getBoundingClientRect();
      // Only capture wheel over the Earth itself so page scrolling stays natural elsewhere.
      if (c && Math.hypot(e.clientX - r.left - c.cx, e.clientY - r.top - c.cy) > c.r * 1.25) return;
      e.preventDefault();
      zoomRef.current(e.deltaY > 0 ? -1 : 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [small]);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  // While the intro owns the camera the canvas has no pointer events; follow the window instead.
  const introRef = useRef(props.intro);
  introRef.current = props.intro;
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!introRef.current?.owning.current) return;
      pointer.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: -(e.clientY / window.innerHeight - 0.5) * 2 };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div
      ref={wrap}
      className="globe-canvas-wrap"
      data-testid="globe-canvas"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: -((e.clientY - r.top) / r.height - 0.5) * 2 };
      }}
      onPointerLeave={() => { pointer.current = { x: 0, y: 0 }; }}
    >
      <Canvas
        frameloop={props.paused ? 'demand' : 'always'}
        camera={{ position: [0, 0, 5.2], fov: 36, near: 0.1, far: 120 }}
        dpr={small ? [1, 1.5] : [1, 1.75]}
        gl={{ antialias: !small, alpha: true, powerPreference: 'high-performance' }}
        aria-label={props.labels?.earth ?? "Interactive three-dimensional Earth globe"}
      >
        <ContextMonitor onFailure={props.onFailure} />
        <EarthScene {...props} zoomLevel={zoomLevel} small={small} pointer={pointer} compRef={compRef} />
        <ReadySignal onReady={props.onReady} />
      </Canvas>
      <div className="globe-controls" aria-label={props.labels?.controls ?? "Globe zoom controls"}>
        <button type="button" onClick={() => changeZoom(1)} aria-label={props.labels?.zoomIn ?? "Zoom in"} data-testid="button-zoom-in">+</button>
        <button type="button" onClick={() => changeZoom(-1)} aria-label={props.labels?.zoomOut ?? "Zoom out"} data-testid="button-zoom-out">−</button>
      </div>
    </div>
  );
}
