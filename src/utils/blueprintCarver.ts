/**
 * blueprintCarver.ts — Motor de Modelado Basado en Bocetos y Tallado Volumétrico 3D (Visual Hull)
 * a partir de vistas ortográficas (Frontal, Superior, Lateral).
 * Incluye filtros de imagen (brillo, contraste, b/n, nitidez), transformaciones (espejo H/V, rotación),
 * eliminación de píxeles aislados (Denoise / Island filter) y detección de zonas súper finas.
 */

import * as THREE from 'three';
import { V3, MeshFace } from '../types';
import { marchingCubes } from './marchingCubes';
import { CSG } from 'three-csg-ts';

export type BlueprintViewKey = 'front' | 'top' | 'side' | 'back' | 'bottom';

export type CarverEngineMode = 'VISUAL_HULL' | 'HARD_SURFACE_CSG' | 'SMOOTH_SCULPT';

export type BlueprintDetectionMode = 'LINE_ART' | 'SOLID_COLOR' | 'TRANSPARENT_ALPHA';

export interface BlueprintImageConfig {
  url: string | null;
  enabled: boolean;
  
  // Transformaciones de orientación, escala y proporción
  flipH?: boolean;            // Espejo Horizontal
  flipV?: boolean;            // Espejo Vertical
  rotation?: number;          // 0, 90, 180, 270 grados
  scaleX?: number;            // Escala Horizontal (0.1 a 3.0, default 1.0)
  scaleY?: number;            // Escala Vertical (0.1 a 3.0, default 1.0)
  scaleUniform?: number;      // Escala Global / Zoom (0.1 a 3.0, default 1.0)
  lockAspectRatio?: boolean;  // Bloquear proporción X/Y (default true)
  preserveAspectRatio?: boolean; // Mantener proporciones reales de la imagen sin distorsión (default true)
  offsetX?: number;           // Desplazamiento Horizontal en % (-1.0 a +1.0, default 0)
  offsetY?: number;           // Desplazamiento Vertical en % (-1.0 a +1.0, default 0)
  naturalWidth?: number;      // Ancho original de la imagen
  naturalHeight?: number;     // Alto original de la imagen
  aspectRatio?: number;       // Proporción Ancho / Alto
  
  // Filtros de ajuste de imagen
  contrast?: number;          // -100 a +100 (0 = normal)
  brightness?: number;        // -100 a +100 (0 = normal)
  grayscale?: boolean;        // Forzar Blanco y Negro / Escala de grises
  sharpen?: number;           // 0 a 5 (Realce de nitidez de líneas finas)
  
  // Detección y limpieza
  threshold: number;          // 1..254 (umbral de detección / sensibilidad)
  detectionMode?: BlueprintDetectionMode; // 'LINE_ART' (bocetos/wireframes), 'SOLID_COLOR', 'TRANSPARENT_ALPHA'
  fillInterior?: boolean;     // Rellenar interior automáticamente para dibujos de líneas
  customBgColor?: [number, number, number] | null; // Color de fondo muestreado
  invert: boolean;            // Invertir máscara
  dilation: number;           // -10 a +10 px (inflar/desinflar silueta)
  blurRadius: number;         // 0 a 5 px de suavizado de bordes
  
  // Filtro de ruido & zonas finas
  denoiseIslandSize?: number; // 0 a 150 px: elimina pequeñas motas o manchas de escaneo que no son parte del objeto
  thinFeatureBoost?: number;  // 0 a 100%: aumenta la sensibilidad de bordes para detectar antenas, cables y cañones

  // Puntos de Control Manuales (Ajuste fino de silueta vectorial)
  manualControlPoints?: [number, number][][] | null; // Bucles poligonales editados manualmente en espacio [-1, 1]
}

export interface BlueprintCarverOptions {
  mode: CarverEngineMode;
  resolution: number;        // 32, 48, 64, 80
  dimensions: V3;            // [Ancho X, Alto Y, Profundidad Z] en unidades de escena
  smoothIterations: number;  // 0 a 5 pasadas de relajación
  smoothFactor: number;      // 0.1 a 0.9
  views: {
    front?: BlueprintImageConfig;
    top?: BlueprintImageConfig;
    side?: BlueprintImageConfig;
    back?: BlueprintImageConfig;
    bottom?: BlueprintImageConfig;
  };
}

export interface ProcessedSilhouette {
  width: number;
  height: number;
  mask: Uint8Array;              // 1 = dentro del objeto, 0 = fondo
  sdf: Float32Array;             // distancia signada en espacio [-1, 1] (< 0 = interior)
  contours: [number, number][][]; // Múltiples bucles poligonales exactos en espacio [-1, 1]
  aspect: number;
  cleanedPixelsCount: number;
}

/**
 * Carga una imagen, preserva sus dimensiones y proporciones reales (sin distorsión cuadrada),
 * y aplica transformaciones geométricas (escala X/Y, desplazamiento X/Y, espejo, rotación)
 * junto con los filtros fotográficos (brillo, contraste, b/n, nitidez).
 */
