import { Vector3, Euler } from 'three';
import { SilhouetteContour } from './utils/silhouettes';

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
  | 'SHAPE' | 'MESH';

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
  roughness: number;
  roughnessMap?: string;
  metalness: number;
  metalnessMap?: string;
  normalMap?: string;
  normalScale?: number;
  displacementMap?: string;
  displacementScale?: number;
  displacementBias?: number;
  aoMap?: string;
  aoMapIntensity?: number;
  emissive: string;
  emissiveMap?: string;
  emissiveIntensity: number;
  opacity: number;
  alphaMap?: string;
  transparent: boolean;
  ior?: number;
  transmission?: number;
  thickness?: number;
  attenuationDistance?: number;
  attenuationColor?: string;
  clearcoat?: number;
  clearcoatRoughness?: number;
  clearcoatNormalMap?: string;
  clearcoatNormalScale?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  specularIntensity?: number;
  specularColor?: string;
  flipY?: boolean;
  uvwMapping?: 'PLANAR' | 'BOX' | 'SPHERICAL' | 'CYLINDRICAL' | 'TRIPLANAR';
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

  // Bézier cúbico: un handle por punto ancla (solo para SHAPE + shapeType=bezier)
  bezierHandles?: BezierHandle[];

  mirrorAxis?: 'none' | 'x' | 'y' | 'z';
  smoothShading?: boolean;
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
export type EditMode       = 'OBJECT' | 'VERTEX' | 'FACE' | 'EDGE';
export type TransformMode  = 'translate' | 'rotate' | 'scale' | 'universal';
export type TransformSpace = 'world' | 'local';
export type ViewMode       = 'SOLID' | 'WIREFRAME' | 'TEXTURED';

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
  isRecording: boolean;
  viewMode:       ViewMode;
  editMode:       EditMode;
  transformMode:  TransformMode;
  transformSpace: TransformSpace;
  drawMode:       'line' | 'rect' | 'bezier' | null;
  drawColor:      string;
  showCSG:        boolean;
  gridSnapEnabled: boolean;
  moveReferenceMode: boolean;
  activeViewport:    ViewportType;
  maximizedViewport: ViewportType | null;
  lastCameraState?:  CameraState;
  viewportCameras:   ViewportCameraState;
  history:      Project[];
  historyIndex: number;
}
