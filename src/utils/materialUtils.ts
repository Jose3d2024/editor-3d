import * as THREE from 'three';
import type { MaterialData } from '../types';

/**
 * Combines AO, Roughness, and Metalness maps into a single ORM texture.
 * R: Ambient Occlusion
 * G: Roughness
 * B: Metalness
 */
export async function createORMMap(
  imgAO: string | null,
  imgRough: string | null,
  imgMetal: string | null,
  width = 512,
  height = 512
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Default: AO=1 (white), Roughness=1 (white), Metalness=0 (black)
  ctx.fillStyle = 'rgb(255, 255, 0)'; // R=255, G=255, B=0
  ctx.fillRect(0, 0, width, height);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const drawChannel = async (src: string | null, channelIndex: number) => {
    if (!src) return;
    try {
      const img = await loadImage(src);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      tempCtx.drawImage(img, 0, 0, width, height);
      const imageData = tempCtx.getImageData(0, 0, width, height);
      const targetData = ctx.getImageData(0, 0, width, height);

      for (let i = 0; i < imageData.data.length; i += 4) {
        // Use the red channel of the source as the data for the target channel
        targetData.data[i + channelIndex] = imageData.data[i];
      }
      ctx.putImageData(targetData, 0, 0);
    } catch (e) {
      console.error('Error loading image for ORM channel:', e);
    }
  };

  await drawChannel(imgAO, 0);    // Red
  await drawChannel(imgRough, 1); // Green
  await drawChannel(imgMetal, 2); // Blue

  return canvas.toDataURL('image/png');
}

/**
 * Injects custom ORM intensity controls into a MeshStandardMaterial's shader.
 */
export function injectORMControls(material: THREE.MeshStandardMaterial, data: MaterialData) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAoIntensity = { value: data.ormIntensityAO ?? 1.0 };
    shader.uniforms.uRoughnessIntensity = { value: data.ormIntensityRoughness ?? 1.0 };
    shader.uniforms.uMetalnessIntensity = { value: data.ormIntensityMetalness ?? 1.0 };

    shader.fragmentShader = `
      uniform float uAoIntensity;
      uniform float uRoughnessIntensity;
      uniform float uMetalnessIntensity;
      ${shader.fragmentShader}
    `.replace(
      '#include <roughnessmap_fragment>',
      `
      float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
        // Use GREEN channel for roughness and multiply by intensity
        roughnessFactor *= texelRoughness.g * uRoughnessIntensity;
      #endif
      `
    ).replace(
      '#include <metalnessmap_fragment>',
      `
      float metalnessFactor = metalness;
      #ifdef USE_METALNESSMAP
        vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
        // Use BLUE channel for metalness and multiply by intensity
        metalnessFactor *= texelMetalness.b * uMetalnessIntensity;
      #endif
      `
    ).replace(
      '#include <aomap_fragment>',
      `
      #ifdef USE_AOMAP
        // Use RED channel for AO and multiply by intensity
        float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * uAoIntensity + 1.0;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      #endif
      `
    );

    material.userData.shader = shader;
  };
}

/**
 * Updates the uniforms of a material that has had ORM controls injected.
 */
export function updateORMUniforms(material: THREE.Material, data: MaterialData) {
  const shader = material.userData.shader;
  if (shader && shader.uniforms) {
    if (shader.uniforms.uAoIntensity) shader.uniforms.uAoIntensity.value = data.ormIntensityAO ?? 1.0;
    if (shader.uniforms.uRoughnessIntensity) shader.uniforms.uRoughnessIntensity.value = data.ormIntensityRoughness ?? 1.0;
    if (shader.uniforms.uMetalnessIntensity) shader.uniforms.uMetalnessIntensity.value = data.ormIntensityMetalness ?? 1.0;
  }
}

/**
 * Creates a Three.js material from MaterialData.
 */
