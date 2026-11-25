// Cabinet of Liminal Earths — web visit
// Phase 4–5: intro, navigation, hover, spatial light, minimap, layer cards, artifact/layer panel.
// All content text is read from data/objects.json. Only interface labels live in UI below.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/* ================= interface labels (English UI, no content) ================= */
const UI = {
  loadingArch: 'Loading the building',
  loadingArtifacts: 'Loading the collection',
  ready: 'Ready',
  error: 'Could not load the scene. Please reload.',
  noWebGL: 'This work needs a browser with WebGL.',
  counts: (l, a) => `${l} layers · ${a} artifacts`,
  layer: 'Layer', stop: 'Stop',
  stopNames: { start: 'Steps', entrance: 'Entrance' },
  explore: 'Explore freely',
  light: { guided: 'Guided light', hidden: 'Hidden', revealed: 'Revealed' },
  soundOn: 'Sound', soundOff: 'Muted',
  about: 'About', creditsImages: 'Image credits', creditsModels: '3D models', creditsSound: 'Sound', creditsSoftware: 'Software',
  modelsPending: 'The sources of the remaining 3D models and of the Pantheon model are being verified.',
  soundCredit: 'All sound is synthesised live in the browser with the Web Audio API; no recordings are used. A quiet room tone, a slow chord and sparse events for each layer, and one note per artifact on hover. They are atmospheres, not documents.',
  clickHint: 'Click for the catalogue entry',
  tapHint: 'Tap again for the catalogue entry',
  tabImage: 'Image', tab3d: '3D model', figure: 'Figure',
  viewerCap: '3D model in the cabinet · drag to rotate',
  viewerCapRecon: '3D reconstruction · drag to rotate',
  part: (i) => `Part ${i}`,
  locate: 'Go there',
  readLayer: 'Read the layer', openEntry: 'Read the entry',
  inCabinet: 'In the cabinet',
  artifacts: 'Artifacts',
  placement: 'Placement', ritual: 'Ritual', intro: 'Layer',
  theme: 'Thesis theme', phase: 'Phase',
  source: 'Source',
  hintTouch: ['Swipe up to approach', 'or tap here'],
  creditsMaking: 'Making',
  makingCredit: 'The web visit was developed by the author with the assistance of Claude (Anthropic): programming, preparation of the 3D models and the reconstructions marked as such. All texts come from the author\'s catalogue.',
  qualityNowLow: 'Now showing the light version.', qualityNowHigh: 'Now showing the full version.',
  qualityHead: 'Display', qualityText: 'The light version loads a simpler building with fewer lights and is chosen automatically on phones and on laptops with integrated graphics. The resolution also adapts to the frame rate.',
  qualityLow: 'Use the light version', qualityHigh: 'Use the full version',
  help: {
    tour: 'Scroll or ‹ › between stops · Drag to look · Click the floor to walk · Click an object',
    walk: 'Click the floor to walk there · Scroll to step · Drag to look · W A S D or arrows · Shift to run',
    walkTouch: 'Tap the floor to walk there · Left pad to move · Drag to look · Tap an object',
    overview: 'Drag to orbit · Scroll to zoom · Right-drag to pan',
  },
};

/* ================= basics ================= */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isTouch = matchMedia('(pointer: coarse)').matches;
// integrated laptop graphics (Intel HD/UHD/Iris) and phones get the light version by default
const GPU = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return { name, weak: /Intel(?!.*Arc)|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(name) };
  } catch (e) { return { name: '', weak: false }; }
})();
const QP = new URLSearchParams(location.search).get('q');
const LOW = QP === 'low' || (QP !== 'high' && (isTouch || GPU.weak));
const canvas = $('#scene');
const clock = new THREE.Clock();

