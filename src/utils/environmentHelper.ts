import * as THREE from 'three';
import { EnvironmentSettings, BackgroundMode } from '../types';
import { loadOptimizedEnvironmentTexture } from './hdrLoader';

export interface EnvTextures {
  envTexture: THREE.Texture | null;
  bgTexture: THREE.Texture | null;
  pmremTexture: THREE.Texture | null;
}

export const PRESET_HDRIS = [
  { id: 'studio_softbox', name: 'Estudio Softbox', url: null, icon: '📸', desc: 'Iluminación de estudio con softboxes neutras' },
  { id: 'sunset',         name: 'Atardecer',      url: 'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr', icon: '🌅', desc: 'Luz dorada cálida de atardecer' },
  { id: 'urban',          name: 'Urbano',         url: 'https://threejs.org/examples/textures/equirectangular/pedestrian_overpass_1k.hdr', icon: '🏙️', desc: 'Reflejos de ciudad y luz natural' },
  { id: 'bridge',         name: 'Interior',       url: 'https://threejs.org/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr', icon: '🏛️', desc: 'Luz difusa de galería/interior' },
  { id: 'night',          name: 'Noche',          url: 'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr', icon: '🌙', desc: 'Contrastes fríos de noche' },
  { id: 'quarry',         name: 'Estudio Neutro', url: 'https://threejs.org/examples/textures/equirectangular/quarry_01_1k.hdr', icon: '💡', desc: 'Luz ambiental suave de alto rango' },
];

/**
 * Creates a synthetic HDRI equirectangular canvas texture with realistic studio softboxes.
 */
export function createStudioEquirectangularCanvas(preset: 'softbox' | 'warm' | 'cool' = 'softbox'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Base background studio gradient
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
  if (preset === 'warm') {
    baseGrad.addColorStop(0, '#2b2422');
    baseGrad.addColorStop(0.5, '#3d322d');
    baseGrad.addColorStop(1, '#191513');
  } else if (preset === 'cool') {
    baseGrad.addColorStop(0, '#19212e');
    baseGrad.addColorStop(0.5, '#283446');
    baseGrad.addColorStop(1, '#0f141e');
  } else {
    baseGrad.addColorStop(0, '#22252c');
    baseGrad.addColorStop(0.5, '#353945');
    baseGrad.addColorStop(1, '#14161a');
  }
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Key Light Softbox (Top-Left)
  const keyGrad = ctx.createRadialGradient(280, 160, 10, 280, 160, 200);
  keyGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  keyGrad.addColorStop(0.35, 'rgba(255, 253, 248, 0.85)');
  keyGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = keyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Fill Light Softbox (Top-Right)
  const fillGrad = ctx.createRadialGradient(780, 180, 10, 780, 180, 230);
  fillGrad.addColorStop(0, 'rgba(255, 242, 225, 0.75)');
  fillGrad.addColorStop(0.5, 'rgba(235, 220, 205, 0.35)');
  fillGrad.addColorStop(1, 'rgba(255, 242, 225, 0)');
  ctx.fillStyle = fillGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Overhead Rim Light Strip
  const rimGrad = ctx.createLinearGradient(0, 20, 0, 110);
  rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
  rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, 1024, 140);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a clean studio photographic radial gradient backdrop texture for scene.background.
 */
export function createStudioGradientBackground(baseColor = '#181921'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Radial highlight in center, smooth dark vignette towards edges
  const rad = ctx.createRadialGradient(256, 220, 20, 256, 256, 360);
  
  // Parse base color tint
  rad.addColorStop(0, '#353a4a');
  rad.addColorStop(0.45, '#1e2029');
  rad.addColorStop(1, '#0c0d12');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Uniformly applies environment lighting, HDRI reflections, background mode, blur, rotation and exposure to a Three.js scene.
 */
export async function setupSceneEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  env: EnvironmentSettings
): Promise<EnvTextures> {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  let envTexture: THREE.Texture | null = null;
  let isCustomHDRI = false;

  if (env.hdriUrl) {
    try {
      envTexture = await loadOptimizedEnvironmentTexture(env.hdriUrl, { maxDimension: env.maxResolution || 2048 });
      isCustomHDRI = true;
    } catch (e) {
      console.warn('Failed loading HDRI, using synthetic studio HDRI canvas:', e);
    }
  }

  let bgMode: BackgroundMode = env.backgroundMode ?? (env.backgroundVisible ? 'HDRI' : 'GRADIENT');
  if (env.backgroundVisible === false && bgMode === 'HDRI') {
    bgMode = 'GRADIENT';
  }

  // Create synthetic studio HDRI canvas only if background mode is HDRI
  if (!envTexture && bgMode === 'HDRI') {
    envTexture = createStudioEquirectangularCanvas('softbox');
  }

  let pmremTexture: THREE.Texture | null = null;
  const currentIntensity = env.intensity ?? 1.2;

  // Crucial: Only apply HDRI image-based lighting (scene.environment) if background mode is explicitly 'HDRI'.
  // For 'GRADIENT', 'COLOR', or 'TRANSPARENT', environment lighting is 0 so deleting all lights produces total darkness.
  if (bgMode === 'HDRI' && envTexture && currentIntensity > 0) {
    pmremTexture = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = pmremTexture;
    scene.environmentIntensity = currentIntensity;
  } else {
    scene.environment = null;
    scene.environmentIntensity = 0;
  }

  renderer.toneMappingExposure = env.exposure ?? 1.1;

  // Rotations
  const rotRad = ((env.rotation ?? 0) * Math.PI) / 180;
  scene.environmentRotation.set(0, rotRad, 0);
  scene.backgroundRotation.set(0, rotRad, 0);

  let bgTexture: THREE.Texture | null = null;

  if (bgMode === 'HDRI') {
    if (envTexture) {
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      envTexture.generateMipmaps = true;
      envTexture.needsUpdate = true;
      scene.background = envTexture;
    } else if (pmremTexture) {
      scene.background = pmremTexture;
    }
    scene.backgroundBlurriness = env.backgroundBlur ?? 0;
    scene.backgroundIntensity = env.backgroundIntensity ?? 1.0;
  } else if (bgMode === 'GRADIENT') {
    bgTexture = createStudioGradientBackground(env.backgroundColor || '#181921');
    scene.background = bgTexture;
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = env.backgroundIntensity ?? 1.0;
  } else if (bgMode === 'COLOR') {
    scene.background = new THREE.Color(env.backgroundColor || '#16171d');
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = env.backgroundIntensity ?? 1.0;
  } else if (bgMode === 'TRANSPARENT') {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
  }

  pmremGenerator.dispose();

  return {
    envTexture: isCustomHDRI ? envTexture : null,
    bgTexture,
    pmremTexture,
  };
}
