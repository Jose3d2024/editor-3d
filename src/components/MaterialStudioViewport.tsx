import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/useStore';
import { createPBRMaterial } from '../utils/materialUtils';
import { MaterialPanel } from './MaterialPanel';
import {
  ArrowLeft, Palette, Sparkles, RotateCw, Sun, Box, Eye, EyeOff,
  Maximize2, Camera, Download, Layers, ShieldCheck, Check,
  SlidersHorizontal, RefreshCw, ZoomIn, ZoomOut, Image as ImageIcon,
  Zap, Cloud, Wind, HelpCircle, Globe
} from 'lucide-react';
import type { MaterialData } from '../types';

type PreviewMeshType = 'SPHERE' | 'SHADER_BALL' | 'CUBE' | 'CYLINDER' | 'TORUS' | 'CLOTH' | 'VOLUME';

interface EnvironmentPreset {
  id: string;
  name: string;
  icon: string;
  bgColor: string;
  ambientColor: number;
  ambientIntensity: number;
  keyColor: number;
  keyIntensity: number;
  keyPos: [number, number, number];
  fillColor: number;
  fillIntensity: number;
  fillPos: [number, number, number];
  rimColor: number;
  rimIntensity: number;
  rimPos: [number, number, number];
  groundColor: string;
}