const state = {
  mode: 'loading',          // loading | tour | walk | overview
  light: 'guided',          // guided | hidden | revealed
  stopIndex: 0,
  yaw: 0, pitch: 0,
  footY: 1.17,
  layer: null,
  hover: null,
  locked: false,
  tween: null,
  keys: new Set(),
  joy: { x: 0, y: 0 },
  savedPose: null,
  walkTo: null,             // click-to-walk destination {x, z}
  wheelV: 0,                // forward speed given by the scroll wheel in Walk
  panel: null,              // { kind:'artifact'|'layer', id }
  lastCardLayer: null,
  layerSince: 0,
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, stencil: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#loadstatus').textContent = UI.noWebGL;
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = new URLSearchParams(location.search).get('tm') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const BG = new THREE.Color('#05070d');
scene.background = BG;
scene.fog = new THREE.Fog('#121624', 55, 190);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

/* ================= lights ================= */
const hemi = new THREE.HemisphereLight('#e4e6ee', '#4d4a45', 0.8);
const ambient = new THREE.AmbientLight('#ffffff', 0.18);
const oculus = new THREE.DirectionalLight('#dfe5f5', 0.7);
scene.add(hemi, ambient, oculus, oculus.target);
const layerLights = [];   // { layer, light }

// spatial light: everything outside the current layer is darkened in the shader
const LIGHT_PRESET = {
  //            outside-layer brightness | no-layer brightness | visitor pool | layer lamps (on/off) | sky
  guided:   { dim: 0.24, none: 1.0,  pool: 0.0,  on: 1.0, off: 0.15, hemi: 0.8, oculus: 0.7, fall: [1.0, 1.7] },
  hidden:   { dim: 0.03, none: 0.10, pool: 0.5,  on: 1.2, off: 0.0,  hemi: 0.75, oculus: 0.3, fall: [0.8, 1.2] },
  revealed: { dim: 1.0,  none: 1.0,  pool: 0.0,  on: 0.7, off: 0.7,  hemi: 0.95, oculus: 0.8, fall: [1.0, 1.7] },
};
const LAYER_LIGHT_POWER = 18;   // the layer lamp is soft; the artifacts get their own key light (museum)

const MAX_FOCI = 5; // 4 layer zones + the visitor's own pool of light
const focus = {
  uFoci: { value: Array.from({ length: MAX_FOCI }, () => new THREE.Vector4(0, 0, 0, 0)) }, // x, z, radius, strength
  uFocusDim: { value: 1 },
  uFocusFall: { value: new THREE.Vector2(1.0, 1.7) },   // inner / outer radius factors of the soft edge
};
const focusTargets = Array.from({ length: MAX_FOCI }, () => ({ x: 0, z: 0, r: 0, s: 0 }));

function addFocus(mat) {
  if (!mat || mat.userData._focus || mat.isShaderMaterial) return;
  mat.userData._focus = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFoci = focus.uFoci;
    sh.uniforms.uFocusDim = focus.uFocusDim;
    sh.uniforms.uFocusFall = focus.uFocusFall;
    sh.vertexShader = 'varying vec3 vFocusW;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vFocusW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform vec4 uFoci[${MAX_FOCI}];\nuniform float uFocusDim;\nuniform vec2 uFocusFall;\nvarying vec3 vFocusW;\n` +
      sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    float k = 0.0;
    for (int i = 0; i < ${MAX_FOCI}; i++) {
      vec4 f = uFoci[i];
      if (f.w <= 0.0) continue;
      float d = distance(vFocusW.xz, f.xy);
      k = max(k, f.w * (1.0 - smoothstep(f.z * uFocusFall.x, f.z * uFocusFall.y + 0.6, d)));
    }
    gl_FragColor.rgb *= mix(uFocusDim, 1.0, k);
  }`);
  };
  mat.customProgramCacheKey = () => 'focus-v2';
  mat.needsUpdate = true;
}
const eachMat = (o, fn) => (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn);

/* ================= data ================= */
let DATA, TOUR;
const layersById = new Map();
const artifactsById = new Map();
const artifactsByLayer = new Map();

/* ================= scene registries ================= */
const registry = new Map();   // id -> { id, data, meshes: [], materials: [] }
const pickables = [];
const occluders = [];
let archRoot = null, artifactsRoot = null, veil = null;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
const archMaterials = new Set();
const ringGroup = new THREE.Group();
scene.add(ringGroup);
const rings = []; // { layer, mesh, label }

/* ================= loaders ================= */
const draco = new DRACOLoader().setDecoderPath('vendor/draco/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const loadGLB = (url, onProgress) => new Promise((res, rej) => gltfLoader.load(url, res, onProgress, rej));
const progress = { arch: 0, art: 0 };
function showProgress(label) {
  const p = progress.arch * 0.55 + progress.art * 0.45;
  $('#loadbar').style.width = `${Math.round(p * 100)}%`;
  if (label) $('#loadstatus').textContent = label;
}
const progressHandler = (key) => (e) => { if (e.lengthComputable && e.total) progress[key] = e.loaded / e.total; showProgress(); };

function findUp(obj, key) {
  for (let o = obj; o; o = o.parent) if (o.userData && o.userData[key] !== undefined) return o.userData[key];
  return undefined;
}
function prepareMesh(mesh) {
  if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
  occluders.push(mesh);
}

/* ================= night: sky dome with stars, moonlight ================= */
const sky = (() => {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#05070d') }, uHorizon: { value: new THREE.Color('#1a2033') }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
        col += vec3(0.05, 0.06, 0.09) * exp(-abs(h) * 14.0);          // faint glow on the horizon
        vec2 uv = vec2(atan(d.z, d.x) * 120.0, asin(clamp(d.y, -1.0, 1.0)) * 120.0);
        vec2 c = floor(uv); vec2 f = fract(uv) - 0.5;
        float r = hash(c);
        vec2 o = vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5;
        float star = step(0.982, r) * smoothstep(0.12, 0.0, length(f - o * 0.6));
        star *= smoothstep(0.05, 0.3, h) * (0.55 + 0.45 * sin(uTime * (0.6 + r * 2.0) + r * 60.0));
        col += vec3(0.85, 0.88, 1.0) * star;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  scene.add(mesh);
  return { update(t) { mesh.position.copy(camera.position); mat.uniforms.uTime.value = t; } };
})();
const moon = new THREE.DirectionalLight('#aebbe2', 0.55);
moon.position.set(-60, 80, 40);
scene.add(moon, moon.target);

function pavingTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5d5f63'; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 86 + Math.floor(rnd() * 22);
    g.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
    const off = (y % 2) * 32;
    g.fillRect(x * 64 + off + 2, y * 64 + 2, 60, 60);
    g.fillRect(x * 64 + off - 512 + 2, y * 64 + 2, 60, 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(110, 110); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ================= ground ================= */
function addGround() {
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#8a8c92', map: pavingTexture(), roughness: 1 })
  );
  g.position.y = TOUR.ground_plane_y - 0.004;
  g.updateMatrixWorld();
  addFocus(g.material);
  scene.add(g);
  prepareMesh(g);
}

/* ================= architecture ================= */
function setupArchitecture(gltf) {
  archRoot = gltf.scene;
  archRoot.traverse((o) => {
    if (!o.isMesh) return;
    eachMat(o, (m) => {
      if (m.name === TOUR.floor_material) m.color.set(TOUR.floor_color);
      m.color.multiplyScalar(TOUR.marble_albedo ?? 0.9);   // the marble reads as stone, not as a light source
      m.clippingPlanes = [clipPlane];
      m.side = THREE.DoubleSide;   // SketchUp/Rhino source: single-sided faces with mixed winding
      archMaterials.add(m);
      addFocus(m);
    });
    prepareMesh(o);
  });
  scene.add(archRoot);
  archRoot.updateMatrixWorld(true);
}

/* ================= artifacts ================= */
function setupArtifacts(gltf) {
  artifactsRoot = gltf.scene;
  artifactsRoot.traverse((o) => {
    if (!o.isMesh) return;
    prepareMesh(o);
    const id = findUp(o, 'id');
    if (!id || !artifactsById.has(id)) { eachMat(o, addFocus); return; }
    if (findUp(o, 'animated') === 'terraforming_veil') {
      o.material = makeVeilMaterial();
      veil = o;
    } else {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      eachMat(o, addFocus);
    }
    let entry = registry.get(id);
    if (!entry) { entry = { id, data: artifactsById.get(id), meshes: [], materials: [] }; registry.set(id, entry); }
    entry.meshes.push(o);
    eachMat(o, (m) => entry.materials.push(m));
    o.userData._artifactId = id;
    o.userData._part = findUp(o, 'part') || 'main';
    pickables.push(o);
  });
  scene.add(artifactsRoot);
  artifactsRoot.updateMatrixWorld(true);
}

/* ================= animated veil (A4.3 reconstruction) ================= */
function makeVeilMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uHighlight: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform float uTime; uniform float uHighlight;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        float t = uTime * 0.12; vec2 loopv = vec2(cos(t), sin(t)) * 1.6; vec2 p = vUv * 3.2;
        float h = fbm(p + loopv) * 0.75 + fbm(p * 1.7 - loopv * 0.6) * 0.35;
        float contour = 1.0 - smoothstep(0.0, 0.06, abs(fract(h * 14.0) - 0.5));
        vec2 g = abs(fract(vUv * 18.0) - 0.5);
        float grid = 1.0 - smoothstep(0.0, 0.025, min(g.x, g.y));
        vec3 col = mix(vec3(0.10,0.12,0.15), vec3(0.32,0.36,0.40), h) + contour * vec3(0.55,0.62,0.66) * 0.6 + grid * 0.10;
        col = mix(col, vec3(0.66,0.64,0.90), uHighlight * 0.35);
        gl_FragColor = vec4(col, 0.55 + contour * 0.25);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ================= layer lamps + floor rings (navigation glyphs) ================= */
const RING_COLOR = new THREE.Color('#a9a5e6');
function makeLabelTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 128);
  g.font = '300 64px "Century Gothic", Futura, Avenir, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function setupLayerGlyphs() {
  const c = TOUR.rotunda_center;
  oculus.position.set(c[0] + 4, 60, c[1] + 6);
  oculus.target.position.set(c[0], 2, c[1]);
  const fy = TOUR.floor_y ?? 2.025;
  TOUR.layer_anchors.forEach((a) => {
    const l = new THREE.PointLight('#fff3e2', 0, 0, 2);
    l.position.set(a.xz[0], TOUR.layer_light_y ?? 6.5, a.xz[1]);
    scene.add(l);
    layerLights.push({ layer: a.layer, light: l });

    const R = a.r * 0.92;
    const mat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.018, R + 0.018, 128).rotateX(-Math.PI / 2), mat);
    ring.position.set(a.xz[0], fy + 0.012, a.xz[1]);
    // four survey ticks
    const tickGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2 + Math.PI / 4;
      pts.push(Math.cos(ang) * (R - 0.25), 0, Math.sin(ang) * (R - 0.25), Math.cos(ang) * (R + 0.25), 0, Math.sin(ang) * (R + 0.25));
    }
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
    ring.add(ticks);
    // label on the edge facing the rotunda centre
    const dx = c[0] - a.xz[0], dz = c[1] - a.xz[1], dl = Math.hypot(dx, dz) || 1;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(a.layer.replace('L', '')), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, color: RING_COLOR }));
    label.scale.set(0.6, 0.3, 1);
    label.position.set(a.xz[0] + (dx / dl) * (R + 0.3), fy + 0.16, a.xz[1] + (dz / dl) * (R + 0.3));
    ringGroup.add(ring, label);
    rings.push({ layer: a.layer, ring, ticks, label });
  });
}
function nextStopLayer() {
  const s = TOUR.stops[state.stopIndex + 1];
  return s ? s.layer : null;
}
function updateGlyphs(dt, t) {
  const k = 1 - Math.exp(-dt * 4);
  const nxt = state.mode === 'tour' ? nextStopLayer() : null;
  rings.forEach((r) => {
    let target;
    if (state.mode === 'loading') target = 0;
    else if (r.layer === state.layer) target = 0.85;
    else if (r.layer === nxt) target = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4));
    else target = state.light === 'hidden' ? 0.4 : 0.22;
    if (state.mode === 'overview') target = Math.max(target, 0.6);
    const m = r.ring.material;
    m.opacity += (target - m.opacity) * k;
    r.ticks.material.opacity = m.opacity;
    r.label.material.opacity = Math.min(1, m.opacity * 1.15);
  });
}

/* ================= moonbeam through the oculus, aimed at the current layer ================= */
const beam = (() => {
  let ready = false, top = new THREE.Vector3(), rTop = 2.0;
  const target = new THREE.Vector3(), cur = new THREE.Vector3(); let rTarget = 2.5, rCur = 2.5, inten = 0;
  const uni = { uTop: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, -1, 0) }, uP1: { value: new THREE.Vector3(1, 0, 0) },
    uP2: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 20 }, uRt: { value: 2 }, uRb: { value: 2.5 }, uI: { value: 0 }, uTime: { value: 0 } };
  const vCommon = `uniform vec3 uTop; uniform vec3 uAxis; uniform vec3 uP1; uniform vec3 uP2; uniform float uLen; uniform float uRt; uniform float uRb;
    vec3 place(float h, float ang, float rad){ float R = mix(uRt, uRb, h); return uTop + uAxis * (h * uLen) + (uP1 * cos(ang) + uP2 * sin(ang)) * R * rad; }`;
  // cone surface: (u = angle 0..1, v = 0 top .. 1 bottom)
  const coneGeo = new THREE.PlaneGeometry(1, 1, 64, 16);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: vCommon + `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ float ang = uv.x * 6.2831853; float h = 1.0 - uv.y; vH = h;
        vec3 p = place(h, ang, 1.0);
        vN = normalize(normalMatrix * (uP1 * cos(ang) + uP2 * sin(ang)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = smoothstep(0.0, 0.08, vH) * (1.0 - 0.45 * vH);
        gl_FragColor = vec4(vec3(0.72, 0.78, 1.0) * core * fade * uI * 0.16, 1.0); }`,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.frustumCulled = false;
  // dust motes drifting in the beam
  const N = 420, mg = new THREE.BufferGeometry(), seeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seeds[i * 3] = Math.random(); seeds[i * 3 + 1] = Math.random() * 6.2831853; seeds[i * 3 + 2] = Math.sqrt(Math.random()); }
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: vCommon + `attribute vec3 seed; uniform float uTime; varying float vA;
      void main(){ float h = fract(seed.x + uTime * 0.006); float ang = seed.y + uTime * 0.05;
        vec3 p = place(0.15 + h * 0.85, ang, seed.z * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(26.0 / -mv.z, 1.0, 3.5); vA = sin(h * 3.14159); }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(vec3(0.85, 0.88, 1.0) * d * vA * uI * 0.55, 1.0); }`,
  }));
  motes.frustumCulled = false;
  const spot = new THREE.SpotLight('#c8d3f2', 0, 0, 0.3, 0.7, 2);
  return {
    init() {
      // find the oculus: rays straight up from the rotunda centre pass through it
      const c = TOUR.rotunda_center, up = new THREE.Vector3(0, 1, 0);
      let y = null, r = 0;
      for (let rr = 0.5; rr < 8; rr += 0.25) {
        ray.set(new THREE.Vector3(c[0] + rr, 3, c[1]), up); ray.far = 60;
        const h = ray.intersectObjects(occluders, false)[0];
        if (h) { y = h.point.y; r = rr; break; }
      }
      if (y === null) return;
      top.set(c[0], y, c[1]); rTop = Math.max(1, r - 0.15);
      cur.set(c[0], TOUR.floor_y ?? 2.025, c[1]); target.copy(cur);
      scene.add(cone, motes, spot, spot.target);
      ready = true;
    },
    update(dt, t) {
      if (!ready) return;
      const fy = TOUR.floor_y ?? 2.025;
      const st = TOUR.stops[state.stopIndex];
      let want = 0.55;
      if (state.mode !== 'loading' && st?.artifact && state.mode === 'tour') {
        const v = artifactViews.get(st.artifact); target.set(v.look[0], fy, v.look[2]); rTarget = 1.3; want = 1;
      } else if (state.layer) {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        const lp = camera.position.clone().addScaledVector(fwd, 4);
        let best = null, bd = Infinity;
        anchorsOf(state.layer).forEach((a) => { const d = Math.hypot(a.xz[0] - lp.x, a.xz[1] - lp.z); if (d < bd) { bd = d; best = a; } });
        target.set(best.xz[0], fy, best.xz[1]); rTarget = Math.min(best.r, 3.2); want = 1;
      } else { target.set(top.x, fy, top.z); rTarget = 2.4; }
      want *= state.light === 'hidden' ? 1.35 : state.light === 'revealed' ? 0.55 : 1;
      const k = 1 - Math.exp(-dt * 1.8);
      cur.lerp(target, k); rCur += (rTarget - rCur) * k; inten += (want - inten) * k;
      const axis = cur.clone().sub(top); const len = axis.length(); axis.normalize();
      const p1 = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize();
      const p2 = new THREE.Vector3().crossVectors(axis, p1).normalize();
      uni.uTop.value.copy(top); uni.uAxis.value.copy(axis); uni.uP1.value.copy(p1); uni.uP2.value.copy(p2);
      uni.uLen.value = len; uni.uRt.value = rTop; uni.uRb.value = rCur; uni.uI.value = inten; uni.uTime.value = t;
      spot.position.copy(top); spot.target.position.copy(cur);
      spot.angle = Math.min(0.9, Math.atan(rCur / len) * 1.25); spot.intensity = 1100 * inten;
    },
  };
})();

/* ================= museum light: a key light on each artifact of the current layer + contact shadows ================= */
// A small pool of spot lights is moved to the artifacts of the layer the visitor is in, so the objects
// read against the pale marble; soft shadow decals ground every object on its support.
const museum = (() => {
  const POOL = LOW ? 2 : 5;
  const spots = [];
  const info = new Map();   // id -> { c, sz, from }
  function shadowTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  return {
    build() {
      for (let i = 0; i < POOL; i++) {
        const s = new THREE.SpotLight('#fff1dc', 0, 9, 0.4, 0.75, 2);
        scene.add(s, s.target); spots.push({ s, id: null, want: 0 });
      }
      const tex = shadowTex();
      const rc = TOUR.rotunda_center;
      registry.forEach((e, id) => {
        const box = new THREE.Box3();
        e.meshes.forEach((m) => box.expandByObject(m));
        if (box.isEmpty()) return;
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const sz = Math.max(size.x, size.y, size.z);
        const dir = new THREE.Vector3(rc[0] - c.x, 0, rc[1] - c.z);
        if (dir.lengthSq() < 4) dir.set(0, 0, 1); dir.normalize();
        const from = c.clone().addScaledVector(dir, 1.1 + sz * 0.6); from.y = box.max.y + 1.9;
        info.set(id, { c, sz, from });
        // contact shadow on the surface just below the object
        ray.set(new THREE.Vector3(c.x, box.min.y + 0.04, c.z), DOWN); ray.far = 0.5;
        const hit = ray.intersectObjects(occluders, false).find((h) => h.object.userData._artifactId !== id);
        if (!hit) return;
        const w = Math.max(size.x, size.z) * 1.55 + 0.08;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        d.position.set(c.x, hit.point.y + 0.003, c.z); d.renderOrder = 2; scene.add(d);
      });
    },
    update(dt) {
      if (!spots.length) return;
      const ids = state.layer && state.mode !== 'loading' ? (artifactsByLayer.get(state.layer) ?? []).map((a) => a.id).filter((id) => info.has(id)) : [];
      const P = { guided: 22, hidden: 26, revealed: 12 }[state.light];
      const k = 1 - Math.exp(-dt * 2.5);
      spots.forEach((sp, i) => {
        const id = ids[i] ?? null;
        if (id !== sp.id && sp.s.intensity < 0.3) {          // retarget only once the old light has faded
          sp.id = id;
          if (id) { const f = info.get(id); sp.s.position.copy(f.from); sp.s.target.position.copy(f.c);
            const dist = f.from.distanceTo(f.c); sp.s.angle = Math.min(0.75, Math.atan((f.sz * 0.75 + 0.2) / dist)); sp.s.distance = dist * 2.2; }
        }
        const want = sp.id && sp.id === id ? P * (info.get(sp.id).sz > 1.5 ? 1.6 : 1) : 0;
        sp.s.intensity += (want - sp.s.intensity) * k;
        sp.s.visible = sp.s.intensity > 0.05;
      });
    },
  };
})();

/* ================= revealed: the L01 jars turn translucent and show what they hide ================= */
const jars = (() => {
  let mats = null, cur = 1;
  function collect() {
    mats = [];
    registry.forEach((e) => {
      if (!e.meshes.some((m) => m.userData._part === 'inner')) return;          // only artifacts kept inside a vessel
      e.meshes.filter((m) => m.userData._part !== 'inner').forEach((m) => eachMat(m, (mt) => { mt.userData._jar = true; mats.push(mt); }));
    });
  }
  return {
    update(dt) {
      if (!mats) { if (registry.size) collect(); else return; }
      const want = state.light === 'revealed' ? 0.22 : 1;
      if (Math.abs(want - cur) < 0.002) return;
      cur += (want - cur) * (1 - Math.exp(-dt * 3)); if (Math.abs(want - cur) < 0.003) cur = want;
      const see = cur < 0.995;
      mats.forEach((mt) => {
        if (mt.transparent !== see) { mt.transparent = see; mt.depthWrite = !see; mt.needsUpdate = true; }
        mt.opacity = cur;
      });
    },
  };
})();

/* ================= quality: resolution follows the frame rate ================= */
const quality = (() => {
  const low = LOW;   // light building, no antialiasing, fewer lights; the resolution may drop to keep it fluid
  const maxPR = Math.min(devicePixelRatio, low ? 1 : 1.5);
  const minPR = low ? 0.7 : Math.min(devicePixelRatio, 1);   // the full version never drops below native sharpness
  let pr = maxPR, sum = 0, n = 0, last = performance.now(), hold = 0;
  renderer.setPixelRatio(pr);
  return {
    low, get pixelRatio() { return pr; },
    update() {
      const now = performance.now(), ms = now - last; last = now;
      if (document.hidden || ms > 400) return;               // tab switch, not a slow frame
      sum += ms; n++;
      if (sum < 1500) return;
      const avg = sum / n; sum = 0; n = 0;
      if (hold > 0) { hold--; return; }
      let next = pr;
      if (avg > 36 && pr > minPR) next = Math.max(minPR, pr - 0.15);
      else if (avg < 19 && pr < maxPR) next = Math.min(maxPR, pr + 0.1);
      if (next !== pr) { pr = next; renderer.setPixelRatio(pr); hold = 1; }
    },
  };
})();

/* ================= spatial lighting ================= */
function anchorsOf(layer) { return TOUR.layer_anchors.filter((a) => a.layer === layer); }
function updateLighting(dt) {
  const P = LIGHT_PRESET[state.light];
  const k = 1 - Math.exp(-dt * 3);
  const kr = 1 - Math.exp(-dt * 1.6);
  hemi.intensity += (P.hemi - hemi.intensity) * k;
  oculus.intensity += (P.oculus - oculus.intensity) * k;
  layerLights.forEach(({ layer, light }) => {
    const f = state.layer ? (layer === state.layer ? P.on : P.off) : (state.light === 'revealed' ? P.on : P.off);
    light.intensity += (f * LAYER_LIGHT_POWER - light.intensity) * k;
  });
  // focus targets
  const zones = state.layer ? anchorsOf(state.layer) : [];
  for (let i = 0; i < 4; i++) {
    const tgt = focusTargets[i];
    const z = zones[i];
    if (z) { if (tgt.s === 0) { tgt.x = z.xz[0]; tgt.z = z.xz[1]; } tgt.x = z.xz[0]; tgt.z = z.xz[1]; tgt.r = z.r * 1.1; tgt.s = 1; }
    else { tgt.s = 0; tgt.r = 0; }
  }
  const pool = focusTargets[4];
  pool.x = camera.position.x; pool.z = camera.position.z; pool.r = 2.2; pool.s = P.pool;
  focus.uFoci.value.forEach((v, i) => {
    const tg = focusTargets[i];
    if (i === 4) { v.set(tg.x, tg.z, tg.r, v.w + (tg.s - v.w) * k); return; }
    if (tg.s > 0 && v.w <= 0.001) { v.x = tg.x; v.y = tg.z; v.z = 0.2; }   // new zone: grow from its centre
    v.x += (tg.x - v.x) * kr; v.y += (tg.z - v.y) * kr;
    v.z += (tg.r - v.z) * kr;
    v.w += (tg.s - v.w) * k;
  });
  const dimTarget = state.mode === 'loading' ? 1 : (state.layer ? P.dim : P.none);
  focus.uFocusDim.value += (dimTarget - focus.uFocusDim.value) * k;
  focus.uFocusFall.value.x += (P.fall[0] - focus.uFocusFall.value.x) * k;
  focus.uFocusFall.value.y += (P.fall[1] - focus.uFocusFall.value.y) * k;
}

/* ================= layer detection ================= */
function detectLayer() {
  let best = null;
  if (state.mode === 'tour') {
    best = state.tween ? state.layer : TOUR.stops[state.stopIndex].layer;
  } else if (state.mode === 'walk') {
    const px = camera.position.x - Math.sin(state.yaw) * 2.5;
    const pz = camera.position.z - Math.cos(state.yaw) * 2.5;
    let bestD = Infinity;
    for (const a of TOUR.layer_anchors) {
      const d = Math.hypot(px - a.xz[0], pz - a.xz[1]);
      if (d < a.r * 1.5 && d < bestD) { best = a.layer; bestD = d; }
    }
  } else return;
  if (best !== state.layer) {
    state.layer = best;
    state.layerSince = clock.elapsedTime;
    renderLayerChip();
  }
}

function layerLabel(id) { return `${UI.layer} ${id.replace('L', '')}`; }
function renderLayerChip() {
  const chip = $('#layerChip');
  if (!state.layer) { chip.hidden = true; return; }
  const L = layersById.get(state.layer);
  chip.innerHTML = '';
  chip.append(el('small', 'kicker', `${layerLabel(state.layer)}${L?.phase ? ' · ' + L.phase : ''}`), el('span', null, L ? L.title : ''));
  chip.hidden = false;
}

/* ================= layer arrival card ================= */
let cardTimer = 0;
function firstSentence(text) {
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : text;
}
let cardTarget = { kind: 'layer', id: null };
function showArtifactCard(id) {
  const a = artifactsById.get(id); if (!a) return;
  cardTarget = { kind: 'artifact', id };
  $('#lcKicker').textContent = `${a.id} · ${layerLabel(a.layer)}`;
  $('#lcTitle').textContent = a.title;
  $('#lcText').textContent = a.short_text; $('#lcText').hidden = false;
  $('#lcMore').textContent = UI.openEntry;
  const card = $('#layerCard'); card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  clearTimeout(cardTimer); cardTimer = setTimeout(hideLayerCard, 14000);
}
function showLayerCard(layerId, compact = false) {
  const L = layersById.get(layerId);
  if (!L) return;
  cardTarget = { kind: 'layer', id: layerId };
  $('#lcMore').textContent = UI.readLayer;
  state.lastCardLayer = layerId;
  $('#lcKicker').textContent = `${layerLabel(layerId)}${L.phase ? ' · ' + L.phase : ''}`;
  $('#lcTitle').textContent = L.title;
  $('#lcText').textContent = compact ? '' : firstSentence(L.intro);
  $('#lcText').hidden = compact;
  const card = $('#layerCard');
  card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideLayerCard, compact ? 6000 : 16000);
}
function hideLayerCard() { $('#layerCard').hidden = true; }
$('#layerCardClose').addEventListener('click', hideLayerCard);
$('#lcMore').addEventListener('click', () => { hideLayerCard(); if (cardTarget.kind === 'artifact') openArtifact(cardTarget.id); else openLayer(cardTarget.id || state.lastCardLayer); });
$('#layerChip').addEventListener('click', () => state.layer && openLayer(state.layer));

/* ================= camera helpers ================= */
function lookAngles(from, to) {
  const d = new THREE.Vector3().subVectors(to, from).normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}
function applyAngles() {
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.35, 1.35);
  camera.rotation.set(state.pitch, state.yaw, 0);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function shortestAngle(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

/* ================= artifact viewpoints + tour stops per artifact ================= */
const artifactViews = new Map();   // id -> { pos, look }
function computeArtifactView(id) {
  const e = registry.get(id); if (!e) return null;
  const box = new THREE.Box3();
  e.meshes.filter((m) => m.userData._part === 'main').forEach((m) => box.expandByObject(m));
  if (box.isEmpty()) e.meshes.forEach((m) => box.expandByObject(m));
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const sz = Math.max(size.x, size.y, size.z);
  const rc = TOUR.rotunda_center;
  const dir = new THREE.Vector3(rc[0] - c.x, 0, rc[1] - c.z);
  if (dir.lengthSq() < 4) dir.set(0, 0, 1); else dir.normalize();   // centre (altar): seen from the entrance side
  dir.normalize();
  const fy = TOUR.floor_y ?? 2.025;
  let dist = THREE.MathUtils.clamp(sz * 1.9 + 1.0, 1.5, 4.2);
  const eyeY = THREE.MathUtils.clamp(c.y + 0.45 + sz * 0.25, fy + 1.25, fy + 2.0);
  const from = new THREE.Vector3(c.x, eyeY, c.z);
  ray.set(from, dir); ray.far = dist;
  const hit = ray.intersectObjects(occluders, false).find((h) => h.object.userData._artifactId !== id && h.distance > 0.3);
  if (hit) dist = Math.max(1.0, hit.distance - 0.25);
  return { pos: from.clone().addScaledVector(dir, dist).toArray(), look: c.toArray() };
}
function buildTourStops() {
  const base = TOUR.base_stops;
  const assign = new Map();
  DATA.artifacts.forEach((a) => {
    const v = computeArtifactView(a.id); if (!v) return;
    artifactViews.set(a.id, v);
    let best = -1, bd = Infinity;
    base.forEach((st, i) => {
      if (st.layer !== a.layer) return;
      const d = Math.hypot(st.look[0] - v.look[0], st.look[2] - v.look[2]);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { if (!assign.has(best)) assign.set(best, []); assign.get(best).push(a.id); }
  });
  const out = [];
  base.forEach((st, i) => {
    out.push(st);
    (assign.get(i) || []).sort().forEach((id) => {
      const v = artifactViews.get(id);
      out.push({ id, layer: artifactsById.get(id).layer, artifact: id, pos: v.pos, look: v.look });
    });
  });
  const cur = TOUR.stops[state.stopIndex]?.id;
  TOUR.stops = out;
  const ni = out.findIndex((st) => st.id === cur);
  if (ni >= 0) state.stopIndex = ni;
  if (state.mode === 'tour') renderStopLabel();
}
function goToArtifact(id) {
  const i = TOUR.stops.findIndex((st) => st.artifact === id);
  if (i < 0) { const a = artifactsById.get(id); if (a) travelToLayer(a.layer, a.position); return; }
  if (state.mode !== 'tour') setMode('tour');
  goToStop(i);
}

/* ================= tour ================= */
function goToStop(i, instant = false) {
  const stops = TOUR.stops;
  state.stopIndex = THREE.MathUtils.clamp(i, 0, stops.length - 1);
  const s = stops[state.stopIndex];
  const pos = new THREE.Vector3(...s.pos);
  const ang = lookAngles(pos, new THREE.Vector3(...s.look));
  hideLayerCard();
  if (instant) {
    camera.position.copy(pos); state.yaw = ang.yaw; state.pitch = ang.pitch; applyAngles();
    state.tween = null;
    onArrive();
  } else {
    const dist = camera.position.distanceTo(pos);
    state.tween = {
      t: 0, dur: THREE.MathUtils.clamp(dist / 4.5, 1.2, 4.5),
      p0: camera.position.clone(), p1: pos,
      y0: state.yaw, dy: shortestAngle(state.yaw, ang.yaw), x0: state.pitch, x1: ang.pitch,
    };
  }
  state.footY = pos.y - TOUR.eye_height;
  renderStopLabel();
  followPanel(s);
}
// an open catalogue panel follows the visit: an artifact stop shows that entry, a layer stop that layer
function followPanel(s) {
  const pn = state.panel;
  if (!pn || (pn.kind !== 'artifact' && pn.kind !== 'layer')) return;
  if (s.artifact) { if (!(pn.kind === 'artifact' && pn.id === s.artifact)) openArtifact(s.artifact); }
  else if (s.layer) { if (!(pn.kind === 'layer' && pn.id === s.layer)) openLayer(s.layer); }
  else closePanel();
}
function onArrive() {
  const s = TOUR.stops[state.stopIndex];
  if (state.mode !== 'tour' || state.panel) return;
  if (s.artifact) { showArtifactCard(s.artifact); rim.flash(s.artifact); }
  else if (s.layer) showLayerCard(s.layer);
}
function updateTween(dt) {
  const tw = state.tween;
  if (!tw) return;
  tw.t += dt / tw.dur;
  const k = ease(Math.min(tw.t, 1));
  camera.position.lerpVectors(tw.p0, tw.p1, k);
  state.yaw = tw.y0 + tw.dy * k;
  state.pitch = tw.x0 + (tw.x1 - tw.x0) * k;
  applyAngles();
  if (tw.t >= 1) { state.tween = null; onArrive(); }
}
function renderStopLabel() {
  const s = TOUR.stops[state.stopIndex];
  const box = $('#stopLabel');
  box.innerHTML = '';
  const art = s.artifact ? artifactsById.get(s.artifact) : null;
  const name = art ? art.title : s.layer ? (layersById.get(s.layer)?.title ?? s.layer) : (UI.stopNames[s.id] ?? '');
  const count = `${UI.stop} ${state.stopIndex + 1} / ${TOUR.stops.length}`;
  const small = el('small', null, art ? `${layerLabel(s.layer)} · ${art.id} · ${count}` : s.layer ? `${layerLabel(s.layer)} · ${count}` : count);
  box.append(small, document.createTextNode(name));
  $('#prevStop').disabled = state.stopIndex === 0;
  const last = state.stopIndex === TOUR.stops.length - 1;
  const nb = $('#nextStop');
  nb.classList.toggle('is-explore', last);
  nb.classList.toggle('btn--icon', !last);
  nb.innerHTML = last ? '' : '<svg><use href="#i-next"/></svg>';
  if (last) nb.textContent = UI.explore;
}
function stopForLayer(layerId, near) {
  const cands = TOUR.stops.map((s, i) => ({ s, i })).filter((o) => o.s.layer === layerId && !o.s.artifact);
  if (!cands.length) return -1;
  if (!near) return cands[0].i;
  cands.sort((a, b) => Math.hypot(a.s.look[0] - near[0], a.s.look[2] - near[2]) - Math.hypot(b.s.look[0] - near[0], b.s.look[2] - near[2]));
  return cands[0].i;
}
function travelToLayer(layerId, near) {
  const i = stopForLayer(layerId, near);
  if (i < 0) return;
  if (state.mode !== 'tour') setMode('tour');
  goToStop(i);
}

/* ================= modes ================= */
let orbit = null;
function setMode(mode) {
  if (mode === state.mode) return;
  const prev = state.mode;
  if (prev === 'overview') {
    orbit.enabled = false;
    clipPlane.constant = 1e5;
    if (state.savedPose) {
      camera.position.copy(state.savedPose.pos); state.yaw = state.savedPose.yaw; state.pitch = state.savedPose.pitch;
      camera.up.set(0, 1, 0); applyAngles();
    }
  }
  if (prev === 'walk') { state.walkTo = null; state.wheelV = 0; floorCursor.dest(null); }
  state.mode = mode;
  state.tween = null;
  if (mode === 'overview') {
    state.savedPose = { pos: camera.position.clone(), yaw: state.yaw, pitch: state.pitch };
    const c = TOUR.rotunda_center;
    if (!orbit) {
      orbit = new OrbitControls(camera, canvas);
      orbit.enableDamping = true;
      orbit.maxPolarAngle = Math.PI * 0.49;
      orbit.minDistance = 6; orbit.maxDistance = 120;
    }
    orbit.target.set(c[0], 2.5, c[1]);
    camera.position.set(c[0] + 22, 30, c[1] + 22);
    orbit.enabled = true;
    orbit.update();
    clipPlane.constant = TOUR.overview_clip_y;
  }
  if (mode === 'walk') {
    const g = groundAt(camera.position.x, camera.position.z, camera.position.y - TOUR.eye_height + 0.5);
    if (g !== null) state.footY = g;
  }
  document.querySelectorAll('.btn--mode[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#tourBar').hidden = mode !== 'tour';
  $('#joystick').hidden = !(isTouch && mode === 'walk');
  $('#crosshair').hidden = true;
  if (mode !== 'tour') hideLayerCard();
  updateHelp();
  setHover(null);
  floorCursor.hover(null);
}
function updateHelp() {
  const h = UI.help;
  let t = h.tour;
  if (state.mode === 'walk') t = isTouch ? h.walkTouch : h.walk;
  if (state.mode === 'overview') t = h.overview;
  $('#help').textContent = t;
}
function setLight(mode) {
  state.light = mode;
  $('#lightLabel').textContent = UI.light[mode];
  $('#lightToggle').setAttribute('aria-pressed', String(mode !== 'guided'));
}

/* ================= walking ================= */
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);
function groundAt(x, z, fromY) {
  ray.set(new THREE.Vector3(x, fromY, z), DOWN);
  ray.far = 6;
  const hit = ray.intersectObjects(occluders, false)[0];
  return hit ? hit.point.y : null;
}
function blocked(from, dir, dist) {
  for (const h of [0.45, 1.25]) {
    ray.set(new THREE.Vector3(from.x, state.footY + h, from.z), dir);
    ray.far = dist;
    if (ray.intersectObjects(occluders, false).length) return true;
  }
  return false;
}
function tryMove(dx, dz) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) return false;
  const dir = new THREE.Vector3(dx / len, 0, dz / len);
  if (blocked(camera.position, dir, len + 0.3)) return false;
  const nx = camera.position.x + dx, nz = camera.position.z + dz;
  const g = groundAt(nx, nz, state.footY + 0.55);
  if (g === null || g - state.footY > 0.4) return false;
  const c = TOUR.rotunda_center;
  if (Math.hypot(nx - c[0], nz - c[1]) > (TOUR.walk_radius ?? 70)) return false;
  camera.position.x = nx; camera.position.z = nz;
  state.footY = g;
  return true;
}
function moveBy(dx, dz) { if (!tryMove(dx, dz)) { if (!tryMove(dx, 0) && !tryMove(0, dz)) return false; } return true; }
function updateWalk(dt) {
  let f = 0, s = 0, turn = 0;
  const k = state.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD')) s += 1;
  if (k.has('KeyA')) s -= 1;
  if (k.has('ArrowRight')) turn -= 1;
  if (k.has('ArrowLeft')) turn += 1;
  if (turn) { state.yaw += turn * 1.7 * dt; applyAngles(); }
  f += -state.joy.y; s += state.joy.x;
  const mag = Math.hypot(f, s);
  if (mag > 0.01 || turn) { state.walkTo = null; state.wheelV = 0; }
  // scroll wheel: a short glide forward or back
  if (Math.abs(state.wheelV) > 0.02) {
    const sy = Math.sin(state.yaw), cy = Math.cos(state.yaw);
    if (!moveBy(-sy * state.wheelV * dt, -cy * state.wheelV * dt)) state.wheelV = 0;
    state.wheelV *= Math.exp(-dt * 3.2);
  } else state.wheelV = 0;
  // click-to-walk: glide to the clicked spot on the floor, turning gently towards it
  if (state.walkTo) {
    const dx = state.walkTo.x - camera.position.x, dz = state.walkTo.z - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) state.walkTo = null;
    else {
      const sp = Math.min(2.4 * Math.min(1, d / 0.8 + 0.25) * dt, d);
      if (!moveBy(dx / d * sp, dz / d * sp)) state.walkTo = null;
      if (d > 0.7 && !(drag && drag.moved > 6)) {
        const want = Math.atan2(-dx, -dz);
        state.yaw += shortestAngle(state.yaw, want) * (1 - Math.exp(-dt * 1.6)); applyAngles();
      }
    }
  }
  floorCursor.dest(state.walkTo);
  if (mag > 0.01) {
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.2 : 2.0) * Math.min(mag, 1);
    const nf = f / Math.max(mag, 1), ns = s / Math.max(mag, 1);
    const sy = Math.sin(state.yaw), cy = Math.cos(state.yaw);
    const dx = (-sy * nf + cy * ns) * speed * dt;
    const dz = (-cy * nf - sy * ns) * speed * dt;
    moveBy(dx, dz);
  }
  camera.position.y += (state.footY + TOUR.eye_height - camera.position.y) * (1 - Math.exp(-dt * 12));
  // compact card when the visitor settles in a new layer
  if (state.layer && state.layer !== state.lastCardLayer && clock.elapsedTime - state.layerSince > 1.2) showLayerCard(state.layer, true);
  // walking away into another layer closes an entry left open
  const pn = state.panel;
  if (pn && state.layer && clock.elapsedTime - state.layerSince > 1.5) {
    const lay = pn.kind === 'artifact' ? artifactsById.get(pn.id)?.layer : pn.kind === 'layer' ? pn.id : null;
    if (lay && lay !== state.layer) closePanel();
  }
}

/* ================= hover / pick ================= */
const pointer = new THREE.Vector2();
let pointerInside = false;
const tooltip = $('#tooltip');
function pick() {
  if (state.mode === 'loading' || state.tween) return null;
  if (state.locked) ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  else if (pointerInside) ray.setFromCamera(pointer, camera);
  else return null;
  ray.far = state.mode === 'overview' ? 400 : 30;
  const hits = ray.intersectObjects(occluders, false);
  const hit = state.mode === 'overview' ? hits.find((h) => !(h.point.y > TOUR.overview_clip_y && archRootContains(h.object))) : hits[0];
  lastHit = hit ?? null;
  return hit ? (hit.object.userData._artifactId ?? null) : null;
}
let lastHit = null;
const _n = new THREE.Vector3();
// a walkable spot under the pointer: an upward-facing surface near the visitor's floor level
function floorPoint(hit = lastHit) {
  if (!hit || hit.object.userData._artifactId || !hit.face || state.mode === 'overview') return null;
  _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
  if (Math.abs(_n.y) < 0.75) return null;           // walls, columns
  if (Math.abs(hit.point.y - state.footY) > 0.9) return null;
  if (hit.distance > 24) return null;
  return hit.point;
}
/* floor cursor: a soft ring under the pointer, and the destination while walking */
const floorCursor = (() => {
  const mk = (r0, r1, o) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color: '#c9c6ff', transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; scene.add(m); return m;
  };
  const hover = mk(0.16, 0.2, 0.55), goal = mk(0.1, 0.26, 0.4);
  return {
    hover(p) { hover.visible = !!p; if (p) hover.position.set(p.x, p.y + 0.015, p.z); },
    dest(p) { goal.visible = !!p; if (p) { goal.position.set(p.x, p.y + 0.015, p.z); const s = 1 + 0.12 * Math.sin(clock.elapsedTime * 5); goal.scale.set(s, s, s); } },
  };
})();
function walkTo(p) {
  if (state.mode !== 'walk') setMode('walk');
  state.walkTo = { x: p.x, y: p.y, z: p.z };
  state.wheelV = 0;
}
function archRootContains(o) { for (let p = o; p; p = p.parent) if (p === archRoot) return true; return false; }
function setHover(id) {
  if (id === state.hover) return;
  state.hover = id;
  rim.hover(id);
  canvas.style.cursor = id ? 'pointer' : '';
  if (!id) { tooltip.hidden = true; return; }
  sound.hover(id);
  const a = registry.get(id).data;
  const th = $('.tooltip__thumb', tooltip);
  if (a.images && a.images[0]) { th.src = a.images[0].thumb; th.hidden = false; } else th.hidden = true;
  $('.tooltip__id', tooltip).textContent = a.id;
  $('.tooltip__layer', tooltip).textContent = layerLabel(a.layer);
  $('.tooltip__title', tooltip).textContent = a.title;
  $('.tooltip__text', tooltip).textContent = a.short_text;
  $('.tooltip__status', tooltip).textContent = a.status_label;
  $('.tooltip__hint', tooltip).textContent = isTouch ? UI.tapHint : UI.clickHint;
  tooltip.hidden = false;
}
const HL = new THREE.Color('#a9a5e6');
function highlight(id, on) {
  const e = registry.get(id);
  if (!e) return;
  e.materials.forEach((m) => {
    if (m.uniforms?.uHighlight) { m.uniforms.uHighlight.value = on ? 1 : 0; return; }
    if (m.emissive) {
      if (on) { m.userData._em = m.emissive.clone(); m.userData._ei = m.emissiveIntensity; m.emissive.copy(HL); m.emissiveIntensity = 0.28; }
      else if (m.userData._em) { m.emissive.copy(m.userData._em); m.emissiveIntensity = m.userData._ei; }
    }
  });
}
function placeTooltip(x, y) {
  const pad = 18, w = tooltip.offsetWidth, h = tooltip.offsetHeight;
  let tx = x + pad, ty = y + pad;
  if (tx + w > innerWidth - 8) tx = x - w - pad;
  if (ty + h > innerHeight - 8) ty = y - h - pad;
  tooltip.style.left = `${Math.max(8, tx)}px`;
  tooltip.style.top = `${Math.max(8, ty)}px`;
}
let lastPointer = { x: innerWidth / 2, y: innerHeight / 2 };
function select(id) {
  if (!id) return;
  openArtifact(id);
  goToArtifact(id);
  window.dispatchEvent(new CustomEvent('artifact:select', { detail: { id } }));
}

/* ================= hover outline: a thin luminous line around the artifact's silhouette ================= */
// Inverted hull: back faces of a copy pushed outwards by a few pixels, so only the silhouette shows
// (flat objects like folders no longer fill up); a faint fresnel keeps the soft glow on curved forms.
const rim = (() => {
  const group = new THREE.Group(); scene.add(group);
  const uColor = { value: new THREE.Color('#c4c0ff') }, uStrength = { value: 0 }, uRes = { value: new THREE.Vector2(innerWidth, innerHeight) };
  // the object's own pixels are marked in the stencil, the hull draws only outside them
  const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const hullMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
    uniforms: { uColor, uStrength, uRes, uWidth: { value: 2.0 } },
    vertexShader: `uniform vec2 uRes; uniform float uWidth;
      void main(){ vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 nv = normalize(normalMatrix * normal); vec2 nd = (projectionMatrix * vec4(nv, 0.0)).xy;
        float l = length(nd); if (l > 1e-5) clip.xy += nd / l * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; void main(){ gl_FragColor = vec4(uColor * uStrength, 1.0); }`,
  });
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, toneMapped: false,
    uniforms: { uColor, uStrength },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float r = pow(smoothstep(0.72, 1.0, f), 2.0); gl_FragColor = vec4(uColor * r * uStrength * 0.45, 1.0); }`,
  });
  addEventListener('resize', () => uRes.value.set(innerWidth, innerHeight));
  const cache = new Map(); let cur = null, strength = 0, target = 0, flashT = 0;
  function smooth(geo) {
    let g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position);
    if (geo.index) g.setIndex(geo.index);
    g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g;
  }
  function build(id) {
    if (cache.has(id)) return cache.get(id);
    const e = registry.get(id); if (!e) return null;
    const g = new THREE.Group();
    e.meshes.forEach((m) => {
      const sg = smooth(m.geometry);
      [[maskMat, 3], [glowMat, 4], [hullMat, 5]].forEach(([mat, ro]) => { const o = new THREE.Mesh(sg, mat); o.matrixAutoUpdate = false; o.matrix.copy(m.matrixWorld); o.renderOrder = ro; g.add(o); });
    });
    cache.set(id, g); return g;
  }
  function set(id) {
    if (cur === id) return;
    if (cur && cache.get(cur)) group.remove(cache.get(cur));
    cur = id;
    if (id) { const g = build(id); if (g) group.add(g); }
  }
  return {
    hover(id) { if (id) { set(id); target = 1; } else if (flashT <= 0) target = 0; },
    flash(id) { set(id); flashT = 3; target = 1; },
    update(dt, t) {
      if (flashT > 0) { flashT -= dt; if (flashT <= 0 && state.hover !== cur) target = 0; }
      strength += (target - strength) * (1 - Math.exp(-dt * 8));
      uStrength.value = strength * (0.85 + 0.15 * Math.sin(t * 3.0)) * 1.25;
      if (strength < 0.01 && target === 0 && cur) set(null);
    },
  };
})();