export async function loadCanvasImageData(
  imageUrl: string,
  config: Partial<BlueprintImageConfig> = {}
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      const nativeAspect = origW / Math.max(1, origH);

      const rot = ((config.rotation || 0) % 360 + 360) % 360;
      const is90or270 = rot === 90 || rot === 270;
      const effAspect = is90or270 ? (1 / nativeAspect) : nativeAspect;

      const CANVAS_SIZE = 512;
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }

      // Proporción y escala:
      // Por defecto preserveAspectRatio es TRUE (guarda las dimensiones verdaderas sin estirar)
      const preserveRatio = config.preserveAspectRatio !== false;
      const sX = (config.scaleX ?? 1.0) * (config.scaleUniform ?? 1.0);
      const sY = (config.scaleY ?? 1.0) * (config.scaleUniform ?? 1.0);
      const offX = (config.offsetX ?? 0) * (CANVAS_SIZE * 0.5);
      const offY = -(config.offsetY ?? 0) * (CANVAS_SIZE * 0.5);

      let baseDrawW = CANVAS_SIZE;
      let baseDrawH = CANVAS_SIZE;

      if (preserveRatio) {
        if (effAspect <= 1.0) {
          // Imagen vertical / esbelta (ej. AT-AT front): ocupa todo el alto y el ancho proporcional
          baseDrawW = CANVAS_SIZE * effAspect;
          baseDrawH = CANVAS_SIZE;
        } else {
          // Imagen horizontal / ancha: ocupa todo el ancho y el alto proporcional
          baseDrawW = CANVAS_SIZE;
          baseDrawH = CANVAS_SIZE / effAspect;
        }
      }

      const drawW = Math.max(8, baseDrawW * sX);
      const drawH = Math.max(8, baseDrawH * sY);

      // Color de fondo del lienzo
      if (config.customBgColor) {
        const [r, g, b] = config.customBgColor;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      } else {
        // Fondo transparente por defecto
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }

      ctx.save();
      // Trasladar al centro del lienzo + desplazamientos X e Y del usuario
      ctx.translate(CANVAS_SIZE / 2 + offX, CANVAS_SIZE / 2 + offY);

      // Rotación
      if (rot !== 0) {
        ctx.rotate((rot * Math.PI) / 180);
      }

      // Espejo
      const flipScaleX = config.flipH ? -1 : 1;
      const flipScaleY = config.flipV ? -1 : 1;
      ctx.scale(flipScaleX, flipScaleY);

      // Dimensiones de dibujado considerando si la imagen rota internamente
      const imgDrawW = is90or270 ? drawH : drawW;
      const imgDrawH = is90or270 ? drawW : drawH;

      ctx.drawImage(img, -imgDrawW / 2, -imgDrawH / 2, imgDrawW, imgDrawH);
      ctx.restore();

      const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Aplicar filtros de brillo, contraste, escala de grises y nitidez si están activos
      applyImageAdjustments(imgData, config);

      resolve(imgData);
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Aplica ajustes de Brillo, Contraste, Escala de Grises y Nitidez a los píxeles de la imagen
 */
export function applyImageAdjustments(
  imgData: ImageData,
  config: Partial<BlueprintImageConfig> = {}
) {
  const {
    contrast = 0,
    brightness = 0,
    grayscale = false,
    sharpen = 0
  } = config;

  if (contrast === 0 && brightness === 0 && !grayscale && (!sharpen || sharpen <= 0)) {
    return;
  }

  const W = imgData.width;
  const H = imgData.height;
  const data = imgData.data;

  // Factor de contraste [-100..100] -> factor multiplicativo
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const bOffset = brightness * 1.5;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Escala de grises
    if (grayscale) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum;
      g = lum;
      b = lum;
    }

    // Brillo
    if (brightness !== 0) {
      r += bOffset;
      g += bOffset;
      b += bOffset;
    }

    // Contraste
    if (contrast !== 0) {
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  // Filtro de Nitidez / Realce de Bordes (Convolution Unsharp Mask)
  if (sharpen && sharpen > 0) {
    applySharpenFilter(imgData, sharpen);
  }
}

/**
 * Filtro de nitidez y convolución para hacer resaltar trazos finos (antenas, cañones)
 */
function applySharpenFilter(imgData: ImageData, strength: number) {
  const W = imgData.width;
  const H = imgData.height;
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;
  const factor = Math.min(3.0, strength * 0.45);

  // Kernel Laplaciano de realce:
  // [  0, -f,  0 ]
  // [ -f, 1+4f, -f ]
  // [  0, -f,  0 ]
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const top = src[((y - 1) * W + x) * 4 + c];
        const bot = src[((y + 1) * W + x) * 4 + c];
        const left = src[(y * W + (x - 1)) * 4 + c];
        const right = src[(y * W + (x + 1)) * 4 + c];

        const val = center * (1 + 4 * factor) - (top + bot + left + right) * factor;
        dst[idx + c] = Math.max(0, Math.min(255, Math.round(val)));
      }
    }
  }
}

/**
 * Auto-detecta el color de fondo y el mejor modo para una imagen dada
 */
