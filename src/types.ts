import { Vector3, Euler } from 'three';
import { SilhouetteContour } from './utils/silhouettes';
import type { NurbsControlPoint, NurbsCurveData, NurbsSurfaceData, NurbsKnotType } from './utils/nurbs';
export type { NurbsControlPoint, NurbsCurveData, NurbsSurfaceData, NurbsKnotType };

export type V3 = [number, number, number];

export interface MeshFace {
  indices: number[];
  normal?: V3;
  uvs?: [number, number][];
  materialIndex?: number;
  selected?: boolean;
}

export type CSGOperation  = 'ADD' | 'SUBTRACT' | 'INTERSECT';
export type PrimitiveType =
  | 'CUBE' | 'SPHERE' | 'CYLINDER' | 'CONE'
  | 'TORUS' | 'ICOSAHEDRON' | 'DODECAHEDRON'
  | 'PYRAMID' | 'PRISM' | 'CAPSULE' | 'TETRAHEDRON' | 'OCTAHEDRON'
  | 'TUBE' | 'WEDGE' | 'HEMISPHERE' | 'ARC' | 'STAR'
  | 'PLANE' | 'CIRCLE' | 'RING'
  | 'SHAPE' | 'MESH'
  | 'VOLUME_CLOUD'
  | 'NURBS_CURVE' | 'NURBS_SURFACE' | 'NURBS_CIRCLE' | 'NURBS_CYLINDER' | 'NURBS_CONE' | 'NURBS_SPHERE' | 'NURBS_TORUS';

export type VolumetricMode = 'cloud' | 'fire' | 'explosion' | 'plasma' | 'smoke' | 'ice';

export interface VolumetricConfig {
  enabled?: boolean;
  mode?: VolumetricMode;   // 'cloud' | 'fire' | 'explosion' | 'plasma' | 'smoke' | 'ice'
  density?: number;        // uCloudDensity (e.g. 1.5)
  lightIntensity?: number; // uLightIntensity (e.g. 1.2)
  scale?: number;         // uCloudScale (e.g. 2.0)
  color?: string;         // uCloudColor (e.g. '#ffffff' or primary flame color)
  secondaryColor?: string; // Secondary flame / gas / ice tint (e.g. '#f59e0b')
  emissiveIntensity?: number; // Self-illumination for fire/plasma (e.g. 2.5)
  threshold?: number;     // uThreshold (smoothstep min cutoff, e.g. 0.4)
  thresholdMax?: number;  // uThresholdMax (smoothstep max, e.g. 0.8)
  absorption?: number;    // uAbsorption (Beer-Lambert attenuation, e.g. 2.0)
  steps?: number;         // Raymarch steps (e.g. 32 to 64)
  shadowSteps?: number;   // Shadow steps (e.g. 6)
  windSpeed?: number;     // Animation drift speed
  windDirection?: [number, number, number]; // Wind vector
  blending?: 'normal' | 'additive'; // Additive blending for fire / plasma
  turbulentFlame?: boolean; // Flame upward turbulence & heat dissipation
}

export interface ShapeParameters {
  segments?:        number;
  radialSegments?:  number;
  tubularSegments?: number;
  radius?:          number;
  tube?:            number;
  detail?:          number;
  innerRadius?:     number;
  outerRadius?:     number;
  arcAngle?:        number; // Degrees (1 to 360)
  starPoints?:      number; // Number of points (puntas)
  height?:          number;
  thetaSegments?:   number;
  sphereType?:      'UV' | 'ICO';
  shapeType?:       'line' | 'rect' | 'bezier' | 'custom';
  closed?:          boolean;

  // NURBS Parametric Data
  nurbsCurve?:      NurbsCurveData;
  nurbsSurface?:    NurbsSurfaceData;
  nurbsResolutionU?: number;
  nurbsResolutionV?: number;
  
  // Extrusion
  extrusionDepth?:  number;
  extrusionAxis?:   'x' | 'y' | 'z';
  profileVertices?: V3[];
  profileBezierHandles?: BezierHandle[];

  // Generation (Advanced)
  genType?:         string;
  genSides?:        number;
  genRadius?:       number;
  genR?:            number;
  genStart?:        number;
  genEnd?:          number;
  genSegs?:         number;
  genFilled?:       boolean;
  genPreset?:       string;
  genH?:            number;
  genProf?:         string;
  genPath?:         string;
  genLen?:          number;
  genS1?:           string;
  genS2?:           string;
  genN?:            number;
  genAxis?:         'x' | 'y' | 'z';
  genAngle?:        number;
  
  // Volumetric Raymarching
  isVolumetric?:    boolean;
  volumetric?:      VolumetricConfig;

  [key: string]:    any;
}

export interface Transform {
  position: V3;
  rotation: V3;
  scale:    V3;
}

