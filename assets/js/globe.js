import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { subsolarPoint } from './solar.js';

const DEG = Math.PI / 180;
const R = 1;
const MARKER_R = 1.012;

export function latLonToVec3(lat, lon, radius = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function makeGlowTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WeatherGlobe {
  constructor(container, { reducedMotion = false } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.frameCallbacks = new Set();
    this.hoverCallbacks = new Set();
    this.markers = new Map();
    this.locked = false;
    this.paused = false;
    this.lastSunUpdate = 0;
    this.ready = false;
    this.failed = false;
    this.failReason = '';
    this.failCallbacks = new Set();
    this.pendingCities = null;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.init().catch((error) => {
      console.error('3D globe failed to start', error);
      this.markFailed(error?.message || 'WebGL unavailable');
      this.ready = true;
      this.resolveReady();
    });
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  async init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const probe = document.createElement('canvas');
    const probeGl = probe.getContext('webgl2');
    if (!probeGl) throw new Error('WebGL2 is not available');
    probeGl.getExtension('WEBGL_lose_context')?.loseContext();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.debug.onShaderError = () => {
      console.error('3D shader compilation failed');
      this.markFailed('shader');
    };
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      console.error('WebGL context lost');
      this.markFailed('WebGL context lost');
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.01, 200);
    this.camera.position.copy(latLonToVec3(18, 105, this.fitDistance()));
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.65;
    this.controls.minDistance = 2.05;
    this.controls.maxDistance = 9.5;
    this.controls.minPolarAngle = 0.04;
    this.controls.maxPolarAngle = Math.PI - 0.04;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.16;

    this.clock = new THREE.Clock();
    this.time = 0;
    this.idleTimer = null;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
    });
    this.controls.addEventListener('end', () => {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (!this.locked && !this.reducedMotion && !this.paused) this.controls.autoRotate = true;
      }, 18000);
    });

    this.buildStars();

    const loader = new THREE.TextureLoader();
    const base = new URL('../textures/', import.meta.url);
    try {
      const [dayTex, nightTex, cloudTex] = await Promise.all([
        loader.loadAsync(new URL('earth-day.jpg', base).href),
        loader.loadAsync(new URL('earth-night.png', base).href),
        loader.loadAsync(new URL('earth-clouds.png', base).href),
      ]);
      dayTex.colorSpace = THREE.SRGBColorSpace;
      dayTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      nightTex.colorSpace = THREE.SRGBColorSpace;
      cloudTex.colorSpace = THREE.SRGBColorSpace;
      this.buildEarth(dayTex, nightTex, cloudTex);
    } catch (error) {
      console.error('地球贴图加载失败', error);
      this.buildFallbackEarth();
    }

    this.ready = true;
    this.updateSun(new Date());
    this.bindHover();
    if (this.pendingCities) {
      const pending = this.pendingCities;
      this.pendingCities = null;
      this.setCities(pending);
    }
    this.resolveReady();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!document.hidden) this.clock.getDelta();
    });
  }

  fitDistance() {
    const vFov = 38 * DEG;
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fov = Math.min(vFov, hFov);
    const fraction = aspect < 1 ? 0.8 : 0.7;
    return 1 / Math.sin((fov * fraction) / 2);
  }

  buildStars() {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 18 + Math.random() * 30;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const warm = Math.random();
      color.setHSL(warm > 0.82 ? 0.08 : 0.58, warm > 0.82 ? 0.35 : 0.2, 0.62 + Math.random() * 0.3);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.11,
      map: makeStarTexture(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
  }

  buildEarth(dayTex, nightTex, cloudTex) {
    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: dayTex },
        uNight: { value: nightTex },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform vec3 uSun;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 normal = normalize(vWorldNormal);
          float sun = dot(normal, normalize(uSun));
          float daylight = smoothstep(-0.16, 0.22, sun);
          vec3 dayCol = texture2D(uDay, vUv).rgb;
          vec3 nightCol = texture2D(uNight, vUv).rgb;
          vec3 col = mix(nightCol * 1.18 + dayCol * 0.018, dayCol, daylight);
          col = mix(col, col * vec3(0.9, 1.0, 1.09), 0.22);
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
          col += vec3(0.10, 0.24, 0.4) * fresnel * 0.55;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), this.earthMaterial);
    this.earth.rotation.y = 0;
    this.scene.add(this.earth);

    this.sunLight = new THREE.DirectionalLight(0xfff2df, 2.4);
    this.scene.add(this.sunLight);
    this.ambientLight = new THREE.AmbientLight(0x1b2735, 0.5);
    this.scene.add(this.ambientLight);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.006, 96, 64),
      new THREE.MeshLambertMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        color: 0xdfeaf5,
      }),
    );
    this.clouds.renderOrder = 1;
    this.scene.add(this.clouds);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.19, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x2c6f9e) } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.6);
            gl_FragColor = vec4(uColor, 1.0) * rim * 0.9;
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.atmosphere.renderOrder = 2;
    this.scene.add(this.atmosphere);

    this.container.classList.add('is-ready');
  }

  buildFallbackEarth() {
    this.earthMaterial = new THREE.MeshBasicMaterial({ color: 0x142a42 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), this.earthMaterial);
    this.scene.add(this.earth);
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.18, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x2c6f9e,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.atmosphere);
    this.container.classList.add('is-ready');
  }

  markFailed(reason = 'WebGL unavailable') {
    if (this.failed) return;
    this.failed = true;
    this.failReason = reason;
    for (const callback of this.failCallbacks) {
      try {
        callback(reason);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  onFail(callback) {
    if (this.failed) {
      callback(this.failReason);
      return () => {};
    }
    this.failCallbacks.add(callback);
    return () => this.failCallbacks.delete(callback);
  }

  updateSun(date = new Date()) {
    const sun = subsolarPoint(date);
    const vec = latLonToVec3(sun.lat, sun.lon, 1).normalize();
    if (this.earthMaterial?.uniforms?.uSun) this.earthMaterial.uniforms.uSun.value.copy(vec);
    if (this.sunLight) this.sunLight.position.copy(vec.clone().multiplyScalar(12));
    this.lastSunUpdate = performance.now();
    return sun;
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  setCities(cities) {
    if (!this.scene) {
      this.pendingCities = cities;
      return;
    }
    for (const marker of this.markers.values()) {
      this.scene.remove(marker.group);
      marker.dot.geometry.dispose();
      marker.dot.material.dispose();
      marker.glow.material.dispose();
      marker.ring.geometry.dispose();
      marker.ring.material.dispose();
    }
    this.markers.clear();
    this.glowTexture = this.glowTexture || makeGlowTexture();
    for (const city of cities) {
      const group = new THREE.Group();
      const normal = latLonToVec3(city.lat, city.lon, 1).normalize();
      const position = normal.clone().multiplyScalar(MARKER_R);
      group.position.copy(position);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0062, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xf2ede2 }),
      );
      dot.renderOrder = 3;
      group.add(dot);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: 0xf2ede2,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.setScalar(0.085);
      glow.renderOrder = 3;
      group.add(glow);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.019, 0.0235, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffb15c,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.position.copy(normal.clone().multiplyScalar(0.0009));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ring.renderOrder = 4;
      group.add(ring);

      this.scene.add(group);
      this.markers.set(city.id, { group, dot, glow, ring, normal, position });
    }
  }

  setMarkerColor(id, color) {
    const marker = this.markers.get(id);
    if (!marker) return;
    const c = new THREE.Color(color);
    marker.dot.material.color.copy(c);
    marker.glow.material.color.copy(c);
  }

  setActive(id) {
    for (const [key, marker] of this.markers) {
      marker.ring.material.opacity = key === id ? 0.95 : 0;
    }
  }

  setLocked(locked) {
    this.locked = locked;
    if (this.controls) this.controls.autoRotate = !locked && !this.reducedMotion && !this.paused;
  }

  focus(lat, lon) {
    if (!this.camera || !this.controls) return;
    const target = latLonToVec3(lat, lon, 1).normalize();
    const start = this.camera.position.clone();
    const startDir = start.clone().normalize();
    const radius = start.length();
    const distance = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, radius));
    const q = new THREE.Quaternion().setFromUnitVectors(startDir, target);
    this.controls.autoRotate = false;
    clearTimeout(this.idleTimer);
    const duration = this.reducedMotion ? 1 : 850;
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      const dir = startDir.clone().applyQuaternion(new THREE.Quaternion().slerp(q, ease(t))).normalize();
      this.camera.position.copy(dir.multiplyScalar(distance));
      this.camera.lookAt(0, 0, 0);
      if (t < 1) requestAnimationFrame(step);
      else {
        this.controls.update();
        this.idleTimer = setTimeout(() => {
          if (!this.locked && !this.reducedMotion && !this.paused) this.controls.autoRotate = true;
        }, 18000);
      }
    };
    step();
  }

  project(lat, lon) {
    if (!this.camera || !this.renderer) return { x: 0, y: 0, visible: false, facing: 0 };
    if (!this.renderer.domElement.isConnected) return { x: 0, y: 0, visible: false, facing: 0 };
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    const world = latLonToVec3(lat, lon, MARKER_R);
    const normal = world.clone().normalize();
    const camDir = this.camera.position.clone().normalize();
    const facing = normal.dot(camDir);
    const p = world.clone().project(this.camera);
    const x = (p.x * 0.5 + 0.5) * width;
    const y = (-p.y * 0.5 + 0.5) * height;
    return { x, y, facing, visible: facing > 0.08 && p.z < 1, ndcZ: p.z };
  }

  raycast(clientX, clientY) {
    if (!this.earth) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    if (!hit) return null;
    const p = hit.point.clone().normalize();
    return {
      lat: Math.asin(p.y) / DEG,
      lon: Math.atan2(-p.z, p.x) / DEG,
    };
  }

  bindHover() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (event) => {
      const point = this.raycast(event.clientX, event.clientY);
      for (const cb of this.hoverCallbacks) cb(point);
    });
    el.addEventListener('pointerleave', () => {
      for (const cb of this.hoverCallbacks) cb(null);
    });
  }

  onHover(cb) {
    this.hoverCallbacks.add(cb);
    return () => this.hoverCallbacks.delete(cb);
  }

  onFrame(cb) {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  whenReady() {
    return this.readyPromise;
  }

  animate() {
    this.raf = requestAnimationFrame(this.animate);
    if (this.paused || !this.renderer) return;
    const dt = Math.min(this.clock.getDelta(), 0.06);
    this.time += dt;
    if (this.controls) this.controls.update();
    if (this.clouds) this.clouds.rotation.y += dt * 0.004;
    if (this.stars) this.stars.rotation.y += dt * 0.0009;
    if (performance.now() - this.lastSunUpdate > 60000) this.updateSun(new Date());

    for (const [id, marker] of this.markers) {
      if (marker.ring.material.opacity > 0) {
        const scale = 1 + Math.sin(this.time * 2.4) * 0.12;
        marker.ring.scale.setScalar(scale);
      }
    }

    this.renderer.render(this.scene, this.camera);
    for (const cb of this.frameCallbacks) cb();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
  }
}