export function analyzeImageCharacteristics(imageData: ImageData): {
  isDarkBg: boolean;
  hasAlpha: boolean;
  suggestedMode: BlueprintDetectionMode;
  suggestedThreshold: number;
  bgColor: [number, number, number];
} {
  const W = imageData.width;
  const H = imageData.height;
  const data = imageData.data;

  let totalAlphaLow = 0;
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;

  // Muestrear todo el perímetro exterior (bordes)
  for (let x = 0; x < W; x++) {
    const idxTop = x * 4;
    if (data[idxTop + 3] < 30) totalAlphaLow++;
    else { bgR += data[idxTop]; bgG += data[idxTop + 1]; bgB += data[idxTop + 2]; bgCount++; }

    const idxBot = ((H - 1) * W + x) * 4;
    if (data[idxBot + 3] < 30) totalAlphaLow++;
    else { bgR += data[idxBot]; bgG += data[idxBot + 1]; bgB += data[idxBot + 2]; bgCount++; }
  }

  for (let y = 1; y < H - 1; y++) {
    const idxLeft = (y * W) * 4;
    if (data[idxLeft + 3] < 30) totalAlphaLow++;
    else { bgR += data[idxLeft]; bgG += data[idxLeft + 1]; bgB += data[idxLeft + 2]; bgCount++; }

    const idxRight = (y * W + (W - 1)) * 4;
    if (data[idxRight + 3] < 30) totalAlphaLow++;
    else { bgR += data[idxRight]; bgG += data[idxRight + 1]; bgB += data[idxRight + 2]; bgCount++; }
  }

  const borderPixels = (W * 2 + (H - 2) * 2);
  const hasAlpha = (totalAlphaLow / borderPixels) > 0.3;

  const avgR = bgCount > 0 ? bgR / bgCount : 0;
  const avgG = bgCount > 0 ? bgG / bgCount : 0;
  const avgB = bgCount > 0 ? bgB / bgCount : 0;
  const bgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  const isDarkBg = bgLum < 120;

  let suggestedMode: BlueprintDetectionMode = 'LINE_ART';
  if (hasAlpha) {
    suggestedMode = 'TRANSPARENT_ALPHA';
  } else if (!isDarkBg && bgLum > 220) {
    suggestedMode = 'LINE_ART';
  }

  return {
    isDarkBg,
    hasAlpha,
    suggestedMode,
    suggestedThreshold: isDarkBg ? 40 : 160,
    bgColor: [Math.round(avgR), Math.round(avgG), Math.round(avgB)]
  };
}

/**
 * Procesa la imagen 2D para extraer la máscara binaria, eliminando ruido aislado y captando zonas finas
 */