/* ================= panel: artifact / layer ================= */
const panel = $('#panel');
const panelBody = $('#panelBody');
function openPanel(kind, id) {
  state.panel = { kind, id };
  setHover(null);
  hideLayerCard();
  panel.hidden = false;
  panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
  panelBody.scrollTop = 0;
}
function closePanel() {
  panel.hidden = true;
  state.panel = null;
  viewer.clear();
}
// keep the subject centred in the free part of the screen while the panel is open
let viewShift = 0;
function updateViewOffset(dt) {
  const target = state.panel && innerWidth > 760 ? (panel.getBoundingClientRect().width + 16) / 2 : 0;
  viewShift += (target - viewShift) * (1 - Math.exp(-dt * 5));
  if (Math.abs(viewShift) < 0.5) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
  camera.setViewOffset(innerWidth, innerHeight, viewShift, 0, innerWidth, innerHeight);
}
$('#panelClose').addEventListener('click', closePanel);

function gallery(layerId) {
  const L = layersById.get(layerId);
  const imgs = L?.images ?? [];
  if (!imgs.length) return null;
  const wrap = el('div');
  wrap.append(el('h4', null, UI.inCabinet));
  const g = el('div', 'gallery');
  imgs.forEach((im) => {
    const b = el('button'); b.type = 'button';
    const img = el('img'); img.src = im.src; img.alt = ''; img.loading = 'lazy';
    b.append(img);
    b.addEventListener('click', () => openLightbox(im.src, ''));
    g.append(b);
  });
  wrap.append(g);
  return wrap;
}
$('#lightboxClose').addEventListener('click', () => { $('#lightbox').hidden = true; });
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; });

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function figureBlock(a, idx) {
  const imgs = a.images;
  const wrap = el('figure', 'fig');
  const im = imgs[idx];
  const btn = el('button', 'fig__img'); btn.type = 'button';
  const small = !im.render;          // third-party catalogue pictures: shown small, with their source, not enlarged
  const img = el('img'); img.src = small ? im.thumb : im.src; img.alt = a.title; img.width = im.w; img.height = im.h;
  btn.append(img);
  if (small) { wrap.classList.add('fig--small'); btn.disabled = true; }
  else btn.addEventListener('click', () => openLightbox(im.src, creditText(im)));
  wrap.append(btn);
  if (imgs.length > 1) {
    const row = el('div', 'fig__thumbs');
    imgs.forEach((x, k) => {
      const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(k === idx));
      const ti = el('img'); ti.src = x.thumb; ti.alt = ''; b.append(ti);
      b.addEventListener('click', () => { const nb = figureBlock(a, k); wrap.replaceWith(nb); });
      row.append(b);
    });
    wrap.append(row);
  }
  const cap = el('figcaption');
  if (im.figure) cap.append(el('b', null, `${UI.figure} ${im.figure}. `));
  if (im.caption) cap.append(document.createTextNode(im.caption));
  if (im.url) {
    const line = el('span', 'fig__src'); line.append(`${UI.source}: `);
    const host = hostOf(im.url);
    if (im.url_ok) { const l = el('a', null, host || im.url); l.href = im.url; l.target = '_blank'; l.rel = 'noopener noreferrer'; line.append(l); }
    else line.append(host || im.url);
    cap.append(line);
  }
  if (im.credit) cap.append(el('span', 'fig__credit', im.credit));
  wrap.append(cap);
  return wrap;
}
function creditText(im) {
  return [im.figure ? `${UI.figure} ${im.figure}. ${im.caption}` : im.caption, im.url ? `${UI.source}: ${hostOf(im.url) || im.url}` : '', im.credit].filter(Boolean).join(' · ');
}
function openLightbox(src, caption) {
  $('#lightboxImg').src = src;
  $('#lightboxCap').textContent = caption || '';
  $('#lightbox').hidden = false;
}

