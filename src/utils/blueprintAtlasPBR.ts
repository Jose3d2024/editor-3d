import * as THREE from 'three';
import { V3, MeshFace } from '../types';
import { GeneratedPBRSet, generateFullPBRMapsFromSource } from './textureColorUtils';
import { BlueprintImageConfig, BlueprintViewKey, loadCanvasImageData } from './blueprintCarver';

export interface ViewPBRData {
  alignedImageUrl: string;
  pbrSet: GeneratedPBRSet;
}

export interface MultiViewAtlasResult {
  materialId: string;
  materialName: string;
  albedoAtlasUrl: string;
  normalAtlasUrl: string;
  displacementAtlasUrl: string;
  roughnessAtlasUrl: string;
  aoAtlasUrl: string;
  metalnessAtlasUrl: string;
  activeViews: BlueprintViewKey[];
}

/**
 * Cuadrantes normalizados del Atlas [uMin, vMin, uMax, vMax] (Espacio UV [0,1])
 * - Frontal: Superior Izquierda [0, 0.5, 0.5, 1.0]
 * - Lateral: Superior Derecha   [0.5, 0.5, 1.0, 1.0]
 * - Superior: Inferior Izquierda [0, 0, 0.5, 0.5]
 * - Detalle / Trasera: Inferior Derecha [0.5, 0, 1.0, 0.5]
 */
export const ATLAS_QUADRANTS: Record<BlueprintViewKey, { uMin: number; vMin: number; uMax: number; vMax: number }> = {
  front:  { uMin: 0.0, vMin: 0.5, uMax: 0.5, vMax: 1.0 },
  side:   { uMin: 0.5, vMin: 0.5, uMax: 1.0, vMax: 1.0 },
  top:    { uMin: 0.0, vMin: 0.0, uMax: 0.5, vMax: 0.5 },
  back:   { uMin: 0.5, vMin: 0.0, uMax: 1.0, vMax: 0.5 },
  bottom: { uMin: 0.5, vMin: 0.0, uMax: 1.0, vMax: 0.5 },
};

/**
 * Carga una imagen de forma asíncrona a un objeto HTMLImageElement
 */