export function processSilhouette(
  imageData: ImageData,
  config: Partial<BlueprintImageConfig> = {}
): ProcessedSilhouette {
  const W = imageData.width;
  const H = imageData.height;
  const data = imageData.data;

  const {
    threshold = 45,
    detectionMode = 'LINE_ART',
    fillInterior = true,
    customBgColor = null,
    invert = false,
    dilation = 0,
    blurRadius = 1,
    denoiseIslandSize = 12,
    thinFeatureBoost = 40
  } = config;

  // 1. Determinar color de fondo
  let bgR = 0, bgG = 0, bgB = 0;
  if (customBgColor) {
    [bgR, bgG, bgB] = customBgColor;
  } else {
    const analysis = analyzeImageCharacteristics(imageData);
    [bgR, bgG, bgB] = analysis.bgColor;
  }

  // 2. Extraer mapa de características inicial (trazos / masa / gradientes finos)
  const initialFeatureMap = new Uint8Array(W * H);
  const boostFactor = (thinFeatureBoost || 0) / 100;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      let isFeature = false;

      if (a < 30) {
        isFeature = false;
      } else if (detectionMode === 'TRANSPARENT_ALPHA') {
        isFeature = a >= 40;
      } else {
        // Distancia euclidiana en color RGB al fondo
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        const colorDist = Math.hypot(dr, dg, db); // [0 .. 441]

        // Luminancia del pixel vs luminancia del fondo
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
        const lumDiff = Math.abs(lum - bgLum);

        // Umbral efectivo con boost para zonas finas
        const effThreshold = Math.max(4, threshold * (1.0 - boostFactor * 0.35));
        const requiredDist = Math.max(6, effThreshold * 1.25);

        isFeature = colorDist >= requiredDist || lumDiff >= effThreshold;

        // Detección de bordes locales / gradiente Sobel para captar líneas muy finas de 1 píxel
        if (!isFeature && boostFactor > 0.1 && x > 0 && x < W - 1 && y > 0 && y < H - 1) {
          const lLeft = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
          const lRight = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
          const lTop = 0.299 * data[idx - W * 4] + 0.587 * data[idx - W * 4 + 1] + 0.114 * data[idx - W * 4 + 2];
          const lBot = 0.299 * data[idx + W * 4] + 0.587 * data[idx + W * 4 + 1] + 0.114 * data[idx + W * 4 + 2];

          const gradX = Math.abs(lRight - lLeft);
          const gradY = Math.abs(lBot - lTop);
          const localGrad = Math.hypot(gradX, gradY);

          if (localGrad >= Math.max(12, effThreshold * 0.75)) {
            isFeature = true;
          }
        }
      }

      initialFeatureMap[y * W + x] = isFeature ? 1 : 0;
    }
  }

  // 3. Si es modo LINE_ART o se solicitó fillInterior:
  // Aplicamos Flood-Fill (inundación) desde los 4 bordes exteriores para identificar el fondo exterior.
  let solidMask = new Uint8Array(W * H);

  if (fillInterior && detectionMode !== 'TRANSPARENT_ALPHA') {
    // Cierre morfológico suave para sellar pequeñas discontinuidades en las líneas
    const closedLines = applyMorphology(initialFeatureMap, W, H, 2);

    const visitedBg = new Uint8Array(W * H);
    const queueX = new Int32Array(W * H);
    const queueY = new Int32Array(W * H);
    let qHead = 0;
    let qTail = 0;

    const pushQ = (x: number, y: number) => {
      const idx = y * W + x;
      if (visitedBg[idx] === 0 && closedLines[idx] === 0) {
        visitedBg[idx] = 1;
        queueX[qTail] = x;
        queueY[qTail] = y;
        qTail++;
      }
    };

    // Sembrar la cola con todos los píxeles de los 4 bordes de la imagen
    for (let x = 0; x < W; x++) {
      pushQ(x, 0);
      pushQ(x, H - 1);
    }
    for (let y = 1; y < H - 1; y++) {
      pushQ(0, y);
      pushQ(W - 1, y);
    }

    // Ejecutar flood-fill 4-conectado
    while (qHead < qTail) {
      const cx = queueX[qHead];
      const cy = queueY[qHead];
      qHead++;

      if (cx > 0) pushQ(cx - 1, cy);
      if (cx < W - 1) pushQ(cx + 1, cy);
      if (cy > 0) pushQ(cx, cy - 1);
      if (cy < H - 1) pushQ(cx, cy + 1);
    }

    // Todo lo que NO haya sido alcanzado por el flood fill exterior es el objeto sólido
    for (let i = 0; i < W * H; i++) {
      solidMask[i] = visitedBg[i] === 0 ? 1 : 0;
    }

    // Asegurar que las líneas finas originales se preserven aunque fueran muy delgadas
    for (let i = 0; i < W * H; i++) {
      if (initialFeatureMap[i] === 1) {
        solidMask[i] = 1;
      }
    }
  } else {
    solidMask = initialFeatureMap;
  }

  // 4. Invertir si está activo
  if (invert) {
    for (let i = 0; i < W * H; i++) {
      solidMask[i] = solidMask[i] === 1 ? 0 : 1;
    }
  }

  // 5. FILTRO DE RUIDO Y ELIMINACIÓN DE PÍXELES AISLADOS (Island / Despeckle Filter)
  let cleanedCount = 0;
  if (denoiseIslandSize && denoiseIslandSize > 0) {
    const cleanedResult = removeSmallIslands(solidMask, W, H, denoiseIslandSize);
    solidMask = cleanedResult.mask;
    cleanedCount = cleanedResult.removedPixels;
  }

  // 6. Aplicar dilatación o erosión si el usuario ajustó el grosor
  let mask = solidMask;
  if (dilation !== 0) {
    mask = applyMorphology(solidMask, W, H, dilation);
  }

  // Comprobar si hay al menos algunos píxeles ocupados
  let countSolid = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1) countSolid++;
  }

  if (countSolid < 5) {
    const pad = Math.floor(Math.min(W, H) * 0.15);
    for (let y = pad; y < H - pad; y++) {
      for (let x = pad; x < W - pad; x++) {
        mask[y * W + x] = 1;
      }
    }
  }

  // 7. Si hay puntos de control manuales suministrados por el usuario, usarlos como contornos
  let finalContours = extractMultiContoursFromMask(mask, W, H);
  let finalMask = mask;
  let finalSdf = computeSDF(mask, W, H, blurRadius);

  if (config.manualControlPoints && config.manualControlPoints.length > 0) {
    finalContours = config.manualControlPoints;
    // Rasterizar los polígonos manuales para reconstruir mask y SDF precisos
    const rasterMask = new Uint8Array(W * H);
    // Para cada bucle manual, rasterizar con Scanline / Ray-Casting
    for (let y = 0; y < H; y++) {
      const ny = 1 - (y / (H - 1)) * 2;
      for (let x = 0; x < W; x++) {
        const nx = (x / (W - 1)) * 2 - 1;
        let inside = false;
        for (const poly of config.manualControlPoints) {
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            const intersect = ((yi > ny) !== (yj > ny)) &&
              (nx < ((xj - xi) * (ny - yi)) / (yj - yi + 1e-7) + xi);
            if (intersect) inside = !inside;
          }
        }
        rasterMask[y * W + x] = inside ? 1 : 0;
      }
    }
    finalMask = rasterMask;
    finalSdf = computeSDF(finalMask, W, H, blurRadius);
  }

  return {
    width: W,
    height: H,
    mask: finalMask,
    sdf: finalSdf,
    contours: finalContours,
    aspect: W / H,
    cleanedPixelsCount: cleanedCount
  };
}

/**
 * Elimina islas desconectadas y motas de ruido de menos de `minPixels` de tamaño (Connected Component Analysis)
 */