function openArtifact(id) {
  const a = artifactsById.get(id);
  if (!a) return;
  openPanel('artifact', id);
  sound.open();
  panelBody.innerHTML = '';
  const L = layersById.get(a.layer);
  const head = el('header', 'panel__head');
  head.append(el('p', 'kicker', `${a.id} · ${layerLabel(a.layer)}${a.phase ? ' · ' + a.phase : ''}`), el('h2', null, a.title));
  const chips = el('div', 'panel__chips');
  chips.append(el('span', `chip chip--${a.status}`, a.status_label));
  head.append(chips);
  panelBody.append(head);

  // media: the catalogue image (with its List of Figures credit) and a live render from the scene
  const tabs = el('div', 'mediatabs');
  const tImg = el('button', 'btn btn--small', UI.tabImage);
  const t3d = el('button', 'btn btn--small', UI.tab3d);
  tabs.append(tImg, t3d);
  const media = el('div', 'media');
  panelBody.append(tabs, media);
  const showImage = () => {
    viewer.clear();
    tImg.setAttribute('aria-pressed', 'true'); t3d.setAttribute('aria-pressed', 'false');
    media.innerHTML = '';
    media.append(figureBlock(a, 0));
  };
  const show3d = () => {
    tImg.setAttribute('aria-pressed', 'false'); t3d.setAttribute('aria-pressed', 'true');
    media.innerHTML = '';
    const v = el('div', 'viewer');
    const vc = el('canvas'); v.append(vc);
    v.append(el('span', 'viewer__cap', a.mapping === 'reconstruction' ? UI.viewerCapRecon : UI.viewerCap));
    const partsBar = el('div', 'viewer__parts'); v.append(partsBar);
    media.append(v);
    viewer.show(id, vc, partsBar);
  };
  tImg.addEventListener('click', showImage);
  t3d.addEventListener('click', show3d);
  if (a.images && a.images.length) showImage(); else { tImg.hidden = true; show3d(); }

  a.sections.forEach((s, i) => {
    const d = el('details', 'sec'); if (i === 0) d.open = true;
    d.append(el('summary', null, s.heading));
    s.text.split(/\n+/).forEach((para) => d.append(el('p', null, para)));
    panelBody.append(d);
  });
  if (a.thesis_theme) {
    const m = el('p', 'meta-row'); m.append(el('b', null, UI.theme + '  '), document.createTextNode(a.thesis_theme)); panelBody.append(m);
  }
  const actions = el('div', 'panel__actions');
  const go = el('button', 'btn btn--ghost btn--small'); go.innerHTML = '<svg><use href="#i-locate"/></svg>'; go.append(UI.locate);
  go.addEventListener('click', () => goToArtifact(a.id));
  const rl = el('button', 'btn btn--ghost btn--small', UI.readLayer);
  rl.addEventListener('click', () => openLayer(a.layer));
  actions.append(go, rl);
  panelBody.append(actions);
  const g = gallery(a.layer);
  if (g) { g.style.marginTop = '1rem'; panelBody.append(g); }
  panelBody.append(el('p', 'source', `${UI.source}: ${a.source}`));
}

