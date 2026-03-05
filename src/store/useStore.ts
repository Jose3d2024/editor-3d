import { create } from 'zustand';
import { AppState, Project, CSGObject, CSGOperation, PrimitiveType, ViewportType, ReferenceImage, MeshFace, V3 } from '../types';
import { generatePrimitive } from '../utils/geometry';
import { applyBooleanOperation, smoothMesh, optimizeMesh, repairMesh } from '../utils/modifiers';

const DEFAULT_CUBE_GEOM = generatePrimitive('CUBE', { segments: 1 });

const DEFAULT_PROJECT: Project = {
  name: 'Nuevo Proyecto',
  objects: [
    {
      id: 'base-cube',
      name: 'Cubo Base',
      type: 'CUBE',
      operation: 'ADD',
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
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
  duration: 5,
  fps: 30,
  references: {
    top:   { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    front: { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
    side:  { url: null, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], opacity: 0.5, locked: false },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).substr(2, 9);

const computeNormal = (verts: V3[], indices: number[]): V3 => {
  const v0 = verts[indices[0]], v1 = verts[indices[1]], v2 = verts[indices[2]];
  const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2];
  const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2];
  const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  return [nx/len, ny/len, nz/len];
};

// ── Store interface ────────────────────────────────────────────────────────
interface Store extends AppState {
  setProject: (project: Project) => void;
  addObject: (type: PrimitiveType) => void;
  updateObject: (id: string, updates: Partial<CSGObject>) => void;
  updateParameters: (id: string, params: Partial<CSGObject['parameters']>) => void;
  updateVertexOffset: (id: string, vertexIndex: number, offset: V3) => void;
  updateVertexOffsets: (id: string, updates: { index: number; offset: V3 }[]) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  toggleObjectSelection: (id: string, multi: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setViewMode: (mode: 'SOLID' | 'WIREFRAME') => void;
  setShowCSG: (show: boolean) => void;
  setEditMode: (mode: 'OBJECT' | 'VERTEX' | 'FACE' | 'EDGE') => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  setActiveViewport: (viewport: ViewportType) => void;
  setSelectedVertexIndices: (indices: number[]) => void;
  setSelectedFaceIndices: (indices: number[]) => void;
  setSelectedEdgeIndices: (indices: number[]) => void;
  clearSelection: () => void;
  setMaximizedViewport: (viewport: ViewportType | null) => void;
  addSelectedVertexIndices: (indices: number[]) => void;
  addKeyframe: (objectId: string, time: number) => void;
  removeKeyframe: (objectId: string, keyframeId: string) => void;
  setReference: (view: 'top' | 'front' | 'side', updates: Partial<ReferenceImage>) => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;

  // Clipboard / Mirror / Extrude
  clipboard: CSGObject | null;
  copyObject: () => void;
  pasteObject: () => void;
  mirrorObject: (id: string, axis: 'x' | 'y' | 'z') => void;
  extrudeFaces: (id: string, faceIndices: number[], distance: number) => void;
  
  // Boolean / Modifiers
  applyBoolean: () => void;
  smoothObject: (id: string, factor: number) => void;
  optimizeObject: (id: string, ratio: number) => void;
  repairObject: (id: string) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useStore = create<Store>()((set, get) => ({
  project: DEFAULT_PROJECT,
  selectedObjectId: null,
  selectedObjectIds: [] as string[],
  currentTime: 0,
  isPlaying: false,
  viewMode: 'SOLID',
  showCSG: false,
  editMode: 'OBJECT',
  transformMode: 'translate',
  transformSpace: 'world',
  history: [DEFAULT_PROJECT],
  historyIndex: 0,
  activeViewport: 'PERSPECTIVE',
  selectedVertexIndices: [],
  selectedFaceIndices: [],
  selectedEdgeIndices: [],
  maximizedViewport: null,
  clipboard: null,

  // ── Project ──────────────────────────────────────────────────────────────
  setProject: (project) => set({ project }),

  // ── Selection ─────────────────────────────────────────────────────────────
  selectObject: (id) => set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [] }),

  toggleObjectSelection: (id, multi) => {
    const { selectedObjectIds } = get();
    let newIds: string[];
    
    if (multi) {
      if (selectedObjectIds.includes(id)) {
        newIds = selectedObjectIds.filter(i => i !== id);
      } else {
        newIds = [...selectedObjectIds, id];
      }
    } else {
      newIds = [id];
    }
    
    // Update primary selected object (last selected or null if empty)
    const newSelectedId = newIds.length > 0 ? newIds[newIds.length - 1] : null;
    set({ selectedObjectIds: newIds, selectedObjectId: newSelectedId });
  },

  // ── Viewport / selection helpers ─────────────────────────────────────────
  setActiveViewport: (viewport) => set({ activeViewport: viewport }),
  setSelectedVertexIndices: (indices) => set({ selectedVertexIndices: indices }),
  setSelectedFaceIndices:   (indices) => set({ selectedFaceIndices: indices }),
  setSelectedEdgeIndices:   (indices) => set({ selectedEdgeIndices: indices }),
  clearSelection: () => set({ selectedVertexIndices: [], selectedFaceIndices: [], selectedEdgeIndices: [] }),
  setMaximizedViewport: (viewport) => set({ maximizedViewport: viewport }),
  addSelectedVertexIndices: (indices) => {
    const unique = Array.from(new Set([...get().selectedVertexIndices, ...indices]));
    set({ selectedVertexIndices: unique });
  },
  setShowCSG: (show) => set({ showCSG: show }),

  setReference: (view, updates) => {
    const { project } = get();
    set({ project: { ...project, references: { ...project.references, [view]: { ...project.references[view], ...updates } } } });
  },

  // ── History ───────────────────────────────────────────────────────────────
  saveHistory: () => {
    const { history, historyIndex, project } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(project)));
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

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
  addObject: (type) => {
    const state = get();
    const defaultParams: CSGObject['parameters'] = {};

    switch (type) {
      case 'SPHERE':      
        defaultParams.segments = 32; 
        defaultParams.sphereType = 'UV';
        defaultParams.detail = 1; 
        break;
      case 'CYLINDER':    defaultParams.segments = 32; break;
      case 'CONE':        defaultParams.segments = 32; break;
      case 'TORUS':
        defaultParams.radialSegments = 16; defaultParams.tubularSegments = 100;
        defaultParams.radius = 0.5; defaultParams.tube = 0.2; break;
      case 'ICOSAHEDRON': defaultParams.detail = 0; break;
      case 'DODECAHEDRON':defaultParams.detail = 0; break;
      case 'CIRCLE':      defaultParams.segments = 32; break;
      case 'RING':
        defaultParams.innerRadius = 0.25; defaultParams.outerRadius = 0.5;
        defaultParams.thetaSegments = 32; break;
      default: defaultParams.segments = 1;
    }

    const geom = generatePrimitive(type, defaultParams);
    const typeNames: Record<string, string> = {
      'CUBE': 'Cubo',
      'SPHERE': 'Esfera',
      'CYLINDER': 'Cilindro',
      'CONE': 'Cono',
      'TORUS': 'Toroide',
      'ICOSAHEDRON': 'Icosaedro',
      'DODECAHEDRON': 'Dodecaedro',
      'PLANE': 'Plano',
      'CIRCLE': 'Círculo',
      'RING': 'Anillo'
    };
    const baseName = typeNames[type] || type;

    const newObj: CSGObject = {
      id: genId(),
      name: `${baseName} ${state.project.objects.length + 1}`,
      type,
      operation: 'ADD',
      transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] },
      parameters: defaultParams,
      vertices: geom.vertices,
      faces: geom.faces,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      opacity: 1,
      visible: true,
      keyframes: [],
    };

    set({ project: { ...state.project, objects: [...state.project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── Update ────────────────────────────────────────────────────────────────
  updateObject: (id, updates) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => o.id === id ? { ...o, ...updates } : o) } });
  },

  updateParameters: (id, params) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const newParams = { ...obj.parameters, ...params };
    const geom = generatePrimitive(obj.type, newParams);

    set({ project: { ...project, objects: project.objects.map(o => 
      o.id === id ? { 
        ...o, 
        parameters: newParams,
        vertices: geom.vertices,
        faces: geom.faces,
        vertexOffsets: {} // Clear offsets as topology changes
      } : o
    )}});
    get().saveHistory();
  },

  updateVertexOffset: (id, vertexIndex, offset) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      const vertexOffsets = { ...(o.vertexOffsets || {}), [vertexIndex]: offset };
      return { ...o, vertexOffsets };
    })}});
  },

  updateVertexOffsets: (id, updates) => {
    const { project } = get();
    set({ project: { ...project, objects: project.objects.map(o => {
      if (o.id !== id) return o;
      const vertexOffsets = { ...(o.vertexOffsets || {}) };
      updates.forEach(({ index, offset }) => { vertexOffsets[index] = offset; });
      return { ...o, vertexOffsets };
    })}});
  },

  // ── Remove / Duplicate ────────────────────────────────────────────────────
  removeObject: (id) => {
    const { project, selectedObjectId, selectedObjectIds } = get();
    const newSelectedObjectIds = selectedObjectIds.filter(i => i !== id);
    const newSelectedObjectId = selectedObjectId === id 
      ? (newSelectedObjectIds.length > 0 ? newSelectedObjectIds[newSelectedObjectIds.length - 1] : null) 
      : selectedObjectId;

    set({ 
      project: { ...project, objects: project.objects.filter(o => o.id !== id) }, 
      selectedObjectId: newSelectedObjectId,
      selectedObjectIds: newSelectedObjectIds
    });
    get().saveHistory();
  },

  duplicateObject: (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const newObj = { ...JSON.parse(JSON.stringify(obj)), id: genId(), name: `${obj.name} (Copia)` };
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── Clipboard ─────────────────────────────────────────────────────────────
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
    newObj.transform.position[0] += 0.5;
    newObj.transform.position[1] += 0.5;
    newObj.transform.position[2] += 0.5;
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── Mirror ────────────────────────────────────────────────────────────────
  mirrorObject: (id, axis) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;
    const newObj = JSON.parse(JSON.stringify(obj));
    newObj.id = genId();
    newObj.name = `${obj.name} (Espejo ${axis.toUpperCase()})`;
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newObj.transform.scale[idx] *= -1;
    set({ project: { ...project, objects: [...project.objects, newObj] }, selectedObjectId: newObj.id, selectedObjectIds: [newObj.id] });
    get().saveHistory();
  },

  // ── Extrude — malla unificada, 1 sola pieza ───────────────────────────────
  extrudeFaces: (id, faceIndices, distance) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    // Deep copy so we don't mutate state
    const newObj: CSGObject = JSON.parse(JSON.stringify(obj));
    const allNewVertexIndices: number[] = [];

    // Process each face
    faceIndices.forEach(faceIndex => {
      const face = newObj.faces[faceIndex];
      if (!face) return;

      // 1. Resolve face normal
      const normal: V3 = face.normal ?? computeNormal(newObj.vertices, face.indices);

      // 2. Compute current positions (base + offset) for each face vertex
      const oldIndices = [...face.indices];
      const currentPositions: V3[] = oldIndices.map(vIdx => {
        const base = newObj.vertices[vIdx];
        const off  = newObj.vertexOffsets?.[vIdx] ?? [0, 0, 0];
        return [base[0]+off[0], base[1]+off[1], base[2]+off[2]];
      });

      // 3. Add new cap vertices displaced along normal
      const newVertexIndices: number[] = currentPositions.map(pos => {
        const newV: V3 = [
          pos[0] + normal[0] * distance,
          pos[1] + normal[1] * distance,
          pos[2] + normal[2] * distance,
        ];
        newObj.vertices.push(newV);
        return newObj.vertices.length - 1;
      });
      
      allNewVertexIndices.push(...newVertexIndices);

      // 4. Move cap face to new vertices
      face.indices = newVertexIndices;
      face.normal  = normal; // same direction

      // 5. Add side quads connecting old ring → new ring
      for (let i = 0; i < oldIndices.length; i++) {
        const next = (i + 1) % oldIndices.length;
        const sideFace: MeshFace = {
          indices: [oldIndices[i], oldIndices[next], newVertexIndices[next], newVertexIndices[i]],
          // Normal computed lazily in the renderer via computeVertexNormals()
        };
        newObj.faces.push(sideFace);
      }

      // 6. Bake offsets for the old ring vertices (they are now fixed walls)
      if (newObj.vertexOffsets) {
        oldIndices.forEach((vIdx) => {
          const off = newObj.vertexOffsets![vIdx];
          if (off) {
            newObj.vertices[vIdx] = [
              newObj.vertices[vIdx][0] + off[0],
              newObj.vertices[vIdx][1] + off[1],
              newObj.vertices[vIdx][2] + off[2],
            ];
            delete newObj.vertexOffsets![vIdx];
          }
        });
      }
    });

    set({ 
      project: { ...project, objects: project.objects.map(o => o.id === id ? newObj : o) },
      selectedVertexIndices: allNewVertexIndices 
    });
    get().saveHistory();
  },

  // ── Boolean / Modifiers ───────────────────────────────────────────────────
  applyBoolean: () => {
    const { project, selectedObjectId } = get();
    if (!selectedObjectId) return;

    const toolIndex = project.objects.findIndex(o => o.id === selectedObjectId);
    if (toolIndex <= 0) return; // Need a target before it

    const target = project.objects[toolIndex - 1];
    const tool = project.objects[toolIndex];

    const result = applyBooleanOperation(target, tool, tool.operation);
    
    if (result) {
      const newTarget = {
        ...target,
        vertices: result.vertices,
        faces: result.faces,
        vertexOffsets: {}, // Clear offsets as topology changes
        name: `${target.name} + ${tool.name}`
      };

      const newObjects = [...project.objects];
      newObjects[toolIndex - 1] = newTarget; // Replace target
      newObjects.splice(toolIndex, 1);       // Remove tool

      set({ 
        project: { ...project, objects: newObjects },
        selectedObjectId: newTarget.id,
        selectedObjectIds: [newTarget.id]
      });
      get().saveHistory();
    }
  },

  smoothObject: (id, factor) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const result = smoothMesh(obj, factor, 1);
    
    set({ project: { ...project, objects: project.objects.map(o => 
      o.id === id ? { ...o, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o
    )}});
    get().saveHistory();
  },

  optimizeObject: (id, ratio) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const result = optimizeMesh(obj, ratio);
    
    set({ project: { ...project, objects: project.objects.map(o => 
      o.id === id ? { ...o, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o
    )}});
    get().saveHistory();
  },

  repairObject: (id) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === id);
    if (!obj) return;

    const result = repairMesh(obj);
    
    set({ project: { ...project, objects: project.objects.map(o => 
      o.id === id ? { ...o, vertices: result.vertices, faces: result.faces, vertexOffsets: {} } : o
    )}});
    get().saveHistory();
  },

  // ── Playback / modes ──────────────────────────────────────────────────────
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying:   (isPlaying) => set({ isPlaying }),
  setViewMode:    (mode) => set({ viewMode: mode }),
  setEditMode: (mode) => set({ editMode: mode, selectedVertexIndices: [], selectedFaceIndices: [], selectedEdgeIndices: [] }),
  setTransformMode:  (mode) => set({ transformMode: mode }),
  setTransformSpace: (space) => set({ transformSpace: space }),

  // ── Keyframes ─────────────────────────────────────────────────────────────
  addKeyframe: (objectId, time) => {
    const { project } = get();
    const obj = project.objects.find(o => o.id === objectId);
    if (!obj) return;
    const newKf = { id: genId(), time, transform: JSON.parse(JSON.stringify(obj.transform)) };
    set({ project: { ...project, objects: project.objects.map(o =>
      o.id === objectId
        ? { ...o, keyframes: [...o.keyframes.filter(k => k.time !== time), newKf].sort((a,b)=>a.time-b.time) }
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
}));