function removeSmallIslands(
  mask: Uint8Array,
  W: number,
  H: number,
  minPixels: number
): { mask: Uint8Array; removedPixels: number } {
  const result = new Uint8Array(mask);
  const visited = new Uint8Array(W * H);
  const queueX = new Int32Array(W * H);
  const queueY = new Int32Array(W * H);
  let totalRemoved = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (result[idx] === 1 && visited[idx] === 0) {
        // Iniciar BFS para esta componente conectada
        let head = 0;
        let tail = 0;

        queueX[tail] = x;
        queueY[tail] = y;
        visited[idx] = 1;
        tail++;

        while (head < tail) {
          const cx = queueX[head];
          const cy = queueY[head];
          head++;

          // 8-conectividad para asegurar que líneas diagonales o filamentos sutiles no se corten
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                const nIdx = ny * W + nx;
                if (result[nIdx] === 1 && visited[nIdx] === 0) {
                  visited[nIdx] = 1;
                  queueX[tail] = nx;
                  queueY[tail] = ny;
                  tail++;
                }
              }
            }
          }
        }

        // Si la componente tiene menos píxeles que el umbral de ruido, borrarla
        if (tail < minPixels) {
          for (let i = 0; i < tail; i++) {
            const rx = queueX[i];
            const ry = queueY[i];
            result[ry * W + rx] = 0;
            totalRemoved++;
          }
        }
      }
    }
  }

  return { mask: result, removedPixels: totalRemoved };
}

/**
 * Aplica dilatación (+) o erosión (-) morfológica a la máscara binaria
 */
function applyMorphology(src: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  if (radius === 0) return src;
  const dst = new Uint8Array(W * H);
  const r = Math.abs(radius);
  const isDilation = radius > 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let found = !isDilation;
      for (let dy = -r; dy <= r && (isDilation ? !found : found); dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const val = src[ny * W + nx];
          if (isDilation && val === 1) {
            found = true;
            break;
          }
          if (!isDilation && val === 0) {
            found = false;
            break;
          }
        }
      }
      dst[y * W + x] = found ? 1 : 0;
    }
  }
  return dst;
}

/**
 * Calcula el Signed Distance Field 2D rápido usando la transformación de distancia euclidiana exacta
 */
function computeSDF(
  mask: Uint8Array,
  W: number,
  H: number,
  blur: number
): Float32Array {
  const sdf = new Float32Array(W * H);
  const INF = 1e9;
  const distInside = new Float32Array(W * H);
  const distOutside = new Float32Array(W * H);

  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1) {
      distInside[i] = 0;
      distOutside[i] = INF;
    } else {
      distInside[i] = INF;
      distOutside[i] = 0;
    }
  }

  const SQRT2 = 1.41421356;

  // Paso 1: Top-Left a Bottom-Right
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      let d = distOutside[idx];
      if (x > 0) d = Math.min(d, distOutside[idx - 1] + 1);
      if (y > 0) d = Math.min(d, distOutside[idx - W] + 1);
      if (x > 0 && y > 0) d = Math.min(d, distOutside[idx - W - 1] + SQRT2);
      if (x < W - 1 && y > 0) d = Math.min(d, distOutside[idx - W + 1] + SQRT2);
      distOutside[idx] = d;

      let di = distInside[idx];
      if (x > 0) di = Math.min(di, distInside[idx - 1] + 1);
      if (y > 0) di = Math.min(di, distInside[idx - W] + 1);
      if (x > 0 && y > 0) di = Math.min(di, distInside[idx - W - 1] + SQRT2);
      if (x < W - 1 && y > 0) di = Math.min(di, distInside[idx - W + 1] + SQRT2);
      distInside[idx] = di;
    }
  }

  // Paso 2: Bottom-Right a Top-Left
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const idx = y * W + x;
      let d = distOutside[idx];
      if (x < W - 1) d = Math.min(d, distOutside[idx + 1] + 1);
      if (y < H - 1) d = Math.min(d, distOutside[idx + W] + 1);
      if (x < W - 1 && y < H - 1) d = Math.min(d, distOutside[idx + W + 1] + SQRT2);
      if (x > 0 && y < H - 1) d = Math.min(d, distOutside[idx + W - 1] + SQRT2);
      distOutside[idx] = d;

      let di = distInside[idx];
      if (x < W - 1) di = Math.min(di, distInside[idx + 1] + 1);
      if (y < H - 1) di = Math.min(di, distInside[idx + W] + 1);
      if (x < W - 1 && y < H - 1) di = Math.min(di, distInside[idx + W + 1] + SQRT2);
      if (x > 0 && y < H - 1) di = Math.min(di, distInside[idx + W - 1] + SQRT2);
      distInside[idx] = di;
    }
  }

  const normDim = Math.max(W, H, 10);
  for (let i = 0; i < W * H; i++) {
    const rawDist = distInside[i] - distOutside[i];
    sdf[i] = (rawDist + (blur > 0 ? (blur * 0.4) : 0)) / (normDim * 0.5);
  }

  return sdf;
}

/**
 * Extrae todos los bucles de contorno perimetrales de la máscara sin cruces falsos
 */