function openLayer(layerId) {
  const L = layersById.get(layerId);
  if (!L) return;
  openPanel('layer', layerId);
  viewer.clear();
  panelBody.innerHTML = '';
  const head = el('header', 'panel__head');
  head.append(el('p', 'kicker', `${layerLabel(layerId)}${L.phase ? ' · ' + L.phase : ''}`), el('h2', null, L.title));
  panelBody.append(head);
  const g = gallery(layerId); if (g) panelBody.append(g);
  const go = el('div', 'panel__actions');
  const gb = el('button', 'btn btn--ghost btn--small'); gb.innerHTML = '<svg><use href="#i-locate"/></svg>'; gb.append(UI.locate);
  gb.addEventListener('click', () => travelToLayer(layerId));
  go.append(gb); panelBody.append(go);
  const sec = (head, text, open) => {
    if (!text) return;
    const d = el('details', 'sec'); d.open = open;
    d.append(el('summary', null, head));
    text.split(/\n+/).forEach((p) => d.append(el('p', null, p)));
    panelBody.append(d);
  };
  sec(UI.intro, L.intro, true);
  sec(UI.placement, L.placement, false);
  sec(UI.ritual, L.ritual, false);
  const list = artifactsByLayer.get(layerId) || [];
  if (list.length) {
    const d = el('div', 'sec');
    d.append(el('h4', null, UI.artifacts));
    const ul = el('ul', 'list');
    list.forEach((a) => {
      const li = el('li'); const b = el('button');
      b.append(el('span', null, a.id), document.createTextNode(a.title));
      b.addEventListener('click', () => openArtifact(a.id));
      li.append(b); ul.append(li);
    });
    d.append(ul); panelBody.append(d);
  }
  panelBody.append(el('p', 'source', `${UI.source}: ${L.source}`));
}