function createEquirectangularTextureForPreset(presetId: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  if (presetId === 'warm_sunset') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#1c172e');
    sky.addColorStop(0.35, '#5c2a47');
    sky.addColorStop(0.5, '#c95932');
    sky.addColorStop(0.65, '#f7b05b');
    sky.addColorStop(0.85, '#2e1814');
    sky.addColorStop(1, '#0e0807');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const sunGrad = ctx.createRadialGradient(512, 280, 5, 512, 280, 180);
    sunGrad.addColorStop(0, 'rgba(255, 255, 240, 1)');
    sunGrad.addColorStop(0.2, 'rgba(255, 200, 100, 0.9)');
    sunGrad.addColorStop(0.6, 'rgba(255, 120, 50, 0.4)');
    sunGrad.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 1024, 512);
  } else if (presetId === 'natural_forest') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#1a3b5c');
    sky.addColorStop(0.35, '#689bb5');
    sky.addColorStop(0.5, '#e0edbb');
    sky.addColorStop(0.65, '#2d4d29');
    sky.addColorStop(1, '#0f1f12');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const sunGrad = ctx.createRadialGradient(320, 200, 10, 320, 200, 160);
    sunGrad.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    sunGrad.addColorStop(0.4, 'rgba(230, 245, 190, 0.5)');
    sunGrad.addColorStop(1, 'rgba(150, 200, 130, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 1024, 512);
  } else if (presetId === 'cyberpunk_neon') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#060714');
    sky.addColorStop(0.4, '#12142d');
    sky.addColorStop(0.6, '#280c35');
    sky.addColorStop(1, '#080918');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const cyanGrad = ctx.createRadialGradient(250, 260, 5, 250, 260, 150);
    cyanGrad.addColorStop(0, 'rgba(0, 240, 255, 1)');
    cyanGrad.addColorStop(0.4, 'rgba(0, 180, 255, 0.6)');
    cyanGrad.addColorStop(1, 'rgba(0, 80, 255, 0)');
    ctx.fillStyle = cyanGrad;
    ctx.fillRect(0, 0, 1024, 512);

    const magGrad = ctx.createRadialGradient(760, 240, 5, 760, 240, 170);
    magGrad.addColorStop(0, 'rgba(255, 0, 140, 1)');
    magGrad.addColorStop(0.4, 'rgba(200, 0, 220, 0.6)');
    magGrad.addColorStop(1, 'rgba(120, 0, 180, 0)');
    ctx.fillStyle = magGrad;
    ctx.fillRect(0, 0, 1024, 512);
  } else if (presetId === 'warm_interior') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#1c1612');
    sky.addColorStop(0.4, '#382b22');
    sky.addColorStop(0.65, '#4a3729');
    sky.addColorStop(1, '#18120e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const warmLight = ctx.createRadialGradient(480, 160, 5, 480, 160, 140);
    warmLight.addColorStop(0, 'rgba(255, 235, 200, 1)');
    warmLight.addColorStop(0.5, 'rgba(255, 180, 110, 0.6)');
    warmLight.addColorStop(1, 'rgba(180, 100, 40, 0)');
    ctx.fillStyle = warmLight;
    ctx.fillRect(0, 0, 1024, 512);
  } else if (presetId === 'clean_white') {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#f0f2f5');
    sky.addColorStop(0.5, '#e4e7ec');
    sky.addColorStop(1, '#cbd0d8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const softGrad = ctx.createRadialGradient(512, 200, 10, 512, 200, 300);
    softGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    softGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = softGrad;
    ctx.fillRect(0, 0, 1024, 512);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#1d2027');
    sky.addColorStop(0.5, '#2e3340');
    sky.addColorStop(1, '#13151b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    const key = ctx.createRadialGradient(300, 180, 10, 300, 180, 180);
    key.addColorStop(0, 'rgba(255, 255, 255, 1)');
    key.addColorStop(0.4, 'rgba(240, 245, 255, 0.7)');
    key.addColorStop(1, 'rgba(200, 220, 255, 0)');
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, 1024, 512);

    const fill = ctx.createRadialGradient(780, 220, 10, 780, 220, 200);
    fill.addColorStop(0, 'rgba(215, 230, 255, 0.8)');
    fill.addColorStop(0.5, 'rgba(180, 200, 240, 0.35)');
    fill.addColorStop(1, 'rgba(140, 170, 220, 0)');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 1024, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'studio_neutral',
    name: 'Estudio Neutral (5500K)',
    icon: '💡',
    bgColor: '#121216',
    ambientColor: 0xffffff,
    ambientIntensity: 0.7,
    keyColor: 0xfffaf0,
    keyIntensity: 2.2,
    keyPos: [4, 5, 4],
    fillColor: 0xd8e4fc,
    fillIntensity: 0.8,
    fillPos: [-4, 2, -2],
    rimColor: 0xffffff,
    rimIntensity: 1.2,
    rimPos: [0, 4, -4],
    groundColor: '#18181f',
  },
  {
    id: 'warm_sunset',
    name: 'Atardecer Cálido',
    icon: '🌅',
    bgColor: '#1a1315',
    ambientColor: 0xff9966,
    ambientIntensity: 0.6,
    keyColor: 0xffaa55,
    keyIntensity: 2.8,
    keyPos: [5, 3, 3],
    fillColor: 0x6677aa,
    fillIntensity: 0.7,
    fillPos: [-4, 2, -3],
    rimColor: 0xffddaa,
    rimIntensity: 1.6,
    rimPos: [-2, 3, -4],
    groundColor: '#20181b',
  },
  {
    id: 'natural_forest',
    name: 'Exterior / Naturaleza',
    icon: '🌲',
    bgColor: '#111814',
    ambientColor: 0x88bb99,
    ambientIntensity: 0.65,
    keyColor: 0xfffbe8,
    keyIntensity: 2.5,
    keyPos: [3, 6, 3],
    fillColor: 0x558866,
    fillIntensity: 0.6,
    fillPos: [-3, 1, 2],
    rimColor: 0xaaddcc,
    rimIntensity: 1.0,
    rimPos: [0, 2, -4],
    groundColor: '#142019',
  },
  {
    id: 'cyberpunk_neon',
    name: 'Ciudad Cyberpunk',
    icon: '🏙️',
    bgColor: '#0c0d18',
    ambientColor: 0x223366,
    ambientIntensity: 0.5,
    keyColor: 0x00e5ff,
    keyIntensity: 2.6,
    keyPos: [4, 3, 3],
    fillColor: 0xff007f,
    fillIntensity: 2.2,
    fillPos: [-4, 2, -2],
    rimColor: 0x9900ff,
    rimIntensity: 2.0,
    rimPos: [0, 4, -4],
    groundColor: '#101222',
  },
  {
    id: 'warm_interior',
    name: 'Interior Cálido / Hogar',
    icon: '🏢',
    bgColor: '#181512',
    ambientColor: 0xffd1a4,
    ambientIntensity: 0.8,
    keyColor: 0xffe8d0,
    keyIntensity: 2.0,
    keyPos: [3, 4, 3],
    fillColor: 0xaa9988,
    fillIntensity: 0.9,
    fillPos: [-3, 2, -2],
    rimColor: 0xffc488,
    rimIntensity: 1.1,
    rimPos: [1, 3, -3],
    groundColor: '#221e1a',
  },
  {
    id: 'clean_white',
    name: 'Estudio Blanco Puro',
    icon: '⚪',
    bgColor: '#2a2b36',
    ambientColor: 0xffffff,
    ambientIntensity: 1.0,
    keyColor: 0xffffff,
    keyIntensity: 2.0,
    keyPos: [4, 6, 4],
    fillColor: 0xdde5f0,
    fillIntensity: 1.0,
    fillPos: [-4, 3, -3],
    rimColor: 0xffffff,
    rimIntensity: 1.0,
    rimPos: [0, 4, -4],
    groundColor: '#343644',
  },
];