function extractMultiContoursFromMask(
  mask: Uint8Array,
  W: number,
  H: number
): [number, number][][] {
  const isBorder = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] === 1) {
        if (
          x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
          mask[y * W + (x - 1)] === 0 || mask[y * W + (x + 1)] === 0 ||
          mask[(y - 1) * W + x] === 0 || mask[(y + 1) * W + x] === 0
        ) {
          isBorder[y * W + x] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(W * H);
  const allContours: [number, number][][] = [];

  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (isBorder[y * W + x] === 1 && visited[y * W + x] === 0) {
        const loopPts: [number, number][] = [];
        let currX = x;
        let currY = y;
        let dir = 7;
        const maxSteps = W * H;
        let step = 0;

        while (step < maxSteps) {
          step++;
          visited[currY * W + currX] = 1;
          const nx = (currX / (W - 1)) * 2 - 1;
          const ny = 1 - (currY / (H - 1)) * 2;
          loopPts.push([nx, ny]);

          let found = false;
          for (let i = 0; i < 8; i++) {
            const checkDir = (dir + i) % 8;
            const tx = currX + dx[checkDir];
            const ty = currY + dy[checkDir];

            if (tx >= 0 && tx < W && ty >= 0 && ty < H && isBorder[ty * W + tx] === 1) {
              currX = tx;
              currY = ty;
              dir = (checkDir + 5) % 8;
              found = true;
              break;
            }
          }

          if (!found || (currX === x && currY === y)) break;
        }

        if (loopPts.length >= 6) {
          allContours.push(resamplePolygon2D(loopPts, Math.min(128, Math.max(24, loopPts.length))));
        }
      }
    }
  }

  if (allContours.length === 0) {
    return [[[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]];
  }

  return allContours;
}

function resamplePolygon2D(pts: [number, number][], n: number): [number, number][] {
  if (pts.length <= n) return pts;
  const result: [number, number][] = [];
  const step = pts.length / n;
  for (let i = 0; i < n; i++) {
    const idx = Math.min(pts.length - 1, Math.floor(i * step));
    result.push(pts[idx]);
  }
  return result;
}

/**
 * Lee el valor de SDF de una silueta procesada en coordenadas normalizadas [-1, 1] con interpolación bilineal
 */
function sampleSilhouetteSDF(sil: ProcessedSilhouette, u: number, v: number): number {
  if (u < -1 || u > 1 || v < -1 || v > 1) {
    const du = Math.max(0, Math.abs(u) - 1);
    const dv = Math.max(0, Math.abs(v) - 1);
    return Math.hypot(du, dv) + 0.05;
  }

  const fx = ((u + 1) / 2) * (sil.width - 1);
  const fy = ((1 - v) / 2) * (sil.height - 1);

  const x0 = Math.floor(fx);
  const x1 = Math.min(sil.width - 1, x0 + 1);
  const y0 = Math.floor(fy);
  const y1 = Math.min(sil.height - 1, y0 + 1);

  const tx = fx - x0;
  const ty = fy - y0;

  const s00 = sil.sdf[y0 * sil.width + x0];
  const s10 = sil.sdf[y0 * sil.width + x1];
  const s01 = sil.sdf[y1 * sil.width + x0];
  const s11 = sil.sdf[y1 * sil.width + x1];

  const top = s00 * (1 - tx) + s10 * tx;
  const bot = s01 * (1 - tx) + s11 * tx;
  return top * (1 - ty) + bot * ty;
}

/**
 * Genera la malla 3D final a partir de las imágenes de referencia usando el método seleccionado
 */
