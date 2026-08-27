/**
 * BlueprintCarverModal.tsx — Estudio Interactivo de Modelado Basado en Bocetos y Blueprints
 * Tallado Volumétrico 3D (3-View Visual Hull & CSG Intersection).
 * Incluye herramientas de Transformación (Espejo H/V, Rotación 90°), Filtros de Imagen
 * (Brillo, Contraste, Blanco y Negro, Nitidez), Limpieza de Ruido/Píxeles Aislados
 * y Detector Adaptativo de Zonas Finas / Antenas.
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Layers,
  Sparkles,
  Sliders,
  Maximize2,
  Box,
  Trash2,
  Upload,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  Zap,
  Info,
  ShieldAlert,
  HelpCircle,
  FileCode,
  Image as ImageIcon,
  ChevronRight,
  RotateCcw,
  Pipette,
  Wand2,
  Brush,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Sun,
  Contrast as ContrastIcon,
  Eraser,
  Feather,
  SlidersHorizontal,
  Scissors,
  Lock,
  Unlock,
  Move,
  Scale,
  ZoomIn,
  ZoomOut,
  MousePointer,
  Crosshair,
  Plus,
  Minus,
  Minimize2,
  Palette
} from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  carveModelFromBlueprints,
  generateBlueprintUVs,
  loadCanvasImageData,
  processSilhouette,
  analyzeImageCharacteristics,
  drawBlueprintPreview,
  BlueprintViewKey,
  CarverEngineMode,
  BlueprintDetectionMode,
  BlueprintImageConfig,
  ProcessedSilhouette
} from '../utils/blueprintCarver';
import { V3, MeshFace, CSGObject, MaterialData } from '../types';
import { safeParseFixed } from '../utils/numberUtils';
import { generateFullPBRMapsFromSource, GeneratedPBRSet } from '../utils/textureColorUtils';
import { generateUVs } from '../utils/modifiers';
import {
  buildUnifiedMultiViewPBRAtlas,
  generateMultiViewAtlasUVs,
  prepareViewPBRData,
  MultiViewAtlasResult,
  ViewPBRData
} from '../utils/blueprintAtlasPBR';

interface BlueprintCarverModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BlueprintCarverModal: React.FC<BlueprintCarverModalProps> = ({ isOpen, onClose }) => {
  const project = useStore(state => state.project);

  const addGenObject = (
    vertices: V3[],
    faces: MeshFace[],
    name: string,
    materialId?: string,
    material?: MaterialData
  ) => {
    const obj: CSGObject = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      type: 'CUBE',
      operation: 'ADD',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { isBlueprintCarved: true },
      vertices,
      faces,
      color: material?.color || '#6366f1',
      materialId: materialId || undefined,
      material: material || undefined,
      opacity: 1,
      visible: true,
      keyframes: [],
      vertexOffsets: {}
    };
    useStore.getState().addObject(obj);
    useStore.getState().selectObject(obj.id);
  };

  // ── Estado de las 3 Vistas Ortográficas ──
  const [viewConfigs, setViewConfigs] = useState<{
    front: BlueprintImageConfig;
    top: BlueprintImageConfig;
    side: BlueprintImageConfig;
  }>({
    front: {
      url: null,
      enabled: true,
      flipH: false,
      flipV: false,
      rotation: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      scaleUniform: 1.0,
      lockAspectRatio: true,
      preserveAspectRatio: true,
      offsetX: 0,
      offsetY: 0,
      contrast: 0,
      brightness: 0,
      grayscale: false,
      sharpen: 1,
      threshold: 45,
      detectionMode: 'LINE_ART',
      fillInterior: true,
      customBgColor: null,
      invert: false,
      dilation: 1,
      blurRadius: 1,
      denoiseIslandSize: 15,
      thinFeatureBoost: 45,
      autoDetectHoles: true,
      holeSeeds: [],
      texScaleX: 1.0,
      texScaleY: 1.0,
      texOffsetX: 0,
      texOffsetY: 0,
      texFlipH: false,
      texFlipV: false,
      texMirrorOpposite: false,
      invertNormalY: false
    },
    top: {
      url: null,
      enabled: true,
      flipH: false,
      flipV: false,
      rotation: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      scaleUniform: 1.0,
      lockAspectRatio: true,
      preserveAspectRatio: true,
      offsetX: 0,
      offsetY: 0,
      contrast: 0,
      brightness: 0,
      grayscale: false,
      sharpen: 1,
      threshold: 45,
      detectionMode: 'LINE_ART',
      fillInterior: true,
      customBgColor: null,
      invert: false,
      dilation: 1,
      blurRadius: 1,
      denoiseIslandSize: 15,
      thinFeatureBoost: 45,
      autoDetectHoles: true,
      holeSeeds: [],
      texScaleX: 1.0,
      texScaleY: 1.0,
      texOffsetX: 0,
      texOffsetY: 0,
      texFlipH: false,
      texFlipV: false,
      texMirrorOpposite: false,
      invertNormalY: false
    },
    side: {
      url: null,
      enabled: true,
      flipH: false,
      flipV: false,
      rotation: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      scaleUniform: 1.0,
      lockAspectRatio: true,
      preserveAspectRatio: true,
      offsetX: 0,
      offsetY: 0,
      contrast: 0,
      brightness: 0,
      grayscale: false,
      sharpen: 1,
      threshold: 45,
      detectionMode: 'LINE_ART',
      fillInterior: true,
      customBgColor: null,
      invert: false,
      dilation: 1,
      blurRadius: 1,
      denoiseIslandSize: 15,
      thinFeatureBoost: 45,
      autoDetectHoles: true,
      holeSeeds: [],
      texScaleX: 1.0,
      texScaleY: 1.0,
      texOffsetX: 0,
      texOffsetY: 0,
      texFlipH: false,
      texFlipV: false,
      texMirrorOpposite: false,
      invertNormalY: false
    }
  });

  const [activeTab, setActiveTab] = useState<'front' | 'top' | 'side'>('front');
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [isHolePickerActive, setIsHolePickerActive] = useState(false);
  const [subSection, setSubSection] = useState<'detection' | 'scale' | 'filters' | 'transform' | 'pbr'>('detection');

  // ── Generación de Textura & Mapas PBR desde Bocetos Ortográficos ──
  const [isGeneratingPBR, setIsGeneratingPBR] = useState(false);
  const [pbrNormalStrength, setPbrNormalStrength] = useState<number>(2.5);
  const [applyPBRMaterialToCarve, setApplyPBRMaterialToCarve] = useState<boolean>(true);
  const [textureTargetMode, setTextureTargetMode] = useState<'atlas' | 'view'>('atlas');
  const [viewPBRDataMap, setViewPBRDataMap] = useState<Partial<Record<'front' | 'top' | 'side', ViewPBRData>>>({});
  const [atlasPBRResult, setAtlasPBRResult] = useState<MultiViewAtlasResult | null>(null);
  const [atlasPBRMaterial, setAtlasPBRMaterial] = useState<MaterialData | null>(null);
  const [generatedPBRMaterials, setGeneratedPBRMaterials] = useState<{
    front: { materialId: string; material: MaterialData; pbrSet: GeneratedPBRSet } | null;
    top: { materialId: string; material: MaterialData; pbrSet: GeneratedPBRSet } | null;
    side: { materialId: string; material: MaterialData; pbrSet: GeneratedPBRSet } | null;
  }>({ front: null, top: null, side: null });
  const [selectedPBRViewKey, setSelectedPBRViewKey] = useState<'front' | 'top' | 'side'>('front');

  // ── Estado de Zoom & Pan 2D para cada vista ──
  const [viewTransforms, setViewTransforms] = useState<{
    front: { zoom: number; panX: number; panY: number };
    top: { zoom: number; panX: number; panY: number };
    side: { zoom: number; panX: number; panY: number };
  }>({
    front: { zoom: 1, panX: 0, panY: 0 },
    top: { zoom: 1, panX: 0, panY: 0 },
    side: { zoom: 1, panX: 0, panY: 0 },
  });

  // ── Modo Edición Manual de Puntos de Silueta ──
  const [isEditPointsMode, setIsEditPointsMode] = useState<boolean>(false);
  const [selectedPoint, setSelectedPoint] = useState<{ loopIdx: number; ptIdx: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ loopIdx: number; ptIdx: number } | null>(null);
  const [isDraggingPoint, setIsDraggingPoint] = useState<boolean>(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedContoursRef = useRef<[number, number][][] | null>(null);

  // ── Parámetros del Motor 3D ──
  const [engineMode, setEngineMode] = useState<CarverEngineMode>('VISUAL_HULL');
  const [resolution, setResolution] = useState<number>(56);
  const [dimensions, setDimensions] = useState<V3>([2.0, 2.0, 3.5]);
  const [smoothIterations, setSmoothIterations] = useState<number>(2);
  const [smoothFactor, setSmoothFactor] = useState<number>(0.5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // ── Previsualización 2D de siluetas ──
  const [processedSilhouettes, setProcessedSilhouettes] = useState<{
    front: ProcessedSilhouette | null;
    top: ProcessedSilhouette | null;
    side: ProcessedSilhouette | null;
  }>({ front: null, top: null, side: null });

  const [rawImages, setRawImages] = useState<{
    front: ImageData | null;
    top: ImageData | null;
    side: ImageData | null;
  }>({ front: null, top: null, side: null });

  const canvasFrontRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasSideRef = useRef<HTMLCanvasElement>(null);

  // ── Visor 3D Interactivo ──
  const threeMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const previewCageRef = useRef<THREE.LineSegments | null>(null);
  const [previewStats, setPreviewStats] = useState({ vertices: 0, triangles: 0 });

  // ── Inicializar: Cargar referencias de la escena si existen ──
  useEffect(() => {
    if (!isOpen) return;

    const refs = project.references;
    const initialFront = refs?.front?.url ?? null;
    const initialTop = refs?.top?.url ?? null;
    const initialSide = refs?.left?.url ?? refs?.right?.url ?? null;

    setViewConfigs(prev => ({
      front: { ...prev.front, url: initialFront },
      top:   { ...prev.top,   url: initialTop },
      side:  { ...prev.side,  url: initialSide }
    }));
  }, [isOpen]);

  // ── Cargar y procesar imágenes cuando cambian URLs o parámetros visuales ──
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const processAll = async () => {
      const keys: ('front' | 'top' | 'side')[] = ['front', 'top', 'side'];
      const newImages: any = { ...rawImages };
      const newSilhouettes: any = { ...processedSilhouettes };

      for (const key of keys) {
        const cfg = viewConfigs[key];
        if (cfg.url) {
          try {
            const imgData = await loadCanvasImageData(cfg.url, cfg);
            if (imgData && isMounted) {
              newImages[key] = imgData;
              newSilhouettes[key] = processSilhouette(imgData, cfg);
            }
          } catch (e) {
            console.warn('Error procesando imagen para', key, e);
          }
        } else {
          newImages[key] = null;
          newSilhouettes[key] = null;
        }
      }

      if (isMounted) {
        setRawImages(newImages);
        setProcessedSilhouettes(newSilhouettes);
      }
    };

    processAll();

    return () => { isMounted = false; };
  }, [
    isOpen,
    viewConfigs.front.url, viewConfigs.front.threshold, viewConfigs.front.detectionMode, viewConfigs.front.fillInterior, viewConfigs.front.customBgColor, viewConfigs.front.invert, viewConfigs.front.dilation, viewConfigs.front.flipH, viewConfigs.front.flipV, viewConfigs.front.rotation, viewConfigs.front.scaleX, viewConfigs.front.scaleY, viewConfigs.front.scaleUniform, viewConfigs.front.preserveAspectRatio, viewConfigs.front.offsetX, viewConfigs.front.offsetY, viewConfigs.front.contrast, viewConfigs.front.brightness, viewConfigs.front.grayscale, viewConfigs.front.sharpen, viewConfigs.front.denoiseIslandSize, viewConfigs.front.thinFeatureBoost, viewConfigs.front.autoDetectHoles, JSON.stringify(viewConfigs.front.holeSeeds),
    viewConfigs.top.url, viewConfigs.top.threshold, viewConfigs.top.detectionMode, viewConfigs.top.fillInterior, viewConfigs.top.customBgColor, viewConfigs.top.invert, viewConfigs.top.dilation, viewConfigs.top.flipH, viewConfigs.top.flipV, viewConfigs.top.rotation, viewConfigs.top.scaleX, viewConfigs.top.scaleY, viewConfigs.top.scaleUniform, viewConfigs.top.preserveAspectRatio, viewConfigs.top.offsetX, viewConfigs.top.offsetY, viewConfigs.top.contrast, viewConfigs.top.brightness, viewConfigs.top.grayscale, viewConfigs.top.sharpen, viewConfigs.top.denoiseIslandSize, viewConfigs.top.thinFeatureBoost, viewConfigs.top.autoDetectHoles, JSON.stringify(viewConfigs.top.holeSeeds),
    viewConfigs.side.url, viewConfigs.side.threshold, viewConfigs.side.detectionMode, viewConfigs.side.fillInterior, viewConfigs.side.customBgColor, viewConfigs.side.invert, viewConfigs.side.dilation, viewConfigs.side.flipH, viewConfigs.side.flipV, viewConfigs.side.rotation, viewConfigs.side.scaleX, viewConfigs.side.scaleY, viewConfigs.side.scaleUniform, viewConfigs.side.preserveAspectRatio, viewConfigs.side.offsetX, viewConfigs.side.offsetY, viewConfigs.side.contrast, viewConfigs.side.brightness, viewConfigs.side.grayscale, viewConfigs.side.sharpen, viewConfigs.side.denoiseIslandSize, viewConfigs.side.thinFeatureBoost, viewConfigs.side.autoDetectHoles, JSON.stringify(viewConfigs.side.holeSeeds)
  ]);

  // ── Redibujar canvas 2D con Zoom, Pan y Puntos de Control ──
  useEffect(() => {
    if (activeTab === 'front' && canvasFrontRef.current) {
      drawBlueprintPreview(
        canvasFrontRef.current,
        rawImages.front,
        processedSilhouettes.front,
        '#ef4444',
        viewTransforms.front,
        selectedPoint,
        isEditPointsMode,
        hoveredPoint,
        viewConfigs.front.holeSeeds || []
      );
    }
    if (activeTab === 'top' && canvasTopRef.current) {
      drawBlueprintPreview(
        canvasTopRef.current,
        rawImages.top,
        processedSilhouettes.top,
        '#22c55e',
        viewTransforms.top,
        selectedPoint,
        isEditPointsMode,
        hoveredPoint,
        viewConfigs.top.holeSeeds || []
      );
    }
    if (activeTab === 'side' && canvasSideRef.current) {
      drawBlueprintPreview(
        canvasSideRef.current,
        rawImages.side,
        processedSilhouettes.side,
        '#06b6d4',
        viewTransforms.side,
        selectedPoint,
        isEditPointsMode,
        hoveredPoint,
        viewConfigs.side.holeSeeds || []
      );
    }
  }, [rawImages, processedSilhouettes, activeTab, viewTransforms, selectedPoint, hoveredPoint, isEditPointsMode, viewConfigs.front.holeSeeds, viewConfigs.top.holeSeeds, viewConfigs.side.holeSeeds]);

  // ── Controles de Zoom 2D ──
  const handleZoom = (key: 'front' | 'top' | 'side', delta: number) => {
    setViewTransforms(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        zoom: Math.max(0.5, Math.min(5.0, safeParseFixed(prev[key].zoom + delta, 2, 1)))
      }
    }));
  };

  const handleResetZoomPan = (key: 'front' | 'top' | 'side') => {
    setViewTransforms(prev => ({
      ...prev,
      [key]: { zoom: 1, panX: 0, panY: 0 }
    }));
    setSelectedPoint(null);
    setHoveredPoint(null);
  };

  // ── Transformaciones Precisas de Coordenadas Pantalla -> Normalizadas [-1, 1] ──
  const getCanvasPointInfo = (canvas: HTMLCanvasElement, clientX: number, clientY: number, key: 'front' | 'top' | 'side') => {
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;
    const { zoom = 1, panX = 0, panY = 0 } = viewTransforms[key];

    const canvasX = (cssX / rect.width) * W;
    const canvasY = (cssY / rect.height) * H;

    const localX = (canvasX - (W / 2 + panX)) / zoom + W / 2;
    const localY = (canvasY - (H / 2 + panY)) / zoom + H / 2;

    const normX = Math.max(-1, Math.min(1, (localX / (W - 1)) * 2 - 1));
    const normY = Math.max(-1, Math.min(1, 1 - (localY / (H - 1)) * 2));

    return { normX, normY, canvasX, canvasY, rect };
  };

  // ── Detección de Punto más Cercano en Espacio de Píxeles de Pantalla (Hit-Test Inmune a Zoom) ──
  const findClosestPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number, key: 'front' | 'top' | 'side', thresholdPx = 24) => {
    const sil = processedSilhouettes[key];
    if (!sil || !sil.contours || sil.contours.length === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const W = canvas.width;
    const H = canvas.height;
    const { zoom = 1, panX = 0, panY = 0 } = viewTransforms[key];

    let minScreenDist = thresholdPx;
    let found: { loopIdx: number; ptIdx: number; pt: [number, number] } | null = null;

    sil.contours.forEach((loop, loopIdx) => {
      loop.forEach((pt, ptIdx) => {
        const localX = ((pt[0] + 1) / 2) * (W - 1);
        const localY = ((1 - pt[1]) / 2) * (H - 1);
        const transX = (localX - W / 2) * zoom + (W / 2 + panX);
        const transY = (localY - H / 2) * zoom + (H / 2 + panY);
        const screenX = rect.left + (transX / W) * rect.width;
        const screenY = rect.top + (transY / H) * rect.height;

        const d = Math.hypot(clientX - screenX, clientY - screenY);
        if (d < minScreenDist) {
          minScreenDist = d;
          found = { loopIdx, ptIdx, pt };
        }
      });
    });

    return found;
  };

  // ── Aplicar y Re-calcular Contornos Manuales Inmediatamente ──
  const commitManualContours = (key: 'front' | 'top' | 'side', updatedContours: [number, number][][]) => {
    const imgData = rawImages[key];
    const newCfg = {
      ...viewConfigs[key],
      manualControlPoints: updatedContours
    };

    setViewConfigs(prev => ({
      ...prev,
      [key]: newCfg
    }));

    if (imgData) {
      const newSil = processSilhouette(imgData, newCfg);
      setProcessedSilhouettes(prev => ({
        ...prev,
        [key]: newSil
      }));
    } else {
      setProcessedSilhouettes(prev => {
        const cur = prev[key];
        if (!cur) return prev;
        return {
          ...prev,
          [key]: {
            ...cur,
            contours: updatedContours
          }
        };
      });
    }
  };

  // ── Manejadores de Interacción con Puntos y Canvas 2D ──
  const handleCanvasPointerDown = (key: 'front' | 'top' | 'side', e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isEyedropperActive) return;
    const canvas = e.currentTarget;

    // Clic Central o Shift+Clic para hacer Pan
    if (e.button === 1 || e.shiftKey || (!isEditPointsMode && e.button === 0)) {
      setIsPanningCanvas(true);
      setPanStart({ x: e.clientX - viewTransforms[key].panX, y: e.clientY - viewTransforms[key].panY });
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Modo Edición de Puntos: Agarre inmediato
    if (isEditPointsMode && e.button === 0) {
      const found = findClosestPoint(canvas, e.clientX, e.clientY, key, 26);

      if (found) {
        // Alt + Clic elimina el punto
        if (e.altKey) {
          const sil = processedSilhouettes[key];
          if (sil && sil.contours) {
            const updated = sil.contours.map((loop, lIdx) => {
              if (lIdx !== found.loopIdx || loop.length <= 3) return loop;
              return loop.filter((_, pIdx) => pIdx !== found.ptIdx);
            });
            commitManualContours(key, updated);
            setSelectedPoint(null);
            setHoveredPoint(null);
            return;
          }
        }

        setSelectedPoint({ loopIdx: found.loopIdx, ptIdx: found.ptIdx });
        setIsDraggingPoint(true);
        const sil = processedSilhouettes[key];
        if (sil && sil.contours) {
          draggedContoursRef.current = sil.contours;
        }
        canvas.setPointerCapture(e.pointerId);
      } else {
        setSelectedPoint(null);
        // Si hizo clic en el fondo en modo edición, permitir hacer Pan
        setIsPanningCanvas(true);
        setPanStart({ x: e.clientX - viewTransforms[key].panX, y: e.clientY - viewTransforms[key].panY });
        canvas.setPointerCapture(e.pointerId);
      }
    }
  };

  const handleCanvasPointerMove = (key: 'front' | 'top' | 'side', e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;

    if (isPanningCanvas) {
      const newPanX = e.clientX - panStart.x;
      const newPanY = e.clientY - panStart.y;
      setViewTransforms(prev => ({
        ...prev,
        [key]: { ...prev[key], panX: newPanX, panY: newPanY }
      }));
      return;
    }

    if (isDraggingPoint && selectedPoint && isEditPointsMode) {
      const info = getCanvasPointInfo(canvas, e.clientX, e.clientY, key);
      const sil = processedSilhouettes[key];
      if (!sil || !sil.contours) return;

      const currentContours = draggedContoursRef.current || sil.contours;
      const updatedLoops: [number, number][][] = currentContours.map((loop, lIdx) => {
        if (lIdx !== selectedPoint.loopIdx) return loop;
        return loop.map((pt, pIdx) => {
          if (pIdx !== selectedPoint.ptIdx) return pt;
          return [info.normX, info.normY] as [number, number];
        });
      });

      draggedContoursRef.current = updatedLoops;

      // Actualizar vista 2D instantáneamente a 60 FPS
      setProcessedSilhouettes(prev => {
        const cur = prev[key];
        if (!cur) return prev;
        return {
          ...prev,
          [key]: {
            ...cur,
            contours: updatedLoops
          }
        };
      });
      return;
    }

    // Feedback de Hover sobre puntos en modo edición
    if (isEditPointsMode && !isDraggingPoint) {
      const found = findClosestPoint(canvas, e.clientX, e.clientY, key, 24);
      setHoveredPoint(found ? { loopIdx: found.loopIdx, ptIdx: found.ptIdx } : null);
    }
  };

  const handleCanvasPointerUp = (key: 'front' | 'top' | 'side', e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (isDraggingPoint && draggedContoursRef.current) {
      commitManualContours(key, draggedContoursRef.current);
    }

    setIsDraggingPoint(false);
    setIsPanningCanvas(false);
  };

  // ── Doble Clic para Insertar un Punto Nuevo en el Contorno ──
  const handleCanvasDoubleClick = (key: 'front' | 'top' | 'side', e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditPointsMode) return;
    const canvas = e.currentTarget;
    const info = getCanvasPointInfo(canvas, e.clientX, e.clientY, key);
    const sil = processedSilhouettes[key];
    if (!sil || !sil.contours || sil.contours.length === 0) return;

    // Buscar el segmento más cercano donde insertar el nuevo punto
    let bestLoop = 0;
    let bestSegmentIdx = 0;
    let minSegmentDist = Infinity;

    sil.contours.forEach((loop, lIdx) => {
      for (let i = 0; i < loop.length; i++) {
        const p1 = loop[i];
        const p2 = loop[(i + 1) % loop.length];

        // Distancia punto a segmento 2D
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const lenSq = dx * dx + dy * dy;
        let t = 0;
        if (lenSq > 1e-7) {
          t = Math.max(0, Math.min(1, ((info.normX - p1[0]) * dx + (info.normY - p1[1]) * dy) / lenSq));
        }
        const projX = p1[0] + t * dx;
        const projY = p1[1] + t * dy;
        const dist = Math.hypot(info.normX - projX, info.normY - projY);

        if (dist < minSegmentDist) {
          minSegmentDist = dist;
          bestLoop = lIdx;
          bestSegmentIdx = i;
        }
      }
    });

    if (minSegmentDist < 0.25) {
      const updatedLoops = sil.contours.map((loop, lIdx) => {
        if (lIdx !== bestLoop) return loop;
        const newLoop = [...loop];
        newLoop.splice(bestSegmentIdx + 1, 0, [info.normX, info.normY]);
        return newLoop;
      });

      setSelectedPoint({ loopIdx: bestLoop, ptIdx: bestSegmentIdx + 1 });
      commitManualContours(key, updatedLoops);
    }
  };

  // ── Clic Derecho para Eliminar Punto ──
  const handleCanvasContextMenu = (key: 'front' | 'top' | 'side', e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isEditPointsMode) return;
    const canvas = e.currentTarget;
    const found = findClosestPoint(canvas, e.clientX, e.clientY, key, 26);
    if (found) {
      const sil = processedSilhouettes[key];
      if (sil && sil.contours) {
        const updated = sil.contours.map((loop, lIdx) => {
          if (lIdx !== found.loopIdx || loop.length <= 3) return loop;
          return loop.filter((_, pIdx) => pIdx !== found.ptIdx);
        });
        commitManualContours(key, updated);
        setSelectedPoint(null);
        setHoveredPoint(null);
      }
    }
  };

  // ── Herramientas de Puntos Manuales (Subdividir, Simplificar, Eliminar, Restablecer) ──
  const handleSubdividePoints = (key: 'front' | 'top' | 'side') => {
    const sil = processedSilhouettes[key];
    if (!sil || !sil.contours) return;
    const subdivided: [number, number][][] = sil.contours.map(loop => {
      const newLoop: [number, number][] = [];
      for (let i = 0; i < loop.length; i++) {
        const p0 = loop[i];
        const p1 = loop[(i + 1) % loop.length];
        newLoop.push(p0);
        newLoop.push([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
      }
      return newLoop;
    });
    commitManualContours(key, subdivided);
  };

  const handleSimplifyPoints = (key: 'front' | 'top' | 'side') => {
    const sil = processedSilhouettes[key];
    if (!sil || !sil.contours) return;
    const simplified: [number, number][][] = sil.contours.map(loop => {
      if (loop.length <= 8) return loop;
      return loop.filter((_, idx) => idx % 2 === 0);
    });
    commitManualContours(key, simplified);
    setSelectedPoint(null);
  };

  const handleDeleteSelectedPoint = (key: 'front' | 'top' | 'side') => {
    if (!selectedPoint) return;
    const sil = processedSilhouettes[key];
    if (!sil || !sil.contours) return;
    const updated: [number, number][][] = sil.contours.map((loop, lIdx) => {
      if (lIdx !== selectedPoint.loopIdx || loop.length <= 3) return loop;
      return loop.filter((_, pIdx) => pIdx !== selectedPoint.ptIdx);
    });
    setSelectedPoint(null);
    commitManualContours(key, updated);
  };

  const handleCanvasWheel = (key: 'front' | 'top' | 'side', e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
    handleZoom(key, zoomDelta);
  };

  // ── Restablecer Puntos Manuales al Cálculo Automático ──
  const handleResetManualPoints = (key: 'front' | 'top' | 'side') => {
    const imgData = rawImages[key];
    const newCfg = {
      ...viewConfigs[key],
      manualControlPoints: null
    };

    setViewConfigs(prev => ({
      ...prev,
      [key]: newCfg
    }));

    if (imgData) {
      const autoSil = processSilhouette(imgData, newCfg);
      setProcessedSilhouettes(prev => ({
        ...prev,
        [key]: autoSil
      }));
    }

    setSelectedPoint(null);
    setHoveredPoint(null);
  };

  // ── Auto-Ajustar Silueta con Análisis Inteligente ──
  const handleAutoCalibrate = (key: 'front' | 'top' | 'side') => {
    const imgData = rawImages[key];
    if (!imgData) return;
    const analysis = analyzeImageCharacteristics(imgData);
    setViewConfigs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        detectionMode: analysis.suggestedMode,
        threshold: analysis.suggestedThreshold,
        fillInterior: analysis.suggestedMode === 'LINE_ART',
        customBgColor: analysis.bgColor,
        invert: false,
        dilation: 1,
        denoiseIslandSize: 15,
        thinFeatureBoost: 45,
        manualControlPoints: null
      }
    }));
    setSelectedPoint(null);
    setHoveredPoint(null);
  };

  // ── Transformaciones Rápidas (Espejo y Rotación) ──
  const toggleFlipH = (key: 'front' | 'top' | 'side') => {
    setViewConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], flipH: !prev[key].flipH }
    }));
  };

  const toggleFlipV = (key: 'front' | 'top' | 'side') => {
    setViewConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], flipV: !prev[key].flipV }
    }));
  };

  const rotate90 = (key: 'front' | 'top' | 'side') => {
    setViewConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], rotation: ((prev[key].rotation || 0) + 90) % 360 }
    }));
  };

  // ── Manejador de Clic en Canvas para Cuentagotas y Selector de Huecos ──
  const handleCanvasClick = (key: 'front' | 'top' | 'side', e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEyedropperActive) {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const imgData = rawImages[key];
      if (!imgData) return;

      const scaleX = imgData.width / rect.width;
      const scaleY = imgData.height / rect.height;

      const px = Math.min(imgData.width - 1, Math.max(0, Math.floor(clickX * scaleX)));
      const py = Math.min(imgData.height - 1, Math.max(0, Math.floor(clickY * scaleY)));

      const idx = (py * imgData.width + px) * 4;
      const r = imgData.data[idx];
      const g = imgData.data[idx + 1];
      const b = imgData.data[idx + 2];

      setViewConfigs(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          customBgColor: [r, g, b]
        }
      }));
      setIsEyedropperActive(false);
      return;
    }

    if (isHolePickerActive) {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const transform = viewTransforms[key];
      const zoom = transform.zoom || 1;
      const panX = transform.panX || 0;
      const panY = transform.panY || 0;

      const normX = Math.max(0, Math.min(1, (clickX - panX) / (rect.width * zoom)));
      const normY = Math.max(0, Math.min(1, (clickY - panY) / (rect.height * zoom)));

      const currentSeeds = viewConfigs[key].holeSeeds || [];
      const updatedSeeds: [number, number][] = [...currentSeeds, [normX, normY]];

      setViewConfigs(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          holeSeeds: updatedSeeds
        }
      }));
      return;
    }
  };

  const handleClearHoleSeeds = (key: 'front' | 'top' | 'side') => {
    setViewConfigs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        holeSeeds: []
      }
    }));
  };

  // ── Inicializar Escena Three.js para Mini-Visor 3D ──
  useEffect(() => {
    if (!isOpen || !threeMountRef.current) return;

    const container = threeMountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(3.8, 2.6, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Luces de Estudio PBR
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(6, 10, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 1.0);
    dirLight2.position.set(-6, -3, -5);
    scene.add(dirLight2);

    // Rejilla de Suelo
    const grid = new THREE.GridHelper(8, 16, 0x4f46e5, 0x27272a);
    grid.position.y = -dimensions[1] / 2;
    scene.add(grid);

    // Caja Bounding Cage
    const cageGeo = new THREE.BoxGeometry(dimensions[0], dimensions[1], dimensions[2]);
    const cageEdges = new THREE.EdgesGeometry(cageGeo);
    const cageMat = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.5 });
    const cage = new THREE.LineSegments(cageEdges, cageMat);
    scene.add(cage);
    previewCageRef.current = cage;

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [isOpen]);

  // ── Actualizar Previsualización 3D al cambiar datos ──
  const update3DPreview = async () => {
    if (!isOpen || !sceneRef.current) return;

    const hasAnyImage = !!(viewConfigs.front.url || viewConfigs.top.url || viewConfigs.side.url);
    if (!hasAnyImage) {
      if (previewMeshRef.current) {
        sceneRef.current.remove(previewMeshRef.current);
        previewMeshRef.current = null;
      }
      setPreviewStats({ vertices: 0, triangles: 0 });
      setStatusMsg('Carga al menos 1 o 2 bocetos ortográficos');
      return;
    }

    setIsGenerating(true);
    setStatusMsg('Tallando volumen 3D...');

    try {
      const meshData = await carveModelFromBlueprints({
        mode: engineMode,
        resolution: resolution,
        dimensions: dimensions,
        smoothIterations: smoothIterations,
        smoothFactor: smoothFactor,
        views: viewConfigs
      });

      if (meshData && sceneRef.current) {
        if (previewMeshRef.current) {
          sceneRef.current.remove(previewMeshRef.current);
          previewMeshRef.current.geometry.dispose();
        }

        // Determinar modo de mapeo UV y material a previsualizar
        const isAtlasActive = applyPBRMaterialToCarve && textureTargetMode === 'atlas' && !!atlasPBRMaterial;
        const activeViewGenerated = applyPBRMaterialToCarve && textureTargetMode === 'view'
          ? (generatedPBRMaterials[selectedPBRViewKey] || generatedPBRMaterials[activeTab])
          : null;

        const boundsMap = {
          front: processedSilhouettes.front?.boundsNormalized,
          top: processedSilhouettes.top?.boundsNormalized,
          side: processedSilhouettes.side?.boundsNormalized
        };

        // Generar coordenadas UV precisas:
        // - Si está activo el Atlas Multi-Vista: mapea cada cara según su orientación (Frontal, Lateral, Superior) al cuadrante exacto del Atlas con escalado y compensación
        // - Si está en modo vista individual: proyecta ortográficamente sobre esa vista con soporte de offset, escala y espejo
        let uvMesh;
        if (isAtlasActive) {
          uvMesh = generateMultiViewAtlasUVs(
            meshData,
            atlasPBRResult?.activeViews || ['side', 'top', 'front'],
            dimensions,
            viewConfigs,
            boundsMap
          );
        } else {
          const targetViewKey = selectedPBRViewKey || activeTab;
          const viewCfg = viewConfigs[targetViewKey];
          const bNorm = boundsMap[targetViewKey];
          uvMesh = generateBlueprintUVs(meshData, targetViewKey, dimensions, viewCfg, bNorm);
        }

        const geo = new THREE.BufferGeometry();
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const vertMap = new Map<string, number>();

        uvMesh.faces.forEach(face => {
          if (!face.indices || face.indices.length < 3) return;
          const faceVertIndices: number[] = [];

          face.indices.forEach((posIdx, i) => {
            const uv = face.uvs?.[i] || [0.5, 0.5];
            const key = `${posIdx}_${uv[0].toFixed(4)}_${uv[1].toFixed(4)}`;
            if (vertMap.has(key)) {
              faceVertIndices.push(vertMap.get(key)!);
            } else {
              const newIdx = positions.length / 3;
              const v = uvMesh.vertices[posIdx] || [0, 0, 0];
              positions.push(v[0], v[1], v[2]);
              uvs.push(uv[0], uv[1]);
              vertMap.set(key, newIdx);
              faceVertIndices.push(newIdx);
            }
          });

          if (faceVertIndices.length === 3) {
            indices.push(faceVertIndices[0], faceVertIndices[1], faceVertIndices[2]);
          } else if (faceVertIndices.length === 4) {
            indices.push(faceVertIndices[0], faceVertIndices[1], faceVertIndices[2]);
            indices.push(faceVertIndices[0], faceVertIndices[2], faceVertIndices[3]);
          } else {
            for (let i = 1; i < faceVertIndices.length - 1; i++) {
              indices.push(faceVertIndices[0], faceVertIndices[i], faceVertIndices[i + 1]);
            }
          }
        });

        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));
        if (indices.length > 0) {
          geo.setIndex(indices);
        }
        geo.computeVertexNormals();

        // Configurar material PBR (Atlas Multi-Vista o Vista Individual)
        let mat: THREE.Material;
        const activeMaterial = isAtlasActive ? atlasPBRMaterial : activeViewGenerated?.material;

        if (activeMaterial) {
          const m = activeMaterial;
          const texLoader = new THREE.TextureLoader();
          const pbrMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: m.roughness ?? 0.45,
            metalness: m.metalness ?? 0.08,
            side: THREE.DoubleSide
          });

          if (m.map) {
            const tex = texLoader.load(m.map, () => {
              pbrMat.needsUpdate = true;
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            pbrMat.map = tex;
          }
          if (m.normalMap) {
            const nTex = texLoader.load(m.normalMap, () => {
              pbrMat.needsUpdate = true;
            });
            pbrMat.normalMap = nTex;
            pbrMat.normalScale = new THREE.Vector2(1, 1);
          }
          if (m.roughnessMap) {
            const rTex = texLoader.load(m.roughnessMap, () => {
              pbrMat.needsUpdate = true;
            });
            pbrMat.roughnessMap = rTex;
          }
          if (m.aoMap) {
            const aoTex = texLoader.load(m.aoMap, () => {
              pbrMat.needsUpdate = true;
            });
            pbrMat.aoMap = aoTex;
            pbrMat.aoMapIntensity = 1.0;
          }
          pbrMat.needsUpdate = true;
          mat = pbrMat;
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: 0x4f46e5,
            roughness: 0.22,
            metalness: 0.18,
            side: THREE.DoubleSide
          });
        }

        const newMesh = new THREE.Mesh(geo, mat);
        sceneRef.current.add(newMesh);
        previewMeshRef.current = newMesh;

        const triCount = indices.length > 0 ? indices.length / 3 : meshData.vertices.length / 3;
        setPreviewStats({ vertices: meshData.vertices.length, triangles: Math.round(triCount) });
        setStatusMsg('✓ Modelo 3D reconstruido con éxito');
      }
    } catch (err: any) {
      console.warn('Error actualizando previsualización 3D:', err);
      setStatusMsg(err?.message || 'Alineación de siluetas no detectada');
    } finally {
      setIsGenerating(false);
    }
  };

  // Re-computar previsualización cuando cambian siluetas o parámetros
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      update3DPreview();
    }, 200);
    return () => clearTimeout(timer);
  }, [
    isOpen,
    processedSilhouettes,
    engineMode,
    resolution,
    dimensions,
    smoothIterations,
    smoothFactor,
    generatedPBRMaterials,
    selectedPBRViewKey,
    applyPBRMaterialToCarve,
    textureTargetMode,
    atlasPBRMaterial
  ]);

  // ── Generar Material y Mapas PBR para una Vista Individual ──
  const handleGeneratePBRFromBlueprint = async (viewKey: 'front' | 'top' | 'side') => {
    const cfg = viewConfigs[viewKey];
    if (!cfg.url) {
      setStatusMsg('Carga primero una imagen en esta vista para generar los mapas PBR');
      return;
    }
    setIsGeneratingPBR(true);
    const viewName = viewKey === 'front' ? 'Frontal' : viewKey === 'top' ? 'Superior' : 'Lateral';
    setStatusMsg(`⚡ Extrayendo mapas Normal, Bump, Rugosidad y AO de la imagen (${viewName})...`);

    try {
      const vData = await prepareViewPBRData(cfg.url, cfg, pbrNormalStrength);
      if (!vData) throw new Error('No se pudo procesar la imagen de la vista');

      const updatedViewDataMap = {
        ...viewPBRDataMap,
        [viewKey]: vData
      };
      setViewPBRDataMap(updatedViewDataMap);

      const newMatId = 'mat_pbr_' + Math.random().toString(36).substr(2, 9);
      const newMaterial: MaterialData = {
        id: newMatId,
        name: `Material PBR - Boceto ${viewName}`,
        category: 'imported',
        color: '#ffffff',
        roughness: 0.45,
        metalness: 0.08,
        emissive: '#000000',
        emissiveIntensity: 0,
        map: vData.alignedImageUrl,
        normalMap: vData.pbrSet.normalMap,
        displacementMap: vData.pbrSet.displacementMap,
        displacementScale: 0.05,
        roughnessMap: vData.pbrSet.roughnessMap,
        aoMap: vData.pbrSet.aoMap,
        aoMapIntensity: 1.0,
        metalnessMap: vData.pbrSet.metalnessMap,
        normalScale: 1.0,
        mapRepeat: [1, 1],
        mapOffset: [0, 0],
        mapRotation: 0,
        opacity: 1,
        transparent: false,
        useORM: false,
        uvwMapping: 'UV',
      };

      // Añadir a la biblioteca de materiales
      useStore.getState().addMaterial(newMaterial);

      setGeneratedPBRMaterials(prev => ({
        ...prev,
        [viewKey]: {
          materialId: newMatId,
          material: newMaterial,
          pbrSet: vData.pbrSet
        }
      }));
      setSelectedPBRViewKey(viewKey);
      setApplyPBRMaterialToCarve(true);

      // Si hay más de una vista con imagen cargada, crear o actualizar automáticamente el Atlas Multi-Vista
      const loadedKeys = (['front', 'top', 'side'] as const).filter(k => !!viewConfigs[k].url);
      if (loadedKeys.length > 1) {
        setStatusMsg(`🎨 Combinando ${loadedKeys.length} vistas en el Atlas Multi-Vista PBR...`);
        
        // Preparar las que falten
        for (const k of loadedKeys) {
          if (!updatedViewDataMap[k] && viewConfigs[k].url) {
            const data = await prepareViewPBRData(viewConfigs[k].url!, viewConfigs[k], pbrNormalStrength);
            if (data) updatedViewDataMap[k] = data;
          }
        }
        setViewPBRDataMap(updatedViewDataMap);

        const atlasRes = await buildUnifiedMultiViewPBRAtlas(updatedViewDataMap, 2048);
        if (atlasRes) {
          const atlasMat: MaterialData = {
            id: atlasRes.materialId,
            name: atlasRes.materialName,
            category: 'imported',
            color: '#ffffff',
            roughness: 0.45,
            metalness: 0.08,
            emissive: '#000000',
            emissiveIntensity: 0,
            map: atlasRes.albedoAtlasUrl,
            normalMap: atlasRes.normalAtlasUrl,
            displacementMap: atlasRes.displacementAtlasUrl,
            displacementScale: 0.05,
            roughnessMap: atlasRes.roughnessAtlasUrl,
            aoMap: atlasRes.aoAtlasUrl,
            aoMapIntensity: 1.0,
            metalnessMap: atlasRes.metalnessAtlasUrl,
            normalScale: 1.0,
            mapRepeat: [1, 1],
            mapOffset: [0, 0],
            mapRotation: 0,
            opacity: 1,
            transparent: false,
            useORM: false,
            uvwMapping: 'UV',
          };
          useStore.getState().addMaterial(atlasMat);
          setAtlasPBRResult(atlasRes);
          setAtlasPBRMaterial(atlasMat);
          setTextureTargetMode('atlas');
        }
      }

      setStatusMsg(`✓ Material PBR guardado y Atlas actualizado con éxito`);
      setTimeout(() => {
        update3DPreview();
      }, 100);
    } catch (err: any) {
      console.error('Error generando mapas PBR:', err);
      setStatusMsg('Error al extraer los mapas PBR desde la imagen');
    } finally {
      setIsGeneratingPBR(false);
    }
  };

  // ── Generar o Re-construir el Atlas Multi-Vista PBR Directamente ──
  const handleGenerateUnifiedAtlasPBR = async () => {
    const loadedKeys = (['front', 'top', 'side'] as const).filter(k => !!viewConfigs[k].url);
    if (loadedKeys.length === 0) {
      setStatusMsg('Carga primero al menos 1 o más vistas con bocetos');
      return;
    }

    setIsGeneratingPBR(true);
    setStatusMsg(`🎨 Sintetizando mapas PBR y horneando Atlas Multi-Vista (${loadedKeys.length} vistas)...`);

    try {
      const updatedViewDataMap = { ...viewPBRDataMap };

      for (const k of loadedKeys) {
        if (!updatedViewDataMap[k] || !updatedViewDataMap[k]?.alignedImageUrl) {
          const vData = await prepareViewPBRData(viewConfigs[k].url!, viewConfigs[k], pbrNormalStrength);
          if (vData) {
            updatedViewDataMap[k] = vData;
            
            // También crear material individual
            const vName = k === 'front' ? 'Frontal' : k === 'top' ? 'Superior' : 'Lateral';
            const newMatId = 'mat_pbr_' + Math.random().toString(36).substr(2, 9);
            const newMaterial: MaterialData = {
              id: newMatId,
              name: `Material PBR - Boceto ${vName}`,
              category: 'imported',
              color: '#ffffff',
              roughness: 0.45,
              metalness: 0.08,
              emissive: '#000000',
              emissiveIntensity: 0,
              map: vData.alignedImageUrl,
              normalMap: vData.pbrSet.normalMap,
              displacementMap: vData.pbrSet.displacementMap,
              displacementScale: 0.05,
              roughnessMap: vData.pbrSet.roughnessMap,
              aoMap: vData.pbrSet.aoMap,
              aoMapIntensity: 1.0,
              metalnessMap: vData.pbrSet.metalnessMap,
              normalScale: 1.0,
              mapRepeat: [1, 1],
              mapOffset: [0, 0],
              mapRotation: 0,
              opacity: 1,
              transparent: false,
              useORM: false,
              uvwMapping: 'UV',
            };
            useStore.getState().addMaterial(newMaterial);
            setGeneratedPBRMaterials(prev => ({
              ...prev,
              [k]: { materialId: newMatId, material: newMaterial, pbrSet: vData.pbrSet }
            }));
          }
        }
      }

      setViewPBRDataMap(updatedViewDataMap);

      const atlasRes = await buildUnifiedMultiViewPBRAtlas(updatedViewDataMap, 2048);
      if (!atlasRes) throw new Error('No se pudo generar el Atlas Multi-Vista');

      const atlasMat: MaterialData = {
        id: atlasRes.materialId,
        name: atlasRes.materialName,
        category: 'imported',
        color: '#ffffff',
        roughness: 0.45,
        metalness: 0.08,
        emissive: '#000000',
        emissiveIntensity: 0,
        map: atlasRes.albedoAtlasUrl,
        normalMap: atlasRes.normalAtlasUrl,
        displacementMap: atlasRes.displacementAtlasUrl,
        displacementScale: 0.05,
        roughnessMap: atlasRes.roughnessAtlasUrl,
        aoMap: atlasRes.aoAtlasUrl,
        aoMapIntensity: 1.0,
        metalnessMap: atlasRes.metalnessAtlasUrl,
        normalScale: 1.0,
        mapRepeat: [1, 1],
        mapOffset: [0, 0],
        mapRotation: 0,
        opacity: 1,
        transparent: false,
        useORM: false,
        uvwMapping: 'UV',
      };

      useStore.getState().addMaterial(atlasMat);
      setAtlasPBRResult(atlasRes);
      setAtlasPBRMaterial(atlasMat);
      setTextureTargetMode('atlas');
      setApplyPBRMaterialToCarve(true);

      setStatusMsg(`✓ Atlas Multi-Vista PBR horneado con éxito (${atlasRes.activeViews.length} vistas combinadas)`);
      setTimeout(() => {
        update3DPreview();
      }, 100);
    } catch (err: any) {
      console.error('Error horneando Atlas PBR:', err);
      setStatusMsg('Error al generar el Atlas Multi-Vista PBR');
    } finally {
      setIsGeneratingPBR(false);
    }
  };

  // Actualizar Bounding Cage al cambiar dimensiones
  useEffect(() => {
    if (!previewCageRef.current) return;
    previewCageRef.current.geometry.dispose();
    const cageGeo = new THREE.BoxGeometry(dimensions[0], dimensions[1], dimensions[2]);
    previewCageRef.current.geometry = new THREE.EdgesGeometry(cageGeo);
  }, [dimensions]);

  // ── Manejo de subida de archivos ──
  const handleFileUpload = (key: 'front' | 'top' | 'side', file: File) => {
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target?.result as string;
      const imgData = await loadCanvasImageData(url);
      let suggestedMode: BlueprintDetectionMode = 'LINE_ART';
      let suggestedThresh = 45;
      let bgColor: [number, number, number] = [0, 0, 0];

      if (imgData) {
        const analysis = analyzeImageCharacteristics(imgData);
        suggestedMode = analysis.suggestedMode;
        suggestedThresh = analysis.suggestedThreshold;
        bgColor = analysis.bgColor;
      }

      setViewConfigs(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          url,
          detectionMode: suggestedMode,
          threshold: suggestedThresh,
          fillInterior: suggestedMode === 'LINE_ART',
          customBgColor: bgColor,
          dilation: 1,
          invert: false,
          flipH: false,
          flipV: false,
          rotation: 0,
          contrast: 0,
          brightness: 0,
          grayscale: false,
          sharpen: 1,
          denoiseIslandSize: 15,
          thinFeatureBoost: 45
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  // ── Importar directamente de los visores 3D ──
  const importFromViewports = () => {
    const refs = project.references;
    const fUrl = refs?.front?.url ?? null;
    const tUrl = refs?.top?.url ?? null;
    const sUrl = refs?.left?.url ?? refs?.right?.url ?? null;

    if (!fUrl && !tUrl && !sUrl) {
      alert('No se encontraron imágenes de referencia cargadas en los visores. Sube tus imágenes directamente en cada vista con el botón "Cargar Boceto".');
      return;
    }

    setViewConfigs(prev => ({
      front: { ...prev.front, url: fUrl || prev.front.url },
      top:   { ...prev.top, url: tUrl || prev.top.url },
      side:  { ...prev.side, url: sUrl || prev.side.url }
    }));
  };

  // ── Modificar Escala Horizontal/Vertical con soporte de bloqueo de proporción ──
  const handleScaleChange = (key: 'front' | 'top' | 'side', axis: 'x' | 'y' | 'uniform', value: number) => {
    setViewConfigs(prev => {
      const current = prev[key];
      if (axis === 'uniform') {
        return { ...prev, [key]: { ...current, scaleUniform: value } };
      }
      if (current.lockAspectRatio) {
        return { ...prev, [key]: { ...current, scaleX: value, scaleY: value } };
      }
      if (axis === 'x') {
        return { ...prev, [key]: { ...current, scaleX: value } };
      } else {
        return { ...prev, [key]: { ...current, scaleY: value } };
      }
    });
  };

  // ── Restablecer Escala y Desplazamiento ──
  const handleResetScale = (key: 'front' | 'top' | 'side') => {
    setViewConfigs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        scaleX: 1.0,
        scaleY: 1.0,
        scaleUniform: 1.0,
        offsetX: 0,
        offsetY: 0,
        preserveAspectRatio: true,
        lockAspectRatio: true
      }
    }));
  };

  // ── Sincronizar dimensiones 3D de la caja con la proporción de los bocetos ──
  const handleSyncDimensionsWithBlueprints = () => {
    const frontSil = processedSilhouettes.front;
    const sideSil = processedSilhouettes.side;
    const topSil = processedSilhouettes.top;

    let baseH = 2.0; // Altura Y estándar en metros
    let widthX = 2.0;
    let depthZ = 2.0;

    if (frontSil && frontSil.aspect) {
      widthX = safeParseFixed(baseH * frontSil.aspect, 2, 2.0);
    }
    if (sideSil && sideSil.aspect) {
      depthZ = safeParseFixed(baseH * sideSil.aspect, 2, 2.0);
    } else if (topSil && topSil.aspect && frontSil && frontSil.aspect) {
      depthZ = safeParseFixed(widthX / topSil.aspect, 2, 2.0);
    }

    setDimensions([Math.max(0.2, widthX), baseH, Math.max(0.2, depthZ)]);
  };

  // ── Limpiar todas las vistas ──
  const handleClearAll = () => {
    setViewConfigs({
      front: { url: null, enabled: true, threshold: 45, detectionMode: 'LINE_ART', fillInterior: true, customBgColor: null, invert: false, dilation: 1, blurRadius: 1, denoiseIslandSize: 15, thinFeatureBoost: 45, contrast: 0, brightness: 0, grayscale: false, sharpen: 1, flipH: false, flipV: false, rotation: 0 },
      top:   { url: null, enabled: true, threshold: 45, detectionMode: 'LINE_ART', fillInterior: true, customBgColor: null, invert: false, dilation: 1, blurRadius: 1, denoiseIslandSize: 15, thinFeatureBoost: 45, contrast: 0, brightness: 0, grayscale: false, sharpen: 1, flipH: false, flipV: false, rotation: 0 },
      side:  { url: null, enabled: true, threshold: 45, detectionMode: 'LINE_ART', fillInterior: true, customBgColor: null, invert: false, dilation: 1, blurRadius: 1, denoiseIslandSize: 15, thinFeatureBoost: 45, contrast: 0, brightness: 0, grayscale: false, sharpen: 1, flipH: false, flipV: false, rotation: 0 }
    });
  };

  // ── Generar y Añadir a la Escena ──
  const handleCommitToScene = async () => {
    setIsGenerating(true);
    setStatusMsg('Construyendo geometría final...');

    try {
      const result = await carveModelFromBlueprints({
        mode: engineMode,
        resolution: resolution,
        dimensions: dimensions,
        smoothIterations: smoothIterations,
        smoothFactor: smoothFactor,
        views: viewConfigs
      });

      if (!result || result.vertices.length === 0) {
        alert('No se pudo generar la malla. Verifica que las siluetas estén cargadas y alineadas.');
        return;
      }

      const isAtlasActive = applyPBRMaterialToCarve && textureTargetMode === 'atlas' && !!atlasPBRMaterial;
      const activeViewGenerated = applyPBRMaterialToCarve && textureTargetMode === 'view'
        ? (generatedPBRMaterials[selectedPBRViewKey] || generatedPBRMaterials[activeTab] || generatedPBRMaterials.front || generatedPBRMaterials.side || generatedPBRMaterials.top)
        : null;

      const boundsMap = {
        front: processedSilhouettes.front?.boundsNormalized,
        top: processedSilhouettes.top?.boundsNormalized,
        side: processedSilhouettes.side?.boundsNormalized
      };

      let uvMesh;
      let targetMat: MaterialData | undefined = undefined;
      let targetMatId: string | undefined = undefined;

      if (isAtlasActive && atlasPBRMaterial) {
        uvMesh = generateMultiViewAtlasUVs(
          { vertices: result.vertices, faces: result.faces },
          atlasPBRResult?.activeViews || ['side', 'top', 'front'],
          dimensions,
          viewConfigs,
          boundsMap
        );
        targetMat = atlasPBRMaterial;
        targetMatId = atlasPBRMaterial.id;
      } else if (activeViewGenerated && activeViewGenerated.material) {
        const targetViewKey = selectedPBRViewKey || activeTab;
        const viewCfg = viewConfigs[targetViewKey];
        const bNorm = boundsMap[targetViewKey];
        uvMesh = generateBlueprintUVs(
          { vertices: result.vertices, faces: result.faces },
          targetViewKey,
          dimensions,
          viewCfg,
          bNorm
        );
        targetMat = activeViewGenerated.material;
        targetMatId = activeViewGenerated.materialId;
      } else {
        const targetViewKey = selectedPBRViewKey || activeTab;
        const viewCfg = viewConfigs[targetViewKey];
        const bNorm = boundsMap[targetViewKey];
        uvMesh = generateBlueprintUVs(
          { vertices: result.vertices, faces: result.faces },
          'auto',
          dimensions,
          viewCfg,
          bNorm
        );
      }

      addGenObject(
        uvMesh.vertices,
        uvMesh.faces,
        isAtlasActive ? 'Modelo Tallado (Atlas Multi-Vista PBR)' : 'Modelo Tallado por Bocetos',
        targetMatId,
        targetMat
      );
      onClose();
    } catch (err: any) {
      alert('Error en el tallado: ' + (err?.message || String(err)));
    } finally {
      setIsGenerating(false);
    }
  };

  const loadedCount = (viewConfigs.front.url ? 1 : 0) + (viewConfigs.top.url ? 1 : 0) + (viewConfigs.side.url ? 1 : 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-2">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-[99vw] max-w-[99vw] h-[97vh] max-h-[98vh] flex flex-col overflow-hidden text-zinc-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── HEADER COMPACTO ── */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow shadow-indigo-500/25 shrink-0">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Modelado 3D por Bocetos Ortográficos</h2>
                <span className="px-1.5 py-0.2 rounded bg-indigo-950/80 border border-indigo-700/60 text-[9px] font-bold text-indigo-300">
                  Tallado Volumétrico & Filtros
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-none mt-0.5">
                Alinea y talla volúmenes 3D a partir de tus dibujos o bocetos ortográficos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={importFromViewports}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors shadow-sm cursor-pointer"
              title="Importa las imágenes de referencia asignadas a los visores 3D actuales"
            >
              <Layers size={12} className="text-indigo-400" />
              <span>Importar de Visores 3D</span>
            </button>
            {loadedCount > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-300 text-xs border border-zinc-700 transition-colors cursor-pointer"
                title="Limpiar todas las vistas"
              >
                <RotateCcw size={11} />
                <span>Limpiar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── CUERPO PRINCIPAL ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
          
          {/* COLUMNA IZQUIERDA: GESTIÓN DE LAS 3 VISTAS (7 columnas - AUMENTADO PARA MÁXIMO DETALLE 2D) */}
          <div className="lg:col-span-7 border-r border-zinc-800 flex flex-col bg-zinc-950/40 p-2.5 space-y-2 overflow-y-auto">
            
            {/* Pestañas de las 3 Vistas Ortográficas con Miniatura */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Vistas Ortográficas</span>
                <span className="text-[9px] text-indigo-400 font-semibold">{loadedCount} de 3 Cargadas</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                {(['front', 'top', 'side'] as const).map(key => {
                  const hasImg = !!viewConfigs[key].url;
                  const imgUrl = viewConfigs[key].url;
                  const label = key === 'front' ? '1. Frontal' : key === 'top' ? '2. Superior' : '3. Lateral';
                  const sub = key === 'front' ? 'Alzado (XY)' : key === 'top' ? 'Planta (XZ)' : 'Perfil (ZY)';
                  const color = key === 'front' ? 'text-red-400' : key === 'top' ? 'text-green-400' : 'text-cyan-400';
                  const isActive = activeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex items-center gap-2 p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-left overflow-hidden ${
                        isActive
                          ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-500'
                          : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                      }`}
                    >
                      {/* Miniatura de la imagen cargada */}
                      {hasImg ? (
                        <img 
                          src={imgUrl!} 
                          alt={label}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded object-cover border border-emerald-500/80 shrink-0 bg-black shadow-sm" 
                        />
                      ) : (
                        <div className="w-8 h-8 rounded border border-dashed border-zinc-700 bg-zinc-950 flex items-center justify-center shrink-0 text-zinc-600">
                          <ImageIcon size={14} />
                        </div>
                      )}
                      
                      <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10.5px] leading-tight truncate ${color}`}>{label}</span>
                          {hasImg && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-sm ml-1" />}
                        </div>
                        <span className="text-[8px] text-zinc-500 leading-tight truncate">{sub}</span>
                        <span className={`text-[8px] leading-tight truncate ${hasImg ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}`}>
                          {hasImg ? '✓ Lista' : 'Vacía'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Panel Activo de la Vista Seleccionada */}
            {(['front', 'top', 'side'] as const).map(key => {
              if (activeTab !== key) return null;
              const cfg = viewConfigs[key];
              const viewName = key === 'front' ? 'Vista Frontal (Ejes X / Y)' : key === 'top' ? 'Vista Superior (Ejes X / Z)' : 'Vista Lateral (Ejes Z / Y)';
              const canvasRef = key === 'front' ? canvasFrontRef : key === 'top' ? canvasTopRef : canvasSideRef;
              const silData = processedSilhouettes[key];
              const transform = viewTransforms[key];
              const hasManualPoints = !!(cfg.manualControlPoints && cfg.manualControlPoints.length > 0);

              return (
                <div key={key} className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2.5 space-y-2 shadow-inner flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-white truncate">{viewName}</span>
                      {transform.zoom !== 1 && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 font-mono text-[9px] font-bold">
                          {Math.round(transform.zoom * 100)}% Zoom
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cfg.url && (
                        <>
                          <button
                            onClick={() => {
                              setIsHolePickerActive(!isHolePickerActive);
                              if (isEyedropperActive) setIsEyedropperActive(false);
                            }}
                            className={`px-2 py-1 rounded border text-[9.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                              isHolePickerActive
                                ? 'bg-rose-600 border-rose-400 text-white shadow-rose-500/30 ring-1 ring-rose-300'
                                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                            }`}
                            title="Haz clic en huecos cerrados o zonas entre patas para recortar y vaciar el fondo"
                          >
                            <Scissors size={11} className={isHolePickerActive ? 'text-white' : 'text-rose-400'} />
                            <span>{isHolePickerActive ? 'Vaciando Hueco (Clic)' : 'Vaciar Hueco'}</span>
                          </button>

                          {cfg.holeSeeds && cfg.holeSeeds.length > 0 && (
                            <button
                              onClick={() => handleClearHoleSeeds(key)}
                              className="px-1.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-[9px] font-bold transition-colors cursor-pointer"
                              title="Eliminar todos los puntos de vaciado de huecos colocados manualmente"
                            >
                              Limpiar ({cfg.holeSeeds.length})
                            </button>
                          )}

                          <button
                            onClick={() => setIsEditPointsMode(!isEditPointsMode)}
                            className={`px-2 py-1 rounded border text-[9.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                              isEditPointsMode
                                ? 'bg-sky-600 border-sky-400 text-white shadow-sky-500/30 ring-1 ring-sky-300'
                                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                            }`}
                            title="Haz clic y arrastra los puntos sobre la silueta para ajustarla manualmente"
                          >
                            <MousePointer size={11} className={isEditPointsMode ? 'text-amber-200' : 'text-sky-400'} />
                            <span>{isEditPointsMode ? 'Editando Puntos' : 'Mover Puntos'}</span>
                          </button>

                          {hasManualPoints && (
                            <button
                              onClick={() => handleResetManualPoints(key)}
                              className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 hover:text-amber-200 text-[9px] font-semibold transition-colors cursor-pointer"
                              title="Restablecer puntos manuales al cálculo automático"
                            >
                              Restablecer
                            </button>
                          )}

                          <button
                            onClick={() => handleAutoCalibrate(key)}
                            className="px-2 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 text-[9.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Auto-detectar silueta y color de fondo"
                          >
                            <Wand2 size={10} className="text-indigo-400" />
                            <span>Auto-Calibrar</span>
                          </button>
                        </>
                      )}
                      <label className="cursor-pointer px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition-colors">
                        <Upload size={11} />
                        <span>{cfg.url ? 'Cambiar' : 'Subir Boceto'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(key, f);
                          }}
                        />
                      </label>
                      {cfg.url && (
                        <button
                          onClick={() => setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], url: null, manualControlPoints: null } }))}
                          className="p-1 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 transition-colors cursor-pointer"
                          title="Eliminar imagen"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Previsualización 2D Canvas con Soporte Drag & Drop, Cuentagotas, Zoom y Edición de Puntos */}
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        handleFileUpload(key, file);
                      }
                    }}
                    className="relative h-56 sm:h-64 md:h-72 w-full bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center shadow-inner group flex-shrink-0"
                  >
                    <canvas
                      ref={canvasRef}
                      width={480}
                      height={480}
                      style={{ maxHeight: '100%', maxWidth: '100%', aspectRatio: '1 / 1' }}
                      onClick={e => handleCanvasClick(key, e)}
                      onPointerDown={e => handleCanvasPointerDown(key, e)}
                      onPointerMove={e => handleCanvasPointerMove(key, e)}
                      onPointerUp={e => handleCanvasPointerUp(key, e)}
                      onPointerLeave={e => handleCanvasPointerUp(key, e)}
                      onDoubleClick={e => handleCanvasDoubleClick(key, e)}
                      onContextMenu={e => handleCanvasContextMenu(key, e)}
                      onWheel={e => handleCanvasWheel(key, e)}
                      className={`h-full aspect-square block select-none touch-none ${
                        isEyedropperActive
                          ? 'cursor-crosshair ring-2 ring-amber-400'
                          : isEditPointsMode
                          ? isDraggingPoint ? 'cursor-grabbing' : hoveredPoint ? 'cursor-grab' : 'cursor-crosshair'
                          : isPanningCanvas ? 'cursor-grabbing' : 'cursor-grab'
                      }`}
                    />
                    {!cfg.url && (
                      <label className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-zinc-950/90 cursor-pointer hover:bg-zinc-950/75 transition-colors">
                        <ImageIcon size={32} className="text-zinc-600 mb-1 group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
                        <p className="text-xs font-bold text-zinc-200">Arrastra o haz clic para subir boceto</p>
                        <p className="text-[9.5px] text-zinc-500 mt-0.5">Soporta imágenes claras/oscuras, dibujos o wireframes</p>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(key, f);
                          }}
                        />
                      </label>
                    )}
                    {isEyedropperActive && (
                      <div className="absolute top-2 left-2 bg-amber-950/90 text-amber-200 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-500/80 shadow-lg pointer-events-none animate-pulse">
                        Haz clic en el fondo de la imagen
                      </div>
                    )}

                    {/* Barra de Controles de Zoom 2D y Pan (Flotante) */}
                    {cfg.url && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md p-1 rounded-lg border border-zinc-700/80 shadow-lg z-10">
                        <button
                          onClick={() => handleZoom(key, 0.2)}
                          className="p-1 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Acercar Zoom 2D (+20%)"
                        >
                          <ZoomIn size={13} />
                        </button>
                        <button
                          onClick={() => handleZoom(key, -0.2)}
                          className="p-1 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Alejar Zoom 2D (-20%)"
                        >
                          <ZoomOut size={13} />
                        </button>
                        {(transform.zoom !== 1 || transform.panX !== 0 || transform.panY !== 0) && (
                          <button
                            onClick={() => handleResetZoomPan(key)}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[8.5px] font-bold text-zinc-300 transition-colors cursor-pointer"
                            title="Restablecer Zoom y Posición 2D"
                          >
                            1:1
                          </button>
                        )}
                        <span className="text-[8.5px] font-mono text-zinc-400 px-0.5">
                          {Math.round(transform.zoom * 100)}%
                        </span>
                      </div>
                    )}

                    {/* Barra de Transformaciones Rápidas Flotante sobre el Canvas */}
                    {cfg.url && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-900/85 backdrop-blur-md p-1 rounded-lg border border-zinc-700/80 shadow-lg z-10">
                        <button
                          onClick={() => toggleFlipH(key)}
                          className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                            cfg.flipH ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                          }`}
                          title="Espejo Horizontal (Voltear en X)"
                        >
                          <FlipHorizontal size={12} />
                        </button>
                        <button
                          onClick={() => toggleFlipV(key)}
                          className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                            cfg.flipV ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                          }`}
                          title="Espejo Vertical (Voltear en Y)"
                        >
                          <FlipVertical size={12} />
                        </button>
                        <button
                          onClick={() => rotate90(key)}
                          className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                            cfg.rotation && cfg.rotation !== 0 ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                          }`}
                          title={`Rotar 90° (Actual: ${cfg.rotation || 0}°)`}
                        >
                          <RotateCw size={12} />
                        </button>
                      </div>
                    )}

                    {/* Barra Flotante de Herramientas de Edición de Puntos */}
                    {isEditPointsMode && cfg.url && (
                      <div className="absolute bottom-2 inset-x-2 flex items-center justify-between bg-zinc-950/95 backdrop-blur-md border border-sky-500/60 rounded-lg px-2 py-1 shadow-xl z-10 text-[9px]">
                        <div className="flex items-center gap-1 text-sky-200">
                          <MousePointer size={11} className="text-amber-300 animate-pulse" />
                          <span className="font-semibold hidden sm:inline">Arrastra puntos • Doble clic: añadir • Clic dcho: borrar</span>
                          <span className="font-semibold sm:hidden">Edición activa</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSubdividePoints(key)}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sky-300 font-bold border border-zinc-700 hover:border-sky-500/50 transition-colors cursor-pointer"
                            title="Subdivide los segmentos para tener más puntos y mayor detalle"
                          >
                            + Subdividir
                          </button>
                          <button
                            onClick={() => handleSimplifyPoints(key)}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold border border-zinc-700 hover:border-zinc-600 transition-colors cursor-pointer"
                            title="Reduce los puntos para suavizar y facilitar el moldeado"
                          >
                            - Simplificar
                          </button>
                          {selectedPoint && (
                            <button
                              onClick={() => handleDeleteSelectedPoint(key)}
                              className="px-1.5 py-0.5 rounded bg-red-950/80 hover:bg-red-900 text-red-200 font-bold border border-red-700/60 transition-colors cursor-pointer"
                              title="Elimina el punto actualmente seleccionado"
                            >
                              Eliminar Punto
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Notificación de Píxeles de Ruido Limpiados */}
                    {silData && silData.cleanedPixelsCount > 0 && !isEditPointsMode && (
                      <div className="absolute bottom-1.5 left-1.5 bg-emerald-950/90 text-emerald-200 text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/70 shadow pointer-events-none">
                        ✓ {silData.cleanedPixelsCount} px de ruido eliminados
                      </div>
                    )}
                  </div>

                  {/* Sub-Pestañas de Configuración de la Vista */}
                  {cfg.url && (
                    <div className="space-y-2 pt-1 border-t border-zinc-800/80 flex-shrink-0">
                      <div className="grid grid-cols-5 gap-0.5 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[9px] font-bold">
                        <button
                          onClick={() => setSubSection('detection')}
                          className={`py-0.5 px-0.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-0.5 ${
                            subSection === 'detection' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Extracción y detección de silueta"
                        >
                          <Feather size={9} />
                          <span className="truncate">Silueta</span>
                        </button>
                        <button
                          onClick={() => setSubSection('scale')}
                          className={`py-0.5 px-0.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-0.5 ${
                            subSection === 'scale' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Escala y proporciones"
                        >
                          <Scale size={9} />
                          <span className="truncate">Escala</span>
                        </button>
                        <button
                          onClick={() => setSubSection('filters')}
                          className={`py-0.5 px-0.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-0.5 ${
                            subSection === 'filters' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Filtros de brillo, contraste y nitidez"
                        >
                          <Sun size={9} />
                          <span className="truncate">Filtros</span>
                        </button>
                        <button
                          onClick={() => setSubSection('transform')}
                          className={`py-0.5 px-0.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-0.5 ${
                            subSection === 'transform' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Giro 90°, espejos y B&N"
                        >
                          <SlidersHorizontal size={9} />
                          <span className="truncate">Giro</span>
                        </button>
                        <button
                          onClick={() => setSubSection('pbr')}
                          className={`py-0.5 px-0.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-0.5 relative ${
                            subSection === 'pbr' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Crear textura y mapas PBR (Normal, Bump, Rugosidad, AO) desde esta imagen"
                        >
                          <Palette size={9} className="text-amber-300" />
                          <span className="truncate">PBR</span>
                          {generatedPBRMaterials[key] && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-0.5 right-0.5 ring-1 ring-black" />
                          )}
                        </button>
                      </div>

                      {/* SUBSECCIÓN 1: DETECCIÓN, LIMPIEZA DE RUIDO Y ZONAS FINAS */}
                      {subSection === 'detection' && (
                        <div className="space-y-1.5 animate-in fade-in duration-150 text-[10px]">
                          {/* Selector de Modo de Detección */}
                          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                            <button
                              onClick={() => setViewConfigs(prev => ({
                                ...prev,
                                [key]: { ...prev[key], detectionMode: 'LINE_ART', fillInterior: true }
                              }))}
                              className={`py-0.5 px-1 rounded text-[8.5px] font-bold transition-all cursor-pointer ${
                                cfg.detectionMode === 'LINE_ART' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              ✏️ Líneas
                            </button>
                            <button
                              onClick={() => setViewConfigs(prev => ({
                                ...prev,
                                [key]: { ...prev[key], detectionMode: 'SOLID_COLOR' }
                              }))}
                              className={`py-0.5 px-1 rounded text-[8.5px] font-bold transition-all cursor-pointer ${
                                cfg.detectionMode === 'SOLID_COLOR' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              ⬛ Sólido
                            </button>
                            <button
                              onClick={() => setViewConfigs(prev => ({
                                ...prev,
                                [key]: { ...prev[key], detectionMode: 'TRANSPARENT_ALPHA' }
                              }))}
                              className={`py-0.5 px-1 rounded text-[8.5px] font-bold transition-all cursor-pointer ${
                                cfg.detectionMode === 'TRANSPARENT_ALPHA' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              🪟 Alfa
                            </button>
                          </div>

                          {/* Slider de Umbral / Sensibilidad */}
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between text-[9.5px]">
                              <span className="text-zinc-300">Sensibilidad / Umbral</span>
                              <span className="font-mono text-indigo-300 font-bold">{cfg.threshold}</span>
                            </div>
                            <input
                              type="range"
                              min={5}
                              max={250}
                              value={cfg.threshold}
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], threshold: val } }));
                              }}
                              className="w-full h-1.5 accent-indigo-500 bg-zinc-800 rounded cursor-pointer"
                            />
                          </div>

                          {/* Slider de Zonas Finas y Eliminación de Ruido en 2 Columnas */}
                          <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 p-1.5 rounded-lg border border-zinc-800">
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-zinc-300 truncate">Zonas Finas</span>
                                <span className="font-mono text-amber-300 font-bold">{cfg.thinFeatureBoost ?? 45}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={cfg.thinFeatureBoost ?? 45}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], thinFeatureBoost: val } }));
                                }}
                                className="w-full h-1 accent-amber-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-zinc-300 truncate">Limpiar Ruido</span>
                                <span className="font-mono text-emerald-300 font-bold">{cfg.denoiseIslandSize ?? 15}px</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={80}
                                value={cfg.denoiseIslandSize ?? 15}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], denoiseIslandSize: val } }));
                                }}
                                className="w-full h-1 accent-emerald-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Opciones de Relleno, Huecos y Cuentagotas */}
                          <div className="grid grid-cols-3 gap-1 pt-0.5">
                            <button
                              onClick={() => setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], fillInterior: !prev[key].fillInterior } }))}
                              className={`px-1.5 py-1 rounded border text-[8.5px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 truncate ${
                                cfg.fillInterior ? 'bg-emerald-950 border-emerald-500 text-emerald-200' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750'
                              }`}
                              title="Rellena contornos cerrados para convertirlos en sólidos"
                            >
                              <Check size={9} className={cfg.fillInterior ? 'text-emerald-400' : 'opacity-0'} />
                              <span className="truncate">Rellenar</span>
                            </button>

                            <button
                              onClick={() => setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], autoDetectHoles: !(prev[key].autoDetectHoles !== false) } }))}
                              className={`px-1.5 py-1 rounded border text-[8.5px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 truncate ${
                                cfg.autoDetectHoles !== false ? 'bg-rose-950 border-rose-500 text-rose-200' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750'
                              }`}
                              title="Detecta y vacía automáticamente islas cerradas del color del fondo (como huecos entre patas)"
                            >
                              <Scissors size={9} className={cfg.autoDetectHoles !== false ? 'text-rose-400' : 'text-zinc-500'} />
                              <span className="truncate">Huecos Fondo</span>
                            </button>

                            <button
                              onClick={() => {
                                setIsEyedropperActive(!isEyedropperActive);
                                if (isHolePickerActive) setIsHolePickerActive(false);
                              }}
                              className={`px-1.5 py-1 rounded border text-[8.5px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 truncate ${
                                isEyedropperActive ? 'bg-amber-950 border-amber-500 text-amber-200' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                              }`}
                              title="Haz clic en cualquier punto del fondo en el canvas para seleccionarlo"
                            >
                              <Pipette size={9} className="text-amber-400" />
                              <span className="truncate">Cuentagotas</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* SUBSECCIÓN 2: ESCALA, PROPORCIONES Y ENCUADRE */}
                      {subSection === 'scale' && (
                        <div className="space-y-2 animate-in fade-in duration-150 text-[10px]">
                          {/* Candado de Bloqueo Conjunto de Escala X e Y */}
                          <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800">
                            <div className="flex items-center gap-1.5">
                              {cfg.lockAspectRatio !== false ? (
                                <Lock size={12} className="text-amber-400" />
                              ) : (
                                <Unlock size={12} className="text-zinc-500" />
                              )}
                              <span className="text-[9.5px] font-bold text-zinc-200">
                                {cfg.lockAspectRatio !== false ? 'Escala Conjunta (Bloqueada)' : 'Escala Independiente (Libre)'}
                              </span>
                            </div>
                            <button
                              onClick={() => setViewConfigs(prev => {
                                const currentLocked = prev[key].lockAspectRatio !== false;
                                const newLocked = !currentLocked;
                                return {
                                  ...prev,
                                  [key]: {
                                    ...prev[key],
                                    lockAspectRatio: newLocked,
                                    // Al activar el candado, sincronizar Y con X
                                    ...(newLocked ? { scaleY: prev[key].scaleX ?? 1.0 } : {})
                                  }
                                };
                              })}
                              className={`px-2 py-0.5 rounded text-[8.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                cfg.lockAspectRatio !== false
                                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              }`}
                              title={cfg.lockAspectRatio !== false ? 'Desbloquear para escalar ejes X e Y por separado' : 'Bloquear para escalar ambos ejes conjuntamente'}
                            >
                              {cfg.lockAspectRatio !== false ? <Lock size={10} /> : <Unlock size={10} />}
                              <span>{cfg.lockAspectRatio !== false ? 'BLOQUEADO' : 'LIBRE'}</span>
                            </button>
                          </div>

                          <div className="relative bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                            {/* Indicador visual de candado cuando está bloqueado */}
                            {cfg.lockAspectRatio !== false && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-zinc-900 border border-amber-500/60 text-amber-400 rounded-full p-1 shadow-md pointer-events-none flex items-center justify-center">
                                <Lock size={10} />
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="text-red-300 font-semibold">Escala X</span>
                                  <span className="font-mono text-red-300 font-bold">{Math.round((cfg.scaleX ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0.2}
                                  max={3.0}
                                  step={0.02}
                                  value={cfg.scaleX ?? 1.0}
                                  onChange={e => handleScaleChange(key, 'x', parseFloat(e.target.value))}
                                  className="w-full h-1.5 accent-red-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="text-green-300 font-semibold">Escala Y</span>
                                  <span className="font-mono text-green-300 font-bold">{Math.round((cfg.scaleY ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0.2}
                                  max={3.0}
                                  step={0.02}
                                  value={cfg.scaleY ?? 1.0}
                                  onChange={e => handleScaleChange(key, 'y', parseFloat(e.target.value))}
                                  className="w-full h-1.5 accent-green-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-950/40 border border-zinc-800/80">
                            <span className="text-[9px] text-zinc-400">Ajuste de Lienzo (1:1)</span>
                            <button
                              onClick={() => setViewConfigs(prev => ({
                                ...prev,
                                [key]: { ...prev[key], preserveAspectRatio: !(prev[key].preserveAspectRatio !== false) }
                              }))}
                              className={`px-2 py-0.5 rounded text-[8px] font-semibold transition-all cursor-pointer ${
                                cfg.preserveAspectRatio !== false ? 'bg-emerald-700/80 text-emerald-200' : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {cfg.preserveAspectRatio !== false ? 'Mantener Proporción Real' : 'Ajuste Libre'}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => handleResetScale(key)}
                              className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[9px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <RotateCcw size={10} />
                              <span>Restablecer Escala</span>
                            </button>
                            <button
                              onClick={() => setViewConfigs(prev => ({
                                ...prev,
                                [key]: { ...prev[key], offsetX: 0, offsetY: 0 }
                              }))}
                              className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[9px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Move size={10} />
                              <span>Centrar</span>
                            </button>
                          </div>

                          {/* Control de Grosor 3D / Extrusión del Eje No Proyectado */}
                          {(() => {
                            const perpIdx = key === 'side' ? 0 : key === 'front' ? 2 : 1;
                            const perpName = key === 'side' ? 'Grosor / Anchura 3D (Eje X)' : key === 'front' ? 'Grosor / Profundidad 3D (Eje Z)' : 'Grosor / Altura 3D (Eje Y)';
                            const colorText = key === 'side' ? 'text-red-300' : key === 'front' ? 'text-cyan-300' : 'text-green-300';
                            const accentClass = key === 'side' ? 'accent-red-500' : key === 'front' ? 'accent-cyan-500' : 'accent-green-500';
                            const currentVal = dimensions[perpIdx];

                            return (
                              <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-700/60 space-y-1.5 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Layers size={12} className="text-indigo-400" />
                                    <span className="text-[9.5px] font-bold text-indigo-200">
                                      {perpName}
                                    </span>
                                  </div>
                                  <span className={`font-mono text-[10.5px] font-bold ${colorText}`}>
                                    {currentVal.toFixed(2)} m
                                  </span>
                                </div>

                                <input
                                  type="range"
                                  min={0.05}
                                  max={10.0}
                                  step={0.05}
                                  value={currentVal}
                                  onChange={e => {
                                    const val = Math.max(0.05, parseFloat(e.target.value) || 0.1);
                                    const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                    nextDims[perpIdx] = val;
                                    setDimensions(nextDims);
                                  }}
                                  className={`w-full h-1.5 ${accentClass} bg-zinc-800 rounded cursor-pointer`}
                                />

                                {/* Botones de ajuste rápido de grosor */}
                                <div className="flex items-center justify-between gap-1 pt-0.5">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                        nextDims[perpIdx] = Math.max(0.05, safeParseFixed(nextDims[perpIdx] / 2, 2, 1));
                                        setDimensions(nextDims);
                                      }}
                                      className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[8px] font-bold border border-zinc-700 transition-colors cursor-pointer"
                                      title="Reducir grosor 3D a la mitad (÷2)"
                                    >
                                      ÷2
                                    </button>
                                    <button
                                      onClick={() => {
                                        const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                        nextDims[perpIdx] = Math.min(20, safeParseFixed(nextDims[perpIdx] * 2, 2, 2));
                                        setDimensions(nextDims);
                                      }}
                                      className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[8px] font-bold border border-zinc-700 transition-colors cursor-pointer"
                                      title="Duplicar grosor 3D (×2)"
                                    >
                                      ×2
                                    </button>
                                    <button
                                      onClick={() => {
                                        const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                        nextDims[perpIdx] = Math.max(0.05, safeParseFixed(nextDims[perpIdx] - 0.2, 2, 1));
                                        setDimensions(nextDims);
                                      }}
                                      className="px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[8px] font-bold border border-zinc-700 transition-colors cursor-pointer"
                                      title="Restar 0.2m de grosor"
                                    >
                                      -0.2
                                    </button>
                                    <button
                                      onClick={() => {
                                        const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                        nextDims[perpIdx] = Math.min(20, safeParseFixed(nextDims[perpIdx] + 0.2, 2, 2));
                                        setDimensions(nextDims);
                                      }}
                                      className="px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[8px] font-bold border border-zinc-700 transition-colors cursor-pointer"
                                      title="Sumar 0.2m de grosor"
                                    >
                                      +0.2
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-0.5">
                                    {[0.2, 0.5, 1.0, 2.0, 4.0].map(preset => (
                                      <button
                                        key={preset}
                                        onClick={() => {
                                          const nextDims: [number, number, number] = [dimensions[0], dimensions[1], dimensions[2]];
                                          nextDims[perpIdx] = preset;
                                          setDimensions(nextDims);
                                        }}
                                        className={`px-1 py-0.5 rounded text-[8px] font-mono transition-colors cursor-pointer ${
                                          Math.abs(dimensions[perpIdx] - preset) < 0.05
                                            ? 'bg-indigo-600 text-white font-bold'
                                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                                        }`}
                                        title={`Ajustar grosor a ${preset} metros`}
                                      >
                                        {preset}m
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* SUBSECCIÓN 3: FILTROS DE IMAGEN (CONTRASTE, BRILLO, NITIDEZ) */}
                      {subSection === 'filters' && (
                        <div className="space-y-1.5 animate-in fade-in duration-150 text-[10px]">
                          <div className="grid grid-cols-3 gap-1.5 bg-zinc-950/60 p-1.5 rounded-lg border border-zinc-800">
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[8.5px]">
                                <span className="text-zinc-300">Contraste</span>
                                <span className="font-mono text-indigo-300 font-bold">{cfg.contrast ?? 0}</span>
                              </div>
                              <input
                                type="range"
                                min={-100}
                                max={100}
                                value={cfg.contrast ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], contrast: val } }));
                                }}
                                className="w-full h-1 accent-indigo-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[8.5px]">
                                <span className="text-zinc-300">Brillo</span>
                                <span className="font-mono text-amber-300 font-bold">{cfg.brightness ?? 0}</span>
                              </div>
                              <input
                                type="range"
                                min={-100}
                                max={100}
                                value={cfg.brightness ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], brightness: val } }));
                                }}
                                className="w-full h-1 accent-amber-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[8.5px]">
                                <span className="text-zinc-300">Nitidez</span>
                                <span className="font-mono text-violet-300 font-bold">{cfg.sharpen ?? 1}x</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={5}
                                step={0.5}
                                value={cfg.sharpen ?? 1}
                                onChange={e => {
                                  const val = parseFloat(e.target.value);
                                  setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], sharpen: val } }));
                                }}
                                className="w-full h-1 accent-violet-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => setViewConfigs(prev => ({
                              ...prev,
                              [key]: { ...prev[key], contrast: 0, brightness: 0, sharpen: 1 }
                            }))}
                            className="w-full py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[9px] transition-colors"
                          >
                            Restablecer Filtros
                          </button>
                        </div>
                      )}

                      {/* SUBSECCIÓN 4: TRANSFORMACIONES, BLANCO Y NEGRO Y GROSOR */}
                      {subSection === 'transform' && (
                        <div className="space-y-1.5 animate-in fade-in duration-150 text-[10px]">
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], grayscale: !prev[key].grayscale } }))}
                              className={`px-2 py-1 rounded border text-[9px] font-semibold transition-all cursor-pointer flex items-center justify-between ${
                                cfg.grayscale ? 'bg-indigo-950 border-indigo-500 text-indigo-200' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                              }`}
                            >
                              <span>Blanco y Negro</span>
                              <span className="text-[8.5px] font-bold">{cfg.grayscale ? 'ON' : 'OFF'}</span>
                            </button>

                            <button
                              onClick={() => setViewConfigs(prev => ({ ...prev, [key]: { ...prev[key], invert: !prev[key].invert } }))}
                              className={`px-2 py-1 rounded border text-[9px] font-semibold transition-all cursor-pointer flex items-center justify-between ${
                                cfg.invert ? 'bg-indigo-950 border-indigo-500 text-indigo-200' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                              }`}
                            >
                              <span>Invertir Fondo</span>
                              <span className="text-[8.5px] font-bold">{cfg.invert ? 'INVERT' : 'NORM'}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => toggleFlipH(key)}
                              className={`py-1 px-1 rounded border text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                cfg.flipH ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              <FlipHorizontal size={11} />
                              <span>Espejo H</span>
                            </button>
                            <button
                              onClick={() => toggleFlipV(key)}
                              className={`py-1 px-1 rounded border text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                cfg.flipV ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              <FlipVertical size={11} />
                              <span>Espejo V</span>
                            </button>
                            <button
                              onClick={() => rotate90(key)}
                              className={`py-1 px-1 rounded border text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                cfg.rotation && cfg.rotation !== 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              <RotateCw size={11} />
                              <span>Giro 90°</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* SUBSECCIÓN 5: GENERADOR DE TEXTURA Y MAPAS PBR DESDE EL BOCETO Y ATLAS MULTI-VISTA */}
                      {subSection === 'pbr' && (
                        <div className="space-y-2.5 animate-in fade-in duration-150 text-[10px]">
                          {/* PANEL MAESTRO: ATLAS MULTI-VISTA UNIFICADO (TEXTURA ÚNICA 3D) */}
                          <div className="bg-gradient-to-br from-indigo-950/90 via-zinc-900 to-purple-950/80 p-2.5 rounded-xl border border-indigo-500/50 space-y-2 shadow-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Sparkles size={13} className="text-amber-300 animate-pulse" />
                                <span className="font-bold text-[10.5px] text-white">
                                  Atlas Multi-Vista PBR (Textura Única)
                                </span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-600/80 border border-indigo-400/60 text-indigo-100 text-[8px] font-bold">
                                {loadedCount} Vistas Disponibles
                              </span>
                            </div>

                            <p className="text-[8.5px] text-zinc-300 leading-tight">
                              Crea una <strong className="text-amber-300">textura PBR combinada de 2048x2048</strong> que proyecta automáticamente la vista <strong className="text-white">Frontal</strong>, <strong className="text-white">Superior</strong> y <strong className="text-white">Lateral</strong> en las caras correspondientes sin sobreescribirse al rotar.
                            </p>

                            {/* Botón Principal: Hornear / Actualizar Atlas Multi-Vista */}
                            <button
                              onClick={handleGenerateUnifiedAtlasPBR}
                              disabled={isGeneratingPBR || loadedCount === 0}
                              className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 via-indigo-600 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white font-bold text-[10px] shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                            >
                              <Zap size={13} className="text-amber-200 fill-amber-200" />
                              <span>
                                {isGeneratingPBR
                                  ? 'Horneando Textura Atlas 2048x2048...'
                                  : atlasPBRResult
                                  ? '⚡ Re-Hornear Atlas Multi-Vista PBR'
                                  : '⚡ Generar Textura Única Multi-Vista PBR'}
                              </span>
                            </button>

                            {/* Previsualización del Atlas Generado */}
                            {atlasPBRResult && (
                              <div className="space-y-1.5 pt-1.5 border-t border-indigo-800/60 animate-in fade-in">
                                <div className="flex items-center justify-between text-[8.5px]">
                                  <span className="text-emerald-300 font-bold flex items-center gap-1">
                                    <Check size={11} />
                                    <span>Atlas PBR 2K Listo ({atlasPBRResult.activeViews.join(', ')})</span>
                                  </span>
                                  <span className="text-zinc-400 font-mono text-[8px] truncate">
                                    2048×2048 px
                                  </span>
                                </div>

                                <div className="grid grid-cols-5 gap-1 text-center text-[7.5px]">
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-indigo-400/80 overflow-hidden bg-black shadow">
                                      <img src={atlasPBRResult.albedoAtlasUrl} alt="Atlas Albedo" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 font-semibold block truncate">Albedo</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-indigo-500 overflow-hidden bg-black shadow">
                                      <img src={atlasPBRResult.normalAtlasUrl} alt="Atlas Normal" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-indigo-300 font-bold block truncate">Normal</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-700 overflow-hidden bg-black shadow">
                                      <img src={atlasPBRResult.displacementAtlasUrl} alt="Atlas Bump" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">Bump</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-700 overflow-hidden bg-black shadow">
                                      <img src={atlasPBRResult.roughnessAtlasUrl} alt="Atlas Rugosidad" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">Rugoso</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-700 overflow-hidden bg-black shadow">
                                      <img src={atlasPBRResult.aoAtlasUrl} alt="Atlas AO" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">AO</span>
                                  </div>
                                </div>

                                {/* Selector de Modo de Texturizado Activo */}
                                <div className="flex items-center justify-between pt-1 gap-2">
                                  <button
                                    onClick={() => {
                                      setTextureTargetMode('atlas');
                                      setApplyPBRMaterialToCarve(true);
                                      setTimeout(() => update3DPreview(), 50);
                                    }}
                                    className={`flex-1 py-1 px-2 rounded-lg text-[9px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                      applyPBRMaterialToCarve && textureTargetMode === 'atlas'
                                        ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                    }`}
                                  >
                                    <Eye size={10} />
                                    <span>Ver Atlas en 3D</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SUBPANEL: CALIBRACIÓN Y ALINEACIÓN DE TEXTURA & COORDENADAS UV */}
                          <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-amber-500/40 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <SlidersHorizontal size={12} className="text-amber-400" />
                                <span className="font-bold text-[9.5px] text-amber-200">
                                  Alineación y Calibración UV (Vista {key.toUpperCase()})
                                </span>
                              </div>
                              <button
                                onClick={() => setViewConfigs(prev => ({
                                  ...prev,
                                  [key]: {
                                    ...prev[key],
                                    texOffsetX: 0,
                                    texOffsetY: 0,
                                    texScaleX: 1.0,
                                    texScaleY: 1.0,
                                    texFlipH: false,
                                    texFlipV: false,
                                    texMirrorOpposite: false
                                  }
                                }))}
                                className="text-[8px] text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-0.5"
                                title="Restablecer posición y escala de la textura"
                              >
                                <RotateCcw size={9} />
                                <span>Restablecer</span>
                              </button>
                            </div>

                            <p className="text-[8px] text-zinc-400 leading-tight">
                              Ajusta la posición y escala de la textura sobre la malla 3D para calzarla exactamente con la geometría.
                            </p>

                            {/* Sliders de Posición / Offset Textura X e Y */}
                            <div className="grid grid-cols-2 gap-2 bg-zinc-900/80 p-1.5 rounded-lg border border-zinc-800">
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[8.5px]">
                                  <span className="text-zinc-300">Posición X (Offset)</span>
                                  <span className="font-mono text-amber-300 font-bold">{(cfg.texOffsetX ?? 0).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min={-1.0}
                                  max={1.0}
                                  step={0.01}
                                  value={cfg.texOffsetX ?? 0}
                                  onChange={e => setViewConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], texOffsetX: parseFloat(e.target.value) }
                                  }))}
                                  className="w-full h-1 accent-amber-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[8.5px]">
                                  <span className="text-zinc-300">Posición Y (Offset)</span>
                                  <span className="font-mono text-amber-300 font-bold">{(cfg.texOffsetY ?? 0).toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min={-1.0}
                                  max={1.0}
                                  step={0.01}
                                  value={cfg.texOffsetY ?? 0}
                                  onChange={e => setViewConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], texOffsetY: parseFloat(e.target.value) }
                                  }))}
                                  className="w-full h-1 accent-amber-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                            </div>

                            {/* Sliders de Escala Textura X e Y */}
                            <div className="grid grid-cols-2 gap-2 bg-zinc-900/80 p-1.5 rounded-lg border border-zinc-800">
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[8.5px]">
                                  <span className="text-zinc-300">Escala Textura X</span>
                                  <span className="font-mono text-indigo-300 font-bold">{Math.round((cfg.texScaleX ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0.2}
                                  max={3.0}
                                  step={0.02}
                                  value={cfg.texScaleX ?? 1.0}
                                  onChange={e => setViewConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], texScaleX: parseFloat(e.target.value) }
                                  }))}
                                  className="w-full h-1 accent-indigo-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[8.5px]">
                                  <span className="text-zinc-300">Escala Textura Y</span>
                                  <span className="font-mono text-indigo-300 font-bold">{Math.round((cfg.texScaleY ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0.2}
                                  max={3.0}
                                  step={0.02}
                                  value={cfg.texScaleY ?? 1.0}
                                  onChange={e => setViewConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], texScaleY: parseFloat(e.target.value) }
                                  }))}
                                  className="w-full h-1 accent-indigo-500 bg-zinc-800 rounded cursor-pointer"
                                />
                              </div>
                            </div>

                            {/* Controles de Volteo de Textura, Cara Trasera y Normal Y */}
                            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                              <button
                                onClick={() => setViewConfigs(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], texFlipH: !prev[key].texFlipH }
                                }))}
                                className={`py-1 px-1.5 rounded border text-[8.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                  cfg.texFlipH ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                                }`}
                                title="Invierte horizontalmente la proyección de textura"
                              >
                                <FlipHorizontal size={10} />
                                <span>Voltear Textura H</span>
                              </button>
                              <button
                                onClick={() => setViewConfigs(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], texFlipV: !prev[key].texFlipV }
                                }))}
                                className={`py-1 px-1.5 rounded border text-[8.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                  cfg.texFlipV ? 'bg-amber-600 border-amber-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                                }`}
                                title="Invierte verticalmente la proyección de textura"
                              >
                                <FlipVertical size={10} />
                                <span>Voltear Textura V</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => setViewConfigs(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], texMirrorOpposite: !prev[key].texMirrorOpposite }
                                }))}
                                className={`py-1 px-1.5 rounded border text-[8.5px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                  cfg.texMirrorOpposite ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                                }`}
                                title="Por defecto desactivado para que la cara trasera (espalda) NO se vea invertida"
                              >
                                <span>Espejar Cara Trasera:</span>
                                <span className="font-bold">{cfg.texMirrorOpposite ? 'SÍ' : 'NO'}</span>
                              </button>

                              <button
                                onClick={() => setViewConfigs(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], invertNormalY: !prev[key].invertNormalY }
                                }))}
                                className={`py-1 px-1.5 rounded border text-[8.5px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                  cfg.invertNormalY ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                                }`}
                                title="Invierte el eje verde (Y) del mapa de normales para corregir la iluminación"
                              >
                                <span>Normal Y (DirectX):</span>
                                <span className="font-bold">{cfg.invertNormalY ? 'ON' : 'OFF'}</span>
                              </button>
                            </div>
                          </div>

                          {/* SUBPANEL: MAPAS PBR DE LA VISTA INDIVIDUAL ACTUAL */}
                          <div className="bg-zinc-950/80 p-2 rounded-lg border border-zinc-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[9px] text-zinc-300 flex items-center gap-1">
                                <Palette size={11} className="text-indigo-400" />
                                <span>Textura Individual: Vista {key.toUpperCase()}</span>
                              </span>
                              <span className="text-[8px] text-zinc-500 font-mono">Canal Único</span>
                            </div>

                            {/* Slider de Intensidad de Relieve / Normal Map */}
                            <div className="space-y-0.5 pt-0.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-zinc-300">Intensidad Relieve / Normales</span>
                                <span className="font-mono text-amber-300 font-bold">{pbrNormalStrength.toFixed(1)}x</span>
                              </div>
                              <input
                                type="range"
                                min={0.5}
                                max={6.0}
                                step={0.2}
                                value={pbrNormalStrength}
                                onChange={e => setPbrNormalStrength(parseFloat(e.target.value))}
                                className="w-full h-1.5 accent-amber-500 bg-zinc-800 rounded cursor-pointer"
                              />
                            </div>

                            {/* Botón: Generar Mapas de esta Vista */}
                            <button
                              onClick={() => handleGeneratePBRFromBlueprint(key)}
                              disabled={isGeneratingPBR || !cfg.url}
                              className="w-full py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold text-[9px] shadow-sm flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Zap size={10} className="text-amber-300" />
                              <span>{generatedPBRMaterials[key] ? 'Regenerar Vista ' + key.toUpperCase() : 'Guardar Mapas de Vista ' + key.toUpperCase()}</span>
                            </button>

                            {/* Previsualización de los 5 Canales PBR de esta Vista */}
                            {generatedPBRMaterials[key] && (
                              <div className="space-y-1.5 pt-1.5 border-t border-zinc-800 animate-in fade-in">
                                <div className="grid grid-cols-5 gap-1 text-center text-[7.5px]">
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-700 overflow-hidden bg-black">
                                      <img src={cfg.url} alt="Albedo" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-400 block truncate">Albedo</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-indigo-500/60 overflow-hidden bg-black">
                                      <img src={generatedPBRMaterials[key]?.pbrSet.normalMap} alt="Normal" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-indigo-300 font-bold block truncate">Normal</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-600 overflow-hidden bg-black">
                                      <img src={generatedPBRMaterials[key]?.pbrSet.displacementMap} alt="Bump" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">Bump</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-600 overflow-hidden bg-black">
                                      <img src={generatedPBRMaterials[key]?.pbrSet.roughnessMap} alt="Rugosidad" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">Rugoso</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="aspect-square rounded border border-zinc-600 overflow-hidden bg-black">
                                      <img src={generatedPBRMaterials[key]?.pbrSet.aoMap} alt="AO" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-zinc-300 block truncate">AO</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                  <button
                                    onClick={() => {
                                      setSelectedPBRViewKey(key);
                                      setTextureTargetMode('view');
                                      setApplyPBRMaterialToCarve(true);
                                      setTimeout(() => update3DPreview(), 50);
                                    }}
                                    className="w-full py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[8.5px] text-zinc-300 hover:text-white font-semibold border border-zinc-700 flex items-center justify-center gap-1 cursor-pointer transition-all"
                                  >
                                    <Eye size={10} />
                                    <span>Aplicar Solo Vista {key.toUpperCase()} al 3D</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dimensiones 3D Bounding Box Compacto */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2 space-y-1.5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Dimensiones 3D (Metros)</span>
                <button
                  onClick={handleSyncDimensionsWithBlueprints}
                  className="text-[9px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 px-2 py-0.5 rounded border border-amber-500/60 flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                  title="Ajusta automáticamente las proporciones reales de tus bocetos"
                >
                  <Wand2 size={10} className="text-amber-400" />
                  <span>Sincronizar</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="flex items-center gap-0.5 bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800">
                  <span className="text-[9px] text-red-400 font-bold px-0.5">X:</span>
                  <button
                    onClick={() => setDimensions([Math.max(0.05, safeParseFixed(dimensions[0] - 0.1, 2, 1)), dimensions[1], dimensions[2]])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Restar 0.1m en X"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step={0.1}
                    min={0.05}
                    value={dimensions[0]}
                    onChange={e => {
                      const v = Math.max(0.05, parseFloat(e.target.value) || 1);
                      setDimensions([v, dimensions[1], dimensions[2]]);
                    }}
                    className="w-full bg-transparent text-xs text-white font-mono text-center focus:outline-none"
                  />
                  <button
                    onClick={() => setDimensions([Math.min(20, safeParseFixed(dimensions[0] + 0.1, 2, 1)), dimensions[1], dimensions[2]])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Sumar 0.1m en X"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-0.5 bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800">
                  <span className="text-[9px] text-green-400 font-bold px-0.5">Y:</span>
                  <button
                    onClick={() => setDimensions([dimensions[0], Math.max(0.05, safeParseFixed(dimensions[1] - 0.1, 2, 1)), dimensions[2]])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Restar 0.1m en Y"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step={0.1}
                    min={0.05}
                    value={dimensions[1]}
                    onChange={e => {
                      const v = Math.max(0.05, parseFloat(e.target.value) || 1);
                      setDimensions([dimensions[0], v, dimensions[2]]);
                    }}
                    className="w-full bg-transparent text-xs text-white font-mono text-center focus:outline-none"
                  />
                  <button
                    onClick={() => setDimensions([dimensions[0], Math.min(20, safeParseFixed(dimensions[1] + 0.1, 2, 1)), dimensions[2]])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Sumar 0.1m en Y"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-0.5 bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800">
                  <span className="text-[9px] text-cyan-400 font-bold px-0.5">Z:</span>
                  <button
                    onClick={() => setDimensions([dimensions[0], dimensions[1], Math.max(0.05, safeParseFixed(dimensions[2] - 0.1, 2, 1))])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Restar 0.1m en Z"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step={0.1}
                    min={0.05}
                    value={dimensions[2]}
                    onChange={e => {
                      const v = Math.max(0.05, parseFloat(e.target.value) || 1);
                      setDimensions([dimensions[0], dimensions[1], v]);
                    }}
                    className="w-full bg-transparent text-xs text-white font-mono text-center focus:outline-none"
                  />
                  <button
                    onClick={() => setDimensions([dimensions[0], dimensions[1], Math.min(20, safeParseFixed(dimensions[2] + 0.1, 2, 1))])}
                    className="w-4 h-4 rounded bg-zinc-850 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Sumar 0.1m en Z"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: MINI-VISOR 3D INTERACTIVO & MOTOR (5 columnas) */}
          <div className="lg:col-span-5 flex flex-col bg-zinc-950 relative overflow-hidden">
            
            {/* Barra Superior del Visor 3D: Motores y Calidad */}
            <div className="px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setEngineMode('VISUAL_HULL')}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                    engineMode === 'VISUAL_HULL' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  🧊 Visual Hull
                </button>
                <button
                  onClick={() => setEngineMode('HARD_SURFACE_CSG')}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                    engineMode === 'HARD_SURFACE_CSG' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  📐 CSG Exacto
                </button>
                <button
                  onClick={() => setEngineMode('SMOOTH_SCULPT')}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                    engineMode === 'SMOOTH_SCULPT' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  ✨ Suave
                </button>
              </div>

              <div className="flex items-center gap-2.5 text-[9.5px]">
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400">Resolución:</span>
                  <select
                    value={resolution}
                    onChange={e => setResolution(parseInt(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-1.5 py-0.5 text-[9.5px] font-mono cursor-pointer"
                  >
                    <option value={40}>Rápida (40³)</option>
                    <option value={56}>Media (56³)</option>
                    <option value={72}>Alta (72³)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-zinc-400">Suavizado:</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={smoothIterations}
                    onChange={e => setSmoothIterations(parseInt(e.target.value))}
                    className="w-14 h-1 accent-indigo-500 bg-zinc-800 rounded cursor-pointer"
                  />
                  <span className="text-zinc-300 font-mono">{smoothIterations}x</span>
                </div>

                {/* Selector rápido de Textura 3D */}
                <div className="flex items-center gap-1 pl-1 border-l border-zinc-800">
                  <button
                    onClick={() => {
                      if (!applyPBRMaterialToCarve) {
                        setApplyPBRMaterialToCarve(true);
                        setTextureTargetMode('atlas');
                      } else if (textureTargetMode === 'atlas') {
                        setTextureTargetMode('view');
                      } else {
                        setApplyPBRMaterialToCarve(false);
                      }
                      setTimeout(() => update3DPreview(), 50);
                    }}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      !applyPBRMaterialToCarve
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                        : textureTargetMode === 'atlas'
                        ? 'bg-amber-950/80 border-amber-500/80 text-amber-300 shadow-sm'
                        : 'bg-indigo-950/80 border-indigo-500/80 text-indigo-300 shadow-sm'
                    }`}
                    title="Alternar entre Atlas Multi-Vista, Textura de Vista Individual o Sólido"
                  >
                    <Sparkles size={10} className={applyPBRMaterialToCarve ? 'text-amber-400' : 'text-zinc-500'} />
                    <span>
                      {!applyPBRMaterialToCarve
                        ? 'Sólido'
                        : textureTargetMode === 'atlas'
                        ? 'Atlas 3D'
                        : 'Vista ' + activeTab.toUpperCase()}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Viewport 3D Three.js */}
            <div className="flex-1 relative">
              <div ref={threeMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

              {/* Overlay de Estado y Estadísticas */}
              <div className="absolute top-2.5 left-2.5 bg-zinc-900/85 backdrop-blur border border-zinc-800 px-2 py-1 rounded-lg text-[9.5px] space-y-0.5 pointer-events-none shadow-md">
                <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                  <div className={`w-2 h-2 rounded-full ${loadedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  <span>{statusMsg || 'Carga tus bocetos para iniciar'}</span>
                </div>
                {previewStats.vertices > 0 && (
                  <div className="text-[8.5px] text-zinc-400 font-mono">
                    {previewStats.vertices.toLocaleString()} Vértices • {previewStats.triangles.toLocaleString()} Polígonos
                  </div>
                )}
              </div>

              {/* Indicador de Ayuda de Navegación 3D */}
              <div className="absolute bottom-2.5 right-2.5 bg-zinc-900/75 backdrop-blur border border-zinc-800/80 px-2 py-0.5 rounded text-[8.5px] text-zinc-400 pointer-events-none">
                Arrastra para rotar • Rueda para zoom
              </div>
            </div>

            {/* Footer de Acciones */}
            <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5 text-[9.5px] text-zinc-400">
                <Info size={12} className="text-indigo-400 shrink-0" />
                <span>Geometría 100% editable con CSG, booleanas y modificadores.</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleCommitToScene}
                  disabled={isGenerating || loadedCount === 0}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-500/25 flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-98"
                >
                  <Zap size={13} className="text-amber-300" />
                  <span>Generar y Añadir a la Escena 3D</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
