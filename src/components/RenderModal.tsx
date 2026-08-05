import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { BackgroundMode } from '../types';
import { X, Download, Play, Pause, RefreshCw, Sparkles, Settings, Camera, Sun, Globe, Palette, RotateCw, Upload } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadOptimizedEnvironmentTexture } from '../utils/hdrLoader';
import { setupSceneEnvironment, PRESET_HDRIS } from '../utils/environmentHelper';
import { fileToDataURL } from '../utils/silhouettes';
import { createBaseGeometry } from '../utils/csg';

interface RenderModalProps { onClose: () => void; }

// ── Opciones de calidad ────────────────────────────────────────────────────
const QUALITY_PRESETS = {
  draft:   { samples: 32,  bounces: 3,  label: 'Borrador', desc: '~3s'   },
  medium:  { samples: 128, bounces: 5,  label: 'Media',    desc: '~12s'  },
  high:    { samples: 256, bounces: 8,  label: 'Alta',     desc: '~30s'  },
  ultra:   { samples: 512, bounces: 12, label: 'Ultra',    desc: '~1min' },
};
type QualityKey = keyof typeof QUALITY_PRESETS;

// ── Helpers ────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function getInterpolatedTransform(obj: any, time: number) {
  const kfs = obj.keyframes;
  if (!kfs || kfs.length === 0) return obj.transform;
  const sorted = [...kfs].sort((a: any, b: any) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].transform;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].transform;
  let prev = sorted[0], next = sorted[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      prev = sorted[i]; next = sorted[i + 1]; break;
    }
  }
  const t = (time - prev.time) / (next.time - prev.time);
  return {
    position: [0,1,2].map(i => lerp(prev.transform.position[i], next.transform.position[i], t)) as [number,number,number],
    rotation: [0,1,2].map(i => lerp(prev.transform.rotation[i], next.transform.rotation[i], t)) as [number,number,number],
    scale:    [0,1,2].map(i => lerp(prev.transform.scale[i],    next.transform.scale[i],    t)) as [number,number,number],
  };
}

/** Halton sequence for low-discrepancy sub-pixel anti-aliasing jitter */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/** Carga una textura y devuelve la promesa resuelta */
function loadTex(loader: THREE.TextureLoader, url: string, isColor = false): Promise<THREE.Texture> {
  return new Promise((res, rej) => loader.load(url, t => {
    t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    t.flipY = false;
    res(t);
  }, undefined, rej));
}