export async function carveModelFromBlueprints(
  options: BlueprintCarverOptions
): Promise<{ vertices: V3[]; faces: MeshFace[] } | null> {
  const {
    mode = 'VISUAL_HULL',
    resolution = 56,
    dimensions = [2, 2, 2],
    smoothIterations = 2,
    smoothFactor = 0.5,
    views
  } = options;

  const processedViews: { [K in BlueprintViewKey]?: ProcessedSilhouette } = {};

  const viewKeys: BlueprintViewKey[] = ['front', 'top', 'side', 'back', 'bottom'];
  for (const key of viewKeys) {
    const viewCfg = views[key];
    if (viewCfg && viewCfg.url && viewCfg.enabled) {
      const imgData = await loadCanvasImageData(viewCfg.url, viewCfg);
      if (imgData) {
        processedViews[key] = processSilhouette(imgData, viewCfg);
      }
    }
  }

  const activeKeys = Object.keys(processedViews) as BlueprintViewKey[];
  if (activeKeys.length === 0) {
    throw new Error('No hay imágenes de referencia válidas o activas para tallar el modelo.');
  }

  // ── MODO 1 & 3: TALLADO VOLUMÉTRICO VISUAL HULL (Marching Cubes + SDF) ──
  if (mode === 'VISUAL_HULL' || mode === 'SMOOTH_SCULPT') {
    const res = Math.max(24, Math.min(96, resolution));
    const [dimX, dimY, dimZ] = dimensions;
    const halfX = dimX / 2;
    const halfY = dimY / 2;
    const halfZ = dimZ / 2;

    const totalVoxels = res * res * res;
    const scalarField = new Float32Array(totalVoxels);

    const hasFront = !!processedViews.front;
    const hasTop = !!processedViews.top;
    const hasSide = !!processedViews.side;
    const hasBack = !!processedViews.back;
    const hasBottom = !!processedViews.bottom;

    let idx = 0;
    for (let x = 0; x < res; x++) {
      const normX = ((x / (res - 1)) * 2 - 1); // [-1, 1]
      for (let y = 0; y < res; y++) {
        const normY = ((y / (res - 1)) * 2 - 1); // [-1, 1]
        for (let z = 0; z < res; z++) {
          const normZ = ((z / (res - 1)) * 2 - 1); // [-1, 1]

          let maxDist = -999;

          // Vista Frontal: X -> normX, Y -> normY
          if (hasFront) {
            const dFront = sampleSilhouetteSDF(processedViews.front!, normX, normY);
            if (dFront > maxDist) maxDist = dFront;
          }

          // Vista Trasera: X -> -normX, Y -> normY
          if (hasBack) {
            const dBack = sampleSilhouetteSDF(processedViews.back!, -normX, normY);
            if (dBack > maxDist) maxDist = dBack;
          }

          // Vista Superior (Planta): X -> normX, Z -> normZ
          if (hasTop) {
            const dTop = sampleSilhouetteSDF(processedViews.top!, normX, normZ);
            if (dTop > maxDist) maxDist = dTop;
          }

          // Vista Inferior: X -> normX, Z -> -normZ
          if (hasBottom) {
            const dBottom = sampleSilhouetteSDF(processedViews.bottom!, normX, -normZ);
            if (dBottom > maxDist) maxDist = dBottom;
          }

          // Vista Lateral (Perfil): Z -> normZ, Y -> normY
          if (hasSide) {
            const dSide = sampleSilhouetteSDF(processedViews.side!, normZ, normY);
            if (dSide > maxDist) maxDist = dSide;
          }

          if (mode === 'SMOOTH_SCULPT') {
            const sphereDist = (normX * normX + normY * normY + normZ * normZ) * 0.15;
            maxDist += sphereDist;
          }

          scalarField[idx++] = maxDist;
        }
      }
    }

    const mesh = marchingCubes(scalarField, res, res, res, {
      isolevel: 0.0,
      boundsMin: [-halfX, -halfY, -halfZ],
      boundsMax: [halfX, halfY, halfZ],
      smoothIterations: mode === 'SMOOTH_SCULPT' ? Math.max(3, smoothIterations) : smoothIterations,
      smoothFactor: smoothFactor
    });

    if (mesh.vertices.length === 0) {
      throw new Error('Las siluetas no se solapan en el espacio 3D. Prueba a ajustar el umbral o la alineación.');
    }

    return mesh;
  }

  // ── MODO 2: HARD-SURFACE CSG (Intersección Booleana de Prismas Exactos) ──
  if (mode === 'HARD_SURFACE_CSG') {
    const [dimX, dimY, dimZ] = dimensions;
    const prisms: THREE.Mesh[] = [];

    if (processedViews.front && processedViews.front.contours.length > 0) {
      for (const loop of processedViews.front.contours) {
        const geo = createExtrudedContourGeo(loop, 'z', dimX, dimY, dimZ);
        if (geo) prisms.push(new THREE.Mesh(geo));
      }
    }

    if (processedViews.top && processedViews.top.contours.length > 0) {
      for (const loop of processedViews.top.contours) {
        const geo = createExtrudedContourGeo(loop, 'y', dimX, dimY, dimZ);
        if (geo) prisms.push(new THREE.Mesh(geo));
      }
    }

    if (processedViews.side && processedViews.side.contours.length > 0) {
      for (const loop of processedViews.side.contours) {
        const geo = createExtrudedContourGeo(loop, 'x', dimX, dimY, dimZ);
        if (geo) prisms.push(new THREE.Mesh(geo));
      }
    }

    if (prisms.length === 0) {
      return carveModelFromBlueprints({ ...options, mode: 'VISUAL_HULL' });
    }

    try {
      let resultCSG = CSG.fromMesh(prisms[0]);
      for (let i = 1; i < prisms.length; i++) {
        const nextCSG = CSG.fromMesh(prisms[i]);
        resultCSG = resultCSG.intersect(nextCSG);
      }

      const finalMesh = CSG.toMesh(resultCSG, new THREE.Matrix4());
      const geo = finalMesh.geometry as THREE.BufferGeometry;
      const posAttr = geo.getAttribute('position');
      const vertices: V3[] = [];
      const faces: MeshFace[] = [];

      for (let i = 0; i < posAttr.count; i++) {
        vertices.push([posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]);
      }

      if (geo.index) {
        const idxAttr = geo.index;
        for (let i = 0; i < idxAttr.count; i += 3) {
          faces.push({ indices: [idxAttr.getX(i), idxAttr.getX(i + 1), idxAttr.getX(i + 2)] });
        }
      } else {
        for (let i = 0; i < vertices.length; i += 3) {
          faces.push({ indices: [i, i + 1, i + 2] });
        }
      }

      return { vertices, faces };
    } catch (e) {
      console.warn('CSG intersection fallback to Visual Hull:', e);
      return carveModelFromBlueprints({ ...options, mode: 'VISUAL_HULL' });
    }
  }

  return null;
}

/**
 * Crea una geometría de Three.js extruyendo un contorno 2D a lo largo del eje indicado
 */
function createExtrudedContourGeo(
  contour: [number, number][],
  axis: 'x' | 'y' | 'z',
  dimX: number,
  dimY: number,
  dimZ: number
): THREE.BufferGeometry | null {
  if (contour.length < 3) return null;

  const shape = new THREE.Shape();
  const scaleU = axis === 'x' ? dimZ / 2 : dimX / 2;
  const scaleV = axis === 'y' ? dimZ / 2 : dimY / 2;

  shape.moveTo(contour[0][0] * scaleU, contour[0][1] * scaleV);
  for (let i = 1; i < contour.length; i++) {
    shape.lineTo(contour[i][0] * scaleU, contour[i][1] * scaleV);
  }
  shape.closePath();

  const depth = axis === 'z' ? dimZ : axis === 'x' ? dimX : dimY;
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: depth,
    bevelEnabled: false
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();

  if (axis === 'x') {
    geo.rotateY(Math.PI / 2);
  } else if (axis === 'y') {
    geo.rotateX(-Math.PI / 2);
  }

  return geo;
}

