import { Vector3, Euler } from 'three';

export type V3 = [number, number, number];

export interface MeshFace {
  indices: number[];          // Índices en el array de vértices del objeto
  normal?: V3;                // Normal unitaria (usada para extruir, iluminar)
  uvs?: [number, number][];   // Coordenadas UV por vértice de la cara
  materialIndex?: number;     // Para multi-material
  selected?: boolean;         // Estado de selección de la cara
}

export type CSGOperation  = 'ADD' | 'SUBTRACT' | 'INTERSECT';
export type PrimitiveType =
  | 'CUBE' | 'SPHERE' | 'CYLINDER' | 'CONE'
  | 'TORUS' | 'ICOSAHEDRON' | 'DODECAHEDRON'
  | 'PLANE' | 'CIRCLE' | 'RING';

export interface ShapeParameters {
  segments?:        number;
  radialSegments?:  number;
  tubularSegments?: number;
  radius?:          number;
  tube?:            number;
  detail?:          number;
  innerRadius?:     number;
  outerRadius?:     number;
  thetaSegments?:   number;
  sphereType?:      'UV' | 'ICO';
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
 * Objeto 3D como malla de vértices compartidos.
 * - `vertices` están en espacio LOCAL; `transform` lleva al espacio mundo.
 * - `faces` son polígonos arbitrarios — extruir añade vértices/caras aquí
 *   mismo, nunca crea objetos nuevos → siempre 1 sola pieza unificada.
 * - `vertexOffsets` permite sculpting por vértice encima de la forma base.
 */
export interface CSGObject {
  id:        string;
  name:      string;
  type:      PrimitiveType;
  operation: CSGOperation;
  transform: Transform;
  parameters: ShapeParameters;

  // Topología de malla (fuente de verdad geométrica)
  vertices:       V3[];
  faces:          MeshFace[];
  vertexOffsets?: Record<number, V3>;

  mirrorAxis?: 'none' | 'x' | 'y' | 'z';
  color:    string;
  opacity?: number;
  visible:  boolean;
  keyframes: Keyframe[];
}

export interface ReferenceImage {
  url:      string | null;
  position: V3;
  rotation: V3;
  scale:    V3;
  opacity:  number;
  locked:   boolean;
}

export interface Project {
  name:     string;
  objects:  CSGObject[];
  duration: number;   // segundos
  fps:      number;
  references: {
    top:   ReferenceImage;
    front: ReferenceImage;
    side:  ReferenceImage;
  };
}

export type ViewportType   = 'PERSPECTIVE' | 'TOP' | 'FRONT' | 'SIDE';
export type EditMode       = 'OBJECT' | 'VERTEX' | 'FACE' | 'EDGE';
export type TransformMode  = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
export type ViewMode       = 'SOLID' | 'WIREFRAME';

export interface AppState {
  project:           Project;

  // Selección
  selectedObjectId:  string | null;
  selectedObjectIds: string[];
  selectedVertexIndices: number[];
  selectedFaceIndices:   number[];
  selectedEdgeIndices:   number[];   // pares de índices de vértice

  // Clipboard
  clipboard: CSGObject | null;

  // Playback
  currentTime: number;
  isPlaying:   boolean;

  // Modos
  viewMode:       ViewMode;
  editMode:       EditMode;
  transformMode:  TransformMode;
  transformSpace: TransformSpace;
  showCSG:        boolean;

  // Viewport
  activeViewport:    ViewportType;
  maximizedViewport: ViewportType | null;

  // Historia
  history:      Project[];
  historyIndex: number;
}