// Shader para acumular muestras temporalmente (Super-Sampling Anti-Aliasing & Soft Shadows)
const blendShader = {
  uniforms: {
    tNew: { value: null as THREE.Texture | null },
    tOld: { value: null as THREE.Texture | null },
    blendWeight: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tNew;
    uniform sampler2D tOld;
    uniform float blendWeight;
    varying vec2 vUv;
    void main() {
      vec4 newColor = texture2D(tNew, vUv);
      vec4 oldColor = texture2D(tOld, vUv);
      gl_FragColor = mix(oldColor, newColor, blendWeight);
    }
  `,
};

export const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const { project, currentTime, lastCameraState, updateEnvironment } = useStore();

  const [samples, setSamples]       = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [status, setStatus]         = useState('Configurando...');
  const [quality, setQuality]       = useState<QualityKey>('draft');
  const [showSettings, setShowSettings] = useState(false);
  const [showGround, setShowGround] = useState(false);
  const [fov, setFov]               = useState(45);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<'viewport' | '1080p' | '4k' | 'square'>('viewport');
  const [ready, setReady]           = useState(false);
  const [error, setError]           = useState('');

  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef        = useRef<number | null>(null);
  const mountedRef    = useRef(true);

  const preset = QUALITY_PRESETS[quality];

  // ── Inicio del render ──────────────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (rendererRef.current) { 
      try { rendererRef.current.dispose(); } catch (_) {}
      rendererRef.current = null; 
    }

    setReady(false);
    setError('');
    setSamples(0);
    setIsRendering(false);
    setStatus('Creando motor físico de render...');

    let w = containerRef.current.clientWidth;
    let h = containerRef.current.clientHeight;

    if (resolution === '1080p') {
      w = 1920; h = 1080;
    } else if (resolution === '4k') {
      w = 3840; h = 2160;
    } else if (resolution === 'square') {
      w = 1024; h = 1024;
    }

    // ── Renderer de alta definición con ToneMapping ───────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = project.environment.exposure ?? 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // ── Cámara ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 1000);
    
    if (selectedCameraId) {
      const camObj = project.cameras?.find(c => c.id === selectedCameraId);
      if (camObj) {
        camera.position.fromArray(camObj.transform.position);
        camera.rotation.fromArray(camObj.transform.rotation);
        camera.fov = camObj.fov;
      }
    } else if ((lastCameraState as any)?.position) {
      camera.position.fromArray((lastCameraState as any).position);
      camera.lookAt(new THREE.Vector3().fromArray((lastCameraState as any).target ?? [0, 0, 0]));
    } else {
      camera.position.set(0, 2, 6);
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    cameraRef.current = camera;

    // ── Escena y Entorno PBR ────────────────────────────────────────────────────────────
    setStatus('Cargando iluminación de estudio HDRI...');
    const scene = new THREE.Scene();

    await setupSceneEnvironment(scene, renderer, project.environment);

    // ── Luces de Estudio Físicas con Sombra Suave ──────────────────────────
    const hasVisibleProjectLights = project.lights && project.lights.some((l: any) => l.visible);

    if (hasVisibleProjectLights) {
      project.lights.forEach((lData: any) => {
        if (!lData.visible) return;
        const color = lData.color || '#ffffff';
        const intensity = lData.intensity ?? 1;
        const pos = lData.transform?.position || [0, 5, 0];
        const rot = lData.transform?.rotation || [0, 0, 0];

        switch (lData.type) {
          case 'POINT': {
            const light = new THREE.PointLight(color, intensity * 50, lData.distance ?? 0, lData.decay ?? 2);
            light.position.fromArray(pos);
            light.castShadow = true;
            light.shadow.mapSize.width = 1024;
            light.shadow.mapSize.height = 1024;
            light.shadow.radius = 3;
            scene.add(light);
            break;
          }
          case 'DIRECTIONAL': {
            const dl = new THREE.DirectionalLight(color, intensity * 3.5);
            dl.castShadow = lData.castShadow ?? true;
            dl.position.fromArray(pos);
            dl.shadow.mapSize.width = 2048;
            dl.shadow.mapSize.height = 2048;
            dl.shadow.radius = 4;
            const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
            dl.target.position.copy(dl.position).add(dir);
            dl.target.updateMatrixWorld(true);
            scene.add(dl);
            scene.add(dl.target);
            break;
          }
          case 'SPOT': {
            const sl = new THREE.SpotLight(color, intensity * 80, lData.distance ?? 0, lData.angle ?? Math.PI / 4, lData.penumbra ?? 0.3, lData.decay ?? 2);
            sl.castShadow = lData.castShadow ?? true;
            sl.position.fromArray(pos);
            sl.shadow.mapSize.width = 1024;
            sl.shadow.mapSize.height = 1024;
            sl.shadow.radius = 3;
            const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
            sl.target.position.copy(sl.position).add(dir);
            sl.target.updateMatrixWorld(true);
            scene.add(sl);
            scene.add(sl.target);
            break;
          }
          case 'RECTAREA': {
            const rl = new THREE.RectAreaLight(color, intensity * 15, lData.width ?? 2, lData.height ?? 2);
            rl.position.fromArray(pos);
            rl.rotation.fromArray(rot);
            scene.add(rl);
            break;
          }
        }
      });
    }

    // Luz solar principal de estudio
    const sun = new THREE.DirectionalLight('#fffaf0', hasVisibleProjectLights ? 3 : 5);
    sun.position.set(6, 10, 6);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld(true);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0001;
    scene.add(sun);
    scene.add(sun.target);

    // Luz de relleno lateral
    const fillLight = new THREE.DirectionalLight('#dce8ff', hasVisibleProjectLights ? 1.5 : 2.5);
    fillLight.position.set(-6, 4, -6);
    fillLight.target.position.set(0, 0, 0);
    fillLight.target.updateMatrixWorld(true);
    scene.add(fillLight);
    scene.add(fillLight.target);

    // ── Plano de suelo con sombra suave física ────────────────────────────
    if (showGround) {
      let minY = 0;
      project.objects.forEach((obj: any) => {
        if (obj.transform) minY = Math.min(minY, obj.transform.position[1] - 0.5);
      });

      const groundGeo = new THREE.PlaneGeometry(60, 60);
      const groundMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#22242c'),
        roughness: 0.7,
        metalness: 0.1,
        clearcoat: 0.2,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = minY - 0.01;
      ground.receiveShadow = true;
      scene.add(ground);
    }

    // ── Cargar materiales y objetos ────────────────────────────────────────
    setStatus('Cargando materiales PBR...');
    const texLoader = new THREE.TextureLoader();

    const loadMaterial = async (obj: any): Promise<THREE.MeshPhysicalMaterial> => {
      const projectMaterials = project.materials || [];
      const refMat = obj.materialId ? projectMaterials.find((m: any) => m.id === obj.materialId) : null;
      const mData: any = {
        ...(refMat || {}),
        ...(obj.material || {}),
      };

      const rawColor = mData.colorBase || mData.color || obj.color || '#cccccc';
      const finalColorHex = (typeof rawColor === 'string' && rawColor.trim() !== '' && rawColor !== '#000000' && rawColor !== '#000')
        ? rawColor
        : (obj.color && obj.color !== '#000000' ? obj.color : '#cccccc');

      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(finalColorHex),
        metalness: mData.metalness ?? 0,
        roughness: mData.roughness ?? 0.4,
        transmission: mData.transmission ?? 0,
        ior: mData.ior ?? 1.5,
        thickness: mData.thickness ?? 0,
        opacity: mData.opacity ?? obj.opacity ?? 1,
        transparent: (mData.opacity ?? obj.opacity ?? 1) < 1 || (mData.transmission ?? 0) > 0,
        emissive: new THREE.Color(mData.emissive && mData.emissive !== '#000000' ? mData.emissive : '#000000'),
        emissiveIntensity: mData.emissiveIntensity ?? 0,
        side: THREE.FrontSide,
        envMapIntensity: 1.2,
      });

      const loads: Promise<void>[] = [];
      const albedoUrl  = mData.mapAlbedo    || mData.map;
      const normalUrl  = mData.mapNormal    || mData.normalMap;
      const roughUrl   = mData.mapRoughness || mData.roughnessMap;
      const metalUrl   = mData.mapMetalness || mData.metalnessMap;
      const aoUrl      = mData.mapAO        || mData.aoMap;
      const emissUrl   = mData.mapEmissive  || mData.emissiveMap;

      if (albedoUrl) loads.push(loadTex(texLoader, albedoUrl, true).then(t => { mat.map = t; }).catch(() => {}));
      if (normalUrl) loads.push(loadTex(texLoader, normalUrl).then(t => { mat.normalMap = t; if (mData.normalScale) mat.normalScale.set(mData.normalScale, mData.normalScale); }).catch(() => {}));
      if (roughUrl)  loads.push(loadTex(texLoader, roughUrl).then(t => { mat.roughnessMap = t; }).catch(() => {}));
      if (metalUrl)  loads.push(loadTex(texLoader, metalUrl).then(t => { mat.metalnessMap = t; }).catch(() => {}));
      if (aoUrl)     loads.push(loadTex(texLoader, aoUrl).then(t => { mat.aoMap = t; }).catch(() => {}));
      if (emissUrl)  loads.push(loadTex(texLoader, emissUrl, true).then(t => { mat.emissiveMap = t; }).catch(() => {}));

      await Promise.all(loads);
      mat.needsUpdate = true;
      return mat;
    };

    const objPromises = project.objects.map(async (obj: any) => {
      if (!obj.visible) return null;
      const t = getInterpolatedTransform(obj, currentTime);
      let mesh: THREE.Object3D | null = null;

      if (obj.meshData) {
        try {
          if (obj.meshData.type === 'gltf') {
            const loader = new GLTFLoader();
            const dLoader = new DRACOLoader();
            dLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
            loader.setDRACOLoader(dLoader);
            loader.setMeshoptDecoder(MeshoptDecoder);
            const gltf = await loader.loadAsync(obj.meshData.data);
            mesh = gltf.scene;

            if (obj.materialId || (obj.material && Object.keys(obj.material).length > 0)) {
              const mat = await loadMaterial(obj);
              mesh.traverse((child: any) => {
                if (child.isMesh) {
                  child.material = mat;
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
            } else {
              mesh.traverse((child: any) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
            }
          } else if (obj.meshData.type === 'obj') {
            const group = await new OBJLoader().loadAsync(obj.meshData.data);
            const mat = await loadMaterial(obj);
            group.traverse((child: any) => { if (child.isMesh) { child.material = mat; child.castShadow = true; child.receiveShadow = true; } });
            mesh = group;
          } else if (obj.meshData.type === 'stl') {
            const geo = await new STLLoader().loadAsync(obj.meshData.data);
            geo.computeVertexNormals();
            const mat = await loadMaterial(obj);
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = true; m.receiveShadow = true;
            mesh = m;
          }
        } catch (e) {
          console.error(`[Render] Error al cargar meshData para ${obj.name}:`, e);
        }
      }

      if (!mesh) {
        try {
          const geo = createBaseGeometry(obj);
          if (!geo.getAttribute('normal')) {
            geo.computeVertexNormals();
          }
          const mat = await loadMaterial(obj);
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true; m.receiveShadow = true;
          mesh = m;
        } catch (e) {
          console.error(`[Render] Error al crear geometría base para ${obj.name}:`, e);
        }
      }

      if (mesh) {
        mesh.position.fromArray(t.position);
        mesh.rotation.fromArray(t.rotation);
        mesh.scale.fromArray(t.scale);
        mesh.updateMatrixWorld(true);
      }
      return mesh;
    });

    const loaded = await Promise.all(objPromises);
    loaded.forEach(o => { if (o) scene.add(o); });

    scene.updateMatrixWorld(true);

    // ── Pipeline de Acumulación Temporal (Super-Sampling & Soft Shadows) ───
    const renderTargetParams: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    let rtCurrent = new THREE.WebGLRenderTarget(w, h, renderTargetParams);
    let rtA       = new THREE.WebGLRenderTarget(w, h, renderTargetParams);
    let rtB       = new THREE.WebGLRenderTarget(w, h, renderTargetParams);

    const quadMaterial = new THREE.ShaderMaterial({
      uniforms: blendShader.uniforms,
      vertexShader: blendShader.vertexShader,
      fragmentShader: blendShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quadMesh = new THREE.Mesh(quadGeo, quadMaterial);
    const quadScene = new THREE.Scene();
    quadScene.add(quadMesh);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Guardar posición original de luz solar para jittering
    const baseSunPos = sun.position.clone();

    setReady(true);
    setStatus('Iniciando render fotorrealista acumulativo...');
    setIsRendering(true);

    // ── Loop de Acumulación Físico ─────────────────────────────────────────
    let currentSample = 0;

    const loop = () => {
      if (!mountedRef.current || !rendererRef.current) return;

      currentSample++;

      // 1. Jittering de sub-píxel para Super-Sampling Anti-Aliasing (Halton)
      const dx = (halton(currentSample, 2) - 0.5) / w;
      const dy = (halton(currentSample, 3) - 0.5) / h;
      camera.setViewOffset(w, h, dx * w, dy * h, w, h);

      // 2. Jittering suave de sombra solar para penumbra física
      const lightJitterX = (Math.random() - 0.5) * 0.15;
      const lightJitterY = (Math.random() - 0.5) * 0.15;
      sun.position.set(baseSunPos.x + lightJitterX, baseSunPos.y + lightJitterY, baseSunPos.z);

      // 3. Renderizar cuadro actual en rtCurrent
      renderer.setRenderTarget(rtCurrent);
      renderer.clear();
      renderer.render(scene, camera);

      // 4. Meclar con cuadro acumulado
      if (currentSample === 1) {
        // Primer cuadro: copiar directamente a rtA
        quadMaterial.uniforms.tNew.value = rtCurrent.texture;
        quadMaterial.uniforms.tOld.value = rtCurrent.texture;
        quadMaterial.uniforms.blendWeight.value = 1.0;
      } else {
        // Cuadros posteriores: mezclar 1/N con rtB (cuadro acumulado previo)
        quadMaterial.uniforms.tNew.value = rtCurrent.texture;
        quadMaterial.uniforms.tOld.value = rtB.texture;
        quadMaterial.uniforms.blendWeight.value = 1.0 / currentSample;
      }

      // Renderizar mezcla en rtA
      renderer.setRenderTarget(rtA);
      renderer.clear();
      renderer.render(quadScene, quadCamera);

      // Dibujar imagen final acumulada en la pantalla con Tone Mapping
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(quadScene, quadCamera);

      // Swap rtA y rtB
      const temp = rtA;
      rtA = rtB;
      rtB = temp;

      setSamples(currentSample);

      if (currentSample >= preset.samples) {
        if (mountedRef.current) {
          setIsRendering(false);
          setStatus(`✓ Completado — ${currentSample} muestras`);
          camera.clearViewOffset();
        }
        return;
      }

      if (currentSample % 2 === 0 && mountedRef.current) {
        setStatus(`Renderizando... ${currentSample} / ${preset.samples} SPP`);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [project, project.environment, currentTime, quality, fov, showGround, preset, lastCameraState, selectedCameraId, resolution]);

  useEffect(() => {
    mountedRef.current = true;
    startRender();
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  const handleDownload = () => {
    if (!canvasRef.current || samples < 1) return;
    const link = document.createElement('a');
    link.download = `render_${project.name}_${samples}spp.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const pctDone = Math.min(100, (samples / preset.samples) * 100);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* ── Header ── */}
        <div className="px-6 py-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600/20 text-violet-400 rounded-xl border border-violet-500/30">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Renderizado Fotorrealista
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                {status}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`p-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                showSettings
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}>
              <Settings size={15} />
              Configurar
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Panel Lateral de Ajustes */}
          {showSettings && (
            <div className="w-80 bg-zinc-900 border-r border-zinc-800 p-5 flex flex-col gap-5 overflow-y-auto z-10 flex-shrink-0">
              {/* Calidad */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  Calidad de Render
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map(key => {
                    const q = QUALITY_PRESETS[key];
                    const active = quality === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setQuality(key)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          active
                            ? 'bg-violet-600/20 border-violet-500 text-white'
                            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800'
                        }`}>
                        <div className="text-xs font-bold">{q.label}</div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{q.samples} SPP · {q.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resolución */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  Resolución de Salida
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'viewport', label: 'Viewport' },
                    { id: '1080p',    label: 'Full HD (1080p)' },
                    { id: '4k',       label: '4K Ultra HD' },
                    { id: 'square',   label: 'Cuadrado (1:1)' },
                  ].map(r => (
                    <button
                      key={r.id}
                      onClick={() => setResolution(r.id as any)}
                      className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                        resolution === r.id
                          ? 'bg-violet-600/20 border-violet-500 text-white'
                          : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800'
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cámaras */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <Camera size={13} />
                  Cámara
                </label>
                <select
                  value={selectedCameraId || ''}
                  onChange={e => setSelectedCameraId(e.target.value || null)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500">
                  <option value="">Vista de Edición Actual</option>
                  {(project.cameras || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* FOV */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Campo de Visión (FOV)
                  </label>
                  <span className="text-xs font-mono text-zinc-300">{fov}°</span>
                </div>
                <input
                  type="range" min="15" max="120" value={fov}
                  onChange={e => setFov(Number(e.target.value))}
                  className="w-full accent-violet-500 bg-zinc-800 rounded-lg h-1.5 cursor-pointer"
                />
              </div>

              {/* Opciones de Entorno, Fondo e Iluminación */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider block flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe size={13} className="text-violet-400" />
                    Iluminación & HDRI
                  </span>
                  <label className="text-[9px] text-violet-400 font-bold hover:underline cursor-pointer flex items-center gap-1">
                    <Upload size={10} />
                    Subir HDR
                    <input type="file" accept=".hdr,.exr,.png,.jpg,.jpeg,.webp" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const dataUrl = await fileToDataURL(file);
                        updateEnvironment({ hdriUrl: `${dataUrl}#${file.name}` });
                      }
                    }} className="hidden" />
                  </label>
                </label>

                {/* Presets HDRI */}
                <div className="grid grid-cols-3 gap-1.5">
                  {PRESET_HDRIS.map(opt => {
                    const active = project.environment.hdriUrl === opt.url;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => updateEnvironment({ hdriUrl: opt.url })}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          active
                            ? 'bg-violet-600/25 border-violet-500 text-white shadow-sm'
                            : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                        title={opt.desc}
                      >
                        <div className="text-sm">{opt.icon}</div>
                        <div className="text-[9px] font-bold truncate mt-0.5">{opt.name}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Modo de Fondo */}
                <div>
                  <span className="text-[10px] text-zinc-400 font-medium block mb-1">Modo de Fondo</span>
                  <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'GRADIENT', label: 'Estudio (Gradiente)' },
                      { id: 'HDRI',     label: 'Imagen HDRI' },
                      { id: 'COLOR',    label: 'Color Sólido' },
                      { id: 'TRANSPARENT', label: 'Transparente' },
                    ].map(m => {
                      const currentMode = project.environment.backgroundMode || (project.environment.backgroundVisible ? 'HDRI' : 'GRADIENT');
                      const active = currentMode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => updateEnvironment({
                            backgroundMode: m.id as BackgroundMode,
                            backgroundVisible: m.id === 'HDRI' || m.id === 'GRADIENT',
                          })}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all ${
                            active
                              ? 'bg-violet-600 text-white shadow'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Desenfoque del Fondo Bokeh */}
                {(project.environment.backgroundMode === 'HDRI' || (!project.environment.backgroundMode && project.environment.backgroundVisible)) && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-zinc-400">Desenfoque de Fondo (Bokeh)</span>
                      <span className="text-[10px] font-mono text-zinc-300">
                        {Math.round((project.environment.backgroundBlur ?? 0.25) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={project.environment.backgroundBlur ?? 0.25}
                      onChange={e => updateEnvironment({ backgroundBlur: parseFloat(e.target.value) })}
                      className="w-full accent-violet-500 bg-zinc-800 rounded-lg h-1.5 cursor-pointer"
                    />
                  </div>
                )}

                {/* Color de Fondo Sólido */}
                {project.environment.backgroundMode === 'COLOR' && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">Color Sólido de Fondo</span>
                    <input
                      type="color"
                      value={project.environment.backgroundColor || '#16171d'}
                      onChange={e => updateEnvironment({ backgroundColor: e.target.value })}
                      className="w-8 h-6 bg-transparent rounded border border-zinc-700 cursor-pointer"
                    />
                  </div>
                )}

                {/* Rotación HDRI */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-400">Rotación de Luz (Dirección)</span>
                    <span className="text-[10px] font-mono text-zinc-300">{project.environment.rotation ?? 0}°</span>
                  </div>
                  <input
                    type="range" min="0" max="360" step="5"
                    value={project.environment.rotation ?? 0}
                    onChange={e => updateEnvironment({ rotation: parseInt(e.target.value, 10) })}
                    className="w-full accent-violet-500 bg-zinc-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>

                {/* Intensidad IBL */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-400">Intensidad de Luz HDRI</span>
                    <span className="text-[10px] font-mono text-zinc-300">{(project.environment.intensity ?? 1.2).toFixed(1)}x</span>
                  </div>
                  <input
                    type="range" min="0.1" max="4.0" step="0.1"
                    value={project.environment.intensity ?? 1.2}
                    onChange={e => updateEnvironment({ intensity: parseFloat(e.target.value) })}
                    className="w-full accent-violet-500 bg-zinc-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>

                {/* Exposición Global */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-400">Exposición de Cámara</span>
                    <span className="text-[10px] font-mono text-zinc-300">{(project.environment.exposure ?? 1.1).toFixed(1)}x</span>
                  </div>
                  <input
                    type="range" min="0.2" max="3.0" step="0.1"
                    value={project.environment.exposure ?? 1.1}
                    onChange={e => updateEnvironment({ exposure: parseFloat(e.target.value) })}
                    className="w-full accent-violet-500 bg-zinc-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={showGround}
                    onChange={e => setShowGround(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0"
                  />
                  Añadir plano de suelo con sombras
                </label>
              </div>

              {/* Botón Aplicar */}
              <button
                onClick={startRender}
                className="mt-auto py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2">
                <RefreshCw size={14} />
                Reiniciar Render
              </button>
            </div>
          )}

          {/* Canvas de Render */}
          <div ref={containerRef} className="flex-1 h-full bg-black flex items-center justify-center relative overflow-hidden">
            <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-2xl" />

            {/* Error Overlay */}
            {error && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-20">
                <p className="text-red-400 font-semibold mb-2 text-sm">{error}</p>
                <button onClick={() => { setError(''); setShowSettings(true); }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[11px] font-bold">
                  Ver configuración
                </button>
              </div>
            )}

            {/* Controles de render flotantes */}
            {ready && (
              <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-20">
                {samples < preset.samples && (
                  <button onClick={() => setIsRendering(v => !v)}
                    className="p-2.5 bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-xl text-white hover:bg-zinc-800 transition-all"
                    title={isRendering ? 'Pausar' : 'Continuar'}>
                    {isRendering ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                )}
                <button onClick={startRender}
                  className="p-2.5 bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-xl text-white hover:bg-zinc-800 transition-all"
                  title="Reiniciar">
                  <RefreshCw size={15} />
                </button>
              </div>
            )}

            {/* Barra de progreso */}
            {ready && (
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent z-20">
                <div className="flex items-center justify-between text-[10px] font-bold text-white/80 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${isRendering ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                    <span className="font-mono">{samples} / {preset.samples} SPP</span>
                  </div>
                  <span className="font-mono">{pctDone.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pctDone}%`,
                      background: 'linear-gradient(90deg, #7c3aed, #db2777)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-zinc-500">
            {ready ? 'Renderizado Fotorrealista PBR — Super-Sampling Anti-Aliasing y Iluminación IBL' : 'Usa calidad Borrador para previsualizar rápido, Ultra para resultado final.'}
          </span>
          <button
            onClick={handleDownload}
            disabled={samples < 1}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] shadow-lg shadow-violet-900/30">
            <Download size={14} />
            Guardar PNG
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