/**
 * Dibuja en un canvas de previsualización 2D la imagen, la máscara coloreada y los contornos perimetrales nítidos
 */
export function drawBlueprintPreview(
  canvas: HTMLCanvasElement,
  imgData: ImageData | null,
  processed: ProcessedSilhouette | null,
  color: string = '#6366f1',
  viewTransform: { zoom: number; panX: number; panY: number } = { zoom: 1, panX: 0, panY: 0 },
  selectedPointInfo: { loopIdx: number; ptIdx: number } | null = null,
  isEditPointsMode: boolean = false,
  hoveredPointInfo: { loopIdx: number; ptIdx: number } | null = null
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (!imgData || !processed) {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#71717a';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin imagen cargada', W / 2, H / 2);
    return;
  }

  const { zoom = 1, panX = 0, panY = 0 } = viewTransform;

  ctx.save();
  // Aplicar transformación de Zoom y Pan centrada en el lienzo
  ctx.translate(W / 2 + panX, H / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);

  // 1. Dibujar imagen base
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imgData.width;
  tempCanvas.height = imgData.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, W, H);
  }

  // 1.1 Guías sutiles de alineación central y encuadre
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  // Línea central vertical
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  // Línea central horizontal
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.restore();

  // 2. Superponer tinte de silueta sólida
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d');
  if (maskCtx) {
    const maskImg = maskCtx.createImageData(W, H);
    const pW = processed.width;
    const pH = processed.height;
    const rgb = hexToRgb(color);

    for (let y = 0; y < H; y++) {
      const py = Math.floor((y / H) * pH);
      for (let x = 0; x < W; x++) {
        const px = Math.floor((x / W) * pW);
        const isSolid = processed.mask[py * pW + px] === 1;
        const idx = (y * W + x) * 4;
        if (isSolid) {
          maskImg.data[idx] = rgb.r;
          maskImg.data[idx + 1] = rgb.g;
          maskImg.data[idx + 2] = rgb.b;
          maskImg.data[idx + 3] = isEditPointsMode ? 70 : 110;
        } else {
          maskImg.data[idx + 3] = 0;
        }
      }
    }
    maskCtx.putImageData(maskImg, 0, 0);
    ctx.drawImage(maskCanvas, 0, 0);
  }

  // 3. Dibujar todos los bucles de contorno reales y puntos de control editables
  if (processed.contours && processed.contours.length > 0) {
    const toCanvas = (u: number, v: number): [number, number] => [
      ((u + 1) / 2) * (W - 1),
      ((1 - v) / 2) * (H - 1)
    ];

    processed.contours.forEach((loop, loopIdx) => {
      if (loop.length < 2) return;

      // Trazo de línea del contorno
      ctx.save();
      ctx.strokeStyle = isEditPointsMode ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = Math.max(1.2, (isEditPointsMode ? 2.5 : 1.8) / zoom);
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4 / zoom;

      ctx.beginPath();
      const [x0, y0] = toCanvas(loop[0][0], loop[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < loop.length; i++) {
        const [cx, cy] = toCanvas(loop[i][0], loop[i][1]);
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Puntos de control interactivos
      const step = isEditPointsMode ? 1 : 4;
      for (let ptIdx = 0; ptIdx < loop.length; ptIdx += step) {
        const [cx, cy] = toCanvas(loop[ptIdx][0], loop[ptIdx][1]);
        const isSelected = selectedPointInfo && selectedPointInfo.loopIdx === loopIdx && selectedPointInfo.ptIdx === ptIdx;
        const isHovered = hoveredPointInfo && hoveredPointInfo.loopIdx === loopIdx && hoveredPointInfo.ptIdx === ptIdx;

        ctx.save();
        ctx.beginPath();
        // Radio escalado inversamente a zoom pero con límites visibles en pantalla
        const baseRadius = isSelected ? 6.5 : isHovered ? 5.5 : isEditPointsMode ? 4.2 : 2.5;
        const ptRadius = Math.max(2.0, baseRadius / zoom);
        ctx.arc(cx, cy, ptRadius, 0, Math.PI * 2);

        if (isSelected) {
          ctx.fillStyle = '#f59e0b'; // Dorado ámbar brillante
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 10 / zoom;
        } else if (isHovered) {
          ctx.fillStyle = '#38bdf8'; // Celeste hover
          ctx.shadowColor = '#0284c7';
          ctx.shadowBlur = 8 / zoom;
        } else if (isEditPointsMode) {
          ctx.fillStyle = '#0284c7'; // Azul cian editable
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 3 / zoom;
        } else {
          ctx.fillStyle = color;
        }
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : '#e2e8f0';
        ctx.lineWidth = Math.max(1.0, (isSelected ? 2.2 : isHovered ? 1.8 : 1.2) / zoom);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  ctx.restore();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}