export interface Keyframe {
  id:        string;
  time:      number;
  transform: Transform;
}

/**
 * Handle de Bézier cúbico para un punto ancla.
 * - `out`: controla la tangente de SALIDA (hacia el siguiente segmento)
 * - `in`:  controla la tangente de ENTRADA (desde el segmento anterior)
 * - Las posiciones son RELATIVAS al punto ancla (espacio local)
 * - Por defecto son simétricas (smooth). Cuando `broken=true` son independientes.
 */
export interface BezierHandle {
  out:    V3;      // tangente de salida relativa al ancla
  in:     V3;      // tangente de entrada relativa al ancla
  broken: boolean; // true = handles independientes (cusp/corner)
}

export interface MaterialData {
  id: string;
  name: string;
  color: string;
  map?: string; // Albedo
  mapAlbedo?: string;
  roughness: number;
  roughnessMap?: string;
  mapRoughness?: string;
  metalness: number;
  metalnessMap?: string;
  mapMetalness?: string;
  normalMap?: string;
  mapNormal?: string;
  normalScale?: number;
  displacementMap?: string;
  mapDisplacement?: string;
  displacementScale?: number;
  displacementBias?: number;
  aoMap?: string;
  mapAO?: string;
  aoMapIntensity?: number;
  emissive: string;
  emissiveMap?: string;
  mapEmissive?: string;
  emissiveIntensity: number;
  opacity: number;
  alphaMap?: string;
  transparent: boolean;
  ior?: number;
  transmission?: number;
  dispersion?: number;
  thickness?: number;
  attenuationDistance?: number;
  attenuationColor?: string;
  clearcoat?: number;
  clearcoatRoughness?: number;
  clearcoatNormalMap?: string;
  clearcoatNormalScale?: number;
  clearcoatMap?: string;
  clearcoatRoughnessMap?: string;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  sheenColorMap?: string;
  sheenRoughnessMap?: string;
  anisotropy?: number;
  anisotropyRotation?: number;
  anisotropyMap?: string;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  iridescenceMap?: string;
  iridescenceThicknessMap?: string;
  transmissionMap?: string;
  thicknessMap?: string;
  specularIntensity?: number;
  specularColor?: string;
  normalFormat?: 'OPENGL' | 'DIRECTX';
  invertNormalY?: boolean;
  flipY?: boolean;
  category?: string;
  uvwMapping?: 'PLANAR' | 'BOX' | 'SPHERICAL' | 'CYLINDRICAL' | 'TRIPLANAR' | 'UV' | 'SMART_UV' | 'LIGHTMAP';
  triplanarBlend?: number; // 0.0 (Duro) a 1.0 (Difuminado suave en biseles y esquinas)
  uvAngleThreshold?: number; // Ángulo límite de Smart UV (por defecto 66°)
  uvIslandMargin?: number; // Margen de separación entre islas UV (por defecto 0.02)
  uvRelaxIterations?: number; // Pasos de relajación laplaciana contra estiramiento (por defecto 6)
  // ORM Specific Intensities (for custom shader)
  ormIntensityAO?: number;
  ormIntensityRoughness?: number;
  ormIntensityMetalness?: number;
  useORM?: boolean;
  ormMap?: string; // Combined texture
  // Texture transformations
  mapRepeat?: [number, number];
  mapOffset?: [number, number];
  mapRotation?: number;
  parallaxScale?: number;
  parallaxSteps?: number;
  useParallax?: boolean;
  proceduralBaseId?: string;
  uvDebug?: boolean;
  filters?: {
    rust: number;
    scratches: number;
    dirt: number;
  };
  // Porosidad y Micro-relieve superficial (rompe el acabado liso y brillo uniforme)
  porosity?: number | boolean;   // 0.0 (Liso) a 1.0 (Muy poroso/rugoso) o boolean
  porosityStrength?: number;     // Fuerza / Profundidad de microcavidades
  porosityScale?: number;        // Escala/frecuencia espacial de los poros (ej: 4.0 a 60.0)
  porosityRoughness?: number;    // Aumento de rugosidad en poros (matifica y rompe reflejos)
  porosityCavityDepth?: number;  // Profundidad de micro-cavidades / oclusión
  porosityCoverage?: number;     // Cobertura de la distribución porosa (0.1 a 1.0)
  porosityPatchiness?: number;   // Distribución en zonas / parches desiguales (0.0 a 1.0)
  porosityPatchScale?: number;   // Escala de los parches desiguales (0.5 a 15.0)
  porosityMatteBias?: number;    // Opacado / mateado de poros para eliminar brillo plástico (0.0 a 1.0)
  porosityCavityDarkening?: number; // Sombreado / oclusión en fondo de cavidades (0.0 a 0.8)
  isVolumetric?: boolean;
  volumetric?: VolumetricConfig;
  isIce?: boolean;
  iceConfig?: IceShaderConfig;
}