export const MaterialStudioViewport: React.FC = () => {
  const {
    project,
    materialStudioMaterialId,
    closeMaterialStudio,
    setMaterialStudioMaterialId,
    updateMaterial,
    addMaterial,
    selectedObjectId,
    selectedObjectIds,
    assignMaterialToObjects,
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Studio configuration states
  const [selectedMeshType, setSelectedMeshType] = useState<PreviewMeshType>('SPHERE');
  const [envPresetId, setEnvPresetId] = useState<string>('studio_neutral');
  const [isTurntableActive, setIsTurntableActive] = useState<boolean>(true);
  const [turntableSpeed, setTurntableSpeed] = useState<number>(0.6);
  const [lightRotation, setLightRotation] = useState<number>(45); // degrees
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showEnvironment, setShowEnvironment] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const animState = useRef({ turntable: isTurntableActive, speed: turntableSpeed });
  useEffect(() => {
    animState.current = { turntable: isTurntableActive, speed: turntableSpeed };
  }, [isTurntableActive, turntableSpeed]);

  // Active Material reference
  const activeMaterial = useMemo(() => {
    if (materialStudioMaterialId) {
      const found = project.materials.find((m) => m.id === materialStudioMaterialId);
      if (found) return found;
    }
    return project.materials[0] || null;
  }, [project.materials, materialStudioMaterialId]);

  // Sync active material ID if missing
  useEffect(() => {
    if (!materialStudioMaterialId && project.materials.length > 0) {
      setMaterialStudioMaterialId(project.materials[0].id);
    }
  }, [materialStudioMaterialId, project.materials, setMaterialStudioMaterialId]);

  // Three.js References
  const threeRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    previewGroup: THREE.Group;
    lightsGroup: THREE.Group;
    groundMesh: THREE.Mesh;
    gridHelper: THREE.GridHelper;
    currentMesh: THREE.Object3D | null;
    currentMaterial: THREE.Material | null;
    ambientLight: THREE.AmbientLight;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    clock: THREE.Clock;
    reqId: number | null;
  } | null>(null);

  // Generate Sample Geometries
  const createPreviewObject = useCallback((type: PreviewMeshType, material: THREE.Material): THREE.Object3D => {
    const group = new THREE.Group();

    if (type === 'SPHERE') {
      // High-poly UV Sphere with smooth normals & tangents for normal mapping
      const geom = new THREE.SphereGeometry(1.2, 128, 64);
      geom.computeTangents();
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (type === 'SHADER_BALL') {
      // Complete multi-part Shader Ball inspection model
      // 1. Central Core Sphere
      const coreGeom = new THREE.SphereGeometry(0.85, 64, 32);
      coreGeom.computeTangents();
      const coreMesh = new THREE.Mesh(coreGeom, material);
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      // 2. Outer Ring / Collar
      const ringGeom = new THREE.TorusGeometry(1.2, 0.18, 32, 100);
      ringGeom.computeTangents();
      const ringMesh = new THREE.Mesh(ringGeom, material);
      ringMesh.rotation.x = Math.PI / 4;
      ringMesh.castShadow = true;
      ringMesh.receiveShadow = true;
      group.add(ringMesh);

      // 3. Base Stand Pedestal
      const baseGeom = new THREE.CylinderGeometry(1.0, 1.25, 0.35, 64);
      baseGeom.computeTangents();
      const baseMesh = new THREE.Mesh(baseGeom, material);
      baseMesh.position.y = -1.1;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      // 4. Inner Stepped Ring
      const stepGeom = new THREE.CylinderGeometry(0.65, 0.85, 0.2, 48);
      const stepMesh = new THREE.Mesh(stepGeom, material);
      stepMesh.position.y = -0.85;
      group.add(stepMesh);
    } else if (type === 'CUBE') {
      // Rounded Chamfered Cube
      const geom = new THREE.BoxGeometry(1.7, 1.7, 1.7, 32, 32, 32);
      // Round the vertices slightly
      const pos = geom.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // Subtle spherical rounding towards edges
        const len = v.length();
        const factor = Math.min(1.0, 1.3 / len);
        v.lerp(v.clone().normalize().multiplyScalar(1.2), 0.12);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geom.computeVertexNormals();
      geom.computeTangents();
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (type === 'CYLINDER') {
      const geom = new THREE.CylinderGeometry(1.0, 1.0, 2.0, 64, 32);
      geom.computeTangents();
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (type === 'TORUS') {
      const geom = new THREE.TorusGeometry(1.05, 0.45, 48, 128);
      geom.computeTangents();
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (type === 'CLOTH') {
      // Curved draped cloth / mantle with rich organic folds
      const geom = new THREE.PlaneGeometry(2.4, 2.4, 64, 64);
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = Math.sin(x * 2.5) * 0.35 + Math.cos(y * 2.0) * 0.25 + Math.sin((x + y) * 3.0) * 0.15;
        pos.setZ(i, z);
      }
      geom.computeVertexNormals();
      geom.computeTangents();
      const mesh = new THREE.Mesh(geom, material);
      mesh.rotation.x = -Math.PI / 6;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (type === 'VOLUME') {
      // Volume Cloud container cube
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geom, material);
      mesh.scale.set(2.2, 2.2, 2.2);
      group.add(mesh);
    }

    return group;
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 4.2);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Controls
    const controls = new OrbitControls(camera, canvasRef.current);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.5;
    controls.maxDistance = 12.0;
    controls.target.set(0, 0, 0);

    // Groups
    const previewGroup = new THREE.Group();
    scene.add(previewGroup);

    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.2);
    keyLight.position.set(4, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.radius = 2.5;
    lightsGroup.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd8e4fc, 0.8);
    fillLight.position.set(-4, 2, -2);
    lightsGroup.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    rimLight.position.set(0, 4, -4);
    lightsGroup.add(rimLight);

    // Studio Ground (Soft shadow catcher / infinite cyclorama floor)
    const groundGeo = new THREE.PlaneGeometry(24, 24, 64, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#18181f',
      roughness: 0.85,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.4;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Studio Grid
    const gridHelper = new THREE.GridHelper(16, 32, 0x4f46e5, 0x27272a);
    gridHelper.position.y = -1.39;
    scene.add(gridHelper);

    // Environment map generator (creates natural reflective environment for PBR)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#22222a');
    // Add soft gradient sphere in envScene
    const envSphere = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.MeshBasicMaterial({ color: '#3b3d4f', side: THREE.BackSide })
    );
    envScene.add(envSphere);
    const envLight1 = new THREE.PointLight(0xffffff, 3, 20);
    envLight1.position.set(5, 8, 5);
    envScene.add(envLight1);
    const envLight2 = new THREE.PointLight(0x88aaff, 2, 20);
    envLight2.position.set(-5, 4, -5);
    envScene.add(envLight2);

    const renderTarget = pmremGenerator.fromScene(envScene);
    scene.environment = renderTarget.texture;
    scene.background = new THREE.Color('#0a0a0c'); // Initial background

    const clock = new THREE.Clock();

    threeRefs.current = {
      scene,
      camera,
      renderer,
      controls,
      previewGroup,
      lightsGroup,
      groundMesh,
      gridHelper,
      currentMesh: null,
      currentMaterial: null,
      ambientLight,
      keyLight,
      fillLight,
      rimLight,
      clock,
      reqId: null,
    };

    // Render loop
    const animate = () => {
      const refs = threeRefs.current;
      if (!refs) return;

      const delta = refs.clock.getDelta();
      const elapsedTime = refs.clock.getElapsedTime();

      // Turntable rotation
      if (animState.current.turntable && refs.previewGroup) {
        refs.previewGroup.rotation.y += delta * animState.current.speed;
      }

      // Volumetric Shader updates
      if (refs.currentMaterial && (refs.currentMaterial as any).isShaderMaterial) {
        const sm = refs.currentMaterial as THREE.ShaderMaterial;
        if (sm.uniforms?.uTime) sm.uniforms.uTime.value = elapsedTime;
        if (sm.uniforms?.uLightPosition && refs.keyLight) {
          sm.uniforms.uLightPosition.value.copy(refs.keyLight.position);
        }
        if (sm.uniforms?.uModelInverse && refs.previewGroup) {
          let mesh = null;
          refs.previewGroup.traverse((child) => {
            if (child.isMesh) mesh = child;
          });
          if (mesh) {
            mesh.updateMatrixWorld();
            sm.uniforms.uModelInverse.value.copy(mesh.matrixWorld).invert();
          }
        }
      }

      refs.controls.update();
      refs.renderer.render(refs.scene, refs.camera);
      refs.reqId = requestAnimationFrame(animate);
    };

    animate();

    // Resize observer
    const handleResize = () => {
      if (!containerRef.current || !threeRefs.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      threeRefs.current.camera.aspect = w / h;
      threeRefs.current.camera.updateProjectionMatrix();
      threeRefs.current.renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (threeRefs.current?.reqId) {
        cancelAnimationFrame(threeRefs.current.reqId);
      }
      pmremGenerator.dispose();
      renderTarget.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Environment Lighting when preset or light rotation changes
  useEffect(() => {
    const refs = threeRefs.current;
    if (!refs) return;

    const preset = ENVIRONMENT_PRESETS.find((p) => p.id === envPresetId) || ENVIRONMENT_PRESETS[0];

    refs.ambientLight.color.set(preset.ambientColor);
    refs.ambientLight.intensity = preset.ambientIntensity;

    // Apply lighting rotation
    const rad = (lightRotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const [kx, ky, kz] = preset.keyPos;
    refs.keyLight.position.set(kx * cos - kz * sin, ky, kx * sin + kz * cos);
    refs.keyLight.color.set(preset.keyColor);
    refs.keyLight.intensity = preset.keyIntensity;

    const [fx, fy, fz] = preset.fillPos;
    refs.fillLight.position.set(fx * cos - fz * sin, fy, fx * sin + fz * cos);
    refs.fillLight.color.set(preset.fillColor);
    refs.fillLight.intensity = preset.fillIntensity;

    const [rx, ry, rz] = preset.rimPos;
    refs.rimLight.position.set(rx * cos - rz * sin, ry, rx * sin + rz * cos);
    refs.rimLight.color.set(preset.rimColor);
    refs.rimLight.intensity = preset.rimIntensity;

    (refs.groundMesh.material as THREE.MeshStandardMaterial).color.set(preset.groundColor);

    // Generate dynamic equirectangular texture for preset
    const envTexture = createEquirectangularTextureForPreset(envPresetId);
    refs.scene.environment = envTexture;
    if (showEnvironment) {
      refs.scene.background = envTexture;
    } else {
      refs.scene.background = new THREE.Color(preset.bgColor || '#0a0a0c');
    }
  }, [envPresetId, lightRotation, showEnvironment]);

  // Update Grid & Wireframe visibility
  useEffect(() => {
    const refs = threeRefs.current;
    if (!refs) return;
    refs.gridHelper.visible = showGrid;
    if (refs.currentMaterial && 'wireframe' in refs.currentMaterial) {
      (refs.currentMaterial as any).wireframe = showWireframe;
    }
  }, [showGrid, showWireframe]);

  // Update Mesh & Material when activeMaterial or selectedMeshType changes
  useEffect(() => {
    const refs = threeRefs.current;
    if (!refs) return;

    // Build fresh Three.js material from activeMaterial data
    let materialData = activeMaterial;
    if (!materialData) {
      materialData = {
        id: 'default_preview',
        name: 'Material Calibración PBR',
        color: '#e0e0e0',
        roughness: 0.35,
        metalness: 0.1,
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        transparent: false,
      };
    }

    const mat = createPBRMaterial(materialData);
    if ('wireframe' in mat) {
      (mat as any).wireframe = showWireframe;
    }
    refs.currentMaterial = mat;

    // Remove previous mesh
    if (refs.currentMesh) {
      refs.previewGroup.remove(refs.currentMesh);
      refs.currentMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).geometry?.dispose();
        }
      });
    }

    // If volumetric material, auto select VOLUME preview if requested
    let meshType = selectedMeshType;
    if (materialData.isVolumetric || materialData.volumetric?.enabled) {
      if (meshType !== 'VOLUME' && meshType === 'SPHERE') {
        meshType = 'VOLUME';
      }
    }

    const newObj = createPreviewObject(meshType, mat);
    refs.currentMesh = newObj;
    refs.previewGroup.add(newObj);
  }, [activeMaterial, selectedMeshType, createPreviewObject, showWireframe]);

  // Keyboard shortcut: Escape to exit Material Studio
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMaterialStudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMaterialStudio]);

  // Reset Camera View
  const handleResetCamera = () => {
    if (!threeRefs.current) return;
    const { camera, controls } = threeRefs.current;
    camera.position.set(0, 0.6, 4.2);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  // Zoom In / Out
  const handleZoom = (direction: 'in' | 'out') => {
    if (!threeRefs.current) return;
    const { camera } = threeRefs.current;
    const factor = direction === 'in' ? 0.8 : 1.25;
    camera.position.multiplyScalar(factor);
    threeRefs.current.controls.update();
  };

  // Assign current material to selected objects in project
  const handleAssignToSelected = () => {
    if (!activeMaterial) return;
    const ids =
      selectedObjectIds && selectedObjectIds.length > 0
        ? selectedObjectIds
        : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (ids.length === 0) {
      setCopiedNotification('No hay ningún objeto 3D seleccionado en la escena.');
      setTimeout(() => setCopiedNotification(null), 3000);
      return;
    }
    assignMaterialToObjects(ids, activeMaterial.id);
    setCopiedNotification(`Asignado con éxito a ${ids.length} objeto(s).`);
    setTimeout(() => setCopiedNotification(null), 2500);
  };

  // Duplicate active material
  const handleDuplicateMaterial = () => {
    if (!activeMaterial) return;
    const newId = 'mat_' + Math.random().toString(36).substr(2, 9);
    const duplicated: MaterialData = {
      ...activeMaterial,
      id: newId,
      name: `${activeMaterial.name} (Copia)`,
    };
    addMaterial(duplicated);
    setMaterialStudioMaterialId(newId);
    setCopiedNotification(`Material duplicado: "${duplicated.name}"`);
    setTimeout(() => setCopiedNotification(null), 2500);
  };

  // Take Snapshot / Export thumbnail
  const handleCaptureSnapshot = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(activeMaterial?.name || 'material').replace(/\s+/g, '_')}_preview.png`;
    a.click();
    setCopiedNotification('Captura HD guardada con éxito.');
    setTimeout(() => setCopiedNotification(null), 2500);
  };

  const selectedEnv = ENVIRONMENT_PRESETS.find((p) => p.id === envPresetId) || ENVIRONMENT_PRESETS[0];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0e12] text-zinc-200 overflow-hidden select-none font-sans">
      {/* ── TOP BAR HEADER: MATERIAL STUDIO ── */}
      <header className="h-13 bg-[#12131a] border-b border-white/10 px-4 flex items-center justify-between gap-3 flex-shrink-0 z-30 shadow-lg">
        {/* Left: Return to 3D Editor Button & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={closeMaterialStudio}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-95 group border border-indigo-400/30"
            title="Regresar a la escena 3D principal (Esc)"
          >
            <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Volver al Editor 3D</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono text-indigo-200 ml-1">Esc</span>
          </button>

          <div className="h-5 w-px bg-white/10" />

          {/* Mode Badge & Material Title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Palette size={15} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">Visor de Materiales PBR</span>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  GPU Aislada (100% Rendimiento)
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 font-medium">
                Editando: <strong className="text-indigo-300">{activeMaterial?.name || 'Sin Material'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Center: Mesh Selector & Environment Presets */}
        <div className="hidden xl:flex items-center gap-2 bg-[#181922] p-1 rounded-xl border border-white/5">
          {/* Sample Mesh Switcher */}
          <div className="flex items-center gap-0.5 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1.5">Malla:</span>
            {[
              { id: 'SPHERE', label: 'Esfera PBR', icon: '🌐' },
              { id: 'SHADER_BALL', label: 'Shader Ball', icon: '🪩' },
              { id: 'CUBE', label: 'Cubo', icon: '🧊' },
              { id: 'TORUS', label: 'Toroide', icon: '🍩' },
              { id: 'CLOTH', label: 'Paño', icon: '👕' },
              { id: 'VOLUME', label: 'Volumétrico', icon: '☁️' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMeshType(m.id as PreviewMeshType)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                  selectedMeshType === m.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
                title={m.label}
              >
                <span>{m.icon}</span>
                <span className="hidden 2xl:inline">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Environment Lighting Selector */}
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1">Luz:</span>
            <select
              value={envPresetId}
              onChange={(e) => setEnvPresetId(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {ENVIRONMENT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Assign to Object */}
          <button
            onClick={handleAssignToSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition-colors shadow-sm"
            title="Asignar este material al objeto seleccionado en la escena"
          >
            <Check size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">Asignar a Selección</span>
          </button>

          {/* Duplicate Material */}
          <button
            onClick={handleDuplicateMaterial}
            className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-white/10"
            title="Duplicar este material"
          >
            <Layers size={15} />
          </button>

          {/* Snapshot */}
          <button
            onClick={handleCaptureSnapshot}
            className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-white/10"
            title="Capturar imagen HD de la vista previa"
          >
            <Camera size={15} />
          </button>
        </div>
      </header>

      {/* ── NOTIFICATION TOAST ── */}
      {copiedNotification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-zinc-900/95 border border-indigo-500/40 text-indigo-200 text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2 animate-fadeIn">
          <Sparkles size={14} className="text-indigo-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* ── MAIN WORKSPACE: 3D VIEWPORT + MATERIAL INSPECTOR ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Central 3D Canvas Area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden flex flex-col min-w-0"
          style={{ backgroundColor: selectedEnv.bgColor }}
        >
          {/* Three.js Canvas */}
          <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing outline-none" />

          {/* ── TOP-LEFT HUD CONTROLS: Mesh & Lighting on Small/Medium screens ── */}
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 pointer-events-none">
            {/* Quick Shape Picker Pills */}
            <div className="flex items-center gap-1 p-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl pointer-events-auto shadow-xl">
              {[
                { id: 'SPHERE', label: 'Esfera', icon: '🌐' },
                { id: 'SHADER_BALL', label: 'Shader Ball', icon: '🪩' },
                { id: 'CUBE', label: 'Cubo', icon: '🧊' },
                { id: 'CLOTH', label: 'Tela', icon: '👕' },
                { id: 'VOLUME', label: 'Nube', icon: '☁️' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMeshType(m.id as PreviewMeshType)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                    selectedMeshType === m.id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                  }`}
                  title={m.label}
                >
                  <span>{m.icon}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Lighting Preset Picker */}
            <div className="flex items-center gap-2 p-1.5 px-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl pointer-events-auto shadow-xl">
              <Sun size={13} className="text-amber-400" />
              <select
                value={envPresetId}
                onChange={(e) => setEnvPresetId(e.target.value)}
                className="bg-transparent text-[10px] font-semibold text-zinc-200 focus:outline-none cursor-pointer"
              >
                {ENVIRONMENT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* HDRI 360 Toggle Button */}
            <button
              onClick={() => setShowEnvironment((v) => !v)}
              className={`flex items-center gap-1.5 p-1.5 px-2.5 rounded-xl text-[10px] font-bold tracking-wider transition-all pointer-events-auto shadow-xl ${
                showEnvironment
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                  : 'bg-black/60 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Alternar fondo panorámico HDRI 360°"
            >
              <Globe size={13} className={showEnvironment ? 'text-white' : 'text-indigo-400'} />
              <span>HDRI: {showEnvironment ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* ── TOP-RIGHT HUD: Light Angle Slider ── */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2 p-1.5 px-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl shadow-xl">
            <Sun size={13} className="text-yellow-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ángulo Luz:</span>
            <input
              type="range"
              min="0"
              max="360"
              value={lightRotation}
              onChange={(e) => setLightRotation(parseFloat(e.target.value))}
              className="w-20 accent-indigo-500 cursor-pointer"
              title={`Rotación de la iluminación: ${lightRotation}°`}
            />
            <span className="text-[10px] font-mono text-zinc-300 w-8">{lightRotation}°</span>
          </div>

          {/* ── BOTTOM HUD CONTROLS: Viewport Floating Bar ── */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl">
            {/* Turntable 360 Toggle */}
            <button
              onClick={() => setIsTurntableActive((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                isTurntableActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400'
              }`}
              title="Giro automático 360°"
            >
              <RotateCw size={12} className={isTurntableActive ? 'animate-spin' : ''} />
              <span>Turntable 360°</span>
            </button>

            {/* Turntable Speed Slider */}
            {isTurntableActive && (
              <div className="flex items-center gap-1 px-2">
                <input
                  type="range"
                  min="0.1"
                  max="2.5"
                  step="0.1"
                  value={turntableSpeed}
                  onChange={(e) => setTurntableSpeed(parseFloat(e.target.value))}
                  className="w-16 accent-indigo-500 cursor-pointer"
                  title={`Velocidad de giro: ${turntableSpeed.toFixed(1)}x`}
                />
              </div>
            )}

            <div className="h-4 w-px bg-white/10" />

            {/* Background Environment Toggle */}
            <button
              onClick={() => setShowEnvironment((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                showEnvironment
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400'
              }`}
              title="Mostrar / Ocultar Mapa de Fondo HDRI 360°"
            >
              <Globe size={12} className={showEnvironment ? 'text-white' : 'text-indigo-400'} />
              <span>HDRI {showEnvironment ? 'ON' : 'OFF'}</span>
            </button>
            
            {/* Grid Toggle */}
            <button
              onClick={() => setShowGrid((v) => !v)}
              className={`p-1.5 rounded-xl text-[10px] font-bold transition-all ${
                showGrid ? 'bg-zinc-700 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Alternar cuadrícula de calibración"
            >
              <Layers size={13} />
            </button>

            {/* Wireframe Toggle */}
            <button
              onClick={() => setShowWireframe((v) => !v)}
              className={`p-1.5 rounded-xl text-[10px] font-bold transition-all ${
                showWireframe ? 'bg-zinc-700 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Modo Malla de Alambre (Wireframe)"
            >
              <Box size={13} />
            </button>

            <div className="h-4 w-px bg-white/10" />

            {/* Zoom In */}
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Acercar Cámara"
            >
              <ZoomIn size={13} />
            </button>

            {/* Zoom Out */}
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Alejar Cámara"
            >
              <ZoomOut size={13} />
            </button>

            {/* Reset Camera */}
            <button
              onClick={handleResetCamera}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Centrar y Resetear Cámara"
            >
              <Maximize2 size={13} />
            </button>
          </div>

          {/* Quick Helper Legend */}
          <div className="absolute bottom-3 right-4 text-[9px] text-zinc-500 flex items-center gap-3 pointer-events-none hidden md:flex">
            <span>🖱️ Click Izq: Orbitar</span>
            <span>🖱️ Click Der: Desplazar</span>
            <span>⚙️ Rueda: Zoom</span>
          </div>
        </div>

        {/* ── RIGHT DOCKED SIDEBAR: FULL MATERIAL INSPECTOR & LIBRARY ── */}
        <aside className="w-80 sm:w-[350px] lg:w-[380px] xl:w-[400px] flex flex-col bg-[#141417] border-l border-white/10 overflow-hidden flex-shrink-0 z-30 shadow-2xl">
          <MaterialPanel />
        </aside>
      </div>
    </div>
  );
};