function openAbout() {
  openPanel('about', 'about');
  viewer.clear();
  panelBody.innerHTML = '';
  const head = el('header', 'panel__head');
  head.append(el('p', 'kicker', UI.about), el('h2', null, DATA.title));
  panelBody.append(head);
  panelBody.append(el('p', 'meta-row', DATA.subtitle));
  panelBody.append(el('p', null, DATA.author));
  const fr = DATA.about?.framing;
  if (fr) { const q = el('blockquote', 'quote'); q.append(el('p', null, fr.text), el('small', null, fr.source.replace(/\s*\[.*?\]\s*/g, ' ').trim())); panelBody.append(q); }
  const C = DATA.credits || {};
  const sec = (head, nodes, open = false) => { const d = el('details', 'sec'); d.open = open; d.append(el('summary', null, head)); nodes.forEach((n) => d.append(n)); panelBody.append(d); };
  const link = (url, text) => { const a = el('a', null, text || hostOf(url) || url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  sec(UI.creditsImages, (C.figures || []).map((f) => {
    const p = el('p', 'credit'); p.append(el('b', null, `${UI.figure} ${f.figure}. `), document.createTextNode(`${f.title} `));
    if (f.url) f.url.split(' | ').forEach((u, i) => { if (i) p.append(' · '); p.append(link(u)); });
    if (f.note) p.append(el('span', 'fig__credit', f.note));
    return p;
  }), true);
  sec(UI.creditsModels, [
    ...(C.models || []).map((m) => { const p = el('p', 'credit'); p.append(document.createTextNode(m.attribution + ' ')); if (m.url) m.url.split(' | ').forEach((u, i) => { if (i) p.append(' · '); p.append(link(u)); }); p.append(el('span', 'fig__credit', m.license)); return p; }),
    ...(C.models_pending ? [el('p', 'credit fig__credit', UI.modelsPending)] : []),
  ]);
  sec(UI.creditsMaking, [el('p', 'credit', UI.makingCredit)]);
  sec(UI.creditsSound, [el('p', 'credit', UI.soundCredit)]);
  const qb = el('button', 'btn btn--ghost btn--small', quality.low ? UI.qualityHigh : UI.qualityLow);
  qb.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('q', quality.low ? 'high' : 'low'); location.href = u.toString(); });
  sec(UI.qualityHead, [el('p', 'credit', (quality.low ? UI.qualityNowLow : UI.qualityNowHigh) + ' ' + UI.qualityText), qb]);
  sec(UI.creditsSoftware, (C.software || []).map((x) => { const p = el('p', 'credit'); p.append(link(x.url, x.name), ` · ${x.license}`); return p; }));
}
$('#aboutBtn').addEventListener('click', openAbout);

/* ================= artifact viewer (render from the scene) ================= */
const viewer = (() => {
  let vr = null, vs = null, vcam = null, pivot = null, inner = null, cur = null, cvs = null;
  let rotY = 0, rotX = -0.15, auto = true, dragging = null;
  function ensure(c) {
    if (vr && cvs === c) return;
    if (vr) vr.dispose();
    cvs = c;
    vr = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    vr.setPixelRatio(Math.min(devicePixelRatio, 2));
    vr.outputColorSpace = THREE.SRGBColorSpace;
    vr.toneMapping = THREE.ACESFilmicToneMapping;
    vr.toneMappingExposure = 1.0;
    vs = new THREE.Scene();
    vs.add(new THREE.HemisphereLight('#ffffff', '#55524e', 1.3));
    const key = new THREE.DirectionalLight('#fff4e6', 2.0); key.position.set(3, 5, 4); vs.add(key);
    const rim = new THREE.DirectionalLight('#c9c6ff', 0.8); rim.position.set(-4, 2, -3); vs.add(rim);
    vcam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    pivot = new THREE.Group(); vs.add(pivot);
    c.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; auto = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      rotY += (e.clientX - dragging.x) * 0.01; rotX += (e.clientY - dragging.y) * 0.006;
      rotX = THREE.MathUtils.clamp(rotX, -1.2, 1.2);
      dragging = { x: e.clientX, y: e.clientY };
    });
    c.addEventListener('pointerup', () => { dragging = null; });
  }
  function build(entry, part) {
    if (inner) pivot.remove(inner);
    inner = new THREE.Group();
    entry.meshes.filter((m) => m.userData._part === part).forEach((m) => {
      const c = new THREE.Mesh(m.geometry, m.material);
      c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld);
      inner.add(c);
    });
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    inner.position.copy(center).negate();
    pivot.add(inner);
    const r = Math.max(sphere.radius, 0.05);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(vcam.fov / 2)) * 1.08;
    vcam.position.set(0, 0, dist); vcam.near = dist / 100; vcam.far = dist * 10; vcam.updateProjectionMatrix();
    vcam.lookAt(0, 0, 0);
  }
  return {
    show(id, c, partsBar) {
      ensure(c);
      const entry = registry.get(id);
      cur = entry ? id : null;
      rotY = 0.6; rotX = -0.2; auto = true;
      if (!entry) return;
      const parts = [...new Set(entry.meshes.map((m) => m.userData._part))].sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)));
      partsBar.innerHTML = '';
      if (parts.length > 1) {
        parts.forEach((p, i) => {
          const b = el('button', 'btn', UI.part(i + 1));
          b.setAttribute('aria-pressed', String(i === 0));
          b.addEventListener('click', () => { build(entry, p); partsBar.querySelectorAll('.btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
          partsBar.append(b);
        });
      }
      build(entry, parts[0]);
    },
    clear() { cur = null; if (inner && pivot) { pivot.remove(inner); inner = null; } },
    render(dt) {
      if (!cur || !vr || !cvs.isConnected) return;
      const w = cvs.clientWidth, h = cvs.clientHeight;
      if (!w || !h) return;
      if (cvs.width !== Math.round(w * vr.getPixelRatio())) { vr.setSize(w, h, false); vcam.aspect = w / h; vcam.updateProjectionMatrix(); }
      if (auto) rotY += dt * 0.35;
      pivot.rotation.set(rotX, rotY, 0);
      // render without hover tint and without the spatial darkening
      const hovered = state.hover === cur; if (hovered) highlight(cur, false);
      const saved = focus.uFocusDim.value; focus.uFocusDim.value = 1;
      vr.render(vs, vcam);
      focus.uFocusDim.value = saved;
      if (hovered) highlight(cur, true);
    },
  };
})();

/* ================= minimap ================= */
const minimap = (() => {
  const box = $('#minimap');
  const cv = $('#minimapCanvas');
  const g = cv.getContext('2d');
  let base = null, R = null, W = 0, H = 0, dpr = 1;
  function toPx(x, z) { return [(x - R.xmin) / (R.xmax - R.xmin) * W, (z - R.zmin) / (R.zmax - R.zmin) * H]; }
  function toWorld(px, py) { return [R.xmin + px / W * (R.xmax - R.xmin), R.zmin + py / H * (R.zmax - R.zmin)]; }
  // a true section plan of the model: cut between floor and ~4 m, seen from above
  function buildBase() {
    R = TOUR.minimap_region;
    const small = innerWidth < 760;
    W = small ? 140 : 210;
    H = Math.round(W * (R.zmax - R.zmin) / (R.xmax - R.xmin));
    dpr = Math.min(devicePixelRatio, 2);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const rw = W * 3, rh = H * 3;
    const rt = new THREE.WebGLRenderTarget(rw, rh);
    const cam = new THREE.OrthographicCamera(R.xmin, R.xmax, -R.zmin, -R.zmax, 0.1, 200);
    cam.position.set(0, 60, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    // after lookAt from above with up=-z: screen-right = +x, screen-up = -z → frustum in (x, -z)
    const cut = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), TOUR.minimap_cut[1]), new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOUR.minimap_cut[0])] });
    const prevBg = scene.background, prevFog = scene.fog, prevClip = clipPlane.constant;
    scene.background = null; scene.fog = null; clipPlane.constant = 1e5;
    ringGroup.visible = false;
    scene.overrideMaterial = cut;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(rw * rh * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, rw, rh, px);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null; scene.background = prevBg; scene.fog = prevFog; clipPlane.constant = prevClip;
    ringGroup.visible = true;
    rt.dispose(); cut.dispose();
    const off = document.createElement('canvas'); off.width = rw; off.height = rh;
    const og = off.getContext('2d');
    const img = og.createImageData(rw, rh);
    for (let y = 0; y < rh; y++) {           // flip rows; white cut → soft ink
      const src = (rh - 1 - y) * rw * 4, dst = y * rw * 4;
      for (let x = 0; x < rw * 4; x += 4) {
        const a = px[src + x + 3];
        img.data[dst + x] = 236; img.data[dst + x + 1] = 233; img.data[dst + x + 2] = 228; img.data[dst + x + 3] = a ? 150 : 0;
      }
    }
    og.putImageData(img, 0, 0);
    base = off;
  }
  function draw(t) {
    if (!base || box.classList.contains('is-off')) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.drawImage(base, 0, 0, W, H);
    const s = W / (R.xmax - R.xmin);
    const nxt = state.mode === 'tour' ? nextStopLayer() : null;
    const [cx, cy] = toPx(TOUR.rotunda_center[0], TOUR.rotunda_center[1]);
    g.font = '400 9px "Century Gothic", Futura, Avenir, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    TOUR.layer_anchors.forEach((a) => {
      const [x, y] = toPx(a.xz[0], a.xz[1]);
      const on = a.layer === state.layer;
      const pulse = a.layer === nxt ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0;
      if (on || pulse) {                       // zone only for the current / next layer
        g.beginPath(); g.arc(x, y, a.r * 0.92 * s, 0, Math.PI * 2);
        if (on) { g.fillStyle = 'rgba(169,165,230,0.20)'; g.fill(); }
        g.setLineDash(on ? [] : [2, 3]); g.lineWidth = 1;
        g.strokeStyle = on ? 'rgba(169,165,230,0.95)' : `rgba(169,165,230,${0.35 + pulse * 0.5})`;
        g.stroke(); g.setLineDash([]);
      }
      g.beginPath(); g.arc(x, y, on ? 3 : 2.2, 0, Math.PI * 2);
      g.fillStyle = on ? '#a9a5e6' : 'rgba(169,165,230,0.75)'; g.fill();
      // label pushed outward from the rotunda centre so neighbours never overlap
      let dx = x - cx, dy = y - cy; const dl = Math.hypot(dx, dy);
      if (dl < 4) { dx = 0; dy = 1; } else { dx /= dl; dy /= dl; }
      const off = (on ? a.r * 0.92 * s : 0) + 9;
      g.fillStyle = on ? '#ffffff' : 'rgba(238,236,232,0.7)';
      g.fillText(a.layer.replace('L', ''), x + dx * off, y + dy * off);
    });
    // artifacts of the current layer
    if (state.layer) {
      (artifactsByLayer.get(state.layer) || []).forEach((art) => {
        const v = artifactViews.get(art.id); if (!v) return;
        const [x, y] = toPx(v.look[0], v.look[2]);
        const sel = state.panel?.id === art.id || state.hover === art.id || TOUR.stops[state.stopIndex]?.artifact === art.id;
        g.beginPath(); g.arc(x, y, sel ? 2.6 : 1.6, 0, Math.PI * 2);
        g.fillStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.65)'; g.fill();
        if (sel) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.strokeStyle = '#a9a5e6'; g.lineWidth = 1; g.stroke(); }
      });
    }
    // visitor: dot + view cone
    let [px, py] = toPx(camera.position.x, camera.position.z);
    const out = px < 0 || py < 0 || px > W || py > H;
    px = THREE.MathUtils.clamp(px, 6, W - 6); py = THREE.MathUtils.clamp(py, 6, H - 6);
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const ang = Math.atan2(dir.z, dir.x);
    if (!out) {
      const grad = g.createRadialGradient(px, py, 0, px, py, 34);
      grad.addColorStop(0, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(px, py); g.arc(px, py, 34, ang - 0.5, ang + 0.5); g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(px, py, 3.6, 0, Math.PI * 2);
    g.fillStyle = '#ffffff'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = '#a9a5e6'; g.stroke();
    if (out) { // arrow at the edge pointing toward the visitor
      g.save(); g.translate(px, py); g.rotate(Math.atan2(py - H / 2, px - W / 2));
      g.beginPath(); g.moveTo(8, 0); g.lineTo(2, -4); g.lineTo(2, 4); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.restore();
    }
  }
  cv.addEventListener('click', (e) => {
    if (!R || state.mode === 'loading') return;
    const rc = cv.getBoundingClientRect();
    const [wx, wz] = toWorld(e.clientX - rc.left, e.clientY - rc.top);
    let best = null, bd = Infinity;
    TOUR.layer_anchors.forEach((a) => { const d = Math.hypot(wx - a.xz[0], wz - a.xz[1]); if (d < a.r * 1.2 && d < bd) { bd = d; best = a; } });
    if (best) travelToLayer(best.layer, [best.xz[0], 0, best.xz[1]]);
  });
  return { buildBase, draw, toggle(on) { box.classList.toggle('is-off', !on); $('#mapToggle').setAttribute('aria-pressed', String(on)); } };
})();
$('#mapToggle').addEventListener('click', () => minimap.toggle($('#minimap').classList.contains('is-off')));