export interface IceShaderConfig {
  enabled?: boolean;
  surfaceWarp?: number;      // Deformación orgánica Voronoi/Perlin de caras (0.0 a 0.25)
  cloudDensity?: number;     // Densidad del núcleo blanco interno Musgrave 3D (0.0 a 3.0)
  cloudColor?: string;       // Color del núcleo nuboso interno (ej: #f0f9ff)
  cloudScale?: number;       // Escala del ruido 3D interno
  frostIntensity?: number;   // Escarcha en bordes/ángulo Fresnel Facing (0.0 a 1.0)
  crackIntensity?: number;   // Grietas de tensión y fracturas internas Voronoi 3D
  porosity?: number;         // Porosidad y micro-rugosidad de superficie glacial (0.0 a 1.0)
  porosityScale?: number;    // Escala de microporos glaciales (ej: 10.0 a 40.0)
}

export type LightType = 'POINT' | 'DIRECTIONAL' | 'SPOT' | 'RECTAREA' | 'AMBIENT';

export interface LightObject {
  id: string;
  name: string;
  type: LightType;
  color: string;
  intensity: number;
  transform: Transform;
  visible: boolean;
  castShadow: boolean;
  // Specific params
  distance?: number; // Point/Spot
  decay?: number;    // Point/Spot
  angle?: number;    // Spot
  penumbra?: number; // Spot
  width?: number;    // RectArea
  height?: number;   // RectArea
}

export interface CSGObject {
  id:        string;
  name:      string;
  type:      PrimitiveType;
  operation: CSGOperation;
  transform: Transform;
  parameters: ShapeParameters;

  // Topología de malla
  vertices:       V3[];
  faces:          MeshFace[];
  vertexOffsets?: Record<number, V3>;
  wireframeEdges?: [number, number][];
  isWireframeOnly?: boolean;

  // Bézier cúbico: un handle por punto ancla (solo para SHAPE + shapeType=bezier)
  bezierHandles?: BezierHandle[];

  // NURBS Parametric Definition
  nurbsCurve?:    NurbsCurveData;
  nurbsSurface?:  NurbsSurfaceData;
  isNurbs?:       boolean;
  selectedNurbsControlPoint?: { u: number; v?: number } | null;
  selectedNurbsControlPoints?: { u: number; v?: number }[];

  mirrorAxis?: 'none' | 'x' | 'y' | 'z';
  smoothShading?: boolean;
  uvDebug?: boolean;
  isVolumetric?: boolean;
  volumetric?: VolumetricConfig;
  color:    string;
  opacity?: number;
  visible:  boolean;
  keyframes: Keyframe[];
  materialId?: string; // Reference to a project material
  material?: Partial<MaterialData>; // Inline overrides
  meshData?: {
    type: 'stl' | 'obj' | 'gltf';
    data: string; // base64 or raw string
    animations?: any[]; // For GLTF animations
    meshes?: { id: string, name: string, vertices: number, faces: number }[]; // For GLTF parts
  };
  stats?: {
    vertices: number;
    faces: number;
  };
}

export interface ReferenceImage {
  url:      string | null;
  position: V3;
  rotation: V3;
  scale:    V3;
  opacity:  number;
  locked:   boolean;
}

export interface CameraObject {
  id: string;
  name: string;
  type: 'PERSPECTIVE' | 'ORTHOGRAPHIC';
  transform: Transform;
  fov: number; // For perspective, this is vertical FOV. For orthographic, it's used as size.
  focalLength?: number; // in mm
  filmGauge?: number; // Sensor size in mm (default 35)
  near: number;
  far: number;
  zoom: number;

  // Seguimiento de Objetivo y Ruta de Cámara
  targetObjectId?: string | null;     // ID del objeto al que la cámara apunta/sigue
  pathObjectId?: string | null;       // ID de la línea o curva por la que se desplaza la cámara
  pathProgress?: number;              // Progreso manual (0.00 a 1.00) en la ruta
  followPathAnimation?: boolean;      // Sincronizar movimiento en la ruta con la línea de tiempo
  cameraOffset?: V3;                  // Desplazamiento opcional respecto a la ruta o al objetivo
  keyframes?: Keyframe[];
}

export interface Project {
  name:     string;
  objects:  CSGObject[];
  lights:   LightObject[];
  cameras:  CameraObject[];
  materials: MaterialData[];
  duration: number;
  fps:      number;
  references: {
    top:    ReferenceImage;
    bottom: ReferenceImage;
    front:  ReferenceImage;
    back:   ReferenceImage;
    left:   ReferenceImage;
    right:  ReferenceImage;
  };
  silueta: SilhouetteState;
  environment: EnvironmentSettings;
  showGrid?: boolean;
}