function loadImageAsync(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Compone un Atlas 2D combinando las imágenes de las diferentes vistas en sus respectivos cuadrantes
 */
async function compositeAtlasChannel(
  images: { viewKey: BlueprintViewKey; url: string }[],
  atlasSize = 2048,
  defaultFillColor = '#ffffff'
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Rellenar con color base por defecto
  ctx.fillStyle = defaultFillColor;
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // 2. Dibujar cada imagen en su cuadrante
  for (const item of images) {
    if (!item.url) continue;
    const img = await loadImageAsync(item.url);
    if (!img) continue;

    const quad = ATLAS_QUADRANTS[item.viewKey] || ATLAS_QUADRANTS.side;
    const dx = quad.uMin * atlasSize;
    // En Canvas 2D Y crece hacia abajo, mientras que en UV V=0 es abajo y V=1 es arriba
    const dy = (1.0 - quad.vMax) * atlasSize;
    const dw = (quad.uMax - quad.uMin) * atlasSize;
    const dh = (quad.vMax - quad.vMin) * atlasSize;

    ctx.drawImage(img, dx, dy, dw, dh);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Genera el conjunto completo de texturas Atlas PBR unificando todas las vistas ortográficas disponibles
 */
export async function buildUnifiedMultiViewPBRAtlas(
  viewDataMap: Partial<Record<BlueprintViewKey, ViewPBRData>>,
  atlasResolution = 2048
): Promise<MultiViewAtlasResult | null> {
  const activeKeys = (['front', 'side', 'top'] as BlueprintViewKey[]).filter(k => !!viewDataMap[k]);
  if (activeKeys.length === 0) return null;

  // 1. Recolectar URLs de cada canal
  const albedoList: { viewKey: BlueprintViewKey; url: string }[] = [];
  const normalList: { viewKey: BlueprintViewKey; url: string }[] = [];
  const bumpList: { viewKey: BlueprintViewKey; url: string }[] = [];
  const roughList: { viewKey: BlueprintViewKey; url: string }[] = [];
  const aoList: { viewKey: BlueprintViewKey; url: string }[] = [];
  const metalList: { viewKey: BlueprintViewKey; url: string }[] = [];

  for (const k of activeKeys) {
    const data = viewDataMap[k];
    if (!data) continue;
    if (data.alignedImageUrl) albedoList.push({ viewKey: k, url: data.alignedImageUrl });
    if (data.pbrSet.normalMap) normalList.push({ viewKey: k, url: data.pbrSet.normalMap });
    if (data.pbrSet.displacementMap) bumpList.push({ viewKey: k, url: data.pbrSet.displacementMap });
    if (data.pbrSet.roughnessMap) roughList.push({ viewKey: k, url: data.pbrSet.roughnessMap });
    if (data.pbrSet.aoMap) aoList.push({ viewKey: k, url: data.pbrSet.aoMap });
    if (data.pbrSet.metalnessMap) metalList.push({ viewKey: k, url: data.pbrSet.metalnessMap });
  }

  // 2. Componer cada mapa Atlas en paralelo
  const [
    albedoAtlasUrl,
    normalAtlasUrl,
    displacementAtlasUrl,
    roughnessAtlasUrl,
    aoAtlasUrl,
    metalnessAtlasUrl
  ] = await Promise.all([
    compositeAtlasChannel(albedoList, atlasResolution, '#e2e8f0'),
    compositeAtlasChannel(normalList, atlasResolution, '#8080ff'), // Normal neutra tangente
    compositeAtlasChannel(bumpList, atlasResolution, '#808080'),   // Bump neutral 50% gris
    compositeAtlasChannel(roughList, atlasResolution, '#707070'),  // Rugosidad media
    compositeAtlasChannel(aoList, atlasResolution, '#ffffff'),     // AO blanco sin sombras
    compositeAtlasChannel(metalList, atlasResolution, '#000000'),  // No metálico por defecto
  ]);

  const materialId = 'mat_atlas_pbr_' + Math.random().toString(36).substring(2, 9);
  const viewNames = activeKeys.map(k => k === 'front' ? 'Frontal' : k === 'top' ? 'Superior' : 'Lateral').join('+');

  return {
    materialId,
    materialName: `Material PBR - Atlas Multi-Vista (${viewNames})`,
    albedoAtlasUrl,
    normalAtlasUrl,
    displacementAtlasUrl,
    roughnessAtlasUrl,
    aoAtlasUrl,
    metalnessAtlasUrl,
    activeViews: activeKeys,
  };
}

/**
 * Genera coordenadas UV mapeando cada cara de la malla 3D al cuadrante correspondiente en el Atlas Multi-Vista.
 * 
 * Regla de Asignación de Cuadrantes según la normal de cada cara:
 * - Caras Laterales (|Nx| dominante): proyectadas en plano Z-Y y mapeadas al cuadrante `side`
 * - Caras Superiores/Inferiores (|Ny| dominante): proyectadas en plano X-Z y mapeadas al cuadrante `top`
 * - Caras Frontales/Posteriores (|Nz| dominante): proyectadas en plano X-Y y mapeadas al cuadrante `front`
 */
export function generateMultiViewAtlasUVs(
  obj: { vertices: V3[]; faces: MeshFace[] },
  activeViews: BlueprintViewKey[] = ['side', 'top', 'front'],
  _customDimensions?: V3,
  viewsConfig?: Partial<Record<BlueprintViewKey, BlueprintImageConfig>>,
  boundsMap?: Partial<Record<BlueprintViewKey, { minU: number; minV: number; maxU: number; maxV: number }>>
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = obj.vertices;
  if (!vertices || vertices.length === 0 || !obj.faces || obj.faces.length === 0) return obj;

  // 1. Bounding box global
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  vertices.forEach(v => {
    if (!v) return;
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });

  const size = [
    Math.max(1e-4, max[0] - min[0]),
    Math.max(1e-4, max[1] - min[1]),
    Math.max(1e-4, max[2] - min[2]),
  ];

  // Determinar vistas activas para fallback
  const hasSide = activeViews.includes('side');
  const hasTop = activeViews.includes('top');
  const hasFront = activeViews.includes('front');

  const faces = obj.faces.map(face => {
    if (!face || !face.indices || face.indices.length < 3) return face;

    // Calcular vector normal de la cara
    const i0 = face.indices[0];
    const i1 = face.indices[1];
    const i2 = face.indices[2];
    const v0Arr = vertices[i0];
    const v1Arr = vertices[i1];
    const v2Arr = vertices[i2];

    let normalX = 0, normalY = 0, normalZ = 0;
    if (v0Arr && v1Arr && v2Arr) {
      const v0 = new THREE.Vector3(...v0Arr);
      const v1 = new THREE.Vector3(...v1Arr);
      const v2 = new THREE.Vector3(...v2Arr);
      const norm = new THREE.Vector3().crossVectors(
        v1.clone().sub(v0),
        v2.clone().sub(v0)
      ).normalize();

      if (norm.lengthSq() > 1e-6) {
        normalX = norm.x;
        normalY = norm.y;
        normalZ = norm.z;
      }
    }

    const absX = Math.abs(normalX);
    const absY = Math.abs(normalY);
    const absZ = Math.abs(normalZ);

    // Seleccionar cuadrante según la normal dominante y disponibilidad
    let dominantView: BlueprintViewKey = 'side';
    if (absY >= absX && absY >= absZ && hasTop) {
      dominantView = 'top';
    } else if (absZ >= absX && absZ >= absY && hasFront) {
      dominantView = 'front';
    } else if (hasSide) {
      dominantView = 'side';
    } else if (hasTop) {
      dominantView = 'top';
    } else if (hasFront) {
      dominantView = 'front';
    }

    const quad = ATLAS_QUADRANTS[dominantView] || ATLAS_QUADRANTS.side;
    const quadWidth = quad.uMax - quad.uMin;
    const quadHeight = quad.vMax - quad.vMin;

    const cfg = viewsConfig?.[dominantView];
    const bounds = boundsMap?.[dominantView] || { minU: 0, minV: 0, maxU: 1, maxV: 1 };
    const bSpanU = Math.max(1e-4, bounds.maxU - bounds.minU);
    const bSpanV = Math.max(1e-4, bounds.maxV - bounds.minV);

    const scaleX = Math.max(0.01, cfg?.texScaleX ?? 1.0);
    const scaleY = Math.max(0.01, cfg?.texScaleY ?? 1.0);
    const offsetX = cfg?.texOffsetX ?? 0.0;
    const offsetY = cfg?.texOffsetY ?? 0.0;
    const flipH = cfg?.texFlipH ?? false;
    const flipV = cfg?.texFlipV ?? false;
    const mirrorOpposite = cfg?.texMirrorOpposite ?? false;

    // Dimensión máxima para mapeado isométrico uniforme sin deformación de aspect ratio
    const maxDim = Math.max(size[0], size[1], size[2]);

    const uvs: [number, number][] = face.indices.map(vIdx => {
      const v = vertices[vIdx] || [0, 0, 0];
      const [x, y, z] = v;
      let rawU = 0.5;
      let rawV = 0.5;

      if (dominantView === 'side') {
        // Vista Lateral (plano Z-Y)
        if (mirrorOpposite) {
          rawU = normalX >= 0 ? (max[2] - z) / maxDim : (z - min[2]) / maxDim;
        } else {
          rawU = (max[2] - z) / maxDim;
        }
        rawV = (y - min[1]) / maxDim;

        // Centrado si no es cúbico
        rawU += (1.0 - (size[2] / maxDim)) * 0.5;
        rawV += (1.0 - (size[1] / maxDim)) * 0.5;
      } else if (dominantView === 'top') {
        // Vista Superior (plano X-Z) - proyección continua sin saltos de signo
        rawU = (x - min[0]) / maxDim;
        rawV = (max[2] - z) / maxDim;

        rawU += (1.0 - (size[0] / maxDim)) * 0.5;
        rawV += (1.0 - (size[2] / maxDim)) * 0.5;
      } else {
        // Vista Frontal (plano X-Y)
        if (mirrorOpposite) {
          rawU = normalZ >= 0 ? (x - min[0]) / maxDim : (max[0] - x) / maxDim;
        } else {
          rawU = (x - min[0]) / maxDim;
        }
        rawV = (y - min[1]) / maxDim;

        rawU += (1.0 - (size[0] / maxDim)) * 0.5;
        rawV += (1.0 - (size[1] / maxDim)) * 0.5;
      }

      // Aplicar escala y offset
      let uNorm = (rawU - 0.5) / scaleX + 0.5 - offsetX;
      let vNorm = (rawV - 0.5) / scaleY + 0.5 - offsetY;

      if (flipH) uNorm = 1.0 - uNorm;
      if (flipV) vNorm = 1.0 - vNorm;

      // Mapear con bounding box
      let subU = bounds.minU + uNorm * bSpanU;
      let subV = bounds.minV + vNorm * bSpanV;

      subU = Math.max(0.001, Math.min(0.999, subU));
      subV = Math.max(0.001, Math.min(0.999, subV));

      // Mapear al espacio global del Atlas [0, 1] en espacio de texturas WebGL
      const atlasU = quad.uMin + subU * quadWidth;
      const atlasV = quad.vMin + subV * quadHeight;

      return [atlasU, atlasV] as [number, number];
    });

    return { ...face, uvs };
  });

  return { vertices, faces };
}

/**
 * Prepara los datos PBR de una vista ortográfica extrayendo el lienzo alineado y sintetizando sus mapas
 */
export async function prepareViewPBRData(
  url: string,
  cfg: BlueprintImageConfig,
  normalStrength = 1.2
): Promise<ViewPBRData | null> {
  if (!url) return null;
  const imgData = await loadCanvasImageData(url, cfg);
  let alignedUrl = url;
  if (imgData) {
    const c = document.createElement('canvas');
    c.width = imgData.width;
    c.height = imgData.height;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.putImageData(imgData, 0, 0);
      alignedUrl = c.toDataURL('image/png');
    }
  }

  const pbrSet = await generateFullPBRMapsFromSource(alignedUrl, normalStrength, !!cfg.invertNormalY);
  return {
    alignedImageUrl: alignedUrl,
    pbrSet,
  };
}