export function createPBRMaterial(data: MaterialData): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const isPhysical = 
    (data.transmission ?? 0) > 0 || 
    (data.clearcoat ?? 0) > 0 || 
    (data.sheen ?? 0) > 0 || 
    (data.iridescence ?? 0) > 0 ||
    (data.specularIntensity !== undefined && data.specularIntensity !== 1) ||
    (data.ior !== undefined && data.ior !== 1.5) ||
    (data.thickness !== undefined && data.thickness > 0);

  const material = isPhysical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
  
  material.name = data.name || 'Material';
  material.color.set(data.color || '#ffffff');
  material.roughness = data.roughness ?? 0.5;
  material.metalness = data.metalness ?? 0;
  material.emissive.set(data.emissive || '#000000');
  material.emissiveIntensity = data.emissiveIntensity ?? 1;
  material.opacity = data.opacity ?? 1;
  material.transparent = data.transparent ?? (material.opacity < 1 || (data.transmission ?? 0) > 0);
  material.side = THREE.DoubleSide;

  if (isPhysical) {
    const m = material as THREE.MeshPhysicalMaterial;
    m.ior = data.ior ?? 1.5;
    m.transmission = data.transmission ?? 0;
    m.thickness = data.thickness ?? 0;
    m.attenuationDistance = data.attenuationDistance ?? Infinity;
    if (data.attenuationColor) m.attenuationColor.set(data.attenuationColor);
    m.clearcoat = data.clearcoat ?? 0;
    m.clearcoatRoughness = data.clearcoatRoughness ?? 0;
    m.sheen = data.sheen ?? 0;
    m.sheenRoughness = data.sheenRoughness ?? 0;
    if (data.sheenColor) m.sheenColor.set(data.sheenColor);
    m.iridescence = data.iridescence ?? 0;
    m.iridescenceIOR = data.iridescenceIOR ?? 1.3;
    if (data.iridescenceThicknessRange) m.iridescenceThicknessRange = data.iridescenceThicknessRange;
    m.specularIntensity = data.specularIntensity ?? 1;
    if (data.specularColor) m.specularColor.set(data.specularColor);
  }

  const loader = new THREE.TextureLoader();
  const loadTexture = (url: string | undefined, colorSpace: THREE.ColorSpace = THREE.NoColorSpace) => {
    if (!url) return null;
    const tex = loader.load(url, (loadedTex) => {
      loadedTex.flipY = data.flipY ?? true;
      loadedTex.needsUpdate = true;
    });
    tex.colorSpace = colorSpace;
    tex.anisotropy = 16;
    tex.flipY = data.flipY ?? true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (data.mapRepeat) tex.repeat.set(data.mapRepeat[0], data.mapRepeat[1]);
    if (data.mapOffset) tex.offset.set(data.mapOffset[0], data.mapOffset[1]);
    if (data.mapRotation) tex.rotation = (data.mapRotation * Math.PI) / 180;
    return tex;
  };

  material.map = loadTexture(data.map, THREE.SRGBColorSpace);
  material.normalMap = loadTexture(data.normalMap);
  if (data.normalScale) material.normalScale.set(data.normalScale, data.normalScale);
  
  if (data.useORM && data.ormMap) {
    const orm = loadTexture(data.ormMap);
    material.aoMap = orm;
    material.roughnessMap = orm;
    material.metalnessMap = orm;
    material.aoMapIntensity = data.aoMapIntensity ?? 1.0;
    injectORMControls(material, data);
  } else {
    material.roughnessMap = loadTexture(data.roughnessMap);
    material.metalnessMap = loadTexture(data.metalnessMap);
    material.aoMap = loadTexture(data.aoMap);
    material.aoMapIntensity = data.aoMapIntensity ?? 1.0;
  }

  material.emissiveMap = loadTexture(data.emissiveMap, THREE.SRGBColorSpace);
  material.alphaMap = loadTexture(data.alphaMap);
  material.displacementMap = loadTexture(data.displacementMap);
  material.displacementScale = data.displacementScale ?? 0;
  material.displacementBias = data.displacementBias ?? 0;

  if (isPhysical) {
    const m = material as THREE.MeshPhysicalMaterial;
    m.clearcoatNormalMap = loadTexture(data.clearcoatNormalMap);
    if (data.clearcoatNormalScale) m.clearcoatNormalScale.set(data.clearcoatNormalScale, data.clearcoatNormalScale);
  }

  return material;
}