export type BackgroundMode = 'HDRI' | 'GRADIENT' | 'COLOR' | 'TRANSPARENT';

export interface EnvironmentSettings {
  hdriUrl: string | null;
  backgroundMode?: BackgroundMode;
  backgroundVisible: boolean;
  backgroundColor?: string;
  backgroundBlur?: number;
  backgroundIntensity?: number;
  rotation?: number;
  intensity: number;
  exposure: number;
  maxResolution?: number;
}

export type ViewportType   = 'PERSPECTIVE' | 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
export type ViewportLayoutPreset = 
  | 'QUAD' 
  | 'SINGLE' 
  | 'TOP_1_BOTTOM_2' 
  | 'TOP_2_BOTTOM_1' 
  | 'LEFT_1_RIGHT_2' 
  | 'RIGHT_1_LEFT_2' 
  | 'SPLIT_H' 
  | 'SPLIT_V';

export interface ViewportConfigState {
  preset: ViewportLayoutPreset;
  splitX: number; // 0.15 to 0.85 (default 0.5)
  splitY: number; // 0.15 to 0.85 (default 0.5)
  customResizeMode: boolean;
  snapStep: number; // e.g. 0.1, 0.25, 0.5, 1.0, 2.0, 5.0
}
export type EditMode       = 'OBJECT' | 'VERTEX' | 'FACE' | 'EDGE';
export type TransformMode  = 'translate' | 'rotate' | 'scale' | 'universal';
export type TransformSpace = 'world' | 'local';
export type ViewMode       = 'SOLID' | 'WIREFRAME' | 'TEXTURED' | 'FACES_VERTICES';

export interface SilhouetteState {
  front: SilhouetteContour | null;
  back:  SilhouetteContour | null;
  left:  SilhouetteContour | null;
  right: SilhouetteContour | null;
  top:   SilhouetteContour | null;
  bottom:SilhouetteContour | null;
  frontImage: string | null;
  backImage:  string | null;
  leftImage:  string | null;
  rightImage: string | null;
  topImage:   string | null;
  bottomImage:string | null;
  activePlane: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | null;
}

export interface CameraState {
  position: V3;
  target: V3;
  zoom: number;
}

export interface ViewportCameraState {
  [key: string]: CameraState;
}

export interface MeshProcessingState {
  active: boolean;
  title: string;
  subtitle?: string;
  progress: number;
  objectName?: string;
  vertCount?: number;
  faceCount?: number;
  completed?: boolean;
  finalVertCount?: number;
  finalFaceCount?: number;
}

export interface AppState {
  project:           Project;
  meshProcessing?:   MeshProcessingState | null;
  closeMeshProcessing: () => void;
  selectedObjectId:  string | null;
  selectedLightId?:  string | null;
  selectedCameraId?: string | null;
  selectedObjectIds: string[];
  selectedVertexIndices: number[];
  selectedFaceIndices:   number[];
  selectedEdgeIndices:   number[];
  selectedGLTFMeshes:    string[];
  isolateGLTFSelection:  boolean;
  clipboard: CSGObject | null;
  currentTime: number;
  isPlaying:   boolean;
  isScrubbing?: boolean;
  setIsScrubbing?: (isScrubbing: boolean) => void;
  isRecording: boolean;
  viewMode:       ViewMode;
  editMode:       EditMode;
  transformMode:  TransformMode;
  transformSpace: TransformSpace;
  drawMode:       'line' | 'rect' | 'bezier' | null;
  drawColor:      string;
  orthoDrawMode:  boolean;
  setOrthoDrawMode: (enabled: boolean) => void;
  drawLockAxis:   'FREE' | 'ORTHO_90' | 'X' | 'Y' | 'Z';
  setDrawLockAxis: (axis: 'FREE' | 'ORTHO_90' | 'X' | 'Y' | 'Z') => void;
  insertVertexMode: boolean;
  setInsertVertexMode: (enabled: boolean) => void;
  showCSG:        boolean;
  gridSnapEnabled: boolean;
  moveReferenceMode: boolean;
  activeViewport:    ViewportType;
  maximizedViewport: ViewportType | null;
  lastCameraState?:  CameraState;
  viewportCameras:   ViewportCameraState;
  viewportConfig:    ViewportConfigState;
  setViewportPreset: (preset: ViewportLayoutPreset) => void;
  setViewportSplits: (splitX: number, splitY: number) => void;
  setCustomResizeMode: (active: boolean) => void;
  setSnapStep: (step: number) => void;
  resetViewportSplits: () => void;
  history:      Project[];
  historyIndex: number;
  isMaterialStudioOpen: boolean;
  materialStudioMaterialId: string | null;
  openMaterialStudio: (materialId?: string | null) => void;
  closeMaterialStudio: () => void;
  setMaterialStudioMaterialId: (id: string) => void;
}
