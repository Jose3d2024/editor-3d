import { create } from 'zustand';
import * as THREE from 'three';
import { createORMMap } from '../utils/materialUtils';
import { AppState, Project, CSGObject, CSGOperation, PrimitiveType, ViewportType, ReferenceImage, MeshFace, V3, BezierHandle, SilhouetteState, ViewMode, MaterialData, CameraState, LightType, LightObject, CameraObject, TransformMode } from '../types';
import { generatePrimitive } from '../utils/geometry';
import { createBaseGeometry } from '../utils/csg';
import { applyBooleanOperation, smoothMesh, roundAnglesMesh, subdivideMesh, optimizeMesh, repairMesh, fillHoles, capSelectedFaces } from '../utils/modifiers';
import { simplifyMesh, convertImportedToCSG } from '../utils/modifiers_advanced';
import { getDefaultMaterials } from '../utils/defaultMaterials';

const DEFAULT_CUBE_GEOM = generatePrimitive('CUBE', { segments: 1 });

const DEFAULT_PROJECT: Project = {
  name: 'Nuevo Proyecto',
  objects: [
    {
      id: 'base-cube',
      name: 'Cubo Base',
      type: 'CUBE',
      operation: 'ADD',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parameters: { segments: 1 },
      vertices: DEFAULT_CUBE_GEOM.vertices,
      faces: DEFAULT_CUBE_GEOM.faces,
      vertexOffsets: {},
      color: '#4f46e5',
      opacity: 1,
      visible: true,
      keyframes: [],
    },
  ],
  lights: [
    {
      id: 'default-light',
      name: 'Luz Principal',
      type: 'DIRECTIONAL',
      color: '#ffffff',
      intensity: 1,
      transform: { position: [5, 10, 7.5], rotation: [-Math.PI/4, Math.PI/4, 0], scale: [1, 1, 1] },
      visible: true,
      castShadow: true
    }
  ],
  cameras: [],
  materials: getDefaultMaterials(),
  duration: 5,
  fps: 30,
  references: {
    top:    { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    bottom: { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    front:  { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    back:   { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    left:   { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    right:  { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
  },
  silueta: {
    front: null,
    back:  null,
    left:  null,
    right: null,
    top:   null,
    bottom:null,
    frontImage: null,
    backImage:  null,
    leftImage:  null,
    rightImage: null,
    topImage:   null,
    bottomImage:null,
    activePlane: null,
  },
  environment: {
    hdriUrl: 'https://threejs.org/examples/textures/equirectangular/quarry_01_1k.hdr',
    backgroundMode: 'GRADIENT',
    backgroundVisible: true,
    backgroundColor: '#16171d',
    backgroundBlur: 0,
    backgroundIntensity: 1.0,
    rotation: 0,
    intensity: 1.2,
    exposure: 1.1,
    maxResolution: 2048,
  },
  showGrid: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).substr(2, 9);

const computeNormal = (verts: V3[], indices: number[]): V3 => {
  const v0 = verts[indices[0]], v1 = verts[indices[1]], v2 = verts[indices[2]];
  if (!v0 || !v1 || !v2) return [0, 1, 0];
  const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2];
  const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2];
  const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  return [nx/len, ny/len, nz/len];
};

// ── FIX: Sample a bezier chain into a polyline ─────────────────────────────
// Used by extrudeShape to convert a bezier SHAPE into a polygon before extrusion.
const sampleBezierCurve = (
  verts: V3[],
  handles: BezierHandle[],
  closed: boolean,
  segments: number = 20
): V3[] => {
  if (verts.length < 2) return [...verts];
  const pts: THREE.Vector3[] = [];
  const count = closed ? verts.length : verts.length - 1;

  for (let i = 0; i < count; i++) {
    const i1 = (i + 1) % verts.length;
    const p0  = new THREE.Vector3(...verts[i]);
    const hOut = handles[i]?.out   ?? [0, 0, 0];
    const hIn  = handles[i1]?.in   ?? [0, 0, 0];
    const p1   = p0.clone().add(new THREE.Vector3(...hOut));
    const p3   = new THREE.Vector3(...verts[i1]);
    const p2   = p3.clone().add(new THREE.Vector3(...hIn));
    const segPts = new THREE.CubicBezierCurve3(p0, p1, p2, p3).getPoints(segments);
    if (pts.length > 0) segPts.shift(); // remove duplicate junction
    pts.push(...segPts);
  }

  // Remove closing duplicate
  if (closed && pts.length > 1) {
    if (pts[0].distanceTo(pts[pts.length - 1]) < 0.0001) pts.pop();
  }

  return pts.map(p => [p.x, p.y, p.z] as V3);
};

// ── FIX: Auto-generate smooth bezier handles for zero-handle anchors ───────
// Handles already set manually (non-zero) are preserved.
// This fixes the bug where clicking without dragging produces straight lines.
const autoSmoothBezierHandles = (
  vertices: V3[],
  handles: BezierHandle[],
  closed: boolean
): BezierHandle[] => {
  const isZero = (v: V3) => v[0] === 0 && v[1] === 0 && v[2] === 0;
  const n   = vertices.length;
  const out = handles.map(h => ({
    broken: h.broken,
    out: [...h.out] as V3,
    in:  [...h.in]  as V3,
  }));

  for (let i = 0; i < n; i++) {
    if (!isZero(out[i].out) || !isZero(out[i].in)) continue; // already set

    const curr = vertices[i];

    if (!closed && i === 0) {
      if (n < 2) continue;
      const next = vertices[1];
      const d = Math.sqrt((next[0]-curr[0])**2 + (next[1]-curr[1])**2 + (next[2]-curr[2])**2) || 1;
      const s = d * 0.35;
      out[i].out = [(next[0]-curr[0])/d*s, (next[1]-curr[1])/d*s, (next[2]-curr[2])/d*s];
      out[i].in  = [0, 0, 0];
      continue;
    }
    if (!closed && i === n - 1) {
      if (n < 2) continue;
      const prev = vertices[i - 1];
      const d = Math.sqrt((curr[0]-prev[0])**2 + (curr[1]-prev[1])**2 + (curr[2]-prev[2])**2) || 1;
      const s = d * 0.35;
      out[i].in  = [(prev[0]-curr[0])/d*s, (prev[1]-curr[1])/d*s, (prev[2]-curr[2])/d*s];
      out[i].out = [0, 0, 0];
      continue;
    }

    const pi = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const ni = closed ? (i + 1) % n     : Math.min(n - 1, i + 1);
    const prev = vertices[pi];
    const next = vertices[ni];

    const dx = next[0] - prev[0], dy = next[1] - prev[1], dz = next[2] - prev[2];
    const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    const d1  = Math.sqrt((curr[0]-prev[0])**2 + (curr[1]-prev[1])**2 + (curr[2]-prev[2])**2) || 1;
    const d2  = Math.sqrt((next[0]-curr[0])**2  + (next[1]-curr[1])**2  + (next[2]-curr[2])**2)  || 1;
    const s   = Math.min(d1, d2) * 0.35;

    out[i].out = [ dx/mag*s,  dy/mag*s,  dz/mag*s];
    out[i].in  = [-dx/mag*s, -dy/mag*s, -dz/mag*s];
  }

  return out;
};

// ── Store interface ────────────────────────────────────────────────────────
interface Store extends AppState {
  resetProject: () => void;
  setProject: (project: Project) => void;
  addObject: (type: PrimitiveType | CSGObject) => void;
  addLight: (type: LightType) => void;
  removeLight: (id: string) => void;
  updateLight: (id: string, updates: Partial<LightObject>) => void;
  selectLight: (id: string | null) => void;
  addCamera: (type: 'PERSPECTIVE' | 'ORTHOGRAPHIC') => void;
  removeCamera: (id: string) => void;
  updateCamera: (id: string, updates: Partial<CameraObject>) => void;
  selectCamera: (id: string | null) => void;
  addShape: (type: 'line' | 'rect' | 'bezier', vertices: V3[], closed: boolean, handles?: BezierHandle[]) => void;
  addShapeVertices: (id: string, vertices: V3[], handles: BezierHandle[]) => void;
  updateObject: (id: string, updates: Partial<CSGObject>) => void;
  updateObjects: (ids: string[], updates: Partial<CSGObject> | ((id: string) => Partial<CSGObject>)) => void;
  updateParameters: (id: string, params: Partial<CSGObject['parameters']>) => void;
  updateVertexOffset: (id: string, vertexIndex: number, offset: V3) => void;
  updateVertexOffsets: (id: string, updates: { index: number; offset: V3 }[]) => void;
  updateBezierHandle: (id: string, index: number, side: 'in' | 'out', offset: V3, broken?: boolean) => void;
  removeObject: (id: string) => void;
  removeObjects: (ids: string[]) => void;
  duplicateObject: (id: string) => void;
  moveObjectUp: (id: string) => void;
  moveObjectDown: (id: string) => void;
  selectObject: (id: string | null) => void;
  toggleObjectSelection: (id: string, multi: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsScrubbing: (isScrubbing: boolean) => void;
  setIsRecording: (isRecording: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowCSG: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setGridSnapEnabled: (enabled: boolean) => void;
  setMoveReferenceMode: (enabled: boolean) => void;
  setEditMode: (mode: 'OBJECT' | 'VERTEX' | 'FACE' | 'EDGE') => Promise<void>;
  setTransformMode: (mode: TransformMode) => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  setDrawMode: (mode: 'line' | 'rect' | 'bezier' | null) => void;
  setDrawColor: (color: string) => void;
  setActiveViewport: (viewport: ViewportType) => void;
  setSelectedVertexIndices: (indices: number[]) => void;
  setSelectedFaceIndices: (indices: number[]) => void;
  setSelectedEdgeIndices: (indices: number[]) => void;
  setSelectedGLTFMeshes: (meshes: string[]) => void;
  toggleGLTFMeshSelection: (meshId: string) => void;
  setIsolateGLTFSelection: (isolate: boolean) => void;
  clearSelection: () => void;
  setMaximizedViewport: (viewport: ViewportType | null) => void;
  setViewportCamera: (viewport: string, cameraState: CameraState) => void;
  addSelectedVertexIndices: (indices: number[]) => void;
  expandSelection: () => void;
  addKeyframe: (objectId: string, time: number) => void;
  removeKeyframe: (objectId: string, keyframeId: string) => void;
  clearAllKeyframes: (objectId: string) => void;
  setReference: (view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right', updates: Partial<ReferenceImage>) => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  setSilueta: (patch: Partial<SilhouetteState>) => void;
  updateEnvironment: (updates: Partial<Project['environment']>) => void;
  addMaterial: (material: Omit<MaterialData, 'id'> & { id?: string }) => void;
  updateMaterial: (id: string, updates: Partial<MaterialData>) => void;
  generateORM: (id: string) => Promise<void>;
  removeMaterial: (id: string) => void;
  assignMaterialToObjects: (objectIds: string[], materialId: string | null) => void;
  setLastCameraState: (cameraState: CameraState) => void;

  selectAll: () => void;
  deselectAll: () => void;
  invertSelection: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  mirrorSelected: (axis: 'x' | 'y' | 'z') => void;

  subdivideFaces: (id: string, faceIndices: number[]) => void;
  mergeFaces: (id: string, faceIndices: number[]) => void;

  clipboard: CSGObject | null;
  copyObject: () => void;
  pasteObject: () => void;
  mirrorObject: (id: string, axis: 'x' | 'y' | 'z') => void;
  extrudeFaces: (id: string, faceIndices: number[], distance: number) => void;
  capSelectedFacesObject: (id: string) => Promise<void>;
  extrudeShape: (id: string, depth: number, axis?: 'x' | 'y' | 'z') => void;

  applyBoolean: (op?: CSGOperation) => Promise<void>;
  smoothObject: (id: string, factor: number, iterations?: number) => Promise<void>;
  roundAnglesObject: (id: string, radius?: number, segments?: number, angleThresholdDeg?: number) => Promise<void>;
  subdivideObject: (id: string) => Promise<void>;
  optimizeObject: (id: string, ratio: number, selectedMeshes?: string[]) => Promise<void>;
  offsetObject: (id: string, distance: number) => Promise<void>;
  repairObject: (id: string, tolerance?: number) => Promise<void>;
  weldObject: (id: string, tolerance?: number) => Promise<void>;
  healObject: (id: string) => Promise<void>;
  fillHolesObject: (id: string) => Promise<void>;
  separateLoosePartsObject: (id: string) => Promise<{ success: boolean; message: string; count?: number }>;
  ungroupSelectedObject: (id: string) => Promise<{ success: boolean; message: string; count?: number }>;
  recenterPivotObject: (idInput?: string) => Promise<void>;
  alignToGrid: (id: string) => void;
  alignToGround: (id: string) => void;
}

function solidExtrudeMesh(
  obj: CSGObject,
  depth: number,
  axis: 'x' | 'y' | 'z',
): { vertices: V3[]; faces: MeshFace[] } | null {
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;

  // Bake vertex offsets
  const bottomVerts: V3[] = obj.vertices.map((v, i) => {
    const off = obj.vertexOffsets?.[i] ?? [0, 0, 0];
    return [v[0] + off[0], v[1] + off[1], v[2] + off[2]] as V3;
  });

  const n = bottomVerts.length;
  const sign = depth < 0 ? -1 : 1;

  // Top ring
  const topVerts: V3[] = bottomVerts.map(v => {
    const nv = [...v] as V3;
    nv[axisIdx] += depth;
    return nv;
  });

  const allVerts: V3[] = [...bottomVerts, ...topVerts];
  const faces: MeshFace[] = [];

  // Bottom cap (reverse winding so normal faces −axis)
  obj.faces.forEach(face => {
    faces.push({ indices: [...face.indices].reverse() });
  });

  // Top cap (forward winding so normal faces +axis), indices shifted by n
  obj.faces.forEach(face => {
    faces.push({ indices: face.indices.map(i => i + n) });
  });

  // ── Detect boundary edges ─────────────────────────────────────
  // An edge is a boundary if it appears in exactly one face.
  const edgeInfo = new Map<string, { a: number; b: number; faceOrder: [number, number] }>();

  obj.faces.forEach(face => {
    const m = face.indices.length;
    for (let i = 0; i < m; i++) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % m];
      const fwd = `${a}:${b}`;
      const rev = `${b}:${a}`;
      // If the reversed edge already exists, this is an interior edge — remove it
      if (edgeInfo.has(rev)) {
        edgeInfo.delete(rev);
      } else {
        edgeInfo.set(fwd, { a, b, faceOrder: [a, b] });
      }
    }
  });

  // Add side quads for each boundary edge
  edgeInfo.forEach(({ a, b }) => {
    if (depth >= 0) {
      // Normal extrude direction: winding so normals face outward
      faces.push({ indices: [a, b, b + n, a + n] });
    } else {
      // Negative depth: flip winding
      faces.push({ indices: [a, a + n, b + n, b] });
    }
  });

  return { vertices: allVerts, faces };
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useStore = create<Store>()((set, get) => ({
  project: DEFAULT_PROJECT,
  meshProcessing: null,
  closeMeshProcessing: () => set({ meshProcessing: null }),
  selectedObjectId: null,
  selectedObjectIds: [] as string[],
  currentTime: 0,
  isPlaying: false,
  isScrubbing: false,
  isRecording: false,
  viewMode: 'SOLID',
  showCSG: false,
  gridSnapEnabled: false,
  editMode: 'OBJECT',
  transformMode: 'universal',
  transformSpace: 'world',
  drawMode: null,
  moveReferenceMode: false,
  drawColor: '#ffffff',
  history: [DEFAULT_PROJECT],
  historyIndex: 0,
  activeViewport: 'PERSPECTIVE',
  selectedVertexIndices: [],
  selectedFaceIndices: [],
  selectedEdgeIndices: [],
  selectedGLTFMeshes: [],
  isolateGLTFSelection: false,
  maximizedViewport: null,
  viewportCameras: {},
  clipboard: null,

  resetProject: () => {
    const freshProject: Project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
    set({
      project: freshProject,
      selectedObjectId: null,
      selectedLightId: null,
      selectedCameraId: null,
      selectedVertexIndices: [],
      selectedFaceIndices: [],
      selectedEdgeIndices: [],
      selectedGLTFMeshes: [],
      history: [freshProject],
      historyIndex: 0,
      currentTime: 0,
      isPlaying: false,
    });
  },

  setProject: (project) => {
    const { project: currentProject } = get();
    const mergedProject = { 
      ...DEFAULT_PROJECT, 
      ...project, 
      lights: project.lights || currentProject.lights || DEFAULT_PROJECT.lights,
      cameras: project.cameras || currentProject.cameras || DEFAULT_PROJECT.cameras,
      references: { ...DEFAULT_PROJECT.references, ...(project.references || {}) },
      silueta: { ...DEFAULT_PROJECT.silueta, ...(project.silueta || {}) } 
    };
    set({ project: mergedProject });
  },

  addLight: (type) => {
    const newLight: LightObject = {
      id: genId(),
      name: `Luz ${type} ${get().project.lights.length + 1}`,
      type,
      color: '#ffffff',
      intensity: 1,
      transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      castShadow: true,
      ...(type === 'SPOT' ? { angle: Math.PI / 3, penumbra: 0.1 } : {}),
      ...(type === 'RECTAREA' ? { width: 1, height: 1 } : {}),
    };
    const project = { ...get().project, lights: [...get().project.lights, newLight] };
    set({ project });
    set({ selectedLightId: newLight.id, selectedObjectId: null });
    get().saveHistory();
  },

  removeLight: (id) => {
    const project = { ...get().project, lights: get().project.lights.filter(l => l.id !== id) };
    set({ project });
    if (get().selectedLightId === id) set({ selectedLightId: null });
    get().saveHistory();
  },

  updateLight: (id, updates) => {
    const project = {
      ...get().project,
      lights: get().project.lights.map(l => l.id === id ? { ...l, ...updates } : l)
    };
    set({ project });
  },

  selectLight: (id) => {
    set({ selectedLightId: id, selectedObjectId: id ? null : get().selectedObjectId, selectedCameraId: null });
  },

  addCamera: (type) => {
    const newCamera: CameraObject = {
      id: genId(),
      name: `Cámara ${type === 'PERSPECTIVE' ? 'Perspectiva' : 'Ortográfica'} ${get().project.cameras?.length + 1 || 1}`,
      type,
      transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
      fov: 45,
      near: 0.1,
      far: 100,
      zoom: 1,
    };
    const project = { ...get().project, cameras: [...(get().project.cameras || []), newCamera] };
    set({ project });
    set({ selectedCameraId: newCamera.id, selectedObjectId: null, selectedLightId: null, selectedObjectIds: [] });
    get().saveHistory();
  },

  removeCamera: (id) => {
    const project = { ...get().project, cameras: (get().project.cameras || []).filter(c => c.id !== id) };
    set({ project });
    if (get().selectedCameraId === id) set({ selectedCameraId: null });
    get().saveHistory();
  },

  updateCamera: (id, updates) => {
    const project = { ...get().project, cameras: (get().project.cameras || []).map(c => c.id === id ? { ...c, ...updates } : c) };
    set({ project });
  },

  selectCamera: (id) => {
    set({ selectedCameraId: id, selectedObjectId: null, selectedLightId: null, selectedObjectIds: [] });
  },

  setSilueta: (patch) => set((state) => ({ project: { ...state.project, silueta: { ...state.project.silueta, ...patch } } })),
  updateEnvironment: (updates) => set((state) => ({ project: { ...state.project, environment: { ...state.project.environment, ...updates } } })),

  addMaterial: (material) => {
    const { project } = get();
    const newMaterial = { ...material, id: material.id || genId() } as MaterialData;
    set({ project: { ...project, materials: [...project.materials, newMaterial] } });
    get().saveHistory();
  },

  updateMaterial: (id, updates) => {
    const { project } = get();
    const mat = project.materials.find(m => m.id === id);
    if (!mat) return;

    const newMat = { ...mat, ...updates };
    
    // If any ORM channel changed and useORM is true, we should ideally regenerate.
    // But since createORMMap is async, we'll trigger it separately or handle it here.
    const ormChannelsChanged = 
      'aoMap' in updates || 
      'roughnessMap' in updates || 
      'metalnessMap' in updates;

    set({ project: { ...project, materials: project.materials.map(m => m.id === id ? newMat : m) } });
    
    if (ormChannelsChanged && newMat.useORM) {
      get().generateORM(id);
    }
    
    get().saveHistory();
  },

  generateORM: async (id) => {
    const { project, updateMaterial } = get();
    const mat = project.materials.find(m => m.id === id);
    if (!mat) return;

    const ormUrl = await createORMMap(
      mat.aoMap || null,
      mat.roughnessMap || null,
      mat.metalnessMap || null
    );

    if (ormUrl) {
      // Use set directly to avoid infinite loop if updateMaterial calls generateORM
      set(state => ({
        project: {
          ...state.project,
          materials: state.project.materials.map(m => m.id === id ? { ...m, ormMap: ormUrl } : m)
        }
      }));
    }
  },

  removeMaterial: (id) => {
    const { project } = get();
    set({
      project: {
        ...project,
        materials: project.materials.filter(m => m.id !== id),
        objects: project.objects.map(o => o.materialId === id ? { ...o, materialId: undefined } : o)
      }
    });
    get().saveHistory();
  },

  assignMaterialToObjects: (objectIds, materialId) => {
    const { project } = get();
    set({
      project: {
        ...project,
        objects: project.objects.map(o => objectIds.includes(o.id) ? { ...o, materialId: materialId ?? undefined } : o)
      }
    });
    get().saveHistory();
  },

  selectObject: (id) => set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [], selectedGLTFMeshes: [], selectedCameraId: null, selectedLightId: null }),

  toggleObjectSelection: (id, multi) => {
    const { selectedObjectIds } = get();
    const newIds = multi
      ? selectedObjectIds.includes(id)
        ? selectedObjectIds.filter(i => i !== id)
        : [...selectedObjectIds, id]
      : [id];
    set({ selectedObjectIds: newIds, selectedObjectId: newIds[newIds.length - 1] ?? null, selectedGLTFMeshes: [], selectedCameraId: null, selectedLightId: null });
  },

  setActiveViewport: (viewport) => set({ activeViewport: viewport }),
  setSelectedVertexIndices: (indices) => set({ selectedVertexIndices: indices }),
  setSelectedFaceIndices:   (indices) => set({ selectedFaceIndices: indices }),
  setSelectedEdgeIndices:   (indices) => set({ selectedEdgeIndices: indices }),
  setSelectedGLTFMeshes:    (meshes) => set({ selectedGLTFMeshes: meshes }),
  toggleGLTFMeshSelection: (meshId) => {
    const { selectedGLTFMeshes } = get();
    const newMeshes = selectedGLTFMeshes.includes(meshId)
      ? selectedGLTFMeshes.filter(id => id !== meshId)
      : [...selectedGLTFMeshes, meshId];
    set({ selectedGLTFMeshes: newMeshes });
  },
  setIsolateGLTFSelection: (isolate) => set({ isolateGLTFSelection: isolate }),
  clearSelection: () => set({ 
    selectedVertexIndices: [], 
    selectedFaceIndices: [], 
    selectedEdgeIndices: [], 
    selectedGLTFMeshes: [],
    isolateGLTFSelection: false 
  }),
  setMaximizedViewport: (viewport) => set({ maximizedViewport: viewport }),
  setViewportCamera: (viewport, cameraState) => set((state) => ({
    viewportCameras: { ...state.viewportCameras, [viewport]: cameraState }
  })),
  addSelectedVertexIndices: (indices) => {
    set({ selectedVertexIndices: Array.from(new Set([...get().selectedVertexIndices, ...indices])) });
  },
  expandSelection: () => {
    const { editMode, selectedObjectId, project, selectedVertexIndices, selectedFaceIndices, selectedEdgeIndices } = get();
    if (!selectedObjectId) return;
    const obj = project.objects.find(o => o.id === selectedObjectId);
    if (!obj || !obj.faces) return;

    if (editMode === 'VERTEX') {
      const newIndices = new Set<number>(selectedVertexIndices);
      selectedVertexIndices.forEach(vi => {
        obj.faces.forEach(face => {
          if (face.indices.includes(vi)) {
            face.indices.forEach(idx => newIndices.add(idx));
          }
        });
      });
      set({ selectedVertexIndices: Array.from(newIndices) });
    } else if (editMode === 'FACE') {
      const newIndices = new Set<number>(selectedFaceIndices);
      selectedFaceIndices.forEach(fi => {
        const face = obj.faces[fi];
        obj.faces.forEach((otherFace, ofi) => {
          if (newIndices.has(ofi)) return;
          const shared = otherFace.indices.filter(idx => face.indices.includes(idx));
          if (shared.length >= 2) {
            newIndices.add(ofi);
          }
        });
      });
      set({ selectedFaceIndices: Array.from(newIndices) });
    } else if (editMode === 'EDGE') {
      const newEdges = new Set<string>();
      const currentEdges: [number, number][] = [];
      for (let i = 0; i < selectedEdgeIndices.length; i += 2) {
        currentEdges.push([selectedEdgeIndices[i], selectedEdgeIndices[i+1]]);
        newEdges.add(`${Math.min(selectedEdgeIndices[i], selectedEdgeIndices[i+1])}-${Math.max(selectedEdgeIndices[i], selectedEdgeIndices[i+1])}`);
      }

      currentEdges.forEach(([v1, v2]) => {
        obj.faces.forEach(face => {
          const len = face.indices.length;
          for (let i = 0; i < len; i++) {
            const a = face.indices[i];
            const b = face.indices[(i + 1) % len];
            if ((a === v1 && b === v2) || (a === v2 && b === v1)) {
              for (let j = 0; j < len; j++) {
                const vA = face.indices[j];
                const vB = face.indices[(j + 1) % len];
                newEdges.add(`${Math.min(vA, vB)}-${Math.max(vA, vB)}`);
              }
            }
          }
        });
      });

      const result: number[] = [];
      newEdges.forEach(s => {
        const [a, b] = s.split('-').map(Number);
        result.push(a, b);
      });
      set({ selectedEdgeIndices: result });
    }
  },
  setShowCSG: (show) => set({ showCSG: show }),
  setShowGrid: (show) => set((state) => ({ project: { ...state.project, showGrid: show } })),
  setGridSnapEnabled: (enabled) => set({ gridSnapEnabled: enabled }),
  setMoveReferenceMode: (enabled) => set({ moveReferenceMode: enabled }),

  setReference: (view, updates) => {
    const { project } = get();
    set({ project: { ...project, references: {
      ...project.references,
      [view]: { ...project.references[view], ...updates },
    }}});
  },

  // ── History ───────────────────────────────────────────────────────────────
  saveHistory: () => {
    const { history, historyIndex, project } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(project)));
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },
  setLastCameraState: (cameraState) => set({ lastCameraState: cameraState }),

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex > 0)
      set({ historyIndex: historyIndex - 1, project: JSON.parse(JSON.stringify(history[historyIndex - 1])) });
  },
  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < history.length - 1)
      set({ historyIndex: historyIndex + 1, project: JSON.parse(JSON.stringify(history[historyIndex + 1])) });
  },

  // ── Add object ────────────────────────────────────────────────────────────
  addObject: (typeOrObj) => {
    const state = get();
    if (typeof typeOrObj === 'object' && typeOrObj !== null) {
      set({
        project: { ...state.project, objects: [...state.project.objects, typeOrObj] },
        selectedObjectId: typeOrObj.id,
        selectedObjectIds: [typeOrObj.id],
      });
      get().saveHistory();
      return;
    }
    const type = typeOrObj as PrimitiveType;
    const p: CSGObject['parameters'] = {};
    switch (type) {
      case 'SPHERE':       p.segments = 32; p.sphereType = 'UV'; p.detail = 1; break;
      case 'CYLINDER':     p.segments = 32; break;
      case 'CONE':         p.segments = 32; break;
      case 'TORUS':        p.radialSegments = 16; p.tubularSegments = 100; p.radius = 0.5; p.tube = 0.2; break;
      case 'ICOSAHEDRON':  p.detail = 0; break;
      case 'DODECAHEDRON': p.detail = 0; break;
      case 'TETRAHEDRON':  p.detail = 0; break;
      case 'OCTAHEDRON':   p.detail = 0; break;
      case 'PYRAMID':      p.segments = 4; p.heightSegments = 1; break;
      case 'PRISM':        p.segments = 3; p.heightSegments = 1; break;
      case 'CAPSULE':      p.segments = 16; break;
      case 'TUBE':         p.innerRadius = 0.25; p.outerRadius = 0.5; p.segments = 32; break;
      case 'ARC':          p.innerRadius = 0.25; p.outerRadius = 0.5; p.arcAngle = 180; p.height = 0.5; p.segments = 32; break;
      case 'STAR':         p.starPoints = 5; p.innerRadius = 0.25; p.outerRadius = 0.5; p.height = 0.5; break;
      case 'HEMISPHERE':   p.segments = 32; break;
      case 'CIRCLE':       p.segments = 32; break;
      case 'RING':         p.innerRadius = 0.25; p.outerRadius = 0.5; p.thetaSegments = 32; break;
      default:             p.segments = 1;
    }
    const geom = generatePrimitive(type, p);
    const names: Record<string,string> = {
      CUBE:'Cubo',SPHERE:'Esfera',CYLINDER:'Cilindro',CONE:'Cono',TORUS:'Toroide',
      ICOSAHEDRON:'Icosaedro',DODECAHEDRON:'Dodecaedro',PYRAMID:'Pirámide',PRISM:'Prisma',
      CAPSULE:'Cápsula',TETRAHEDRON:'Tetraedro',OCTAHEDRON:'Octaedro',TUBE:'Tubo',
      ARC:'Arco 3D',STAR:'Estrella 3D',
      WEDGE:'Cuña',HEMISPHERE:'Hemisferio',PLANE:'Plano',CIRCLE:'Círculo',RING:'Anillo',SHAPE:'Forma',
    };
    const newObj: CSGObject = {
      id: genId(),
      name: `${names[type] ?? type} ${state.project.objects.length + 1}`,
      type, operation: 'ADD',
      transform: { position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] },
      parameters: p,
      vertices: geom.vertices, faces: geom.faces,
      color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'),
      smoothShading: ['SPHERE', 'CYLINDER', 'CONE', 'TORUS', 'CAPSULE', 'HEMISPHERE', 'TUBE'].includes(type),
      opacity: 1, visible: true, keyframes: [],
    };
    set({ project: { ...state.project, objects: [...state.project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── FIX: addShape — bezier handles auto-smoothed even when provided ────────
  addShape: (type, vertices, closed, customHandles) => {
    const state = get();
    let handles: BezierHandle[] = customHandles
      ? customHandles.map(h => ({ broken: h.broken, out: [...h.out] as V3, in: [...h.in] as V3 }))
      : vertices.map(() => ({ out: [0,0,0] as V3, in: [0,0,0] as V3, broken: false }));

    // Always auto-smooth zero handles for bezier type.
    // Fixes: clicking without dragging → all [0,0,0] handles → straight lines.
    if (type === 'bezier') {
      handles = autoSmoothBezierHandles(vertices, handles, closed);
    }

    const newObj: CSGObject = {
      id: genId(),
      name: `Forma ${state.project.objects.length + 1}`,
      type: 'SHAPE', operation: 'ADD',
      transform: { position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] },
      parameters: { shapeType: type, closed, segments: type === 'bezier' ? 20 : 1 },
      vertices, bezierHandles: handles, faces: [],
      color: state.drawColor, smoothShading: false, opacity: 1, visible: true, keyframes: [],
    };
    set({
      project: { ...state.project, objects: [...state.project.objects, newObj] },
      selectedObjectId: newObj.id, selectedObjectIds: [newObj.id],
      drawMode: null,
    });
    get().saveHistory();
  },

  // ── addShapeVertices: extend existing shape with new points ───────────────
  addShapeVertices: (id, newVerts, newHandles) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      const updatedVerts   = [...o.vertices,       ...newVerts];
      const updatedHandles = [...(o.bezierHandles ?? []), ...newHandles];
      const smoothed = o.parameters.shapeType === 'bezier'
        ? autoSmoothBezierHandles(updatedVerts, updatedHandles, o.parameters.closed ?? false)
        : updatedHandles;
      return { ...o, vertices: updatedVerts, bezierHandles: smoothed };
    })}});
    get().saveHistory();
  },

  // ── Update ────────────────────────────────────────────────────────────────
  updateObject: (id, updates) => {
    const { project, isRecording, currentTime } = get();
    
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      
      // If recording OR object already has keyframes, and updating transform, add/update keyframe instead of base transform
      const hasKeyframes = o.keyframes && o.keyframes.length > 0;
      if ((isRecording || hasKeyframes) && updates.transform) {
        const kfs = [...(o.keyframes || [])];
        const existingIdx = kfs.findIndex(k => Math.abs(k.time - currentTime) < 0.001);
        
        if (existingIdx >= 0) {
          kfs[existingIdx] = { ...kfs[existingIdx], transform: { ...kfs[existingIdx].transform, ...updates.transform } };
        } else {
          // If no keyframe at exact time, create one.
          // Base it on the current interpolated transform to avoid jumps, then apply updates
          const _interpTransform = (() => {
            if (kfs.length === 0) return o.transform;
            const sorted = [...kfs].sort((a, b) => a.time - b.time);
            if (currentTime <= sorted[0].time) return sorted[0].transform;
            if (currentTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].transform;
            let prev = sorted[0], next = sorted[0];
            for (let _i = 0; _i < sorted.length - 1; _i++) {
              if (currentTime >= sorted[_i].time && currentTime <= sorted[_i+1].time) {
                prev = sorted[_i]; next = sorted[_i+1]; break;
              }
            }
            const t = (currentTime - prev.time) / (next.time - prev.time);
            const lerp = (a: number, b: number) => a + (b-a)*t;
            return {
              position: [lerp(prev.transform.position[0], next.transform.position[0]),
                         lerp(prev.transform.position[1], next.transform.position[1]),
                         lerp(prev.transform.position[2], next.transform.position[2])] as [number,number,number],
              rotation: [lerp(prev.transform.rotation[0], next.transform.rotation[0]),
                         lerp(prev.transform.rotation[1], next.transform.rotation[1]),
                         lerp(prev.transform.rotation[2], next.transform.rotation[2])] as [number,number,number],
              scale:    [lerp(prev.transform.scale[0], next.transform.scale[0]),
                         lerp(prev.transform.scale[1], next.transform.scale[1]),
                         lerp(prev.transform.scale[2], next.transform.scale[2])] as [number,number,number],
            };
          })();
          
          kfs.push({
            id: genId(),
            time: currentTime,
            transform: { ..._interpTransform, ...updates.transform }
          });
          kfs.sort((a, b) => a.time - b.time);
        }
        
        // Apply non-transform updates to the base object
        const { transform, ...otherUpdates } = updates;
        return { ...o, ...otherUpdates, keyframes: kfs };
      }
      
      return { ...o, ...updates };
    }) } });
  },

  updateObjects: (ids, updates) => {
    const { project, isRecording, currentTime } = get();
    const idSet = new Set(ids);
    
    set({ project: { ...project, objects: project.objects.map(o => {
      if (!idSet.has(o.id)) return o;
      
      const objUpdates = typeof updates === 'function' ? updates(o.id) : updates;
      
      // If recording OR object already has keyframes, and updating transform, add/update keyframe instead of base transform
      const hasKeyframes = o.keyframes && o.keyframes.length > 0;
      if ((isRecording || hasKeyframes) && objUpdates.transform) {
        const kfs = [...(o.keyframes || [])];
        const existingIdx = kfs.findIndex(k => Math.abs(k.time - currentTime) < 0.001);
        
        if (existingIdx >= 0) {
          kfs[existingIdx] = { ...kfs[existingIdx], transform: { ...kfs[existingIdx].transform, ...objUpdates.transform } };
        } else {
          // If no keyframe at exact time, create one.
          // Base it on the current interpolated transform to avoid jumps, then apply updates
          const _interpTransform = (() => {
            if (kfs.length === 0) return o.transform;
            const sorted = [...kfs].sort((a, b) => a.time - b.time);
            if (currentTime <= sorted[0].time) return sorted[0].transform;
            if (currentTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].transform;
            let prev = sorted[0], next = sorted[0];
            for (let _i = 0; _i < sorted.length - 1; _i++) {
              if (currentTime >= sorted[_i].time && currentTime <= sorted[_i+1].time) {
                prev = sorted[_i]; next = sorted[_i+1]; break;
              }
            }
            const t = (currentTime - prev.time) / (next.time - prev.time);
            const lerp = (a: number, b: number) => a + (b-a)*t;
            return {
              position: [lerp(prev.transform.position[0], next.transform.position[0]),
                         lerp(prev.transform.position[1], next.transform.position[1]),
                         lerp(prev.transform.position[2], next.transform.position[2])] as [number,number,number],
              rotation: [lerp(prev.transform.rotation[0], next.transform.rotation[0]),
                         lerp(prev.transform.rotation[1], next.transform.rotation[1]),
                         lerp(prev.transform.rotation[2], next.transform.rotation[2])] as [number,number,number],
              scale:    [lerp(prev.transform.scale[0], next.transform.scale[0]),
                         lerp(prev.transform.scale[1], next.transform.scale[1]),
                         lerp(prev.transform.scale[2], next.transform.scale[2])] as [number,number,number],
            };
          })();
          
          kfs.push({
            id: genId(),
            time: currentTime,
            transform: { ..._interpTransform, ...objUpdates.transform }
          });
          kfs.sort((a, b) => a.time - b.time);
        }
        
        // Apply non-transform updates to the base object
        const { transform, ...otherUpdates } = objUpdates;
        return { ...o, ...otherUpdates, keyframes: kfs };
      }
      
      return { ...o, ...objUpdates };
    }) } });
  },

  updateParameters: (id, params) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj || obj.type === 'MESH') return;
    const newParams = { ...obj.parameters, ...params };
    
    // For SHAPE objects, we need to pass the current vertices and handles as the profile
    const genParams = obj.type === 'SHAPE' 
      ? { ...newParams, profileVertices: obj.vertices, profileBezierHandles: obj.bezierHandles }
      : newParams;

    const geom = (obj.type === 'SHAPE' && newParams.extrusionDepth === undefined)
      ? { vertices: obj.vertices, faces: obj.faces }
      : generatePrimitive(obj.type, genParams);

    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === id ? { 
        ...o, 
        parameters: newParams, 
        vertices: geom.vertices, 
        faces: geom.faces, 
        // Only clear offsets for primitives, keep them for SHAPE as they are control point offsets
        vertexOffsets: o.type === 'SHAPE' ? o.vertexOffsets : {} 
      } : o
    )}});
    get().saveHistory();
  },

  updateVertexOffset: (id, vertexIndex, offset) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      if (o.type === 'SHAPE') {
        return { ...o, vertexOffsets: { ...(o.vertexOffsets ?? {}), [vertexIndex]: offset } };
      }
      return { ...o, type: 'MESH', parameters: {}, vertexOffsets: { ...(o.vertexOffsets ?? {}), [vertexIndex]: offset } };
    })}});
  },

  updateVertexOffsets: (id, updates) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      const vo = { ...(o.vertexOffsets ?? {}) };
      updates.forEach(({ index, offset }) => { vo[index] = offset; });
      if (o.type === 'SHAPE') {
        return { ...o, vertexOffsets: vo };
      }
      return { ...o, type: 'MESH', parameters: {}, vertexOffsets: vo };
    })}});
  },

  updateBezierHandle: (id, index, side, offset, broken = false) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id || !o.bezierHandles?.[index]) return o;
      const handles = [...o.bezierHandles];
      const h = { ...handles[index] };
      if (side === 'out') h.out = offset; else h.in = offset;
      if (!broken && !h.broken) {
        if (side === 'out') h.in  = [-offset[0], -offset[1], -offset[2]];
        else                h.out = [-offset[0], -offset[1], -offset[2]];
      }
      handles[index] = h;
      return { ...o, bezierHandles: handles };
    })}});
  },

  // ── Remove / Duplicate ────────────────────────────────────────────────────
  removeObject: (id) => {
    const { project, selectedObjectId, selectedObjectIds } = get();
    const safeIds = selectedObjectIds || [];
    const newIds = safeIds.filter(i => i !== id);
    const newSel = selectedObjectId === id ? (newIds[newIds.length-1] ?? null) : selectedObjectId;
    set({ project: { ...project, objects: project.objects.filter(o => o.id !== id) }, selectedObjectId: newSel, selectedObjectIds: newIds });
    get().saveHistory();
  },

  removeObjects: (ids) => {
    if (!ids || ids.length === 0) return;
    const { project, selectedObjectId, selectedObjectIds } = get();
    const idSet = new Set(ids);
    const safeIds = selectedObjectIds || [];
    const newIds = safeIds.filter(i => !idSet.has(i));
    const newSel = idSet.has(selectedObjectId || '') ? (newIds[newIds.length - 1] ?? null) : selectedObjectId;
    set({
      project: { ...project, objects: project.objects.filter(o => !idSet.has(o.id)) },
      selectedObjectId: newSel,
      selectedObjectIds: newIds
    });
    get().saveHistory();
  },

  duplicateObject: (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const newObj = { ...JSON.parse(JSON.stringify(obj)), id: genId(), name: `${obj.name} (Copia)` };
    if (newObj.transform && newObj.transform.position) {
      newObj.transform.position[0] += 0.5;
      newObj.transform.position[2] += 0.5;
    }
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  moveObjectUp: (id) => {
    const { project } = get();
    const idx = project.objects.findIndex(o => o.id === id);
    if (idx <= 0) return;
    const newObjects = [...project.objects];
    [newObjects[idx - 1], newObjects[idx]] = [newObjects[idx], newObjects[idx - 1]];
    set({ project: { ...project, objects: newObjects } });
    get().saveHistory();
  },

  moveObjectDown: (id) => {
    const { project } = get();
    const idx = project.objects.findIndex(o => o.id === id);
    if (idx < 0 || idx >= project.objects.length - 1) return;
    const newObjects = [...project.objects];
    [newObjects[idx], newObjects[idx + 1]] = [newObjects[idx + 1], newObjects[idx]];
    set({ project: { ...project, objects: newObjects } });
    get().saveHistory();
  },

  copyObject: () => {
    const { project, selectedObjectId } = get();
    const obj = project.objects.find(o => o.id === selectedObjectId);
    if (obj) set({ clipboard: JSON.parse(JSON.stringify(obj)) });
  },

  pasteObject: () => {
    const { project, clipboard } = get();
    if (!clipboard) return;
    const newObj = JSON.parse(JSON.stringify(clipboard));
    newObj.id = genId();
    newObj.name = `${newObj.name} (Copia)`;
    newObj.transform.position = newObj.transform.position.map((v: number) => v + 0.5);
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  mirrorObject: (id, axis) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const newObj = JSON.parse(JSON.stringify(obj));
    newObj.id = genId();
    newObj.name = `${obj.name} (Espejo ${axis.toUpperCase()})`;
    newObj.transform.scale[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] *= -1;
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── extrudeFaces ──────────────────────────────────────────────────────────
  extrudeFaces: (id, faceIndices, distance) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const newObj: CSGObject = JSON.parse(JSON.stringify(obj));
    newObj.type = 'MESH';

    const selectedVertSet = new Set<number>();
    faceIndices.forEach(fIdx => newObj.faces[fIdx]?.indices.forEach(vIdx => selectedVertSet.add(vIdx)));

    // Averaged normal
    let avgNormal: V3 = [0,0,0];
    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx];
      if (!face) return;
      const pos = face.indices.map(vIdx => {
        const base = newObj.vertices[vIdx];
        const off  = newObj.vertexOffsets?.[vIdx] ?? [0,0,0];
        return [base[0]+off[0], base[1]+off[1], base[2]+off[2]] as V3;
      });
      const n = computeNormal(pos, [0,1,2]);
      avgNormal[0] += n[0]; avgNormal[1] += n[1]; avgNormal[2] += n[2];
    });
    const mag = Math.sqrt(avgNormal[0]**2+avgNormal[1]**2+avgNormal[2]**2) || 1;
    avgNormal = [avgNormal[0]/mag, avgNormal[1]/mag, avgNormal[2]/mag];

    const oldToNew = new Map<number, number>();
    selectedVertSet.forEach(vIdx => {
      const base = newObj.vertices[vIdx];
      const off  = newObj.vertexOffsets?.[vIdx] ?? [0,0,0];
      const pos: V3 = [base[0]+off[0], base[1]+off[1], base[2]+off[2]];
      newObj.vertices.push([
        pos[0] + avgNormal[0] * distance,
        pos[1] + avgNormal[1] * distance,
        pos[2] + avgNormal[2] * distance,
      ]);
      oldToNew.set(vIdx, newObj.vertices.length - 1);
    });

    // Boundary edges → side faces
    const edgeCounts = new Map<string, { a: number; b: number; count: number }>();
    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx]; if (!face) return;
      for (let i = 0; i < face.indices.length; i++) {
        const a = face.indices[i], b = face.indices[(i+1) % face.indices.length];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const ex = edgeCounts.get(key);
        ex ? ex.count++ : edgeCounts.set(key, { a, b, count: 1 });
      }
    });

    edgeCounts.forEach(info => {
      if (info.count !== 1) return;
      let v1 = info.a, v2 = info.b;
      faceIndices.map(fi => newObj.faces[fi]).find(f => {
        if (!f) return false;
        for (let i = 0; i < f.indices.length; i++) {
          if (f.indices[i] === info.a && f.indices[(i+1)%f.indices.length] === info.b) { v1=info.a; v2=info.b; return true; }
          if (f.indices[i] === info.b && f.indices[(i+1)%f.indices.length] === info.a) { v1=info.b; v2=info.a; return true; }
        }
        return false;
      });
      const nv1 = oldToNew.get(v1), nv2 = oldToNew.get(v2);
      if (nv1 === undefined || nv2 === undefined) return;
      if (distance < 0) {
        newObj.faces.push({ indices: [v1, nv1, nv2, v2] });
      } else {
        newObj.faces.push({ indices: [v1, v2, nv2, nv1] });
      }
    });

    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx]; if (!face) return;
      if (distance < 0) {
        face.indices = face.indices.map(vIdx => oldToNew.get(vIdx) ?? vIdx).reverse();
      } else {
        face.indices = face.indices.map(vIdx => oldToNew.get(vIdx) ?? vIdx);
      }
      face.normal  = computeNormal(newObj.vertices, face.indices);
    });

    newObj.parameters = {};

    if (newObj.vertexOffsets) {
      selectedVertSet.forEach(vIdx => {
        const off = newObj.vertexOffsets![vIdx];
        if (off) {
          newObj.vertices[vIdx] = [
            newObj.vertices[vIdx][0]+off[0],
            newObj.vertices[vIdx][1]+off[1],
            newObj.vertices[vIdx][2]+off[2],
          ];
          delete newObj.vertexOffsets![vIdx];
        }
      });
    }

    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) }, selectedVertexIndices: Array.from(oldToNew.values()) });
    get().saveHistory();
  },

  extrudeShape: (id, depth, axis = 'y') => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);

    // ── FIX: acepta SHAPE, PLANE, RING, CIRCLE ──────────────────
    const extrudableTypes: string[] = ['SHAPE', 'PLANE', 'RING', 'CIRCLE'];
    if (!obj || !extrudableTypes.includes(obj.type)) return;

    let vertices: V3[];
    let faces: MeshFace[];
    let profilePoints: V3[] | undefined;

    if (obj.type === 'SHAPE') {
      // ── SHAPE: usa el perfil 2D dibujado por el usuario ─────────
      const rawVerts = obj.vertices.map((v, i) => {
        const off = obj.vertexOffsets?.[i] ?? [0, 0, 0];
        return [v[0] + off[0], v[1] + off[1], v[2] + off[2]] as V3;
      });

      const isBezier = obj.parameters.shapeType === 'bezier' && !!obj.bezierHandles?.length;
      const isClosed = obj.parameters.closed ?? false;
      const segs = Math.max(4, obj.parameters.segments ?? 20);

      let profile: V3[];
      if (isBezier && obj.bezierHandles) {
        const smoothed = autoSmoothBezierHandles(rawVerts, obj.bezierHandles, isClosed);
        profile = sampleBezierCurve(rawVerts, smoothed, isClosed, segs);
      } else {
        profile = [...rawVerts];
      }

      // Remove coincident first/last
      if (profile.length > 1) {
        const first = profile[0], last = profile[profile.length - 1];
        const d = Math.sqrt(
          (first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2 + (first[2] - last[2]) ** 2,
        );
        if (d < 0.0001) profile.pop();
      }

      const n = profile.length;
      if (n < 2) { console.warn('extrudeShape: insufficient profile points'); return; }

      const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      const ext: V3 = [0, 0, 0];
      ext[axisIdx] = depth;

      vertices = [
        ...profile,
        ...profile.map(v => [v[0] + ext[0], v[1] + ext[1], v[2] + ext[2]] as V3),
      ];

      faces = [];
      const isNegative = depth < 0;

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (isNegative) {
          faces.push({ indices: [i, i + n, j + n, j] });
        } else {
          faces.push({ indices: [i, j, j + n, i + n] });
        }
      }

      if (n >= 3) {
        if (isNegative) {
          faces.push({ indices: Array.from({ length: n }, (_, k) => k) });
          faces.push({ indices: Array.from({ length: n }, (_, k) => 2 * n - 1 - k) });
        } else {
          faces.push({ indices: Array.from({ length: n }, (_, k) => n - 1 - k) });
          faces.push({ indices: Array.from({ length: n }, (_, k) => k + n) });
        }
      }

      profilePoints = profile;

    } else {
      // ── PLANE / RING / CIRCLE: extrude sólido genérico ──────────
      let tempObj = { ...obj };
      if (!tempObj.vertices || tempObj.vertices.length === 0) {
        // Generar vértices/caras desde la primitiva si no existen
        const geo = createBaseGeometry(tempObj);
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        const index = geo.getIndex();
        
        const verts: V3[] = [];
        for (let i = 0; i < pos.count; i++) {
          verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)] as V3);
        }
        
        const faces: MeshFace[] = [];
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            faces.push({ indices: [index.getX(i), index.getX(i + 1), index.getX(i + 2)] });
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            faces.push({ indices: [i, i + 1, i + 2] });
          }
        }
        tempObj.vertices = verts;
        tempObj.faces = faces;
      }

      const result = solidExtrudeMesh(tempObj, depth, axis);
      if (!result) return;
      vertices = result.vertices;
      faces    = result.faces;
    }

    const newObj: CSGObject = {
      ...obj,
      name: `${obj.name} (Extruido)`,
      type: 'MESH',
      vertices,
      faces,
      vertexOffsets: {},
      bezierHandles: undefined,
      parameters: {
        ...obj.parameters,
        extrusionDepth:         depth,
        extrusionAxis:          axis,
        profileVertices:        profilePoints,
        profileBezierHandles:   obj.bezierHandles,
      },
    };

    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) } });
    get().saveHistory();
  },

  // ── subdivideFaces ────────────────────────────────────────────────────────
  subdivideFaces: (id, faceIndices) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj || faceIndices.length === 0) return;

    const newObj: CSGObject = JSON.parse(JSON.stringify(obj));
    newObj.type = 'MESH'; // Convert to pure mesh
    
    const edgeMidpoints = new Map<string, number>();
    const getEdgeKey = (v1: number, v2: number) => Math.min(v1, v2) + '_' + Math.max(v1, v2);
    
    const newFaces: MeshFace[] = [];
    const facesToRemove = new Set(faceIndices);
    
    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx];
      if (!face) return;
      
      const n = face.indices.length;
      if (n < 3) return;
      
      let cx = 0, cy = 0, cz = 0;
      face.indices.forEach(vIdx => {
        const base = newObj.vertices[vIdx];
        const off = newObj.vertexOffsets?.[vIdx] ?? [0,0,0];
        cx += base[0] + off[0];
        cy += base[1] + off[1];
        cz += base[2] + off[2];
      });
      cx /= n; cy /= n; cz /= n;
      
      const centerIdx = newObj.vertices.length;
      newObj.vertices.push([cx, cy, cz]);
      
      const midIndices: number[] = [];
      for (let i = 0; i < n; i++) {
        const v1 = face.indices[i];
        const v2 = face.indices[(i + 1) % n];
        const edgeKey = getEdgeKey(v1, v2);
        
        if (edgeMidpoints.has(edgeKey)) {
          midIndices.push(edgeMidpoints.get(edgeKey)!);
        } else {
          const b1 = newObj.vertices[v1];
          const o1 = newObj.vertexOffsets?.[v1] ?? [0,0,0];
          const b2 = newObj.vertices[v2];
          const o2 = newObj.vertexOffsets?.[v2] ?? [0,0,0];
          
          const mx = (b1[0] + o1[0] + b2[0] + o2[0]) / 2;
          const my = (b1[1] + o1[1] + b2[1] + o2[1]) / 2;
          const mz = (b1[2] + o1[2] + b2[2] + o2[2]) / 2;
          
          const midIdx = newObj.vertices.length;
          newObj.vertices.push([mx, my, mz]);
          edgeMidpoints.set(edgeKey, midIdx);
          midIndices.push(midIdx);
        }
      }
      
      for (let i = 0; i < n; i++) {
        const v1 = face.indices[i];
        const m1 = midIndices[i];
        const mPrev = midIndices[(i - 1 + n) % n];
        newFaces.push({ indices: [v1, m1, centerIdx, mPrev] });
      }
    });
    
    newObj.faces = newObj.faces.filter((_, i) => !facesToRemove.has(i)).concat(newFaces);
    newObj.parameters = {};
    
    // Apply vertex offsets to base vertices and clear offsets
    if (newObj.vertexOffsets) {
      Object.entries(newObj.vertexOffsets).forEach(([idx, off]) => {
        const i = parseInt(idx);
        if (newObj.vertices[i]) {
          newObj.vertices[i][0] += off[0];
          newObj.vertices[i][1] += off[1];
          newObj.vertices[i][2] += off[2];
        }
      });
      newObj.vertexOffsets = {};
    }
    
    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) } });
    get().saveHistory();
  },

  // ── mergeFaces ────────────────────────────────────────────────────────────
  mergeFaces: (id, faceIndices) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj || faceIndices.length < 2) return;

    const newObj: CSGObject = JSON.parse(JSON.stringify(obj));
    newObj.type = 'MESH'; // Convert to pure mesh
    
    const edgeMap = new Map<string, { from: number; to: number }>();
    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx];
      if (!face) return;
      for (let i = 0; i < face.indices.length; i++) {
        const from = face.indices[i];
        const to = face.indices[(i + 1) % face.indices.length];
        const key = `${from},${to}`;
        const oppKey = `${to},${from}`;
        
        if (edgeMap.has(oppKey)) {
          edgeMap.delete(oppKey);
        } else {
          edgeMap.set(key, { from, to });
        }
      }
    });
    
    const boundaryEdges = Array.from(edgeMap.values());
    if (boundaryEdges.length === 0) return;
    
    const nextMap = new Map<number, number>();
    boundaryEdges.forEach(e => {
      nextMap.set(e.from, e.to);
    });
    
    const loop: number[] = [];
    let current = boundaryEdges[0].from;
    const start = current;
    
    while (true) {
      loop.push(current);
      const next = nextMap.get(current);
      if (next === undefined || next === start) break;
      current = next;
      if (loop.length > boundaryEdges.length) break;
    }
    
    const newFace: MeshFace = { indices: loop };
    const facesToRemove = new Set(faceIndices);
    newObj.faces = newObj.faces.filter((_, i) => !facesToRemove.has(i));
    newObj.faces.push(newFace);
    newObj.parameters = {};
    
    if (newObj.vertexOffsets) {
      Object.entries(newObj.vertexOffsets).forEach(([idx, off]) => {
        const i = parseInt(idx);
        if (newObj.vertices[i]) {
          newObj.vertices[i][0] += off[0];
          newObj.vertices[i][1] += off[1];
          newObj.vertices[i][2] += off[2];
        }
      });
      newObj.vertexOffsets = {};
    }
    
    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) }, selectedFaceIndices: [] });
    get().saveHistory();
  },

  // ── Cap selected faces (close hole by boundary loop) ─────────────────────
  capSelectedFaces: (id, faceIndices) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj || faceIndices.length === 0) return;

    const newObj = JSON.parse(JSON.stringify(obj));
    newObj.type = 'MESH';

    // Build edge map from selected faces to find boundary loop
    const edgeMap = new Map<string, { from: number; to: number }>();
    faceIndices.forEach(fIdx => {
      const face = newObj.faces[fIdx];
      if (!face) return;
      for (let i = 0; i < face.indices.length; i++) {
        const from = face.indices[i];
        const to   = face.indices[(i + 1) % face.indices.length];
        const fwd  = `${from}:${to}`;
        const rev  = `${to}:${from}`;
        if (edgeMap.has(rev)) edgeMap.delete(rev);
        else edgeMap.set(fwd, { from, to });
      }
    });

    const boundaryEdges = Array.from(edgeMap.values());
    if (boundaryEdges.length < 3) return;

    // Walk boundary loop
    const nextMap = new Map<number, number>();
    boundaryEdges.forEach(e => nextMap.set(e.from, e.to));
    const loop: number[] = [];
    let cur = boundaryEdges[0].from;
    const start = cur;
    for (let i = 0; i < nextMap.size + 1; i++) {
      loop.push(cur);
      const next = nextMap.get(cur);
      if (next === undefined || next === start) break;
      cur = next;
    }

    if (loop.length < 3) return;

    // Create face from loop (fan from centroid)
    const cx = loop.reduce((s,i)=>s+newObj.vertices[i][0],0)/loop.length;
    const cy = loop.reduce((s,i)=>s+newObj.vertices[i][1],0)/loop.length;
    const cz = loop.reduce((s,i)=>s+newObj.vertices[i][2],0)/loop.length;
    const centerIdx = newObj.vertices.length;
    newObj.vertices.push([cx,cy,cz]);
    for (let i = 0; i < loop.length; i++) {
      newObj.faces.push({ indices: [centerIdx, loop[(i+1)%loop.length], loop[i]] });
    }

    newObj.parameters = {};
    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) }, selectedFaceIndices: [] });
    get().saveHistory();
  },

  // ── Boolean / Modifiers ───────────────────────────────────────────────────
  applyBoolean: async (op) => {
    const { project, selectedObjectIds } = get();
    let target: CSGObject | undefined;
    let tool: CSGObject | undefined;

    if (selectedObjectIds.length === 2) {
      target = project.objects.find(o => o.id === selectedObjectIds[0]);
      tool = project.objects.find(o => o.id === selectedObjectIds[1]);
    } else {
      const { selectedObjectId } = get();
      if (!selectedObjectId) return;
      const toolIndex = project.objects.findIndex(o => o.id === selectedObjectId);
      if (toolIndex <= 0) return;
      target = project.objects[toolIndex - 1];
      tool = project.objects[toolIndex];
    }

    if (!target || !tool) return;
    
    if (target.meshData) target = await convertImportedToCSG(target);
    if (tool.meshData) tool = await convertImportedToCSG(tool);
    
    const operation = op || tool.operation || 'SUBTRACT';
    const result = applyBooleanOperation(target, tool, operation);
    if (result) {
      const newTarget: CSGObject = { 
        ...target, 
        vertices: result.vertices, 
        faces: result.faces, 
        vertexOffsets: {}, 
        name: `${target.name} + ${tool.name}`, 
        meshData: undefined,
        transform: {
          position: [0, 0, 0] as V3,
          rotation: [0, 0, 0] as V3,
          scale: [1, 1, 1] as V3
        }
      };
      
      const newObjects = project.objects.filter(o => o.id !== tool!.id).map(o => o.id === target!.id ? newTarget : o);
      set({ 
        project: { ...project, objects: newObjects }, 
        selectedObjectId: newTarget.id, 
        selectedObjectIds: [newTarget.id] 
      });
      get().saveHistory();
    }
  },

  selectAll: () => {
    const { project } = get();
    const allIds = project.objects.map(o => o.id);
    set({ selectedObjectIds: allIds, selectedObjectId: allIds[allIds.length - 1] || null });
  },
  deselectAll: () => {
    set({ selectedObjectIds: [], selectedObjectId: null });
  },
  invertSelection: () => {
    const { project, selectedObjectIds } = get();
    const allIds = project.objects.map(o => o.id);
    const newIds = allIds.filter(id => !selectedObjectIds.includes(id));
    set({ selectedObjectIds: newIds, selectedObjectId: newIds[newIds.length - 1] || null });
  },
  deleteSelected: () => {
    const { project, selectedObjectIds, selectedLightId, selectedCameraId } = get();
    
    let updatedProject = { ...project };
    let changed = false;

    const safeIds = selectedObjectIds || [];
    if (safeIds.length > 0) {
      updatedProject.objects = project.objects.filter(o => !safeIds.includes(o.id));
      changed = true;
    }

    if (selectedLightId) {
      updatedProject.lights = project.lights.filter(l => l.id !== selectedLightId);
      changed = true;
    }

    if (selectedCameraId) {
      updatedProject.cameras = (project.cameras || []).filter(c => c.id !== selectedCameraId);
      changed = true;
    }

    if (changed) {
      set({ 
        project: updatedProject,
        selectedObjectIds: [],
        selectedObjectId: null,
        selectedLightId: null,
        selectedCameraId: null
      });
      get().saveHistory();
    }
  },
  duplicateSelected: () => {
    const { project, selectedObjectIds } = get();
    if (selectedObjectIds.length === 0) return;
    const newObjs: CSGObject[] = [];
    const newIds: string[] = [];
    selectedObjectIds.forEach(id => {
      const obj = project.objects.find(o => o.id === id);
      if (obj) {
        const newId = genId();
        newObjs.push({ ...JSON.parse(JSON.stringify(obj)), id: newId, name: `${obj.name} (Copia)` });
        newIds.push(newId);
      }
    });
    set({ 
      project: { ...project, objects: [...project.objects, ...newObjs] },
      selectedObjectIds: newIds,
      selectedObjectId: newIds[newIds.length - 1]
    });
    get().saveHistory();
  },
  mirrorSelected: (axis) => {
    const { project, selectedObjectIds } = get();
    if (selectedObjectIds.length === 0) return;
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    set({
      project: {
        ...project,
        objects: project.objects.map(o => {
          if (!selectedObjectIds.includes(o.id)) return o;
          const newScale = [...o.transform.scale] as V3;
          newScale[axisIdx] *= -1;
          return { ...o, transform: { ...o.transform, scale: newScale } };
        })
      }
    });
    get().saveHistory();
  },

  smoothObject: async (id, factor, iterations = 1) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    
    if (obj.meshData && obj.meshData.type === 'gltf') {
      const { smoothGLB } = await import('../utils/glb_processor');
      const smoothedObj = await smoothGLB(obj, factor, iterations);
      if (smoothedObj === obj) {
        console.warn('Smoothing did not produce a new object.');
        return;
      }
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? smoothedObj : o)}});
      get().saveHistory();
      return;
    }

    if (obj.meshData) obj = await convertImportedToCSG(obj);
    const result = smoothMesh(obj, factor, iterations);
    set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o)}});
    get().saveHistory();
  },

  roundAnglesObject: async (id, radius = 0.08, segments = 3, angleThresholdDeg = 35) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    if (obj.meshData) obj = await convertImportedToCSG(obj);
    const result = roundAnglesMesh(obj, radius, segments, angleThresholdDeg);
    set({
      project: {
        ...get().project,
        objects: get().project.objects.map(o =>
          o.id === id
            ? {
                ...o,
                type: 'MESH',
                parameters: {},
                meshData: undefined,
                vertices: result.vertices,
                faces: result.faces,
                vertexOffsets: {},
                smoothShading: true,
                stats: { vertices: result.vertices.length, faces: result.faces.length }
              }
            : o
        )
      }
    });
    get().saveHistory();
  },

  subdivideObject: async (id) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    if (obj.meshData && obj.meshData.type === 'gltf') {
      const { subdivideGLB } = await import('../utils/glb_processor');
      const subdividedObj = await subdivideGLB(obj);
      if (subdividedObj === obj) {
        console.warn('Subdivision did not produce a new object.');
        return;
      }
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? subdividedObj : o)}});
      get().saveHistory();
      return;
    }

    if (obj.meshData) obj = await convertImportedToCSG(obj);
    const result = subdivideMesh(obj);
    set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, type: 'MESH', parameters: {}, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o)}});
    get().saveHistory();
  },

  optimizeObject: async (id, ratio, selectedMeshes) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const initialVerts = obj.stats?.vertices ?? obj.vertices?.length ?? 0;
    const initialFaces = obj.stats?.faces ?? obj.faces?.length ?? 0;

    set({
      meshProcessing: {
        active: true,
        title: 'Optimización Poligonal',
        subtitle: 'Calculando colapso de aristas...',
        progress: 15,
        objectName: obj.name,
        vertCount: initialVerts,
        faceCount: initialFaces,
      }
    });
    await new Promise(r => setTimeout(r, 40));
    
    try {
      let updatedObj = obj;
      if (obj.meshData) {
        if (obj.meshData.type === 'gltf') {
          const { optimizeGLBModel } = await import('../utils/glb_processor');
          const resLevel = Math.max(1, Math.min(12, Math.round(ratio * 12)));
          updatedObj = await optimizeGLBModel(obj, resLevel, (prog, step) => {
            set(s => ({
              meshProcessing: s.meshProcessing ? { ...s.meshProcessing, progress: prog, subtitle: step } : null
            }));
          }, selectedMeshes);
        } else {
          updatedObj = await convertImportedToCSG(obj);
          const result = await simplifyMesh(updatedObj, ratio);
          updatedObj = { ...updatedObj, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {}, stats: { vertices: result.vertices.length, faces: result.faces.length } };
        }
      } else {
        const result = await simplifyMesh(obj, ratio);
        updatedObj = { ...obj, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {}, stats: { vertices: result.vertices.length, faces: result.faces.length } };
      }

      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? updatedObj : o)}});
      get().saveHistory();

      const finalVerts = updatedObj.stats?.vertices ?? updatedObj.vertices?.length ?? 0;
      const finalFaces = updatedObj.stats?.faces ?? updatedObj.faces?.length ?? 0;

      set(s => ({
        meshProcessing: s.meshProcessing ? {
          ...s.meshProcessing,
          progress: 100,
          subtitle: '¡Optimización completada con éxito!',
          completed: true,
          finalVertCount: finalVerts,
          finalFaceCount: finalFaces,
        } : null
      }));
    } catch (error) {
      console.error('Error optimizando objeto:', error);
      set({ meshProcessing: null });
    }
  },

  offsetObject: async (id, distance) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    
    if (obj.meshData && obj.meshData.type === 'gltf') {
      const { processGLBMeshes } = await import('../utils/glb_processor');
      const { offsetMesh } = await import('../utils/modifiers_advanced');
      const newObj = await processGLBMeshes(obj, (v, f) => offsetMesh({ vertices: v, faces: f } as any, distance));
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? newObj : o)}});
      get().saveHistory();
      return;
    }

    if (obj.meshData) obj = await convertImportedToCSG(obj);
    const { offsetMesh } = await import('../utils/modifiers_advanced');
    const result = offsetMesh(obj, distance);
    set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o)}});
    get().saveHistory();
  },

  repairObject: async (id, tolerance = 0.001) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const initialVerts = obj.stats?.vertices ?? obj.vertices?.length ?? 0;
    const initialFaces = obj.stats?.faces ?? obj.faces?.length ?? 0;

    set({
      meshProcessing: {
        active: true,
        title: 'Soldado y Reparación de Malla',
        subtitle: `Fusionando vértices a distancia <= ${tolerance}...`,
        progress: 20,
        objectName: obj.name,
        vertCount: initialVerts,
        faceCount: initialFaces,
      }
    });
    await new Promise(r => setTimeout(r, 40));

    try {
      if (obj.meshData) obj = await convertImportedToCSG(obj);
      const result = repairMesh(obj, tolerance);
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {}, stats: { vertices: result.vertices.length, faces: result.faces.length } } : o)}});
      get().saveHistory();

      set(s => ({
        meshProcessing: s.meshProcessing ? {
          ...s.meshProcessing,
          progress: 100,
          subtitle: `¡Soldado de vértices completado! (${result.report.join(', ')})`,
          completed: true,
          finalVertCount: result.vertices.length,
          finalFaceCount: result.faces.length,
        } : null
      }));
    } catch (e) {
      console.error("Error en reparación/soldado:", e);
      set({ meshProcessing: null });
    }
  },

  weldObject: async (id, tolerance = 0.001) => {
    return get().repairObject(id, tolerance);
  },

  healObject: async (id) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const initialVerts = obj.stats?.vertices ?? obj.vertices?.length ?? 0;
    const initialFaces = obj.stats?.faces ?? obj.faces?.length ?? 0;

    set({
      meshProcessing: {
        active: true,
        title: 'Curado Topológico Manifold',
        subtitle: 'Cerrando vacíos y consolidando sólido...',
        progress: 25,
        objectName: obj.name,
        vertCount: initialVerts,
        faceCount: initialFaces,
      }
    });
    await new Promise(r => setTimeout(r, 40));

    try {
      if (obj.meshData) obj = await convertImportedToCSG(obj);
      const { healMesh } = await import('../utils/manifoldUtils');
      const result = await healMesh(obj.vertices, obj.faces);
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {}, stats: { vertices: result.vertices.length, faces: result.faces.length } } : o)}});
      get().saveHistory();

      set(s => ({
        meshProcessing: s.meshProcessing ? {
          ...s.meshProcessing,
          progress: 100,
          subtitle: '¡Curado topológico completado!',
          completed: true,
          finalVertCount: result.vertices.length,
          finalFaceCount: result.faces.length,
        } : null
      }));
    } catch (e) {
      console.error('Manifold heal failed', e);
      set({ meshProcessing: null });
    }
  },

  fillHolesObject: async (id) => {
    const { project } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const initialVerts = obj.stats?.vertices ?? obj.vertices?.length ?? 0;
    const initialFaces = obj.stats?.faces ?? obj.faces?.length ?? 0;

    set({
      meshProcessing: {
        active: true,
        title: 'Tapar Agujeros Poligonales',
        subtitle: 'Buscando bordes abiertos y triangulando huecos...',
        progress: 30,
        objectName: obj.name,
        vertCount: initialVerts,
        faceCount: initialFaces,
      }
    });
    await new Promise(r => setTimeout(r, 40));

    try {
      if (obj.meshData) obj = await convertImportedToCSG(obj);
      const result = fillHoles(obj);
      set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {}, stats: { vertices: result.vertices.length, faces: result.faces.length } } : o)}});
      get().saveHistory();

      set(s => ({
        meshProcessing: s.meshProcessing ? {
          ...s.meshProcessing,
          progress: 100,
          subtitle: '¡Agujeros sellados con éxito!',
          completed: true,
          finalVertCount: result.vertices.length,
          finalFaceCount: result.faces.length,
        } : null
      }));
    } catch (e) {
      console.error("Error en Tapar Huecos:", e);
      set({ meshProcessing: null });
    }
  },

  separateLoosePartsObject: async (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return { success: false, message: 'Objeto no encontrado.' };

    const { separateLooseParts } = await import('../utils/meshExplode');
    const result = await separateLooseParts(obj);

    if (!result.success || !result.objects) {
      return result;
    }

    const updatedObjects = project.objects.flatMap(o =>
      o.id === id ? result.objects! : [o]
    );

    set({
      project: { ...get().project, objects: updatedObjects },
      selectedObjectId: result.objects[0].id,
      selectedObjectIds: result.objects.map(o => o.id),
    });
    get().saveHistory();

    return { success: true, message: result.message, count: result.objects.length };
  },

  ungroupSelectedObject: async (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return { success: false, message: 'Objeto no encontrado.' };

    const { ungroupObject } = await import('../utils/ungroup');
    const result = await ungroupObject(obj);

    if (!result.success || !result.objects || result.objects.length === 0) {
      return result;
    }

    const updatedObjects = project.objects.flatMap(o =>
      o.id === id ? result.objects! : [o]
    );

    const newSelectedIds = result.objects.map(o => o.id);

    set({
      project: { ...get().project, objects: updatedObjects },
      selectedObjectId: result.objects[0].id,
      selectedObjectIds: newSelectedIds,
    });
    get().saveHistory();

    return { success: true, message: result.message, count: result.objects.length };
  },

  recenterPivotObject: async (idInput?: string) => {
    const { project, selectedObjectId, selectedObjectIds } = get();
    const targetIds = idInput ? [idInput] : (selectedObjectIds.length > 0 ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []));
    if (targetIds.length === 0) return;

    const { convertImportedToCSG } = await import('../utils/modifiers_advanced');
    const { createBaseGeometry } = await import('../utils/csg');
    const { fromThreeGeometry } = await import('../utils/modifiers');

    let updatedObjects = [...project.objects];
    let changed = false;

    for (const id of targetIds) {
      let obj = updatedObjects.find(o => o.id === id);
      if (!obj) continue;

      if (obj.meshData) {
        try {
          obj = await convertImportedToCSG(obj);
        } catch (e) {
          console.error('Error convirtiendo modelo para centrar pivote:', e);
        }
      }

      if (!obj.vertices || obj.vertices.length === 0) {
        try {
          const geo = createBaseGeometry(obj);
          const res = fromThreeGeometry(geo);
          obj = {
            ...obj,
            vertices: res.vertices,
            faces: res.faces,
            meshData: undefined,
          };
        } catch (e) {
          console.error('Error generando geometría para centrar pivote:', e);
          continue;
        }
      }

      let vertices = obj.vertices || [];
      if (!vertices.length) continue;

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      vertices.forEach((v, idx) => {
        const off = obj.vertexOffsets?.[idx] ?? [0, 0, 0];
        const vx = v[0] + off[0];
        const vy = v[1] + off[1];
        const vz = v[2] + off[2];
        if (vx < minX) minX = vx;
        if (vy < minY) minY = vy;
        if (vz < minZ) minZ = vz;
        if (vx > maxX) maxX = vx;
        if (vy > maxY) maxY = vy;
        if (vz > maxZ) maxZ = vz;
      });

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;

      if (Math.hypot(cx, cy, cz) < 1e-4) {
        if (obj.vertexOffsets && Object.keys(obj.vertexOffsets).length > 0) {
          const flushedVertices: V3[] = vertices.map((v, idx) => {
            const off = obj.vertexOffsets?.[idx] ?? [0, 0, 0];
            return [v[0] + off[0], v[1] + off[1], v[2] + off[2]];
          });
          updatedObjects = updatedObjects.map(o => o.id === id ? {
            ...obj,
            vertices: flushedVertices,
            vertexOffsets: {},
            meshData: undefined,
          } : o);
          changed = true;
        } else if (obj.meshData) {
          updatedObjects = updatedObjects.map(o => o.id === id ? {
            ...obj,
            meshData: undefined,
          } : o);
          changed = true;
        }
        continue;
      }

      const newVertices: V3[] = vertices.map((v, idx) => {
        const off = obj.vertexOffsets?.[idx] ?? [0, 0, 0];
        return [v[0] + off[0] - cx, v[1] + off[1] - cy, v[2] + off[2] - cz];
      });

      const scale = new THREE.Vector3(...obj.transform.scale);
      const euler = new THREE.Euler(...obj.transform.rotation, 'XYZ');
      const localOffset = new THREE.Vector3(cx, cy, cz).multiply(scale).applyEuler(euler);

      const newPos: [number, number, number] = [
        obj.transform.position[0] + localOffset.x,
        obj.transform.position[1] + localOffset.y,
        obj.transform.position[2] + localOffset.z,
      ];

      updatedObjects = updatedObjects.map(o => o.id === id ? {
        ...obj,
        vertices: newVertices,
        faces: obj.faces,
        vertexOffsets: {},
        meshData: undefined,
        transform: {
          ...obj.transform,
          position: newPos,
        }
      } : o);

      changed = true;
    }

    if (changed) {
      set({ project: { ...get().project, objects: updatedObjects } });
      get().saveHistory();
    }
  },

  capSelectedFacesObject: async (id) => {
    const { project, selectedFaceIndices } = get();
    let obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    if (obj.meshData) obj = await convertImportedToCSG(obj);
    const result = capSelectedFaces(obj, selectedFaceIndices);
    set({ project: { ...get().project, objects: get().project.objects.map(o => o.id === id ? { ...o, meshData: undefined, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o)}});
    get().saveHistory();
  },

  alignToGrid: (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const gs = 0.5;
    const newPos: V3 = obj.transform.position.map(v => Math.round(v/gs)*gs) as V3;
    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? { ...o, transform: { ...o.transform, position: newPos } } : o)}});
    get().saveHistory();
  },

  alignToGround: (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const box = new THREE.Box3();
    obj.vertices.forEach((v, i) => {
      const off = obj.vertexOffsets?.[i] || [0,0,0];
      box.expandByPoint(new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]));
    });
    const minY = box.min.y * obj.transform.scale[1];
    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === id ? { ...o, transform: { ...o.transform, position: [o.transform.position[0], -minY, o.transform.position[2]] } } : o
    )}});
    get().saveHistory();
  },

  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying:   (v)    => set({ isPlaying: v }),
  setIsScrubbing: (v)    => set({ isScrubbing: v }),
  setIsRecording: (v)    => set({ isRecording: v }),
  setViewMode:    (mode) => set({ viewMode: mode }),
  setEditMode: async (mode) => {
    if (mode !== 'OBJECT') {
      const { project, selectedObjectId } = get();
      if (selectedObjectId) {
        let obj = project.objects.find(o => o.id === selectedObjectId);
        if (obj && obj.meshData) {
          obj = await convertImportedToCSG(obj);
          obj.meshData = undefined;
          get().updateObject(obj.id, obj);
        }
      }
    }
    set({ editMode: mode, selectedVertexIndices: [], selectedFaceIndices: [], selectedEdgeIndices: [] });
  },
  setTransformMode:  (mode)  => set({ transformMode: mode }),
  setTransformSpace: (space) => set({ transformSpace: space }),
  setDrawMode:       (mode)  => set({ drawMode: mode }),
  setDrawColor:      (color) => set({ drawColor: color }),

  // ── FIX: Keyframes — deduplicate by time (±0.001 s tolerance) ────────────
  addKeyframe: (objectId, time) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === objectId);
    if (!obj) return;
    
    // Calculate interpolated transform at this time
    const _interpTransform = (() => {
      const kfs = obj.keyframes || [];
      if (kfs.length === 0) return obj.transform;
      const sorted = [...kfs].sort((a, b) => a.time - b.time);
      if (time <= sorted[0].time) return sorted[0].transform;
      if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].transform;
      let prev = sorted[0], next = sorted[0];
      for (let _i = 0; _i < sorted.length - 1; _i++) {
        if (time >= sorted[_i].time && time <= sorted[_i+1].time) {
          prev = sorted[_i]; next = sorted[_i+1]; break;
        }
      }
      const t = (time - prev.time) / (next.time - prev.time);
      const lerp = (a: number, b: number) => a + (b-a)*t;
      return {
        position: [lerp(prev.transform.position[0], next.transform.position[0]),
                   lerp(prev.transform.position[1], next.transform.position[1]),
                   lerp(prev.transform.position[2], next.transform.position[2])] as [number,number,number],
        rotation: [lerp(prev.transform.rotation[0], next.transform.rotation[0]),
                   lerp(prev.transform.rotation[1], next.transform.rotation[1]),
                   lerp(prev.transform.rotation[2], next.transform.rotation[2])] as [number,number,number],
        scale:    [lerp(prev.transform.scale[0], next.transform.scale[0]),
                   lerp(prev.transform.scale[1], next.transform.scale[1]),
                   lerp(prev.transform.scale[2], next.transform.scale[2])] as [number,number,number],
      };
    })();

    const newKf = { id: genId(), time, transform: JSON.parse(JSON.stringify(_interpTransform)) };
    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === objectId
        ? { ...o, keyframes: [...(o.keyframes || []).filter(k => Math.abs(k.time - time) > 0.001), newKf].sort((a,b) => a.time - b.time) }
        : o
    )}});
    get().saveHistory();
  },

  removeKeyframe: (objectId, keyframeId) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === objectId ? { ...o, keyframes: o.keyframes.filter(k => k.id !== keyframeId) } : o
    )}});
    get().saveHistory();
  },

  clearAllKeyframes: (objectId) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === objectId ? { ...o, keyframes: [] } : o
    )}});
    get().saveHistory();
  },
}));