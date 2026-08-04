import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { useStore } from '../store/useStore';
import { X, Download, Play, Pause, RefreshCw, Sparkles, Settings, Camera } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadOptimizedEnvironmentTexture } from '../utils/hdrLoader';
import { createBaseGeometry } from '../utils/csg';

interface RenderModalProps { onClose: () => void; }

// ── Opciones de calidad ────────────────────────────────────────────────────
const QUALITY_PRESETS = {
  draft:   { samples: 32,  bounces: 3,  label: 'Borrador', desc: '~3s'   },
  medium:  { samples: 128, bounces: 5,  label: 'Media',    desc: '~15s'  },
  high:    { samples: 256, bounces: 8,  label: 'Alta',     desc: '~45s'  },
  ultra:   { samples: 512, bounces: 12, label: 'Ultra',    desc: '~2min' },
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

/** Carga una textura y devuelve la promesa resuelta */
function loadTex(loader: THREE.TextureLoader, url: string, isColor = false): Promise<THREE.Texture> {
  return new Promise((res, rej) => loader.load(url, t => {
    t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    t.flipY = false; // GLTF y PathTracer suelen preferir flipY=false para consistencia
    res(t);
  }, undefined, rej));
}

export const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const { project, currentTime, lastCameraState } = useStore();

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

  const pathTracerRef = useRef<WebGLPathTracer | null>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef        = useRef<number | null>(null);
  const mountedRef    = useRef(true);

  const preset = QUALITY_PRESETS[quality];

  // ── Inicio del render ──────────────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current) return;

    // Limpiar render anterior
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (pathTracerRef.current) { 
      try {
        pathTracerRef.current.dispose(); 
      } catch (_) {}
      pathTracerRef.current = null; 
    }
    if (rendererRef.current) { 
      try {
        rendererRef.current.dispose(); 
      } catch (_) {}
      rendererRef.current = null; 
    }

    setReady(false);
    setError('');
    setSamples(0);
    setIsRendering(false);
    setStatus('Creando renderer...');

    let w = containerRef.current.clientWidth;
    let h = containerRef.current.clientHeight;

    if (resolution === '1080p') {
      w = 1920; h = 1080;
    } else if (resolution === '4k') {
      w = 3840; h = 2160;
    } else if (resolution === 'square') {
      w = 1024; h = 1024;
    }

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(w, h, false); // false para no forzar estilo CSS
    renderer.setPixelRatio(1); // Forzamos pixel ratio 1 para renders exactos
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = project.environment.exposure ?? 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
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
    cameraRef.current = camera;

    // ── Path Tracer ───────────────────────────────────────────────────────
    const pt = new WebGLPathTracer(renderer);
    pt.renderToCanvas        = true;
    pt.synchronizeRenderSize = true;
    pt.bounces               = preset.bounces;
    pt.transmissiveBounces   = Math.max(10, preset.bounces); // Mejora la calidad de los cristales/líquidos
    pt.filterGlossyFactor    = 0.5; // Reduce los "fireflies" (puntos blancos) en reflejos
    pt.multipleImportanceSampling = true; // Mejora la iluminación global
    
    // Si la calidad es ultra, dividimos el render en tiles para no saturar la GPU
    if (quality === 'ultra') {
      pt.tiles.set(2, 2);
    } else {
      pt.tiles.set(1, 1);
    }

    pt.renderDelay           = 300;  // ms de delay antes de iniciar PT — da tiempo a compilar shaders
    pt.fadeDuration          = 0;
    pt.minSamples            = 1;
    pt.dynamicLowRes         = true;  // preview de baja resolución durante compilación
    pt.rasterizeScene        = true;
    pathTracerRef.current = pt;

    // ── Escena ────────────────────────────────────────────────────────────
    setStatus('Cargando escena...');
    const scene = new THREE.Scene();

    // ── Environment / HDRI ────────────────────────────────────────────────
    const envIntensity = project.environment.intensity ?? 1;
    if (project.environment.hdriUrl) {
      try {
        setStatus('Cargando HDRI / EXR...');
        const tex = await loadOptimizedEnvironmentTexture(project.environment.hdriUrl, { maxDimension: 2048 });
        // Configurar la textura como equirrect para que three-gpu-pathtracer pueda leerla
        tex.mapping    = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        tex.needsUpdate = true;
        scene.environment = tex;           // raw equirect — el path tracer lo requiere así
        if (project.environment.backgroundVisible) {
          scene.background = tex;
          scene.backgroundBlurriness = 0.02;
        } else {
          scene.background = new THREE.Color('#0d0d10');
        }
        scene.environmentIntensity = envIntensity;
      } catch (e) {
        console.warn('HDRI/EXR load failed, using synthetic sky:', e);
        setupSyntheticSky(scene, renderer, envIntensity);
      }
    } else {
      setupSyntheticSky(scene, renderer, envIntensity);
    }

    // ── Luces del proyecto ────────────────────────────────────────────────
    if (project.lights && project.lights.length > 0) {
      project.lights.forEach((lData: any) => {
        if (!lData.visible) return;
        let light: THREE.Light;
        switch (lData.type) {
          case 'POINT':
            light = new THREE.PointLight(lData.color, lData.intensity * 100, lData.distance ?? 0, lData.decay ?? 2);
            break;
          case 'DIRECTIONAL': {
            const dl = new THREE.DirectionalLight(lData.color, lData.intensity * 3);
            dl.castShadow = lData.castShadow ?? true;
            dl.shadow.mapSize.set(2048, 2048);
            dl.shadow.radius = 4;
            dl.shadow.bias = -0.0005;
            light = dl; break;
          }
          case 'SPOT': {
            const sl = new THREE.SpotLight(lData.color, lData.intensity * 100, lData.distance ?? 0, lData.angle ?? Math.PI / 4, lData.penumbra ?? 0.2, lData.decay ?? 2);
            sl.castShadow = lData.castShadow ?? true;
            sl.shadow.mapSize.set(1024, 1024);
            light = sl; break;
          }
          case 'RECTAREA':
            light = new THREE.RectAreaLight(lData.color, lData.intensity * 10, lData.width ?? 2, lData.height ?? 2);
            break;
          default: return;
        }
        light.position.fromArray(lData.transform.position);
        light.rotation.fromArray(lData.transform.rotation);
        scene.add(light);
      });
    } else {
      // Luz por defecto si no hay luces configuradas
      const sun = new THREE.DirectionalLight('#fff5e0', 3);
      sun.position.set(3, 8, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 4;
      sun.shadow.bias = -0.0005;
      scene.add(sun);
      scene.add(new THREE.AmbientLight('#c8d8ff', 0.4));
    }

    // ── Plano de suelo con sombra ─────────────────────────────────────────
    if (showGround) {
      // Calcular bbox de todos los objetos para colocar el suelo
      let minY = 0;
      project.objects.forEach((obj: any) => {
        if (obj.transform) minY = Math.min(minY, obj.transform.position[1] - 1);
      });

      const groundGeo = new THREE.PlaneGeometry(40, 40, 1, 1);
      const groundMat = new THREE.MeshPhysicalMaterial({
        color: '#1a1a1f',
        roughness: 0.95,
        metalness: 0.0,
        envMapIntensity: 0.3,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = minY - 0.01;
      ground.receiveShadow = true;
      scene.add(ground);
    }

    // ── Objetos de la escena ───────────────────────────────────────────────
    setStatus('Cargando objetos...');
    const texLoader = new THREE.TextureLoader();

    const loadMaterial = async (obj: any): Promise<THREE.MeshPhysicalMaterial> => {
      const projectMaterials = project.materials || [];
      const refMat = obj.materialId ? projectMaterials.find((m: any) => m.id === obj.materialId) : null;
      const mData: any = {
        ...(refMat || {}),
        ...(obj.material || {}),
      };

      const rawColor = mData.colorBase || mData.color || (obj.color && obj.color !== '#000000' ? obj.color : null) || '#ffffff';
      const finalColorHex = (typeof rawColor === 'string' && rawColor.trim() !== '' && rawColor !== '#000000' && rawColor !== '#000')
        ? rawColor
        : (obj.color && obj.color !== '#000000' ? obj.color : '#ffffff');

      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(finalColorHex),
        metalness: mData.metalness ?? 0,
        roughness: mData.roughness ?? 0.5,
        transmission: mData.transmission ?? 0,
        ior: mData.ior ?? 1.5,
        thickness: mData.thickness ?? 0,
        opacity: mData.opacity ?? obj.opacity ?? 1,
        transparent: (mData.opacity ?? obj.opacity ?? 1) < 1 || (mData.transmission ?? 0) > 0,
        emissive: new THREE.Color(mData.emissive && mData.emissive !== '#000000' ? mData.emissive : '#000000'),
        emissiveIntensity: mData.emissiveIntensity ?? 0,
        side: THREE.DoubleSide,
        envMapIntensity: 1.0,
      });

      // Cargar mapas — importante esperar para que el path tracer los vea
      const loads: Promise<void>[] = [];
      // Soportar ambas convenciones: mapAlbedo (store) y map/normalMap (legacy)
      const albedoUrl  = mData.mapAlbedo    || mData.map;
      const normalUrl  = mData.mapNormal    || mData.normalMap;
      const roughUrl   = mData.mapRoughness || mData.roughnessMap;
      const metalUrl   = mData.mapMetalness || mData.metalnessMap;
      const aoUrl      = mData.mapAO        || mData.aoMap;
      const emissUrl   = mData.mapEmissive  || mData.emissiveMap;
      if (albedoUrl) loads.push(loadTex(texLoader, albedoUrl, true).then(t => { mat.map = t; mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar albedo:', err)));
      if (normalUrl) loads.push(loadTex(texLoader, normalUrl).then(t => { mat.normalMap = t; if (mData.normalScale) mat.normalScale.set(mData.normalScale, mData.normalScale); mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar normal:', err)));
      if (roughUrl)  loads.push(loadTex(texLoader, roughUrl).then(t => { mat.roughnessMap = t; mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar roughness:', err)));
      if (metalUrl)  loads.push(loadTex(texLoader, metalUrl).then(t => { mat.metalnessMap = t; mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar metalness:', err)));
      if (aoUrl)     loads.push(loadTex(texLoader, aoUrl).then(t => { mat.aoMap = t; mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar AO:', err)));
      if (emissUrl)  loads.push(loadTex(texLoader, emissUrl, true).then(t => { mat.emissiveMap = t; mat.needsUpdate = true; }).catch(err => console.error('[RenderModal] Error al cargar emissive:', err)));
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
            // Aplicar material del proyecto si está definido explícitamente
            if (obj.materialId || (obj.material && Object.keys(obj.material).length > 0)) {
              const mat = await loadMaterial(obj);
              mesh.traverse((child: any) => {
                if (child.isMesh) {
                  child.material = mat;
                  child.material.side = THREE.DoubleSide;
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
            } else {
              // Sin material de proyecto: conservar materiales originales del GLTF y forzar DoubleSide
              mesh.traverse((child: any) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                const upgraded = mats.map((m: THREE.Material) => {
                  let phys: THREE.MeshPhysicalMaterial;
                  if (m instanceof THREE.MeshPhysicalMaterial) {
                    phys = m;
                  } else if (m instanceof THREE.MeshStandardMaterial) {
                    phys = new THREE.MeshPhysicalMaterial();
                    phys.copy(m as any);
                    phys.map           = m.map;
                    phys.normalMap     = m.normalMap;
                    phys.roughnessMap  = m.roughnessMap;
                    phys.metalnessMap  = m.metalnessMap;
                    phys.aoMap         = m.aoMap;
                    phys.emissiveMap   = m.emissiveMap;
                  } else {
                    phys = new THREE.MeshPhysicalMaterial({ color: (m as any).color || '#ffffff' });
                  }
                  phys.side = THREE.DoubleSide;
                  phys.needsUpdate = true;
                  return phys;
                });
                child.material = upgraded.length === 1 ? upgraded[0] : upgraded;
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
          console.error(`[Render] Failed to load meshData for ${obj.name}:`, e);
        }
      }

      if (!mesh) {
        try {
          const geo = createBaseGeometry(obj);
          const mat = await loadMaterial(obj);
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true; m.receiveShadow = true;
          mesh = m;
        } catch (e) {
          console.error(`[Render] Failed to build geometry for ${obj.name}:`, e);
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

    
    // ── Construir BVH ───────────────────────────────────────────────
    setStatus('Generando BVH...');
    try {
      pt.setScene(scene, camera);
    } catch (err: any) {
      console.error('[Render] setScene failed:', err);
      const msg = 'Error al preparar la escena. Prueba calidad Borrador.';
      if (mountedRef.current) setError(msg);
      return;
    }

    if (!mountedRef.current) return;

    setReady(true);
    setStatus('Listo — iniciando render...');
    setIsRendering(true);

    // ── Loop de render ─────────────────────────────────────────────────────
    let frameCount = 0;
    const loop = () => {
      if (!mountedRef.current || !pathTracerRef.current || !rendererRef.current) return;

      const curPt = pathTracerRef.current;
      const s = Math.floor(curPt.samples);

      if (s >= preset.samples) {
        if (mountedRef.current) {
          setIsRendering(false);
          setSamples(s);
          setStatus(`✓ Completado — ${s} muestras`);
        }
        return;
      }

      if (!curPt.isCompiling) {
        try {
          curPt.renderSample();
        } catch (e) {
          // isReady puede fallar en el primer frame si los shaders PT aún no están listos
          // simplemente saltamos ese frame y reintentamos en el siguiente
          console.warn('[Render] renderSample frame skip:', e);
        }
        frameCount++;
        const cur = Math.floor(curPt.samples);
        // Actualizar UI cada 5 frames para no saturar React
        if (frameCount % 5 === 0 && mountedRef.current) {
          setSamples(cur);
          setStatus(`Renderizando... ${cur} / ${preset.samples} muestras`);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [project, currentTime, quality, fov, showGround, preset, lastCameraState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (pathTracerRef.current) { pathTracerRef.current.dispose(); pathTracerRef.current = null; }
      if (rendererRef.current) { rendererRef.current.dispose(); rendererRef.current = null; }
    };
  }, []);

  // Pausa/reanuda
  useEffect(() => {
    if (pathTracerRef.current) {
      pathTracerRef.current.pausePathTracing = !isRendering;
    }
  }, [isRendering]);

  const handleDownload = () => {
    if (!canvasRef.current || samples < 1) return;
    const link = document.createElement('a');
    link.download = `render_${project.name}_${samples}spp.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const pctDone = Math.min(100, (samples / preset.samples) * 100);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-5xl bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
           style={{ maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Renderizado Fotorrealista</h2>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(v => !v)}
              className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}
              title="Configuración">
              <Settings size={16} />
            </button>
            <button onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
              title="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Configuración ── */}
        {showSettings && (
          <div className="px-5 py-4 border-b border-zinc-800/60 bg-zinc-900/30 flex-shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Calidad */}
              <div className="space-y-1.5 col-span-2">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Calidad</label>
                <div className="flex gap-1">
                  {(Object.entries(QUALITY_PRESETS) as [QualityKey, any][]).map(([k, v]) => (
                    <button key={k} onClick={() => setQuality(k)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${quality === k ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                      <span className="block font-bold">{v.label}</span>
                      <span className="text-[8px] opacity-70">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Resolución */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Resolución</label>
                <select 
                  value={resolution} 
                  onChange={e => setResolution(e.target.value as any)}
                  className="w-full bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg px-2 py-1.5 outline-none border border-white/5"
                >
                  <option value="viewport">Igual al Visor</option>
                  <option value="1080p">1920x1080 (FHD)</option>
                  <option value="4k">3840x2160 (4K)</option>
                  <option value="square">1024x1024 (Cuadrado)</option>
                </select>
              </div>
              {/* Cámara */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Cámara</label>
                <select 
                  value={selectedCameraId || ''} 
                  onChange={e => setSelectedCameraId(e.target.value || null)}
                  className="w-full bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg px-2 py-1.5 outline-none border border-white/5"
                >
                  <option value="">Cámara del Visor</option>
                  {(project.cameras || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {/* FOV */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">FOV: {selectedCameraId ? (project.cameras?.find(c => c.id === selectedCameraId)?.fov || fov) : fov}°</label>
                <input type="range" min={15} max={120} step={5} value={selectedCameraId ? (project.cameras?.find(c => c.id === selectedCameraId)?.fov || fov) : fov} onChange={e => !selectedCameraId && setFov(+e.target.value)}
                  disabled={!!selectedCameraId}
                  className={`w-full h-1.5 accent-violet-500 ${selectedCameraId ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
              {/* Suelo */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Opciones</label>
                <button onClick={() => setShowGround(v => !v)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold w-full transition-colors ${showGround ? 'bg-teal-900/40 text-teal-300 border border-teal-800/40' : 'bg-zinc-800 text-zinc-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${showGround ? 'bg-teal-400' : 'bg-zinc-600'}`} />
                  Plano de suelo
                </button>
              </div>
            </div>
            <button
              onClick={startRender}
              className="mt-3 w-full py-2 rounded-xl text-[12px] font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-lg shadow-violet-900/30 active:scale-[0.99]">
              <Sparkles size={12} className="inline mr-1.5 -mt-0.5" />
              Iniciar Render
            </button>
          </div>
        )}

        {/* ── Canvas ── */}
        <div ref={containerRef} className="flex-1 relative bg-black min-h-0" style={{ aspectRatio: '16/9' }}>
          <canvas ref={canvasRef} className="w-full h-full" />

          {/* Estado vacío — render no iniciado */}
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
                <Sparkles size={28} className="text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">Listo para renderizar</p>
                <p className="text-[11px] text-zinc-500 mt-1">Configura las opciones y pulsa Iniciar Render</p>
              </div>
              <button
                onClick={() => { setShowSettings(false); startRender(); }}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-[12px] font-bold transition-all shadow-xl shadow-violet-900/40 active:scale-[0.98]">
                <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />
                Renderizar ({QUALITY_PRESETS[quality].label})
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 p-8">
              <div className="text-red-400 text-sm font-bold text-center">{error}</div>
              <button onClick={() => { setError(''); setShowSettings(true); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[11px] font-bold">
                Ver configuración
              </button>
            </div>
          )}

          {/* Controles de render flotantes */}
          {ready && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              {samples < preset.samples && (
                <button onClick={() => setIsRendering(v => !v)}
                  className="p-2.5 bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-xl text-white hover:bg-zinc-800 transition-all"
                  title={isRendering ? 'Pausar' : 'Continuar'}>
                  {isRendering ? <Pause size={15} /> : <Play size={15} />}
                </button>
              )}
              <button onClick={() => {
                startRender();
              }}
                className="p-2.5 bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-xl text-white hover:bg-zinc-800 transition-all"
                title="Reiniciar">
                <RefreshCw size={15} />
              </button>
            </div>
          )}

          {/* Barra de progreso */}
          {ready && (
            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center justify-between text-[10px] font-bold text-white/80 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isRendering ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  <span className="font-mono">{samples} / {preset.samples} SPP</span>
                </div>
                <span className="font-mono">{pctDone.toFixed(1)}%</span>
              </div>
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pctDone}%`,
                    background: 'linear-gradient(90deg, #7c3aed, #db2777)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-zinc-600">
            {ready ? 'Path Tracing — cada muestra añade detalle. Sin ruido a las 512+ muestras.' : 'Usa calidad Borrador para previsualizar rápido, Ultra para resultado final.'}
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

/** Crea un cielo sintético con PMREMGenerator cuando no hay HDRI */
function setupSyntheticSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, intensity: number) {

  // ── Generar envmap equirrectangular para WebGLPathTracer ──────────────────
  // CRÍTICO: three-gpu-pathtracer necesita una DataTexture Float32 con mapping
  // EquirectangularReflectionMapping en scene.environment.
  // fromScene(RoomEnvironment) devuelve un CubeRenderTarget → crash en setScene.
  // Solución: generar DataTexture de gradiente cielo → asignar directamente.
  const W = 512, H = 256;
  const pixels = new Float32Array(W * H * 4);
  const cTop = new THREE.Color('#1e4080');
  const cHor = new THREE.Color('#b8cce0');
  const cSun = new THREE.Color('#fff4cc');
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const t = Math.pow(1 - v, 0.45);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const sunX = Math.abs(x / W - 0.25) * W;
      const sunY = Math.abs(v - 0.42) * H;
      const sunF = Math.exp(-(sunX * sunX + sunY * sunY) / 60) * 3;
      pixels[i    ] = cTop.r * t + cHor.r * (1-t) + cSun.r * sunF;
      pixels[i + 1] = cTop.g * t + cHor.g * (1-t) + cSun.g * sunF;
      pixels[i + 2] = cTop.b * t + cHor.b * (1-t) + cSun.b * sunF;
      pixels[i + 3] = 1.0;
    }
  }
  // Asignar el DataTexture equirrect directamente — path tracer lo consume así
  const envTex = new THREE.DataTexture(pixels, W, H, THREE.RGBAFormat, THREE.FloatType);
  envTex.mapping    = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.LinearSRGBColorSpace;
  envTex.needsUpdate = true;
  scene.environment = envTex;
  scene.background = envTex;
  scene.backgroundBlurriness = 0.02;
  scene.environmentIntensity = intensity;
}