/* ================= intro: scroll-driven approach to the door ================= */
// Scrolling moves the camera along a path from the forecourt to the threshold; the catalogue
// passages (data/objects.json → story) change on the way. Reaching the door reveals Enter.
const intro = (() => {
  let active = false, ready = false, done = false;
  let target = 0, p = 0, lastInput = 0, lastDir = 0;
  let posCurve = null, lookCurve = null;
  const passagesBox = $('#passages');
  const nodes = [];
  const OPEN_END = 0.07, PASS_START = 0.09, PASS_END = 0.9, ARRIVE = 0.955;
  function build() {
    const story = DATA.story;
    const span = (PASS_END - PASS_START) / story.length;
    story.forEach((s, i) => {
      const d = el('div', 'passage');
      d.append(el('p', null, s.text), el('small', null, s.source.replace(/\s*\[.*?\]\s*/g, ' ').trim()));
      passagesBox.append(d);
      nodes.push({ el: d, a: PASS_START + i * span, b: PASS_START + (i + 1) * span });
    });
    const pts = TOUR.intro_path;
    posCurve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q.pos)), false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q.look)), false, 'centripetal');
    const meta = UI.counts(DATA.layers.length, DATA.artifacts.length);
    $('#introMeta').textContent = meta; $('#introMeta2').textContent = meta;
    place(0);
  }
  const bump = (x, a, b, f) => {   // 0→1→0 over [a,b] with fade width f
    if (x <= a || x >= b) return 0;
    return Math.min(1, (x - a) / f, (b - x) / f);
  };
  const _p = new THREE.Vector3(), _l = new THREE.Vector3();
  function place(u) {
    const k = THREE.MathUtils.clamp(u, 0, 1);          // arc-length: every notch moves the camera the same
    posCurve.getPointAt(k, _p); lookCurve.getPointAt(k, _l);
    camera.position.copy(_p);
    const ang = lookAngles(_p, _l); state.yaw = ang.yaw; state.pitch = ang.pitch; applyAngles();
  }
  // when the visitor stops scrolling, the camera settles on the nearest passage (never between two)
  function rests() { return [0, ...nodes.map((n) => (n.a + n.b) / 2), 1]; }
  function settle() {
    if (!ready || !lastDir || performance.now() - lastInput < 380) return;
    const r = rests();
    // carry on to the next passage in the direction of the scroll (a small scroll turns one page)
    target = lastDir > 0 ? (r.find((x) => x >= target - 0.004) ?? 1) : ([...r].reverse().find((x) => x <= target + 0.004) ?? 0);
    lastDir = 0;
  }
  function update(dt) {
    if (!active) return;
    settle();
    p += (target - p) * (1 - Math.exp(-dt * 2.4));
    if (Math.abs(target - p) < 1e-4) p = target;
    place(p);
    // overlays
    const open = 1 - THREE.MathUtils.smoothstep(p, 0.0, OPEN_END);
    const op = $('#introOpening');
    op.style.opacity = open.toFixed(3);
    op.style.transform = `translateY(calc(-50% - ${(1 - open) * 40}px))`;
    nodes.forEach((n) => {
      const v = bump(p, n.a, n.b, (n.b - n.a) * 0.32);
      n.el.style.opacity = v.toFixed(3);
      n.el.style.transform = `translateY(${((p - (n.a + n.b) / 2) / (n.b - n.a)) * -36}px)`;
      n.el.style.filter = v < 0.98 ? `blur(${((1 - v) * 2.5).toFixed(2)}px)` : 'none';
    });
    const arr = THREE.MathUtils.smoothstep(p, ARRIVE - 0.035, ARRIVE + 0.03);
    const ar = $('#introArrival');
    ar.style.opacity = arr.toFixed(3);
    ar.style.transform = `translateY(${(1 - arr) * 24}px)`;
    ar.style.pointerEvents = arr > 0.5 ? 'auto' : 'none';
    $('#scrollHint').style.opacity = ready ? String(Math.max(0, 1 - p * 18)) : '0';
    $('#railDot').style.top = `calc(${(p * 100).toFixed(2)}% - 3px)`;
  }
  function nudge(d) {
    if (!active || !ready) return;
    lastInput = performance.now(); lastDir = Math.sign(d);
    if (target >= 0.999 && d > 0 && p > 0.99) { enter(); return; }   // scrolling on at the door goes in
    target = THREE.MathUtils.clamp(target + d, 0, 1);
  }
  function setReady() {
    ready = true;
    $('#introBg').classList.add('is-gone');
    $('#intro').classList.add('is-ready');
    $('#loadstatus').textContent = '';
  }
  // wheel / touch / keys
  addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    nudge(THREE.MathUtils.clamp(d, -240, 240) * 0.0006);
  }, { passive: false, capture: true });
  // mouse fallback: drag up to approach (as on touch screens)
  let my = null;
  addEventListener('pointerdown', (e) => { if (active && e.pointerType === 'mouse' && !e.target.closest('button')) my = e.clientY; }, true);
  addEventListener('pointermove', (e) => { if (!active || my === null) return; nudge((my - e.clientY) * 0.0011); my = e.clientY; }, true);
  addEventListener('pointerup', () => { my = null; }, true);
  // the hint is also a button: each click goes on to the next passage
  $('#scrollHint').addEventListener('click', () => {
    if (!ready) return;
    const next = nodes.find((n) => (n.a + n.b) / 2 > target + 0.01);
    target = next ? (next.a + next.b) / 2 : 1;
  });
  let ty = null;
  addEventListener('touchstart', (e) => { if (active) ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!active || ty === null) return;
    const y = e.touches[0].clientY; nudge((ty - y) * 0.0011); ty = y;
  }, { passive: true });
  addEventListener('touchend', () => { ty = null; });
  $('#storySkip').addEventListener('click', () => { if (ready) target = 1; });
  function enter() {
    if (done || !ready) return;
    done = true; active = false;
    $('#intro').classList.add('is-out');
    setTimeout(() => { $('#intro').hidden = true; }, 1450);
    document.querySelectorAll('.hud').forEach((h) => { h.hidden = false; });
    if (innerWidth < 760) minimap.toggle(false);
    setLight('guided');
    setMode('tour');
    // seamless: from the threshold straight into the rotunda, towards the first layer
    state.stopIndex = 1; state.footY = camera.position.y - TOUR.eye_height;
    goToStop(2);
    window.dispatchEvent(new CustomEvent('cabinet:enter')); // audio starts here (phase 6)
  }
  return {
    start() {
      active = true; build();
      if (isTouch) { $('#scrollHint span').textContent = UI.hintTouch[0]; $('#scrollHint small').textContent = UI.hintTouch[1]; }
    },
    setReady, update, enter, nudge,
    key(code) {
      if (['ArrowDown', 'PageDown', 'Space', 'ArrowRight'].includes(code)) nudge(0.06);
      if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(code)) nudge(-0.06);
      if (code === 'End') { if (ready) target = 1; }
      if (code === 'Enter' && p > ARRIVE - 0.01) enter();
    },
    get active() { return active; }, get done() { return done; },
    get progress() { return p; }, get target() { return target; }, set progress(v) { target = p = v; },
  };
})();

/* ================= sound: generated in the browser (Web Audio), no recordings ================= */
// A quiet, unsettled room tone for the rotunda; each layer adds its own slow chord and sparse events
// (struck glass, reversed swells, gliding carrier tones, low pulses), crossfading as the visitor moves.
// Hovering an artifact strikes one soft note. Atmospheres, not documents (see 04_audio/CREDITS.md).
const sound = (() => {
  let ctx = null, master = null, dry = null, send = null, on = true, started = false;
  let current = undefined, nextAt = 0, lastHover = 0;
  const voices = new Map();
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  const rr = (a, b) => a + Math.random() * (b - a);
  const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // layer palettes: pitch sets (MIDI), pad chord, pad timbre, brightness, event types
  const P = {
    L01: { notes: [62, 69, 74, 76, 81], pad: [50, 57, 62], wave: 'sine', cut: 900, ev: ['swell', 'bell', 'swell'] },
    L02: { notes: [60, 61, 67, 68, 72], pad: [48, 49, 55], wave: 'triangle', cut: 620, ev: ['swell', 'whisper', 'bell'] },
    L03: { notes: [65, 72, 75, 79, 84], pad: [53, 60, 65], wave: 'sine', cut: 1200, ev: ['glide', 'glide', 'bell'] },
    L04: { notes: [71, 78, 83, 88, 90], pad: [59, 66, 71], wave: 'sine', cut: 1600, ev: ['bell', 'bell', 'swell'] },
    L05: { notes: [52, 58, 59, 64, 70], pad: [40, 46, 52], wave: 'sawtooth', cut: 420, ev: ['swell', 'whisper', 'pulse'] },
    L06: { notes: [57, 64, 68, 75, 80], pad: [45, 52, 57], wave: 'triangle', cut: 700, ev: ['pulse', 'bell', 'glide'] },
    VOID: { notes: [62, 65, 69, 70, 74], pad: null, ev: ['bell', 'swell', 'whisper'] },
  };
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { lp += 0.25 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / n, decay); }
    }
    return b;
  }
  function out(node, pan, wet) {          // node → panner → dry + reverb send
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = wet;
    node.connect(p); p.connect(dry); p.connect(g); g.connect(send);
    return p;
  }
  function lfo(rate, depth, param) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o;
  }
  function room() {                       // unsettled room tone: beating low triangles + a breath of air
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    [[38, -4], [38, 5], [45, 2]].forEach(([m, cents]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = cents;
      lfo(rr(0.03, 0.07), 6, o.detune); o.connect(f); o.start();
    });
    lfo(0.05, 140, f.frequency); lfo(0.031, 0.02, g.gain);
    f.connect(g); out(g, 0, 0.5);
    const n = ctx.createBufferSource(); n.buffer = impulse(4, 0); n.loop = true;   // looped soft noise
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.006;
    lfo(0.07, 260, bp.frequency); lfo(0.043, 0.005, ng.gain);
    n.connect(bp); bp.connect(ng); out(ng, 0.2, 0.8); n.start();
  }
  function voice(id) {                    // a layer's slow chord, silent until the visitor is there
    const p = P[id]; const g = ctx.createGain(); g.gain.value = 0;
    if (p.pad) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.cut; f.Q.value = 0.8;
      lfo(rr(0.02, 0.05), p.cut * 0.35, f.frequency);
      p.pad.forEach((m, i) => {
        const o = ctx.createOscillator(); o.type = p.wave; o.frequency.value = mtof(m);
        lfo(rr(0.04, 0.11), rr(6, 14), o.detune);
        const og = ctx.createGain(); og.gain.value = (p.wave === 'sawtooth' ? 0.012 : 0.022) / (1 + i * 0.4);
        lfo(rr(0.02, 0.06), og.gain.value * 0.7, og.gain);
        o.connect(og); og.connect(f); o.start();
      });
      f.connect(g); out(g, 0, 0.7);
    }
    voices.set(id, g);
  }
  function env(g, t, a, peak, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
  }
  const EV = {
    bell(m, t, amp = 0.07) {             // struck glass: inharmonic FM, long decay into the reverb
      const c = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.frequency.value = mtof(m); md.frequency.value = mtof(m) * pickOf([1.41, 2.76, 3.53]);
      mg.gain.setValueAtTime(mtof(m) * 1.6, t); mg.gain.exponentialRampToValueAtTime(1, t + 3);
      md.connect(mg); mg.connect(c.frequency); c.connect(g); env(g, t, 0.006, amp, rr(3.5, 6));
      out(g, rr(-0.7, 0.7), 0.9); c.start(t); md.start(t); c.stop(t + 7); md.stop(t + 7);
    },
    swell(m, t) {                         // a reversed tone: slow rise, sudden end
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m + 12) * 1.003;
      const a = rr(2.5, 4.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + a); g.gain.linearRampToValueAtTime(0.0001, t + a + 0.25);
      o.connect(g); o2.connect(g); out(g, rr(-0.5, 0.5), 0.8); o.start(t); o2.start(t); o.stop(t + a + 0.4); o2.stop(t + a + 0.4);
    },
    glide(m, t) {                         // a carrier tone drifting off its frequency
      const o = ctx.createOscillator(), g = ctx.createGain(), d = rr(3, 6);
      o.frequency.setValueAtTime(mtof(m), t); o.frequency.exponentialRampToValueAtTime(mtof(m - rr(0.6, 2.2)), t + d);
      lfo(rr(4, 7), 4, o.detune);
      env(g, t, d * 0.4, 0.03, d * 0.6); o.connect(g); out(g, rr(-0.8, 0.8), 0.7); o.start(t); o.stop(t + d + 0.2);
    },
    pulse(m, t) {                         // two low knocks, far away
      [0, 0.32].forEach((dt, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), s = t + dt;
        o.frequency.setValueAtTime(mtof(m - 12) * 1.5, s); o.frequency.exponentialRampToValueAtTime(mtof(m - 12), s + 0.25);
        env(g, s, 0.01, i ? 0.07 : 0.1, 0.6); o.connect(g); out(g, rr(-0.3, 0.3), 0.6); o.start(s); o.stop(s + 0.8);
      });
    },
    whisper(m, t) {                       // breath through a narrow filter, sweeping
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
      const d = rr(1.8, 3.2);
      bp.frequency.setValueAtTime(mtof(m + 12), t); bp.frequency.exponentialRampToValueAtTime(mtof(m + rr(0, 7)), t + d);
      const g = ctx.createGain(); env(g, t, d * 0.5, 0.09, d * 0.5);
      n.connect(bp); bp.connect(g); out(g, rr(-0.9, 0.9), 0.9); n.start(t, rr(0, 2)); n.stop(t + d + 0.1);
    },
  };
  let noiseBuf = null;
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t < nextAt) return;
    const p = P[current] ?? P.VOID;
    EV[pickOf(p.ev)](pickOf(p.notes), t + 0.05);
    nextAt = t + rr(current ? 3 : 5, current ? 8 : 12);
  }
  function setLayer(id) {
    if (id === current) return;
    current = id;
    const t = ctx.currentTime;
    voices.forEach((g, k) => g.gain.setTargetAtTime(k === id ? 1 : 0, t, 2.2));
    nextAt = Math.min(nextAt, t + 1.5);
  }
  function start() {
    if (started) return; started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    dry = ctx.createGain(); dry.gain.value = 0.55;
    const verb = ctx.createConvolver(); verb.buffer = impulse(6.5, 2.6);
    send = ctx.createGain(); send.gain.value = 0.9;
    dry.connect(master); send.connect(verb); verb.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = impulse(5, 0);
    room(); Object.keys(P).filter((k) => k !== 'VOID').forEach(voice);
    master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 1.5);
    setInterval(schedule, 200);
    if (ctx.state !== 'running') {        // entered by scrolling (no click yet): wake up on the first gesture
      const wake = () => { ctx.resume(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
      addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    }
  }
  function toggle() {
    on = !on;
    $('#soundToggle').setAttribute('aria-pressed', String(on));
    $('#soundLabel').textContent = on ? UI.soundOn : UI.soundOff;
    if (master) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.25);
  }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : ctx.resume(); });
  $('#soundToggle').addEventListener('click', toggle);
  return {
    start, toggle,
    update() { if (ctx) setLayer(state.mode === 'loading' ? null : state.layer ?? null); },
    hover(id) {                           // one soft note per artifact, from its layer's set
      if (!ctx || ctx.state !== 'running' || !on) return;
      const t = ctx.currentTime; if (t - lastHover < 0.35) return; lastHover = t;
      const a = artifactsById.get(id); const p = P[a?.layer] ?? P.VOID;
      const n = parseInt(String(id).split('.')[1] ?? '1', 10) || 1;
      EV.bell(p.notes[(n - 1) % p.notes.length] + 12, t + 0.01, 0.035);
    },
    open() { if (ctx && ctx.state === 'running' && on) EV.swell((P[current] ?? P.VOID).notes[0] - 12, ctx.currentTime + 0.02); },
    get layer() { return current; }, get running() { return !!ctx && ctx.state === 'running'; },
  };
})();
window.addEventListener('cabinet:enter', () => { try { sound.start(); } catch (e) { console.warn('sound', e); } });

/* ================= input ================= */
let drag = null;
let lastTapId = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state.mode === 'overview' || state.mode === 'loading') return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointerInside = true;
  lastPointer = { x: e.clientX, y: e.clientY };
  if (drag && drag.id === e.pointerId && !state.locked && (state.mode === 'tour' || state.mode === 'walk')) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (!state.tween) {
      const s = isTouch ? 0.005 : 0.0035;
      state.yaw += dx * s; state.pitch += dy * s;
      applyAngles();
    }
  }
});
canvas.addEventListener('pointerup', (e) => {
  const wasClick = drag && drag.moved < 6;
  drag = null;
  if (state.mode === 'overview') {      // orbit: a click without drag still selects
    return;
  }
  if (!wasClick || state.mode === 'loading') return;
  if (isTouch) {                         // first tap shows the label, second tap opens
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    pointerInside = true;
    const id = pick();
    if (id && id === lastTapId) { select(id); lastTapId = null; return; }
    lastTapId = id;
    setHover(id);
    if (id) placeTooltip(e.clientX, e.clientY);
    else { const fp = floorPoint(); if (fp && !state.tween) walkTo(fp); }
    return;
  }
  if (state.hover) { select(state.hover); return; }
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick();
  const fp = floorPoint();
  if (fp && !state.tween) walkTo(fp);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// scroll: in Tour it moves between stops, in Walk it glides forward / back
let wheelAcc = 0, wheelAt = 0, wheelStepAt = 0;
canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'tour' && state.mode !== 'walk') return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  if (state.mode === 'walk') {
    state.walkTo = null;
    state.wheelV = THREE.MathUtils.clamp(state.wheelV - THREE.MathUtils.clamp(d, -200, 200) * 0.012, -4, 4);
    return;
  }
  const now = performance.now();
  if (now - wheelAt > 450) wheelAcc = 0;
  wheelAcc += d; wheelAt = now;
  if (Math.abs(wheelAcc) < 90 || now - wheelStepAt < 650) return;
  wheelStepAt = now;
  if (wheelAcc > 0) onNext(); else goToStop(state.stopIndex - 1);
  wheelAcc = -Math.sign(wheelAcc) * 400;       // one stop per gesture
}, { passive: false });
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('click', (e) => {
  if (state.mode === 'overview' && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && state.hover) select(state.hover);
});
canvas.addEventListener('pointerleave', () => { pointerInside = false; });


const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  if (intro.active) {
    if (['Space', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End'].includes(e.code)) e.preventDefault();
    intro.key(e.code);
    return;
  }
  if (e.code === 'Escape') {
    if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; return; }
    if (state.panel) { closePanel(); return; }
  }
  if (state.mode === 'loading') return;
  if (e.code === 'KeyM') { minimap.toggle($('#minimap').classList.contains('is-off')); return; }
  if (e.code === 'KeyN') { sound.toggle(); return; }
  state.keys.add(e.code);
  if (state.mode === 'tour') {
    if (e.code === 'ArrowRight') onNext();
    if (e.code === 'ArrowLeft') goToStop(state.stopIndex - 1);
    if (MOVE_KEYS.includes(e.code) || e.code === 'ArrowUp' || e.code === 'ArrowDown') setMode('walk');
  }
});
addEventListener('keyup', (e) => state.keys.delete(e.code));
addEventListener('blur', () => state.keys.clear());

(() => { // touch joystick
  const pad = $('#joystick'), knob = $('.joystick__knob', pad);
  let pid = null; const R = 40;
  const upd = (e) => {
    const r = pad.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y); if (l > R) { x *= R / l; y *= R / l; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    state.joy.x = x / R; state.joy.y = y / R;
  };
  pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); upd(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) upd(e); });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; knob.style.transform = ''; state.joy.x = state.joy.y = 0; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
})();

function onNext() {
  if (state.stopIndex >= TOUR.stops.length - 1) setMode('walk');
  else goToStop(state.stopIndex + 1);
}
$('#nextStop').addEventListener('click', onNext);
$('#prevStop').addEventListener('click', () => goToStop(state.stopIndex - 1));
document.querySelectorAll('.btn--mode[data-mode]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.mode === 'tour' && state.mode !== 'tour') { setMode('tour'); goToStop(state.stopIndex); return; }
  setMode(b.dataset.mode);
}));
$('#lightToggle').addEventListener('click', () => {
  const order = ['guided', 'hidden', 'revealed'];
  setLight(order[(order.indexOf(state.light) + 1) % order.length]);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ================= loop ================= */
let tick = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (state.mode === 'tour') updateTween(dt);
  else if (state.mode === 'walk') updateWalk(dt);
  else if (state.mode === 'overview') orbit.update();
  else if (intro.active) intro.update(dt);
  if (state.mode !== 'loading') detectLayer();
  updateLighting(dt);
  updateGlyphs(dt, t);
  updateViewOffset(dt);
  beam.update(dt, t);
  museum.update(dt);
  jars.update(dt);
  quality.update();
  rim.update(dt, t);
  sky.update(t);
  sound.update();
  if (veil) veil.material.uniforms.uTime.value = t;
  tick++;
  if (!isTouch && !state.panel && (tick & 1) === 0) {
    setHover(pick());
    floorCursor.hover(!state.hover && (state.mode === 'tour' || state.mode === 'walk') && !state.tween && !drag ? floorPoint() : null);
    if (state.hover) state.locked ? placeTooltip(innerWidth / 2, innerHeight / 2) : placeTooltip(lastPointer.x, lastPointer.y);
  }
  renderer.render(scene, camera);
  if ((tick % 3) === 0) minimap.draw(t);
  if (state.panel) viewer.render(dt);
}

/* ================= boot ================= */
async function boot() {
  const [objects, tour] = await Promise.all([
    fetch('data/objects.json').then((r) => r.json()),
    fetch('data/tour.json').then((r) => r.json()),
  ]);
  DATA = objects; TOUR = tour; TOUR.base_stops = TOUR.stops.slice();
  DATA.layers.forEach((l) => layersById.set(l.id, l));
  DATA.artifacts.forEach((a) => {
    artifactsById.set(a.id, a);
    if (!artifactsByLayer.has(a.layer)) artifactsByLayer.set(a.layer, []);
    artifactsByLayer.get(a.layer).push(a);
  });
  document.querySelectorAll('[data-bind="title"]').forEach((n) => { n.textContent = DATA.title; });
  document.querySelectorAll('[data-bind="subtitle"]').forEach((n) => { n.textContent = DATA.subtitle; });
  document.querySelectorAll('[data-bind="author"]').forEach((n) => { n.textContent = DATA.author ?? ''; });
  document.title = DATA.title;
  addGround();
  setupLayerGlyphs();
  intro.start();
  renderer.setAnimationLoop(frame);

  showProgress(UI.loadingArch);
  const arch = await loadGLB(quality.low ? 'assets/architecture_lite.glb' : 'assets/architecture.glb', progressHandler('arch'));
  progress.arch = 1;
  setupArchitecture(arch);
  beam.init();
  $('#enterBtn').disabled = false;
  intro.setReady();

  showProgress(UI.loadingArtifacts);
  const art = await loadGLB('assets/artifacts.glb', progressHandler('art'));
  progress.art = 1;
  setupArtifacts(art);
  buildTourStops();
  museum.build();
  minimap.buildBase();
  $('#loadstatus').textContent = '';
  window.dispatchEvent(new CustomEvent('cabinet:ready'));
  // warm the tooltip thumbnails so the first hover already shows the picture
  DATA.artifacts.forEach((x) => { if (x.images?.[0]) { const im = new Image(); im.decoding = 'async'; im.src = x.images[0].thumb; } });
}

$('#enterBtn').addEventListener('click', () => intro.enter());

boot().catch((err) => {
  console.error(err);
  $('#loadstatus').textContent = UI.error;
});

// test hook (read-only use in automated browser checks)
window.__cabinet = { quality, museum, sound, openAbout, stopsIndexOf: (id) => TOUR.stops.findIndex((x) => x.id === id), select, state, camera, registry, goToStop, setMode, setLight, scene, renderer, groundAt, blocked, tryMove, openArtifact, openLayer, closePanel, intro, focus, get layer() { return state.layer; } };
