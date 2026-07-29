import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewportType, V3, BezierHandle, CSGObject } from '../types';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadOptimizedEnvironmentTexture } from '../utils/hdrLoader';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { useStore } from '../store/useStore';
import { performCSG, createPrimitiveMesh } from '../utils/csg';
import { generateUVs, applyUVWMapping } from '../utils/modifiers';
import { createParallaxMaterial } from '../utils/ParallaxMaterial';
import { setupTriplanarMaterial } from '../utils/TriplanarMaterial';
import { createPBRMaterial, updateORMUniforms } from '../utils/materialUtils';
import { Plus, Minus, ChevronDown } from 'lucide-react';
import { fileToDataURL } from '../utils/silhouettes';

interface ViewportProps {
  type: ViewportType;
  title: string;
}

// Initialize RectAreaLightUniformsLib globally
RectAreaLightUniformsLib.init();

export const Viewport: React.FC<ViewportProps> = ({ type: initialType, title: initialTitle }) => {
  const [type, setType] = React.useState<ViewportType | 'CAMERA'>(initialType);
  const [title, setTitle] = React.useState(initialTitle);
  const [viewCameraId, setViewCameraId] = React.useState<string | null>(null);

  // Sync with prop if it changes (e.g. from MultiViewport)
  useEffect(() => {
    setType(initialType);
    setTitle(initialTitle);
    setViewCameraId(null);
  }, [initialType, initialTitle]);

  const containerRef = useRef<HTMLDivElement>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement>(null);
  const gizmoDisplayRef = useRef<HTMLDivElement>(null);  // numeric value overlay

  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const bgTextureRef = useRef<THREE.Texture | null>(null);
  const envTextureRef = useRef<THREE.Texture | null>(null);
  const groupRef = useRef<THREE.Group>(new THREE.Group());
  const primitivesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const siluetaGroupRef = useRef<THREE.Group>(new THREE.Group());
  const vertexPointsRef = useRef<THREE.Points | null>(null);
  
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const selectedVertexIndexRef = useRef<number | null>(null);
  const selectedVertexIndicesRef = useRef<number[]>([]);
  const isDraggingRef = useRef(false);

  const drawingPointsRef = useRef<THREE.Vector3[]>([]);
  const drawingHandlesRef = useRef<BezierHandle[]>([]);
  const drawingObjectIdRef = useRef<string | null>(null);
  const drawingMeshRef = useRef<THREE.Object3D | null>(null);
  const drawingPreviewPointRef = useRef<THREE.Vector3 | null>(null);
  const isDrawingHandleRef = useRef(false);

  const gizmoStateRef = useRef<{
    hoveredAxis: 'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'XZ' | 'FREE' | null;
    activeAxis: 'X' | 'Y' | 'Z' | 'XY' | 'YZ' | 'XZ' | 'FREE' | null;
    startMouseWorld: THREE.Vector3;
    startPos: [number,number,number];
    startRot: [number,number,number];
    startScale: [number,number,number];
    startScreenPos: {x:number, y:number};
    startVertexOffsets: Record<number, [number,number,number]>;
    dragHandleType?: 'anchor' | 'bezierOut' | 'bezierIn';
    dragAnchorIdx?: number;
    startTransforms: Record<string, { position: [number,number,number], rotation: [number,number,number], scale: [number,number,number] }>;
  }>({
    hoveredAxis: null,
    activeAxis: null,
    startMouseWorld: new THREE.Vector3(),
    startPos: [0,0,0],
    startRot: [0,0,0],
    startScale: [1,1,1],
    startScreenPos: {x:0,y:0},
    startVertexOffsets: {},
    startTransforms: {},
  });

  const initialTransformRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    basePositions: { [index: number]: THREE.Vector3 };
    initialOffsets: { [index: number]: [number, number, number] };
    meshMatrix: THREE.Matrix4;
  } | null>(null);

  const { 
    project, currentTime, viewMode, setViewMode, selectedObjectId, selectedObjectIds, selectObject,
    selectedLightId, selectLight, selectedCameraId, selectCamera,
    toggleObjectSelection, editMode, transformMode, setTransformMode, transformSpace,
    drawMode, setDrawMode, addShape, updateBezierHandle,
    updateVertexOffset, updateVertexOffsets, updateObject, updateObjects,
    activeViewport, setActiveViewport, selectedVertexIndices, setSelectedVertexIndices,
    addSelectedVertexIndices, selectedFaceIndices, setSelectedFaceIndices,
    selectedEdgeIndices, setSelectedEdgeIndices, selectedGLTFMeshes, setSelectedGLTFMeshes,
    isolateGLTFSelection, clearSelection,
    maximizedViewport, setMaximizedViewport, saveHistory,
    gridSnapEnabled, setGridSnapEnabled, isRecording,
    setSilueta, moveReferenceMode, setReference,
    addMaterial, assignMaterialToObjects
  } = useStore();
  const { silueta } = project;

  // Silueta interaction refs
  const siluetaDragRef = useRef<{ planeKey: 'front'|'back'|'left'|'right'|'top'|'bottom'; pointIndex: number } | null>(null);
  const refDragRef = useRef<{ viewKey: 'top'|'bottom'|'front'|'back'|'left'|'right'; startPos: [number,number,number]; startMouse: THREE.Vector3 } | null>(null);
  const siluetaRef = useRef(silueta);
  const marqueeRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  // Pending marquee: records mousedown position but doesn't start selection until drag > 5px
  const pendingMarqueeRef = useRef<{ x: number; y: number } | null>(null);

  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { siluetaRef.current = silueta; }, [silueta]);

  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getPoint = (e: PointerEvent | MouseEvent, skipSnap = false) => {
    if (!rendererRef.current || !cameraRef.current) return null;
    const canvas = rendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    
    const drawPlaneNormal =
      (type === 'FRONT' || type === 'BACK') ? new THREE.Vector3(0, 0, 1) :
      (type === 'LEFT' || type === 'RIGHT') ? new THREE.Vector3(1, 0, 0) :
                                              new THREE.Vector3(0, 1, 0);
    const plane = new THREE.Plane(drawPlaneNormal, 0);
    const target = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, target)) return null;
    
    if (skipSnap) return target;

    const p = target.clone();
    if (gridSnapEnabled) {
      const gs = 0.1;
      if (type === 'FRONT' || type === 'BACK') {
        p.x = Math.round(p.x / gs) * gs;
        p.y = Math.round(p.y / gs) * gs;
      } else if (type === 'LEFT' || type === 'RIGHT') {
        p.z = Math.round(p.z / gs) * gs;
        p.y = Math.round(p.y / gs) * gs;
      } else {
        p.x = Math.round(p.x / gs) * gs;
        p.z = Math.round(p.z / gs) * gs;
      }
    }

    if (e.shiftKey && drawingPointsRef.current.length > 0) {
      const last = drawingPointsRef.current[drawingPointsRef.current.length - 1];
      const dx = Math.abs(p.x - last.x);
      const dy = Math.abs(p.y - last.y);
      const dz = Math.abs(p.z - last.z);
      if (type === 'FRONT' || type === 'BACK') {
        if (dx > dy) p.y = last.y; else p.x = last.x;
      } else if (type === 'LEFT' || type === 'RIGHT') {
        if (dz > dy) p.y = last.y; else p.z = last.z;
      } else {
        if (dx > dz) p.z = last.z; else p.x = last.x;
      }
    }
    return p;
  };

  const getInterpolatedTransform = (obj: any, time: number) => {
    const kfs = obj.keyframes;
    if (!kfs || kfs.length === 0) return obj.transform;
    const sorted = [...kfs].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].transform;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].transform;
    let prev = sorted[0], next = sorted[0];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (time >= sorted[i].time && time <= sorted[i+1].time) {
        prev = sorted[i]; next = sorted[i+1]; break;
      }
    }
    const t = (time - prev.time) / (next.time - prev.time);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return {
      position: [lerp(prev.transform.position[0], next.transform.position[0]),
                 lerp(prev.transform.position[1], next.transform.position[1]),
                 lerp(prev.transform.position[2], next.transform.position[2])] as [number, number, number],
      rotation: [lerp(prev.transform.rotation[0], next.transform.rotation[0]),
                 lerp(prev.transform.rotation[1], next.transform.rotation[1]),
                 lerp(prev.transform.rotation[2], next.transform.rotation[2])] as [number, number, number],
      scale:    [lerp(prev.transform.scale[0], next.transform.scale[0]),
                 lerp(prev.transform.scale[1], next.transform.scale[1]),
                 lerp(prev.transform.scale[2], next.transform.scale[2])] as [number, number, number],
    };
  };

  const scaleSelection = (factor: number) => {
    if (!selectedObjectId || selectedVertexIndices.length === 0) return;
    const mesh = primitivesGroupRef.current.children.find(c => c.userData.id === selectedObjectId) as THREE.Mesh;
    const selectedObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
    if (!mesh || !selectedObj) return;
    const positions = mesh.geometry.getAttribute('position');
    const centroid = new THREE.Vector3();
    selectedVertexIndices.forEach(idx => {
      centroid.add(new THREE.Vector3(positions.getX(idx), positions.getY(idx), positions.getZ(idx)));
    });
    centroid.divideScalar(selectedVertexIndices.length);
    const updates = selectedVertexIndices.map(idx => {
      const currentPos = new THREE.Vector3(positions.getX(idx), positions.getY(idx), positions.getZ(idx));
      const currentOffset = selectedObj.vertexOffsets?.[idx] || [0, 0, 0];
      const toVertex = currentPos.clone().sub(centroid);
      const scaledToVertex = toVertex.multiplyScalar(factor);
      const newPos = centroid.clone().add(scaledToVertex);
      const delta = newPos.sub(currentPos);
      return { index: idx, offset: [currentOffset[0]+delta.x, currentOffset[1]+delta.y, currentOffset[2]] as [number,number,number] };
    });
    updateVertexOffsets(selectedObjectId, updates);
    saveHistory();
  };

  const handleRecenter = () => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam) return;

    // Compute world bounding box of ALL visible objects (or just selected one)
    const objects = projectRef.current.objects.filter(o => o.visible);
    if (objects.length === 0) return;

    const box = new THREE.Box3();
    objects.forEach(obj => {
      const _interp = getInterpolatedTransform(obj, currentTime);
      const mat4 = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(_interp.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
        new THREE.Vector3().fromArray(_interp.scale),
      );
      obj.vertices.forEach((v, i) => {
        const off = obj.vertexOffsets?.[i] ?? [0,0,0];
        const worldPt = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
        box.expandByPoint(worldPt);
      });
    });

    if (box.isEmpty()) { box.set(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1)); }

    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);

    if (type === 'PERSPECTIVE') {
      // Move camera to fit the bounding sphere with some padding
      const fov    = (cam as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const dist   = (maxDim * 0.5 / Math.tan(fov * 0.5)) * 1.6;
      if (controls) {
        controls.target.copy(center);
        // Keep current viewing direction but adjust distance
        const dir = new THREE.Vector3().subVectors(cam.position, controls.target);
        const len = dir.length();
        dir.normalize().multiplyScalar(len > 0.01 ? dist : dist);
        cam.position.copy(center).add(dir.lengthSq() > 0 ? dir : new THREE.Vector3(0.6,0.5,1).normalize().multiplyScalar(dist));
        controls.update();
      }
    } else {
      const orthoCam = cam as THREE.OrthographicCamera;

      // Reset camera position to look straight at the scene from the correct axis
      if (type === 'TOP') {
        orthoCam.position.set(center.x, center.y + 10, center.z);
        orthoCam.up.set(0, 0, -1);
      } else if (type === 'BOTTOM') {
        orthoCam.position.set(center.x, center.y - 10, center.z);
        orthoCam.up.set(0, 0, 1);
      } else if (type === 'FRONT') {
        orthoCam.position.set(center.x, center.y, center.z + 10);
        orthoCam.up.set(0, 1, 0);
      } else if (type === 'BACK') {
        orthoCam.position.set(center.x, center.y, center.z - 10);
        orthoCam.up.set(0, 1, 0);
      } else if (type === 'LEFT') {
        orthoCam.position.set(center.x - 10, center.y, center.z);
        orthoCam.up.set(0, 1, 0);
      } else if (type === 'RIGHT') {
        orthoCam.position.set(center.x + 10, center.y, center.z);
        orthoCam.up.set(0, 1, 0);
      }
      orthoCam.lookAt(center);

      // Zoom to fit: adjust orthographic zoom so the bounding box fills 80% of the view
      const renderer = rendererRef.current;
      const w = renderer?.domElement.clientWidth  ?? 1;
      const h = renderer?.domElement.clientHeight ?? 1;
      const asp = w / h;
      const halfH = 5; // matches init size=10 → half=5
      const halfW = halfH * asp;

      let viewW = 1, viewH = 1;
      if (type === 'TOP' || type === 'BOTTOM') {
        viewW = size.x; viewH = size.z;
      } else if (type === 'FRONT' || type === 'BACK') {
        viewW = size.x; viewH = size.y;
      } else if (type === 'LEFT' || type === 'RIGHT') {
        viewW = size.z; viewH = size.y;
      }

      const neededH = Math.max(viewW / asp, viewH) * 0.6;
      const neededW = Math.max(viewW, viewH * asp) * 0.6;
      const fitZoom  = Math.min(halfH / (neededH || 1), halfW / (neededW || 1), 10);

      orthoCam.zoom = Math.max(0.1, fitZoom);

      // Pan the ortho camera so center is in middle of view (reset controls target)
      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
      orthoCam.updateProjectionMatrix();
    }
  };

  const handleResetView = () => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return;

    if (type === 'PERSPECTIVE') {
      cam.position.set(10, 10, 10);
      controls.target.set(0, 0, 0);
      cam.up.set(0, 1, 0);
    } else {
      controls.target.set(0, 0, 0);
      switch(type) {
        case 'TOP':    cam.position.set(0, 20, 0); break;
        case 'BOTTOM': cam.position.set(0, -20, 0); break;
        case 'FRONT':  cam.position.set(0, 0, 20); break;
        case 'BACK':   cam.position.set(0, 0, -20); break;
        case 'LEFT':   cam.position.set(-20, 0, 0); break;
        case 'RIGHT':  cam.position.set(20, 0, 0); break;
      }
    }
    controls.update();
  };

  const handleAlignToAxes = () => {
    const ids = selectedObjectIds.length > 0 ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
    if (ids.length === 0) return;
    
    // Snap rotation to nearest 90 degrees (Math.PI / 2)
    const snap = (val: number) => Math.round(val / (Math.PI / 2)) * (Math.PI / 2);
    
    ids.forEach(id => {
      const obj = project.objects.find(o => o.id === id);
      if (obj) {
        useStore.getState().updateObject(id, {
          transform: {
            ...obj.transform,
            rotation: [
              snap(obj.transform.rotation[0]),
              snap(obj.transform.rotation[1]),
              snap(obj.transform.rotation[2])
            ]
          }
        });
      }
    });
    useStore.getState().saveHistory();
  };

  const handleAlignToFloor = () => {
    const ids = selectedObjectIds.length > 0 ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
    if (ids.length === 0) return;

    ids.forEach(id => {
      const obj = project.objects.find(o => o.id === id);
      if (!obj) return;

      let posOffset = 0;
      // Attempt exact bounding box calculation from rendered mesh in primitivesGroupRef
      const mesh = primitivesGroupRef.current?.children.find((ch: any) => ch.userData.id === id);
      if (mesh) {
        const box = new THREE.Box3().setFromObject(mesh);
        if (isFinite(box.min.y)) {
          posOffset = 0 - box.min.y;
        }
      } else if (obj.vertices && obj.vertices.length > 0) {
        const euler = new THREE.Euler(obj.transform.rotation[0], obj.transform.rotation[1], obj.transform.rotation[2]);
        const scale = new THREE.Vector3(...obj.transform.scale);
        let min = Infinity;
        obj.vertices.forEach((v, idx) => {
          const off = obj.vertexOffsets?.[idx] ?? [0,0,0];
          const p = new THREE.Vector3((v[0]+off[0])*scale.x, (v[1]+off[1])*scale.y, (v[2]+off[2])*scale.z).applyEuler(euler);
          if (p.y < min) min = p.y;
        });
        if (isFinite(min)) {
          posOffset = 0 - (obj.transform.position[1] + min);
        }
      }

      useStore.getState().updateObject(id, {
        transform: {
          ...obj.transform,
          position: [
            obj.transform.position[0],
            obj.transform.position[1] + posOffset,
            obj.transform.position[2]
          ]
        }
      });
    });
    useStore.getState().saveHistory();
  };

  const handleRecenterPivot = () => {
    useStore.getState().recenterPivotObject();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current || !cameraRef.current || !sceneRef.current) return;

    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // Raycast against the scene
    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
    
    // Find the first object with an ID in userData
    const hit = intersects.find(i => i.object.userData.id);
    const targetId = hit ? hit.object.userData.id : selectedObjectId;

    if (!targetId) return;

    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const data = JSON.parse(jsonData);
        if (data.materialId) {
          // Assign existing material from manager
          assignMaterialToObjects([targetId], data.materialId);
          saveHistory();
          return;
        } else if (data.name) {
          // Import and assign new material (from example materials)
          const newId = Math.random().toString(36).substr(2, 9);
          addMaterial({ ...data, id: newId });
          assignMaterialToObjects([targetId], newId);
          saveHistory();
          return;
        }
      } catch (err) {
        console.error('Error parsing drop data:', err);
      }
    }

    const textureUrl = e.dataTransfer.getData('application/x-texture-url');
    const textureType = e.dataTransfer.getData('application/x-texture-type') || 'map';

    if (textureUrl) {
      // Apply existing texture
      const obj = project.objects.find(o => o.id === targetId);
      if (obj) {
        const m = obj.material || {};
        updateObject(targetId, { material: { ...m, [textureType]: textureUrl } });
        setViewMode('TEXTURED');
        saveHistory();
      }
    } else if (e.dataTransfer.files.length > 0) {
      // Handle file drop
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const url = await fileToDataURL(file);
        const obj = project.objects.find(o => o.id === targetId);
        if (obj) {
          const m = obj.material || {};
          updateObject(targetId, { material: { ...m, map: url } });
          setViewMode('TEXTURED');
          saveHistory();
        }
      }
    }
  };

  const handleZoomIn = () => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (cam instanceof THREE.OrthographicCamera) {
      cam.zoom = Math.min(cam.zoom * 1.25, 20);
      cam.updateProjectionMatrix();
    } else if (controlsRef.current) {
      const dist = cam.position.distanceTo(controlsRef.current.target);
      const dir  = new THREE.Vector3().subVectors(cam.position, controlsRef.current.target).normalize();
      cam.position.copy(controlsRef.current.target).add(dir.multiplyScalar(dist * 0.75));
      controlsRef.current.update();
    }
  };

  const handleZoomOut = () => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (cam instanceof THREE.OrthographicCamera) {
      cam.zoom = Math.max(cam.zoom / 1.25, 0.05);
      cam.updateProjectionMatrix();
    } else if (controlsRef.current) {
      const dist = cam.position.distanceTo(controlsRef.current.target);
      const dir  = new THREE.Vector3().subVectors(cam.position, controlsRef.current.target).normalize();
      cam.position.copy(controlsRef.current.target).add(dir.multiplyScalar(dist * 1.33));
      controlsRef.current.update();
    }
  };

  useEffect(() => {
    if (!sceneRef.current) return;
    const grid = sceneRef.current.getObjectByName('scene-grid');
    if (grid) grid.visible = project.showGrid !== false;
  }, [project.showGrid]);

  // ── 1. Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 300;

    const scene = sceneRef.current;
    scene.background = new THREE.Color(0x1a1a1a);
    scene.clear();
    scene.add(groupRef.current);
    scene.add(primitivesGroupRef.current);
    scene.add(siluetaGroupRef.current);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.3));
    
    const dl1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dl1.position.set(5, 10, 7.5);
    scene.add(dl1);

    const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dl2.position.set(-5, -5, -5);
    scene.add(dl2);

    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    grid.name = 'scene-grid';
    if (type==='FRONT' || type==='BACK') grid.rotation.x = Math.PI/2;
    if (type==='LEFT' || type==='RIGHT') grid.rotation.z = Math.PI/2;
    scene.add(grid);
    grid.visible = projectRef.current.showGrid !== false;

    let camera: THREE.Camera;
    if (type === 'CAMERA' && viewCameraId) {
      const camData = projectRef.current.cameras?.find(c => c.id === viewCameraId);
      if (camData) {
        if (camData.type === 'PERSPECTIVE') {
          camera = new THREE.PerspectiveCamera(camData.fov, width/height, camData.near, camData.far);
          (camera as THREE.PerspectiveCamera).filmGauge = camData.filmGauge || 35;
        } else {
          const asp = width/height, size = camData.fov || 10;
          camera = new THREE.OrthographicCamera(-size*asp/2, size*asp/2, size/2, -size/2, camData.near, camData.far);
        }
        camera.position.fromArray(camData.transform.position);
        camera.rotation.fromArray(camData.transform.rotation);
        camera.scale.fromArray(camData.transform.scale);
      } else {
        camera = new THREE.PerspectiveCamera(50, width/height, 0.1, 1000);
        camera.position.set(5,5,5);
      }
    } else if (type === 'PERSPECTIVE') {
      camera = new THREE.PerspectiveCamera(50, width/height, 0.1, 1000);
      camera.position.set(5,5,5);
    } else {
      const asp = width/height, size = 10;
      camera = new THREE.OrthographicCamera(-size*asp/2, size*asp/2, size/2, -size/2, 0.1, 1000);
      if (type==='TOP')    { camera.position.set(0,10,0);  (camera as any).up.set(0,0,-1); camera.lookAt(0,0,0); }
      if (type==='BOTTOM') { camera.position.set(0,-10,0); (camera as any).up.set(0,0,1);  camera.lookAt(0,0,0); }
      if (type==='FRONT')  { camera.position.set(0,0,10);  camera.lookAt(0,0,0); }
      if (type==='BACK')   { camera.position.set(0,0,-10); camera.lookAt(0,0,0); }
      if (type==='LEFT')   { camera.position.set(-10,0,0); camera.lookAt(0,0,0); }
      if (type==='RIGHT')  { camera.position.set(10,0,0);  camera.lookAt(0,0,0); }
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x1a1a1a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (containerRef.current) {
      while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
      containerRef.current.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    }
    rendererRef.current = renderer;

    // Initial environment setup
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envData = projectRef.current.environment;
    if (envData.hdriUrl) {
      loadOptimizedEnvironmentTexture(envData.hdriUrl, { maxDimension: envData.maxResolution || 2048 })
        .then((texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;
          scene.environment = envMap;
          scene.background = envData.backgroundVisible ? texture : new THREE.Color(0x1a1a1a);

          if (bgTextureRef.current && bgTextureRef.current !== texture) bgTextureRef.current.dispose();
          if (envTextureRef.current && envTextureRef.current !== envMap) envTextureRef.current.dispose();
          bgTextureRef.current = texture;
          envTextureRef.current = envMap;
        })
        .catch((e) => console.error('Failed to load initial environment map:', e));
    } else {
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    pmremGenerator.dispose();

    // ALL viewports get OrbitControls — perspective gets full rotate+pan+zoom,
    // ortho views get pan+zoom only (rotate disabled so the angle is locked).
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = type === 'PERSPECTIVE';
    controls.dampingFactor  = 0.1;
    controls.enableRotate   = type === 'PERSPECTIVE' || type === 'CAMERA';
    controls.mouseButtons   = (type === 'PERSPECTIVE' || type === 'CAMERA')
      ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.PAN,    MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.screenSpacePanning = true;
    
    controlsRef.current = controls;

    // Restore camera state if exists
    if (type !== 'CAMERA') {
      const savedCam = useStore.getState().viewportCameras[type];
      if (savedCam) {
        camera.position.fromArray(savedCam.position);
        controls.target.fromArray(savedCam.target);
        if ((camera as any).isOrthographicCamera || (camera as any).isPerspectiveCamera) {
          if ((camera as any).isOrthographicCamera) (camera as any).zoom = savedCam.zoom;
          (camera as any).updateProjectionMatrix();
        }
        controls.update();
      }
    }

    // Update last camera state for rendering and persistence
    controls.addEventListener('change', () => {
      const state = useStore.getState();
      const pos = camera.position.toArray() as V3;
      const rot = camera.rotation.toArray() as V3;
      
      if (type === 'CAMERA' && viewCameraId) {
        const camData = state.project.cameras?.find(c => c.id === viewCameraId);
        if (camData) {
          state.updateCamera(viewCameraId, {
            transform: { ...camData.transform, position: pos, rotation: rot }
          });
        }
        return;
      }
      
      const target = controls.target.toArray() as V3;
      const zoom = (camera as any).zoom || 1;
      const cameraState = { position: pos, target, zoom };

      if (state.activeViewport === type || state.maximizedViewport === type) {
        state.setLastCameraState(cameraState);
      }
      state.setViewportCamera(type, cameraState);
    });

    renderer.render(scene, camera);
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        rendererRef.current.domElement.remove();
        rendererRef.current = null;
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
    };
  }, [type, viewCameraId]);

  // ── 1.4 Lights Rendering ────────────────────────────────────────────────
  const lightsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Cleanup old lights
    lightsRef.current.forEach(l => scene.remove(l));
    lightsRef.current.clear();

    project.lights.forEach(lData => {
      if (!lData.visible) return;

      let light: THREE.Light;
      switch (lData.type) {
        case 'POINT':
          light = new THREE.PointLight(lData.color, lData.intensity, lData.distance, lData.decay);
          break;
        case 'DIRECTIONAL':
          light = new THREE.DirectionalLight(lData.color, lData.intensity);
          break;
        case 'SPOT':
          light = new THREE.SpotLight(lData.color, lData.intensity, lData.distance, lData.angle, lData.penumbra, lData.decay);
          break;
        case 'RECTAREA':
          light = new THREE.RectAreaLight(lData.color, lData.intensity, lData.width, lData.height);
          break;
        case 'AMBIENT':
          light = new THREE.AmbientLight(lData.color, lData.intensity);
          break;
        default:
          return;
      }

      light.position.fromArray(lData.transform.position);
      light.rotation.fromArray(lData.transform.rotation);
      
      if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
        const target = new THREE.Object3D();
        target.position.set(0, 0, -1);
        light.add(target);
        light.target = target;
      }
      
      light.castShadow = !!lData.castShadow;
      const l = light as any;
      if (l.shadow) {
        l.shadow.bias = -0.001;
        l.shadow.mapSize.set(1024, 1024);
        if (l instanceof THREE.DirectionalLight) {
          l.shadow.camera.left = -20;
          l.shadow.camera.right = 20;
          l.shadow.camera.top = 20;
          l.shadow.camera.bottom = -20;
          l.shadow.camera.near = 0.1;
          l.shadow.camera.far = 50;
        } else if (l instanceof THREE.SpotLight) {
          l.shadow.camera.near = 0.1;
          l.shadow.camera.far = 50;
        } else if (l instanceof THREE.PointLight) {
          l.shadow.camera.near = 0.1;
          l.shadow.camera.far = 50;
        }
      }
      scene.add(light);
      lightsRef.current.set(lData.id, light);

      // Add a small selectable gizmo for the light
      const gizmoGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const gizmoMat = new THREE.MeshBasicMaterial({ color: lData.color, wireframe: true, transparent: true, opacity: 0.5 });
      const gizmo = new THREE.Mesh(gizmoGeo, gizmoMat);
      gizmo.position.copy(light.position);
      gizmo.rotation.copy(light.rotation);
      gizmo.userData = { id: lData.id, isLight: true };
      scene.add(gizmo);
      lightsRef.current.set(`${lData.id}-gizmo`, gizmo);

      // Add helper if selected
      if (selectedLightId === lData.id) {
        let helper: THREE.Object3D | null = null;
        if (light instanceof THREE.PointLight) helper = new THREE.PointLightHelper(light, 0.5);
        if (light instanceof THREE.DirectionalLight) helper = new THREE.DirectionalLightHelper(light, 1);
        if (light instanceof THREE.SpotLight) helper = new THREE.SpotLightHelper(light);
        if (light instanceof THREE.RectAreaLight) helper = new RectAreaLightHelper(light);
        
        if (helper) {
          helper.userData = { id: lData.id, isLight: true };
          scene.add(helper);
          lightsRef.current.set(`${lData.id}-helper`, helper);
        }
      }
    });

    return () => {
      lightsRef.current.forEach(l => scene.remove(l));
    };
  }, [project.lights, selectedLightId]);

  // ── 1.1b Cámaras ─────────────────────────────────────────────────────────
  const camerasRef = useRef<Map<string, THREE.Object3D>>(new Map());
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Cleanup old cameras
    camerasRef.current.forEach(c => scene.remove(c));
    camerasRef.current.clear();

    (project.cameras || []).forEach(cData => {
      // Create a visual representation of the camera
      const camGroup = new THREE.Group();
      
      // Camera body
      const bodyGeom = new THREE.BoxGeometry(0.4, 0.4, 0.6);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.userData = { id: cData.id, isCamera: true };
      camGroup.add(body);

      // Camera lens
      const lensGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.3, 16);
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
      const lens = new THREE.Mesh(lensGeom, lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -0.45;
      lens.userData = { id: cData.id, isCamera: true };
      camGroup.add(lens);

      camGroup.position.fromArray(cData.transform.position);
      camGroup.rotation.fromArray(cData.transform.rotation);
      camGroup.scale.fromArray(cData.transform.scale);
      
      camGroup.userData = { id: cData.id, isCamera: true };
      scene.add(camGroup);
      camerasRef.current.set(cData.id, camGroup);

      // Add helper if selected
      const { selectedCameraId } = useStore.getState();
      if (selectedCameraId === cData.id) {
        const size = cData.fov || 5;
        const helperCam = cData.type === 'PERSPECTIVE' 
          ? new THREE.PerspectiveCamera(cData.fov, 16/9, cData.near, cData.far)
          : new THREE.OrthographicCamera(-size, size, size, -size, cData.near, cData.far);
        
        if (cData.type === 'PERSPECTIVE') {
          (helperCam as THREE.PerspectiveCamera).filmGauge = cData.filmGauge || 35;
        }
        
        const helper = new THREE.CameraHelper(helperCam);
        camGroup.add(helper);
        camerasRef.current.set(`${cData.id}-helper`, helper);
      }

      // Sync viewport camera if this is the active camera view
      if (type === 'CAMERA' && viewCameraId === cData.id && cameraRef.current) {
        const cam = cameraRef.current;
        cam.position.fromArray(cData.transform.position);
        cam.rotation.fromArray(cData.transform.rotation);
        cam.scale.fromArray(cData.transform.scale);
        if (cData.type === 'PERSPECTIVE' && (cam as any).isPerspectiveCamera) {
          const pCam = cam as THREE.PerspectiveCamera;
          pCam.fov = cData.fov;
          pCam.filmGauge = cData.filmGauge || 35;
          pCam.near = cData.near;
          pCam.far = cData.far;
          pCam.updateProjectionMatrix();
        } else if (cData.type === 'ORTHOGRAPHIC' && (cam as any).isOrthographicCamera) {
          const oCam = cam as THREE.OrthographicCamera;
          const size = cData.fov || 10;
          const asp = oCam.right / oCam.top; // Keep current aspect ratio
          oCam.left = -size * asp / 2;
          oCam.right = size * asp / 2;
          oCam.top = size / 2;
          oCam.bottom = -size / 2;
          oCam.near = cData.near;
          oCam.far = cData.far;
          oCam.updateProjectionMatrix();
        }
      }
    });

    return () => {
      camerasRef.current.forEach(c => scene.remove(c));
    };
  }, [project.cameras, selectedCameraId, type, viewCameraId]);

  // ── 1.2 Resize Observer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
        if (!w || !h) return;
        rendererRef.current.setSize(w, h, false);
        if (cameraRef.current instanceof THREE.PerspectiveCamera) {
          cameraRef.current.aspect = w/h; cameraRef.current.updateProjectionMatrix();
        } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
          const asp = w/h;
          let size = 10;
          if (type === 'CAMERA' && viewCameraId) {
            const camData = useStore.getState().project.cameras?.find(c => c.id === viewCameraId);
            if (camData && camData.type === 'ORTHOGRAPHIC') size = camData.fov || 10;
          }
          cameraRef.current.left=-size*asp/2; cameraRef.current.right=size*asp/2;
          cameraRef.current.top=size/2; cameraRef.current.bottom=-size/2;
          cameraRef.current.updateProjectionMatrix();
        }
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [type]);

  // ── 1.5 Animation Loop ───────────────────────────────────────────────────
  useEffect(() => {
    let id: number;
    const animate = () => {
      id = requestAnimationFrame(animate);
      try {
        if (rendererRef.current && cameraRef.current && sceneRef.current) {
          if (controlsRef.current) controlsRef.current.update();

          // Update parallax camera position
          sceneRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                if (mat.uniforms && mat.uniforms.uCameraPos) {
                  mat.uniforms.uCameraPos.value.copy(cameraRef.current!.position);
                }
              });
            }
          });

          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } catch {}
    };
    animate();
    return () => cancelAnimationFrame(id);
  }, []);

  // ── 1.5b Disable OrbitControls while draw mode is active ────────────────
  // OrbitControls and drawing listeners share the same canvas element.
  // Without this, every pointer drag in draw mode ALSO pans/rotates the camera,
  // causing: (a) Bézier handles not working, (b) points placed at wrong coords.
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    
    const isSiluetaActiveInThisViewport = !!(silueta.activePlane && 
      silueta.activePlane.toUpperCase() === type.toUpperCase()
    );

    ctrl.enabled = !drawMode && !isSiluetaActiveInThisViewport && !moveReferenceMode;
    return () => { if (controlsRef.current) controlsRef.current.enabled = true; };
  }, [drawMode, silueta.activePlane, type, moveReferenceMode]);

  // ── 1.6 Reference Image ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const existing = sceneRef.current.getObjectByName('reference-plane');
    if (existing) sceneRef.current.remove(existing);

    const viewKey = type.toLowerCase() as 'top'|'bottom'|'front'|'back'|'left'|'right';
    if (!['top','bottom','front','back','left','right'].includes(viewKey)) return;
    const refData = project.references[viewKey];
    if (!refData?.url) return;

    new THREE.TextureLoader().load(refData.url, tex => {
      const old = sceneRef.current?.getObjectByName('reference-plane');
      if (old) sceneRef.current!.remove(old);
      const aspect = tex.image ? (tex.image.width / tex.image.height) : 1;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1,1),
        new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:refData.opacity, side:THREE.DoubleSide, depthWrite:false })
      );
      plane.name = 'reference-plane';
      const s = refData.scale[1] || refData.scale[0] || 5;
      plane.scale.set(s * aspect, s, 1);
      
      const pos = refData.position || [0, 0, 0];
      plane.position.set(pos[0], pos[1], pos[2]);

      if (type === 'TOP' || type === 'BOTTOM') {
        plane.rotation.x = -Math.PI/2;
        if (type === 'BOTTOM') plane.rotation.x = Math.PI/2;
      } else if (type === 'FRONT' || type === 'BACK') {
        if (type === 'BACK') plane.rotation.y = Math.PI;
      } else if (type === 'LEFT' || type === 'RIGHT') {
        plane.rotation.y = Math.PI/2;
        if (type === 'LEFT') plane.rotation.y = -Math.PI/2;
      }
      sceneRef.current?.add(plane);
    });
  }, [project.references, type]);

  // ── 1.8 Environment Update ──────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const env = project.environment;

    const updateEnv = async () => {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      if (env.hdriUrl) {
        try {
          const texture = await loadOptimizedEnvironmentTexture(env.hdriUrl, { maxDimension: env.maxResolution || 2048 });
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;
          scene.environment = envMap;
          scene.background = env.backgroundVisible ? texture : new THREE.Color(0x1a1a1a);

          if (bgTextureRef.current && bgTextureRef.current !== texture) {
            bgTextureRef.current.dispose();
          }
          if (envTextureRef.current && envTextureRef.current !== envMap) {
            envTextureRef.current.dispose();
          }
          bgTextureRef.current = texture;
          envTextureRef.current = envMap;
        } catch (e) {
          console.error('Failed to load HDRI/EXR:', e);
          scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.background = new THREE.Color(0x1a1a1a);
        }
      } else {
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.background = new THREE.Color(0x1a1a1a);
      }
      pmremGenerator.dispose();
    };

    updateEnv();
  }, [project.environment.hdriUrl, project.environment.backgroundVisible, project.environment.maxResolution]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = project.environment.exposure;
    }
  }, [project.environment.exposure]);

  // ── 1.7 Silueta Reference Image ──────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const existing = sceneRef.current.getObjectByName('silueta-reference-plane');
    if (existing) sceneRef.current.remove(existing);

    if (!silueta.activePlane) return;

    const viewKey = type.toLowerCase() as 'top'|'bottom'|'front'|'back'|'left'|'right';
    if (!['top','bottom','front','back','left','right'].includes(viewKey)) return;
    
    const imageUrl = silueta[`${viewKey}Image` as keyof typeof silueta] as string | null;
    if (!imageUrl) return;

    new THREE.TextureLoader().load(imageUrl, tex => {
      const old = sceneRef.current?.getObjectByName('silueta-reference-plane');
      if (old) sceneRef.current!.remove(old);
      
      const aspect = tex.image ? (tex.image.width / tex.image.height) : 1;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:0.4, side:THREE.DoubleSide, depthWrite:false })
      );
      plane.name = 'silueta-reference-plane';
      plane.scale.set(aspect, 1, 1);
      
      if (type === 'TOP' || type === 'BOTTOM') {
        plane.rotation.x = -Math.PI/2;
        if (type === 'BOTTOM') plane.rotation.x = Math.PI/2;
        plane.position.y = (type === 'TOP' ? -0.01 : 0.01);
      } else if (type === 'FRONT' || type === 'BACK') {
        if (type === 'BACK') plane.rotation.y = Math.PI;
        plane.position.z = (type === 'FRONT' ? -0.01 : 0.01);
      } else if (type === 'LEFT' || type === 'RIGHT') {
        plane.rotation.y = Math.PI/2;
        if (type === 'LEFT') plane.rotation.y = -Math.PI/2;
        plane.position.x = (type === 'RIGHT' ? -0.01 : 0.01);
      }

      sceneRef.current?.add(plane);
    });
  }, [silueta.activePlane, silueta.frontImage, silueta.backImage, silueta.leftImage, silueta.rightImage, silueta.topImage, silueta.bottomImage, type]);

  // ── Silueta Rendering ───────────────────────────────────────────────────
  useEffect(() => {
    const group = siluetaGroupRef.current;
    if (!group) return;
    group.clear();

    // If silueta tool is active (any plane), we show the contours in their respective viewports
    if (!silueta.activePlane) return;
    
    let planeKey: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | null = null;
    const t = type.toLowerCase() as any;
    if (['front','back','left','right','top','bottom'].includes(t)) {
      planeKey = t;
    }
    
    if (!planeKey) return;

    const contour = silueta[planeKey] || [];
    if (contour.length === 0) return;

    // Render lines
    const points: THREE.Vector3[] = [];
    contour.forEach(p => {
      if (planeKey === 'front' || planeKey === 'back') points.push(new THREE.Vector3(p[0], p[1], 0));
      else if (planeKey === 'left' || planeKey === 'right') points.push(new THREE.Vector3(0, p[1], p[0]));
      else if (planeKey === 'top' || planeKey === 'bottom') points.push(new THREE.Vector3(p[0], 0, -p[1]));
    });
    
    if (points.length > 1) {
      // Close loop for visualization
      const closedPoints = [...points, points[0]];
      const lineGeom = new THREE.BufferGeometry().setFromPoints(closedPoints);
      const color = (planeKey === 'front' || planeKey === 'back') ? 0xff0000 : ((planeKey === 'left' || planeKey === 'right') ? 0x22d3ee : 0x22c55e);
      const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
      group.add(line);
    }

    // Render points
    contour.forEach((p, idx) => {
      const dotGeom = new THREE.SphereGeometry(0.04, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.userData.siluetaIdx = idx;   // ← needed for raycaster hit detection
      if (planeKey === 'front' || planeKey === 'back') dot.position.set(p[0], p[1], 0);
      else if (planeKey === 'left' || planeKey === 'right') dot.position.set(0, p[1], p[0]);
      else if (planeKey === 'top' || planeKey === 'bottom') dot.position.set(p[0], 0, -p[1]);
      group.add(dot);
    });
  }, [silueta, type]);

  const meshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const mixersRef = useRef<Map<string, THREE.AnimationMixer>>(new Map());
  const gltfCacheRef = useRef<Map<string, { scene: THREE.Object3D, animations: THREE.AnimationClip[] }>>(new Map());

  // ── 2. Scene sync — builds geometry from vertices/faces (unified mesh) ───
  useEffect(() => {
    const group = groupRef.current;
    const primitivesGroup = primitivesGroupRef.current;
    if (!group || !primitivesGroup) return;
    group.clear();
    primitivesGroup.clear();
    meshesRef.current.clear();
    vertexPointsRef.current = null;

    const getMaterialForObject = (obj: CSGObject, mData: any) => {
      // Ensure mData has defaults from obj if not present
      const finalMData = {
        ...mData,
        color: mData.color || obj.color || '#ffffff',
        opacity: mData.opacity ?? obj.opacity ?? 1,
        transparent: (mData.opacity ?? obj.opacity ?? 1) < 1,
      };

      if (finalMData.useParallax && viewMode === 'TEXTURED') {
        const loader = new THREE.TextureLoader();
        const loadTex = (url: string | undefined, isColor = false) => {
          if (!url) return undefined;
          const tex = loader.load(url, (loadedTex) => {
            loadedTex.flipY = finalMData.flipY ?? true;
            loadedTex.needsUpdate = true;
          });
          if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = finalMData.flipY ?? true;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          if (finalMData.mapRepeat) tex.repeat.set(finalMData.mapRepeat[0], finalMData.mapRepeat[1]);
          if (finalMData.mapOffset) tex.offset.set(finalMData.mapOffset[0], finalMData.mapOffset[1]);
          if (finalMData.mapRotation !== undefined) tex.rotation = (finalMData.mapRotation * Math.PI) / 180;
          return tex;
        };

        const maps = {
          albedo: loadTex(finalMData.map, true),
          normal: loadTex(finalMData.normalMap),
          roughness: loadTex(finalMData.roughnessMap),
          metallic: loadTex(finalMData.metalnessMap),
          ao: loadTex(finalMData.aoMap),
          displacement: loadTex(finalMData.displacementMap),
        };
        return createParallaxMaterial(maps, {
          scale: finalMData.parallaxScale ?? 0.1,
          steps: finalMData.parallaxSteps ?? 32,
          tiling: finalMData.mapRepeat ?? [1, 1],
          color: finalMData.color,
          roughness: finalMData.roughness ?? 0.5,
          metalness: finalMData.metalness ?? 0,
          opacity: finalMData.opacity,
          transparent: finalMData.transparent,
          normalScale: finalMData.normalScale ?? 1,
        });
      }

      const mat = createPBRMaterial(finalMData);
      if (finalMData.uvwMapping === 'TRIPLANAR' && viewMode === 'TEXTURED') {
        setupTriplanarMaterial(mat, finalMData);
      }
      return mat;
    };

    project.objects.forEach(obj => {
      if (!obj.visible) return;
      
      const _interpTransform = getInterpolatedTransform(obj, currentTime);
      const initialPos = new THREE.Vector3(..._interpTransform.position);
      const initialRot = new THREE.Euler(..._interpTransform.rotation);
      const initialScale = new THREE.Vector3(..._interpTransform.scale);
      const mat4 = new THREE.Matrix4().compose(
        initialPos,
        new THREE.Quaternion().setFromEuler(initialRot),
        initialScale
      );

      // Handle GLTF/STL/OBJ objects specifically
      if (obj.meshData) {
        const isSelected = (selectedObjectIds ?? [selectedObjectId]).includes(obj.id);
        
        // Resolve material: priority is inline material > materialId > default
        const projectMaterials = project.materials || [];
        const referencedMaterial = obj.materialId ? project.materials.find(m => m.id === obj.materialId) : null;
        const mData = {
          ...(referencedMaterial || {}),
          ...(obj.material || {})
        } as any;
        
        let customMaterial: THREE.Material | null = null;
        if (obj.materialId || Object.keys(obj.material || {}).length > 0 || (obj.color && obj.color !== '#ffffff') || (obj.opacity !== undefined && obj.opacity !== 1)) {
            customMaterial = getMaterialForObject(obj, mData);
        }

        const applyViewModeToImported = (object3D: THREE.Object3D) => {
          let meshIdx = 0;
          object3D.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (customMaterial) {
                mesh.material = customMaterial;
              } else {
                const mapMaterial = (origMat: THREE.Material) => {
                  const projMat = projectMaterials.find(m => m.id === origMat.userData.csgMaterialId);
                  if (projMat) {
                    return getMaterialForObject(obj, projMat);
                  }
                  return origMat;
                };

                if (Array.isArray(mesh.material)) {
                  mesh.material = mesh.material.map(mapMaterial);
                } else {
                  mesh.material = mapMaterial(mesh.material);
                }
              }
              
              const meshId = `mesh-${meshIdx++}`;
              const isMeshSelected = isSelected && selectedGLTFMeshes && selectedGLTFMeshes.includes(meshId);
              
              // Isolation mode
              if (isSelected && isolateGLTFSelection) {
                mesh.visible = isMeshSelected;
              } else {
                mesh.visible = true;
              }

              if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                  mesh.material = mesh.material.map(m => {
                    const cloned = isMeshSelected ? m.clone() : m;
                    if (isMeshSelected && (cloned as any).color) {
                      (cloned as any).color.setHex(0xffff00);
                      if ((cloned as any).emissive) {
                        (cloned as any).emissive.setHex(0x444400);
                      }
                    }
                    (cloned as any).wireframe = viewMode === 'WIREFRAME';
                    return cloned;
                  });
                } else {
                  const cloned = isMeshSelected ? mesh.material.clone() : mesh.material;
                  if (isMeshSelected && (cloned as any).color) {
                    (cloned as any).color.setHex(0xffff00);
                    if ((cloned as any).emissive) {
                      (cloned as any).emissive.setHex(0x444400);
                    }
                  }
                  (cloned as any).wireframe = viewMode === 'WIREFRAME';
                  mesh.material = cloned;
                }
              }
            }
            if (child.userData.isSkeletonHelper) {
              child.visible = viewMode === 'WIREFRAME' || isSelected;
            }
          });
        };

        const cacheKey = obj.meshData.data;
        const cached = gltfCacheRef.current.get(cacheKey);
        
        if (cached) {
          const clonedScene = SkeletonUtils.clone(cached.scene);
          clonedScene.position.copy(initialPos);
          clonedScene.rotation.copy(initialRot);
          clonedScene.scale.copy(initialScale);
          clonedScene.updateMatrixWorld(true);
          clonedScene.userData.id = obj.id;
          
          let meshIdx = 0;
          let hasBones = false;
          clonedScene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              
              // Add invisible raycasting proxy for each mesh
              const pickMesh = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
              mesh.updateMatrixWorld(true);
              pickMesh.applyMatrix4(mesh.matrixWorld);
              pickMesh.userData.id = obj.id;
              pickMesh.userData.meshId = `mesh-${meshIdx++}`;
              primitivesGroup.add(pickMesh);
            }
            if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
              hasBones = true;
            }
          });
          if (hasBones) {
            const helper = new THREE.SkeletonHelper(clonedScene);
            helper.userData.isSkeletonHelper = true;
            clonedScene.add(helper);
          }

          applyViewModeToImported(clonedScene);

          if (cached.animations && cached.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(clonedScene);
            cached.animations.forEach(clip => {
              mixer.clipAction(clip).play();
            });
            mixer.setTime(currentTime);
            mixersRef.current.set(obj.id, mixer);
          }

          group.add(clonedScene);
          meshesRef.current.set(obj.id, clonedScene);
          return;
        }

        if (obj.meshData.type === 'gltf') {
          const loader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
          loader.setDRACOLoader(dracoLoader);
          loader.setMeshoptDecoder(MeshoptDecoder);
          loader.load(obj.meshData.data, (gltf) => {
            const scene = gltf.scene;
            
            // Cache the original loaded scene and animations
            gltfCacheRef.current.set(cacheKey, { scene: scene, animations: gltf.animations || [] });
            
            // Clone it for this instance
            const clonedScene = SkeletonUtils.clone(scene);
            clonedScene.position.copy(initialPos);
            clonedScene.rotation.copy(initialRot);
            clonedScene.scale.copy(initialScale);
            clonedScene.updateMatrixWorld(true);
            clonedScene.userData.id = obj.id;
            
            let meshIdx = 0;
            let hasBones = false;
            clonedScene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (!mesh.geometry.attributes.normal) {
                  mesh.geometry.computeVertexNormals();
                }

                // Add invisible raycasting proxy for each mesh
                const pickMesh = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
                mesh.updateMatrixWorld(true);
                pickMesh.applyMatrix4(mesh.matrixWorld);
                pickMesh.userData.id = obj.id;
                pickMesh.userData.meshId = `mesh-${meshIdx++}`;
                primitivesGroup.add(pickMesh);
              }
              if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
                hasBones = true;
              }
            });
            if (hasBones) {
              const helper = new THREE.SkeletonHelper(clonedScene);
              helper.userData.isSkeletonHelper = true;
              clonedScene.add(helper);
            }

            applyViewModeToImported(clonedScene);

            if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(clonedScene);
              gltf.animations.forEach(clip => {
                mixer.clipAction(clip).play();
              });
              mixer.setTime(currentTime);
              mixersRef.current.set(obj.id, mixer);
            }

            group.add(clonedScene);
            meshesRef.current.set(obj.id, clonedScene);
          }, undefined, (error) => {
            console.error(`❌ Error loading GLTF for object ${obj.id}:`, error);
          });
          return;
        } else if (obj.meshData.type === 'stl') {
          new STLLoader().load(obj.meshData.data, (geometry) => {
            const material = new THREE.MeshPhysicalMaterial({ color: obj.color || '#ffffff' });
            const mesh = new THREE.Mesh(geometry, material);
            
            gltfCacheRef.current.set(cacheKey, { scene: mesh, animations: [] });
            
            const clonedMesh = mesh.clone();
            clonedMesh.position.copy(initialPos);
            clonedMesh.rotation.copy(initialRot);
            clonedMesh.scale.copy(initialScale);
            clonedMesh.updateMatrixWorld(true);
            clonedMesh.userData.id = obj.id;
            applyViewModeToImported(clonedMesh);
            
            group.add(clonedMesh);
            meshesRef.current.set(obj.id, clonedMesh);
          });
          return;
        } else if (obj.meshData.type === 'obj') {
          new OBJLoader().load(obj.meshData.data, (object) => {
            gltfCacheRef.current.set(cacheKey, { scene: object, animations: [] });
            
            const clonedObject = object.clone();
            clonedObject.position.copy(initialPos);
            clonedObject.rotation.copy(initialRot);
            clonedObject.scale.copy(initialScale);
            clonedObject.updateMatrixWorld(true);
            clonedObject.userData.id = obj.id;
            applyViewModeToImported(clonedObject);
            
            group.add(clonedObject);
            meshesRef.current.set(obj.id, clonedObject);
          });
          return;
        }
      }

      if (obj.type === 'SHAPE' && (!obj.faces || obj.faces.length === 0)) {
          const isBezier = obj.parameters.shapeType === 'bezier';
          const isSelected = (selectedObjectIds ?? [selectedObjectId]).includes(obj.id);
          const inEditMode = isSelected && editMode !== 'OBJECT';
          const objColor = isSelected ? 0xffff00 : new THREE.Color(obj.color).getHex();

          // Control points with offsets applied
          const ctrlPts = obj.vertices.map((v, i) => {
            const off = obj.vertexOffsets?.[i] ?? [0,0,0];
            return new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]);
          });

          // ── Build display curve ───────────────────────────────────────────
          let curveLine: THREE.Object3D;
          if (isBezier && ctrlPts.length >= 2 && obj.bezierHandles) {
            // Cubic Bezier chain: each segment uses anchor[i], anchor[i]+out[i],
            // anchor[i+1]+in[i+1], anchor[i+1]
            const allCurvePoints: THREE.Vector3[] = [];
            const count = obj.parameters.closed ? ctrlPts.length : ctrlPts.length - 1;
            for (let i = 0; i < count; i++) {
              const i1 = (i + 1) % ctrlPts.length;
              const h = obj.bezierHandles;
              if (!h[i] || !h[i1]) continue;
              const p0 = ctrlPts[i];
              const p1 = p0.clone().add(new THREE.Vector3(...h[i].out));
              const p3 = ctrlPts[i1];
              const p2 = p3.clone().add(new THREE.Vector3(...h[i1].in));
              const seg = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
              const pts = seg.getPoints(obj.parameters.segments ?? 20);
              if (allCurvePoints.length > 0) pts.shift(); // avoid duplicate junction
              allCurvePoints.push(...pts);
            }
            const geo = new THREE.BufferGeometry().setFromPoints(allCurvePoints);
            curveLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: objColor, linewidth: 2 }));
          } else if (isBezier && ctrlPts.length >= 2) {
            // FIX: For bezier without handles yet, auto-smooth and render as proper bezier
            // (no more CatmullRom fallback that produces wrong curves)
            const allCurvePoints2: THREE.Vector3[] = [];
            const segCount = obj.parameters.segments ?? 20;
            const handles2 = obj.bezierHandles!;
            const loopCount = obj.parameters.closed ? ctrlPts.length : ctrlPts.length - 1;
            for (let i = 0; i < loopCount; i++) {
              const i1 = (i + 1) % ctrlPts.length;
              const hOut = handles2[i]?.out   ?? [0,0,0];
              const hIn  = handles2[i1]?.in   ?? [0,0,0];
              const p0   = ctrlPts[i];
              const p1   = p0.clone().add(new THREE.Vector3(...hOut));
              const p3   = ctrlPts[i1];
              const p2   = p3.clone().add(new THREE.Vector3(...hIn));
              const seg2 = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
              const pts2 = seg2.getPoints(segCount);
              if (allCurvePoints2.length > 0) pts2.shift();
              allCurvePoints2.push(...pts2);
            }
            const geo2 = new THREE.BufferGeometry().setFromPoints(allCurvePoints2);
            curveLine = new THREE.Line(geo2, new THREE.LineBasicMaterial({ color: objColor, linewidth: 2 }));
          } else {
            const geo = new THREE.BufferGeometry().setFromPoints(ctrlPts);
            curveLine = obj.parameters.closed
              ? new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: objColor }))
              : new THREE.Line(geo, new THREE.LineBasicMaterial({ color: objColor }));
          }
          curveLine.position.copy(initialPos);
          curveLine.rotation.copy(initialRot);
          curveLine.scale.copy(initialScale);
          curveLine.updateMatrixWorld(true);
          curveLine.userData.id = obj.id;
          group.add(curveLine);
          meshesRef.current.set(obj.id, curveLine);

          if (inEditMode) {
            const pickLine = curveLine.clone() as THREE.Line;
            pickLine.material = new THREE.LineBasicMaterial({ visible: false });
            pickLine.userData.id = obj.id;
            pickLine.userData.handleType = 'curveLine';
            primitivesGroup.add(pickLine);
          }

          // ── Anchors and Bezier handles (only in edit mode) ───────────────────────────
          if (inEditMode && obj.vertices) {
            const selectedSet = new Set(selectedVertexIndices);
            ctrlPts.forEach((anchor, i) => {
              const h = obj.bezierHandles?.[i];
              const anchorWorld = anchor.clone().applyMatrix4(mat4);
              const isAnchorSel = selectedSet.has(i);

              // ── Anchor point ──
              const anchorMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 8, 8),
                new THREE.MeshBasicMaterial({ color: isAnchorSel ? 0xff8800 : 0xffffff, depthTest: false })
              );
              anchorMesh.position.copy(anchorWorld);
              anchorMesh.renderOrder = 4;
              anchorMesh.userData.id = obj.id;
              anchorMesh.userData.handleType = 'anchor';
              anchorMesh.userData.anchorIdx = i;
              group.add(anchorMesh);

              // Show handles only for selected anchors (or all if in edit mode)
              const showHandles = inEditMode && isBezier && h;
              if (showHandles) {
                // ── OUT handle (blue) ──
                // If handle is zero-length, show at a minimum visible offset so it can be grabbed
                const MIN_H = 0.18;
                const rawOut = new THREE.Vector3(...h.out);
                const outPos = rawOut.length() > 0.001 ? rawOut : new THREE.Vector3(MIN_H, 0, 0);
                const outWorld = anchor.clone().add(outPos).applyMatrix4(mat4);
                // Arm line anchor→out
                const outLineGeo = new THREE.BufferGeometry().setFromPoints([anchorWorld, outWorld]);
                const outLine = new THREE.Line(outLineGeo, new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.7, depthTest: false }));
                outLine.userData.id = obj.id;
                group.add(outLine);
                // Handle dot
                const outMesh = new THREE.Mesh(
                  new THREE.SphereGeometry(0.04, 7, 7),
                  new THREE.MeshBasicMaterial({ color: selectedSet.has(i + 10000) ? 0xff4400 : 0x4488ff, depthTest: false })
                );
                outMesh.position.copy(outWorld);
                outMesh.renderOrder = 4;
                outMesh.userData.id = obj.id;
                outMesh.userData.handleType = 'bezierOut';
                outMesh.userData.anchorIdx = i;
                group.add(outMesh);

                // ── IN handle (green) ──
                const rawIn = new THREE.Vector3(...h.in);
                const inPos = rawIn.length() > 0.001 ? rawIn : new THREE.Vector3(-MIN_H, 0, 0);
                const inWorld = anchor.clone().add(inPos).applyMatrix4(mat4);
                const inLineGeo = new THREE.BufferGeometry().setFromPoints([anchorWorld, inWorld]);
                const inLine = new THREE.Line(inLineGeo, new THREE.LineBasicMaterial({ color: 0x44cc44, transparent: true, opacity: 0.7, depthTest: false }));
                inLine.userData.id = obj.id;
                group.add(inLine);
                const inMesh = new THREE.Mesh(
                  new THREE.SphereGeometry(0.04, 7, 7),
                  new THREE.MeshBasicMaterial({ color: selectedSet.has(i + 20000) ? 0xff4400 : 0x44cc44, depthTest: false })
                );
                inMesh.position.copy(inWorld);
                inMesh.renderOrder = 4;
                inMesh.userData.id = obj.id;
                inMesh.userData.handleType = 'bezierIn';
                inMesh.userData.anchorIdx = i;
                group.add(inMesh);
              }

              // Invisible pick sphere for anchor
              const pickSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.09, 6, 6),
                new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
              );
              pickSphere.position.copy(anchorWorld);
              pickSphere.userData.id = obj.id;
              pickSphere.userData.handleType = 'anchor';
              pickSphere.userData.anchorIdx = i;
              primitivesGroup.add(pickSphere);

              // Invisible pick spheres for handles
              if (showHandles) {
                const outPos2 = anchor.clone().add(new THREE.Vector3(...h.out)).applyMatrix4(mat4);
                const outPick = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
                outPick.position.copy(outPos2);
                outPick.userData.id = obj.id;
                outPick.userData.handleType = 'bezierOut';
                outPick.userData.anchorIdx = i;
                primitivesGroup.add(outPick);

                const inPos2 = anchor.clone().add(new THREE.Vector3(...h.in)).applyMatrix4(mat4);
                const inPick = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
                inPick.position.copy(inPos2);
                inPick.userData.id = obj.id;
                inPick.userData.handleType = 'bezierIn';
                inPick.userData.anchorIdx = i;
                primitivesGroup.add(inPick);
              }
            });
          }

          // ── Invisible pick line for object selection ──────────────────────
          const pickLine = obj.parameters.closed && !isBezier
            ? new THREE.LineLoop((curveLine as THREE.Line).geometry, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
            : new THREE.Line((curveLine as THREE.Line).geometry, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
          pickLine.applyMatrix4(mat4);
          pickLine.userData.id = obj.id;
          primitivesGroup.add(pickLine);

          return;
      }

      // ── Build Geometry with UV support ──────────────────────────────────
      let meshData = { vertices: obj.vertices, faces: obj.faces };
      const hasUVs = obj.faces?.some(f => f.uvs && f.uvs.length > 0);
      
      // Resolve material: priority is inline material > materialId > default
      const projectMaterials = project.materials || [];
      const referencedMaterial = obj.materialId ? projectMaterials.find(m => m.id === obj.materialId) : null;
      const mData = {
        ...(referencedMaterial || {}),
        ...(obj.material || {})
      } as any;

      if (!hasUVs && obj.vertices && obj.faces) {
        meshData = generateUVs(meshData);
      }

      // Apply UVW Mapping overrides if specified
      if (mData.uvwMapping && mData.uvwMapping !== 'PLANAR' && obj.vertices && obj.faces) {
        meshData = { ...meshData, faces: meshData.faces.map(f => ({ ...f, uvs: undefined })) }; // Clear existing UVs for re-projection
        meshData = applyUVWMapping(meshData, mData.uvwMapping);
      }

      const indices: number[] = [];
      const finalPos: number[] = [];
      const finalUv: number[] = [];
      const vertMap = new Map<string, number>();
      const faceMap: number[] = [];
      const vertexMap: number[] = []; // Maps finalPos index to obj.vertices index

      // We also need a flat position array for the wireframe (based on original indices)
      const posArr: number[] = [];
      meshData.vertices.forEach((v, i) => {
        const off = obj.vertexOffsets?.[i] || [0,0,0];
        posArr.push(v[0]+off[0], v[1]+off[1], v[2]+off[2]);
      });

      meshData.faces?.forEach((face, fIdx) => {
        const faceIndices: number[] = [];
        face.indices.forEach((posIdx, i) => {
          const uv = face.uvs?.[i] || [0, 0];
          // Create a unique vertex for each position + UV combination to handle seams
          const key = `${posIdx}_${uv[0].toFixed(4)}_${uv[1].toFixed(4)}`;
          
          if (vertMap.has(key)) {
            faceIndices.push(vertMap.get(key)!);
          } else {
            const newIdx = finalPos.length / 3;
            const v = meshData.vertices[posIdx];
            const off = obj.vertexOffsets?.[posIdx] || [0,0,0];
            finalPos.push(v[0]+off[0], v[1]+off[1], v[2]+off[2]);
            finalUv.push(uv[0], uv[1]);
            vertMap.set(key, newIdx);
            faceIndices.push(newIdx);
            vertexMap.push(posIdx);
          }
        });

        // Triangulate face (fan)
        for (let i = 1; i < faceIndices.length - 1; i++) {
          indices.push(faceIndices[0], faceIndices[i], faceIndices[i+1]);
          faceMap.push(fIdx);
        }
      });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(finalPos, 3));
      if (hasUVs || (!hasUVs && obj.vertices && obj.faces)) {
        const uvAttr = new THREE.Float32BufferAttribute(finalUv, 2);
        geometry.setAttribute('uv', uvAttr);
        geometry.setAttribute('uv2', uvAttr);
      }
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      if (mData.useParallax) {
        geometry.computeTangents();
      }

      const isSelected = (selectedObjectIds ?? [selectedObjectId]).includes(obj.id);

      // ── Solid mesh ───────────────────────────────────────────────────────
      if (viewMode !== 'WIREFRAME') {
        const opacity = obj.opacity ?? 1;
        
        // Resolve material: priority is inline material > materialId > default
        const projectMaterials = project.materials || [];
        const referencedMaterial = obj.materialId ? project.materials.find(m => m.id === obj.materialId) : null;
        
        // Merge referenced material with inline overrides
        const m = {
          ...(referencedMaterial || {}),
          ...(obj.material || {})
        } as any;

        const finalMaterial = getMaterialForObject(obj, m);

        const solidMesh = new THREE.Mesh(geometry, finalMaterial);
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
        solidMesh.position.copy(initialPos);
        solidMesh.rotation.copy(initialRot);
        solidMesh.scale.copy(initialScale);
        solidMesh.updateMatrixWorld(true);
        solidMesh.userData.id = obj.id;
        group.add(solidMesh);
        meshesRef.current.set(obj.id, solidMesh);
      }

      // ── Wireframe overlay (Topology-based) ───────────────────────────────
      // We build edges from the logical faces to ensure every edge is visible,
      // regardless of the angle between faces (unlike EdgesGeometry).
      const edgeSet = new Set<string>();
      const edgePositions: number[] = [];
      
      obj.faces.forEach(face => {
        const len = face.indices.length;
        for (let i = 0; i < len; i++) {
          const a = face.indices[i];
          const b = face.indices[(i + 1) % len];
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            // Look up positions from the posArr we built earlier
            // posArr is flat [x,y,z, x,y,z...], so index * 3
            edgePositions.push(
              posArr[a*3], posArr[a*3+1], posArr[a*3+2],
              posArr[b*3], posArr[b*3+1], posArr[b*3+2]
            );
          }
        }
      });

      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));

      const edgeLines = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: viewMode==='WIREFRAME' ? (isSelected?0x4f8ef7:0x22dd44) : 0x444444,
          opacity: viewMode==='WIREFRAME' ? 1 : (isSelected?0.3:0.05),
          transparent: true,
          depthTest: viewMode !== 'WIREFRAME', 
          depthWrite: false
        })
      );
      edgeLines.position.copy(initialPos);
      edgeLines.rotation.copy(initialRot);
      edgeLines.scale.copy(initialScale);
      edgeLines.updateMatrixWorld(true);
      edgeLines.renderOrder = 1; // Ensure it renders on top of the solid mesh
      edgeLines.userData.id = obj.id;
      group.add(edgeLines);

      // ── Sub-object edit helpers ──────────────────────────────────────────
      if (isSelected && editMode !== 'OBJECT') {
        const posAttr = geometry.getAttribute('position');

        if (editMode === 'VERTEX') {
          const pointGeo = new THREE.BufferGeometry();
          const logicalVerts: number[] = [];
          if (obj.vertices) {
            obj.vertices.forEach((v, i) => {
              const off = obj.vertexOffsets?.[i] || [0,0,0];
              logicalVerts.push(v[0]+off[0], v[1]+off[1], v[2]+off[2]);
            });
          }
          pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(logicalVerts, 3));
          pointGeo.computeBoundingSphere();
          const pts = new THREE.Points(pointGeo, new THREE.PointsMaterial({ visible:true, transparent:true, opacity:0, size:0.2 }));
          pts.position.copy(initialPos);
          pts.rotation.copy(initialRot);
          pts.scale.copy(initialScale);
          pts.updateMatrixWorld(true);
          vertexPointsRef.current = pts;

          const selectedSet = new Set(selectedVertexIndices);
          const logicalPosAttr = pointGeo.getAttribute('position');
          for (let i = 0; i < logicalPosAttr.count; i++) {
            const dot = new THREE.Mesh(
              new THREE.SphereGeometry(0.012, 6, 6),
              new THREE.MeshBasicMaterial({ color: selectedSet.has(i)?0xffaa00:0x888888, depthTest:false })
            );
            const world = new THREE.Vector3(logicalPosAttr.getX(i), logicalPosAttr.getY(i), logicalPosAttr.getZ(i))
              .multiply(initialScale)
              .applyEuler(initialRot)
              .add(initialPos);
            dot.position.copy(world);
            dot.renderOrder = 2;
            dot.userData.id = obj.id;
            group.add(dot);
          }
        }

        if (editMode === 'FACE' && selectedFaceIndices.length > 0) {
          selectedFaceIndices.forEach(faceIdx => {
            const face = obj.faces[faceIdx];
            if (!face) return;
            const faceVerts: number[] = [];
            for (let i = 1; i < face.indices.length-1; i++) {
              [face.indices[0], face.indices[i], face.indices[i+1]].forEach(vi => {
                const baseV = obj.vertices[vi];
                const off = obj.vertexOffsets?.[vi] || [0,0,0];
                faceVerts.push(baseV[0]+off[0], baseV[1]+off[1], baseV[2]+off[2]);
              });
            }
            const fGeo = new THREE.BufferGeometry();
            fGeo.setAttribute('position', new THREE.Float32BufferAttribute(faceVerts, 3));
            const fm = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({
              color:0xff6600, transparent:true, opacity:0.55, side:THREE.DoubleSide, 
              depthTest:true,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1
            }));
            fm.position.copy(initialPos);
            fm.rotation.copy(initialRot);
            fm.scale.copy(initialScale);
            fm.updateMatrixWorld(true);
            fm.renderOrder = 1;
            fm.userData.id = obj.id;
            group.add(fm);
          });
        }

        if (editMode === 'EDGE' && selectedEdgeIndices.length > 0) {
          const edgePos: number[] = [];
          for (let i = 0; i < selectedEdgeIndices.length; i+=2) {
            const a = selectedEdgeIndices[i], b = selectedEdgeIndices[i+1];
            if (obj.vertices && a < obj.vertices.length && b < obj.vertices.length) {
              const va = obj.vertices[a];
              const vb = obj.vertices[b];
              const offA = obj.vertexOffsets?.[a] || [0,0,0];
              const offB = obj.vertexOffsets?.[b] || [0,0,0];
              edgePos.push(va[0]+offA[0], va[1]+offA[1], va[2]+offA[2], vb[0]+offB[0], vb[1]+offB[1], vb[2]+offB[2]);
            }
          }
          if (edgePos.length) {
            const eGeo = new THREE.BufferGeometry();
            eGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
            const el = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color:0x39ff14, linewidth:3, depthTest:false }));
            el.position.copy(initialPos);
            el.rotation.copy(initialRot);
            el.scale.copy(initialScale);
            el.updateMatrixWorld(true);
            el.renderOrder = 1;
            el.userData.id = obj.id;
            group.add(el);
          }
        }
      }

      // ── Invisible raycasting proxy ───────────────────────────────────────
      const pickMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible:false, side:THREE.DoubleSide }));
      pickMesh.position.copy(initialPos);
      pickMesh.rotation.copy(initialRot);
      pickMesh.scale.copy(initialScale);
      pickMesh.updateMatrixWorld(true);
      pickMesh.userData.id = obj.id;
      pickMesh.userData.faceMap = faceMap;
      pickMesh.userData.vertexMap = vertexMap;
      primitivesGroup.add(pickMesh);
    });
    return () => {
      // Dispose of materials and textures to prevent memory leaks
      const disposeObject = (obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
              mat.dispose();
              // Dispose of textures too
              Object.keys(mat).forEach(key => {
                const val = (mat as any)[key];
                if (val && val.isTexture) val.dispose();
              });
            });
          }
        }
        obj.children.forEach(disposeObject);
      };
      group.children.forEach(disposeObject);
      primitivesGroup.children.forEach(disposeObject);
    };
  }, [project, viewMode, selectedObjectId, selectedObjectIds, editMode, selectedVertexIndices, selectedFaceIndices, selectedEdgeIndices, selectedGLTFMeshes, isolateGLTFSelection]);

  // Update transforms when currentTime changes
  useEffect(() => {
    project.objects.forEach(obj => {
      const mesh = meshesRef.current.get(obj.id);
      if (mesh) {
        const transform = getInterpolatedTransform(obj, currentTime);
        mesh.position.set(transform.position[0], transform.position[1], transform.position[2]);
        mesh.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        mesh.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
        mesh.updateMatrixWorld(true);
      }
      
      // Update GLTF mixers
      const mixer = mixersRef.current.get(obj.id);
      if (mixer) {
        mixer.setTime(currentTime);
      }
    });
  }, [currentTime, project.objects]);

  // ── Drawing Logic ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drawMode) {
        if (drawingMeshRef.current) {
            sceneRef.current?.remove(drawingMeshRef.current);
            drawingMeshRef.current.traverse((child) => {
              if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m?.dispose());
                } else {
                  child.material?.dispose();
                }
              }
            });
            drawingMeshRef.current = null;
        }
        drawingPointsRef.current = [];
        drawingHandlesRef.current = [];
        drawingObjectIdRef.current = null;
        drawingPreviewPointRef.current = null;
        return;
    }

    if (!containerRef.current || !sceneRef.current || !cameraRef.current) return;

    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    // Snap a world point to grid intersections (axes depend on view)
    const toV3 = (p: THREE.Vector3): [number,number,number] => {
      if (type === 'FRONT' || type === 'BACK') return [p.x, p.y, 0];
      if (type === 'LEFT' || type === 'RIGHT')  return [0,   p.y, p.z];
      return [p.x, 0, p.z]; // TOP, BOTTOM or PERSPECTIVE
    };

    const updatePreview = () => {
      if (!sceneRef.current) return;
      
      // Clean up previous preview
      if (drawingMeshRef.current) {
        sceneRef.current.remove(drawingMeshRef.current);
        drawingMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m?.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
        drawingMeshRef.current = null;
      }

      const points = [...drawingPointsRef.current];
      const handles = [...drawingHandlesRef.current];
      
      if (drawingPreviewPointRef.current && !isDrawingHandleRef.current) {
        if (drawMode === 'rect' && points.length === 1) {
            const p1 = points[0];
            const p2 = drawingPreviewPointRef.current;
            if (type === 'FRONT' || type === 'BACK') {
              points.push(new THREE.Vector3(p2.x, p1.y, 0));
              points.push(new THREE.Vector3(p2.x, p2.y, 0));
              points.push(new THREE.Vector3(p1.x, p2.y, 0));
            } else if (type === 'LEFT' || type === 'RIGHT') {
              points.push(new THREE.Vector3(0, p1.y, p2.z));
              points.push(new THREE.Vector3(0, p2.y, p2.z));
              points.push(new THREE.Vector3(0, p2.y, p1.z));
            } else {
              points.push(new THREE.Vector3(p2.x, 0, p1.z));
              points.push(new THREE.Vector3(p2.x, 0, p2.z));
              points.push(new THREE.Vector3(p1.x, 0, p2.z));
            }
            points.push(p1);
        } else {
            points.push(drawingPreviewPointRef.current);
            if (drawMode === 'bezier') {
              handles.push({ out: [0,0,0], in: [0,0,0], broken: false });
            }
        }
      }

      if (points.length > 0) {
        const group = new THREE.Group();
        
        let curveLine;
        if (handles.length > 0 && points.length > 1) {
            const allCurvePoints: THREE.Vector3[] = [];
            const count = points.length - 1;
            for (let i = 0; i < count; i++) {
              const p0 = points[i];
              const p3 = points[i+1];
              const hOut = handles[i]?.out ?? [0,0,0];
              const hIn = handles[i+1]?.in ?? [0,0,0];
              
              if (hOut[0] === 0 && hOut[1] === 0 && hOut[2] === 0 && 
                  hIn[0] === 0 && hIn[1] === 0 && hIn[2] === 0) {
                allCurvePoints.push(p0);
              } else {
                const p1 = p0.clone().add(new THREE.Vector3(...hOut));
                const p2 = p3.clone().add(new THREE.Vector3(...hIn));
                const seg = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
                const pts = seg.getPoints(20);
                if (allCurvePoints.length > 0) pts.shift();
                allCurvePoints.push(...pts);
              }
            }
            allCurvePoints.push(points[points.length - 1]);
            const geometry = new THREE.BufferGeometry().setFromPoints(allCurvePoints);
            curveLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        } else {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            curveLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        }
        group.add(curveLine);

        // Draw handles and anchors for visual feedback
        points.forEach((p, i) => {
          // Scale handle dots by camera distance so they remain visible at any zoom
          const camDist = cameraRef.current instanceof THREE.OrthographicCamera
            ? 1 / Math.max(0.01, (cameraRef.current as THREE.OrthographicCamera).zoom)
            : cameraRef.current?.position.distanceTo(p) ?? 5;
          const anchorR = Math.max(0.04, camDist * 0.022);
          const handleR = Math.max(0.03, camDist * 0.016);

          const anchor = new THREE.Mesh(
            new THREE.SphereGeometry(anchorR, 8, 8),
            new THREE.MeshBasicMaterial({ color: i === drawingPointsRef.current.length - 1 ? 0xffff00 : 0xffffff, depthTest: false })
          );
          anchor.position.copy(p);
          group.add(anchor);

          if (drawMode === 'bezier' && handles[i]) {
            const h = handles[i];
            // Show out handle (or a ghost if zero-length so user can see it exists)
            const outVec = new THREE.Vector3(...h.out);
            const hasOut = outVec.length() > 0.001;
            if (hasOut) {
              const outPos = p.clone().add(outVec);
              const lineGeo = new THREE.BufferGeometry().setFromPoints([p, outPos]);
              group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x4488ff, depthTest: false })));
              const dot = new THREE.Mesh(new THREE.SphereGeometry(handleR, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4488ff, depthTest: false }));
              dot.position.copy(outPos);
              group.add(dot);
            }
            const inVec = new THREE.Vector3(...h.in);
            const hasIn = inVec.length() > 0.001;
            if (hasIn) {
              const inPos = p.clone().add(inVec);
              const lineGeo = new THREE.BufferGeometry().setFromPoints([p, inPos]);
              group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x44cc44, depthTest: false })));
              const dot = new THREE.Mesh(new THREE.SphereGeometry(handleR, 8, 8), new THREE.MeshBasicMaterial({ color: 0x44cc44, depthTest: false }));
              dot.position.copy(inPos);
              group.add(dot);
            }
          }
        });

        // ── Snap indicator: green ring when about to snap to an endpoint ──
        if ((drawingPreviewPointRef as any)._snapping && drawingPreviewPointRef.current) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.10, 0.14, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, depthTest: false })
          );
          ring.position.copy(drawingPreviewPointRef.current);
          ring.renderOrder = 10;
          group.add(ring);
        }

        drawingMeshRef.current = group as any;
        sceneRef.current.add(group);
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Screen-space endpoint snapping
    // Works by projecting every open SHAPE's first/last vertex into screen pixels
    // and returning the nearest one within a pixel threshold.
    // This is INDEPENDENT of pick-spheres / raycasting, so it works even when
    // the shape is not selected and has no invisible proxy meshes in the scene.
    // ─────────────────────────────────────────────────────────────────────────
    type SnapResult = { objId: string; anchorIdx: number; worldPos: THREE.Vector3; isOwnStart: boolean };

    const findSnapEndpoint = (clientX: number, clientY: number, pxThresh = 20): SnapResult | null => {
      const cam = cameraRef.current;
      const rnd = rendererRef.current;
      if (!cam || !rnd) return null;

      const rect = rnd.domElement.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const w  = rect.width;
      const h  = rect.height;

      let best: SnapResult | null = null;
      let bestDist = pxThresh;

      for (const obj of projectRef.current.objects) {
        if (obj.type !== 'SHAPE' || obj.parameters.closed || obj.vertices.length < 1) continue;

        const _interp = getInterpolatedTransform(obj, currentTime);
        const mat4 = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(_interp.position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
          new THREE.Vector3().fromArray(_interp.scale),
        );

        const checkVertex = (vi: number) => {
          const v   = obj.vertices[vi];
          const off = obj.vertexOffsets?.[vi] ?? [0, 0, 0];
          const world = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
          const ndc   = world.clone().project(cam);
          if (ndc.z > 1) return;            // behind camera
          const px = (ndc.x *  0.5 + 0.5) * w;
          const py = (ndc.y * -0.5 + 0.5) * h;
          const d  = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
          if (d < bestDist) {
            bestDist = d;
            // isOwnStart: this endpoint is the *first* vertex of the shape we're currently extending
            const isOwnStart = obj.id === drawingObjectIdRef.current && vi === 0;
            best = { objId: obj.id, anchorIdx: vi, worldPos: world, isOwnStart };
          }
        };

        checkVertex(0);
        if (obj.vertices.length > 1) checkVertex(obj.vertices.length - 1);
      }

      return best;
    };

    // Shared finish-stroke helper
    const finishStroke = (snapResult: SnapResult | null) => {
      const pts  = [...drawingPointsRef.current];
      const hnds = [...drawingHandlesRef.current];

      let closeShape = false;

      if (snapResult) {
        // Add the snapped world-point as the last vertex
        pts.push(snapResult.worldPos.clone());
        hnds.push({ out: [0,0,0], in: [0,0,0], broken: false });

        // If snapping to the first vertex of the shape we're extending → close it
        if (snapResult.isOwnStart) {
          pts.pop();   // drop the duplicate
          hnds.pop();
          closeShape = true;
        }
      }

      const vertices = pts.map(p => toV3(p));
      const handles  = hnds;

      if (drawingObjectIdRef.current) {
        const existObj = projectRef.current.objects.find(o => o.id === drawingObjectIdRef.current);
        useStore.getState().updateObject(drawingObjectIdRef.current, {
          vertices,
          bezierHandles: handles,
          parameters: { ...existObj?.parameters, closed: closeShape, shapeType: drawMode as any },
        } as any);
      } else {
        addShape(drawMode as 'line' | 'bezier', vertices, closeShape, handles);
      }

      drawingPointsRef.current       = [];
      drawingHandlesRef.current      = [];
      drawingObjectIdRef.current     = null;
      drawingPreviewPointRef.current = null;
      updatePreview();
      useStore.getState().setDrawMode(null);
      useStore.getState().saveHistory();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      // ── SILUETA mode ──────────────────────────────────────────────────────
      const isSiluetaActive = !!(silueta.activePlane && 
        silueta.activePlane.toUpperCase() === type.toUpperCase()
      );

      if (isSiluetaActive) {
        // Force disable controls to be absolutely sure
        if (controlsRef.current) controlsRef.current.enabled = false;
        
        e.stopPropagation();
        e.preventDefault();
        
        const pointRaw = getPoint(e, true);
        if (!pointRaw) return;

        const planeKey = silueta.activePlane!;
        const contour = silueta[planeKey] || [];
        
        const u = (silueta.activePlane === 'left' || silueta.activePlane === 'right') ? pointRaw.z : pointRaw.x;
        const v = (silueta.activePlane === 'top' || silueta.activePlane === 'bottom') ? -pointRaw.z : pointRaw.y;
        
        // Find nearest point (using unsnapped coords for precision)
        let nearestIdx = -1;
        let minDist = 0.25; 
        contour.forEach((p, i) => {
          const d = Math.hypot(u - p[0], v - p[1]);
          if (d < minDist) { minDist = d; nearestIdx = i; }
        });

        // Deletion with Alt key
        if (e.altKey && nearestIdx >= 0) {
          const next = [...contour];
          next.splice(nearestIdx, 1);
          setSilueta({ [planeKey]: next });
          return;
        }

        if (nearestIdx >= 0) {
          // Drag existing point
          gizmoStateRef.current.activeAxis = 'FREE';
          gizmoStateRef.current.dragAnchorIdx = nearestIdx;
          isDraggingRef.current = true;
          try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
        } else {
          // Use snapped point for adding/inserting
          const point = getPoint(e);
          if (!point) return;
          const su = (silueta.activePlane === 'left' || silueta.activePlane === 'right') ? point.z : point.x;
          const sv = (silueta.activePlane === 'top' || silueta.activePlane === 'bottom') ? -point.z : point.y;

          // Try to insert point on a segment
          let insertIdx = -1;
          let minSegDist = 0.15;
          for (let i = 0; i < contour.length; i++) {
            const p1 = contour[i];
            const p2 = contour[(i + 1) % contour.length];
            
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) continue;
            
            let t = ((su - p1[0]) * dx + (sv - p1[1]) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            
            const projX = p1[0] + t * dx;
            const projY = p1[1] + t * dy;
            const d = Math.hypot(su - projX, sv - projY);
            
            if (d < minSegDist) {
              minSegDist = d;
              insertIdx = i + 1;
            }
          }

          if (insertIdx >= 0) {
            const next = [...contour];
            next.splice(insertIdx, 0, [su, sv]);
            setSilueta({ [planeKey]: next });
            gizmoStateRef.current.activeAxis = 'FREE';
            gizmoStateRef.current.dragAnchorIdx = insertIdx;
            isDraggingRef.current = true;
            try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
          } else {
            const next = [...contour, [su, sv] as [number, number]];
            setSilueta({ [planeKey]: next });
            gizmoStateRef.current.activeAxis = 'FREE';
            gizmoStateRef.current.dragAnchorIdx = next.length - 1;
            isDraggingRef.current = true;
            try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
          }
        }
        return;
      }

      if (!drawMode) return;

      // Stop OrbitControls from seeing this event (we're in capture phase)
      e.stopPropagation();
      e.preventDefault();
      const now = Date.now();
      const last = (onPointerDown as any)._lastMs as number ?? 0;
      (onPointerDown as any)._lastMs = now;
      if (now - last < 260) { (onPointerDown as any)._skipOne = true; return; }
      if ((onPointerDown as any)._skipOne) { (onPointerDown as any)._skipOne = false; return; }

      // ── RECT mode ─────────────────────────────────────────────────────────
      if (drawMode === 'rect') {
        const point = getPoint(e);
        if (!point) return;
        if (drawingPointsRef.current.length === 0) {
          drawingPointsRef.current.push(point);
        } else {
          const p1 = drawingPointsRef.current[0];
          const p2 = point;
          let vertices: [number,number,number][];
          if (type === 'FRONT' || type === 'BACK')     vertices = [[p1.x,p1.y,0],[p2.x,p1.y,0],[p2.x,p2.y,0],[p1.x,p2.y,0]];
          else if (type === 'LEFT' || type === 'RIGHT') vertices = [[0,p1.y,p1.z],[0,p1.y,p2.z],[0,p2.y,p2.z],[0,p2.y,p1.z]];
          else                      vertices = [[p1.x,0,p1.z],[p2.x,0,p1.z],[p2.x,0,p2.z],[p1.x,0,p2.z]];
          addShape('rect', vertices, true);
          drawingPointsRef.current       = [];
          drawingHandlesRef.current      = [];
          drawingPreviewPointRef.current = null;
          updatePreview();
        }
        return;
      }

      // ── LINE / BEZIER mode ────────────────────────────────────────────────
      const snap = findSnapEndpoint(e.clientX, e.clientY);

      // ── CASE A: Nothing drawn yet — start from a snap point OR free click ──
      if (drawingPointsRef.current.length === 0) {
        if (snap) {
          // Continue from an existing endpoint: load the shape into drawing buffers
          const existObj = projectRef.current.objects.find(o => o.id === snap.objId)!;
          drawingObjectIdRef.current = snap.objId;

          const verts = existObj.vertices.map(v => new THREE.Vector3(...v));
          const handles: BezierHandle[] = existObj.bezierHandles
            ? existObj.bezierHandles.map(h => ({ out: [...h.out] as [number,number,number], in: [...h.in] as [number,number,number], broken: h.broken }))
            : existObj.vertices.map(() => ({ out: [0,0,0] as [number,number,number], in: [0,0,0] as [number,number,number], broken: false }));

          if (snap.anchorIdx === 0) {
            // Clicked start → reverse so we draw from the tail
            drawingPointsRef.current  = [...verts].reverse();
            drawingHandlesRef.current = [...handles].reverse().map(h => ({
              out: [...h.in]  as [number,number,number],
              in:  [...h.out] as [number,number,number],
              broken: h.broken,
            }));
          } else {
            drawingPointsRef.current  = verts;
            drawingHandlesRef.current = handles;
          }
          updatePreview();
          return;
        }

        // Free first point
        const point = getPoint(e);
        if (!point) return;
        drawingPointsRef.current.push(point);
        drawingHandlesRef.current.push({ out: [0,0,0], in: [0,0,0], broken: false });
        if (drawMode === 'bezier') {
          isDrawingHandleRef.current = true;
          // Capture pointer: mousemove keeps firing even outside the canvas
          try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
        }
        return;
      }

      // ── CASE B: Stroke in progress — snap click closes/connects, else add point ──
      if (snap) {
        // Need at least 2 committed points before we can close/connect
        if (drawingPointsRef.current.length >= 1) {
          finishStroke(snap);
          return;
        }
      }

      // Free click — add a regular point
      const point = getPoint(e);
      if (!point) return;

      drawingPointsRef.current.push(point);
      drawingHandlesRef.current.push({ out: [0,0,0], in: [0,0,0], broken: false });
      if (drawMode === 'bezier') {
        // Auto-init: set a small handle in the direction of travel so it's
        // immediately visible and the user can refine by dragging.
        const lastIdx = drawingPointsRef.current.length - 1;
        if (lastIdx >= 1) {
          const prev = drawingPointsRef.current[lastIdx - 1];
          const curr = drawingPointsRef.current[lastIdx];
          const dir = curr.clone().sub(prev);
          const len = dir.length();
          if (len > 0.001) {
            dir.normalize().multiplyScalar(len * 0.35);
            drawingHandlesRef.current[lastIdx].out = [dir.x, dir.y, dir.z];
            drawingHandlesRef.current[lastIdx].in  = [-dir.x, -dir.y, -dir.z];
            // Also smooth previous point outHandle toward this direction
            drawingHandlesRef.current[lastIdx - 1].out = [dir.x, dir.y, dir.z];
            if (!drawingHandlesRef.current[lastIdx - 1].broken) {
              drawingHandlesRef.current[lastIdx - 1].in = [-dir.x, -dir.y, -dir.z];
            }
          }
        }
        isDrawingHandleRef.current = true;
        try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // ── SILUETA mode ──────────────────────────────────────────────────────
      const isSiluetaActive = !!(silueta.activePlane && 
        silueta.activePlane.toUpperCase() === type.toUpperCase()
      );

      if (isSiluetaActive && gizmoStateRef.current.activeAxis === 'FREE' && gizmoStateRef.current.dragAnchorIdx !== undefined) {
        e.stopPropagation();
        e.preventDefault();
        const point = getPoint(e);
        if (!point) return;
        const planeKey = silueta.activePlane!;
        const contour = [...(silueta[planeKey] || [])];
        const u = (silueta.activePlane === 'left' || silueta.activePlane === 'right') ? point.z : point.x;
        const v = (silueta.activePlane === 'top' || silueta.activePlane === 'bottom') ? -point.z : point.y;
        contour[gizmoStateRef.current.dragAnchorIdx] = [u, v];
        setSilueta({ [planeKey]: contour });
        return;
      }

      if (isDrawingHandleRef.current && drawMode === 'bezier') {
        e.stopPropagation();
        const point = getPoint(e);
        if (!point) return;
        const lastIdx = drawingPointsRef.current.length - 1;
        const anchor  = drawingPointsRef.current[lastIdx];
        const diff    = point.clone().sub(anchor);
        drawingHandlesRef.current[lastIdx].out = [diff.x, diff.y, diff.z];
        drawingHandlesRef.current[lastIdx].in  = [-diff.x, -diff.y, -diff.z];
        updatePreview();
        return;
      }

      if (!drawMode) return;
      e.stopPropagation();

      // Show snap-to-endpoint highlight, or plain cursor position
      const snap = findSnapEndpoint(e.clientX, e.clientY, 22);
      if (snap) {
        drawingPreviewPointRef.current = snap.worldPos.clone();
        (drawingPreviewPointRef as any)._snapping = true;
      } else {
        const point = getPoint(e);
        if (point) drawingPreviewPointRef.current = point;
        (drawingPreviewPointRef as any)._snapping = false;
      }
      updatePreview();
    };

    const onPointerUp = (_e: PointerEvent) => {
      // ── SILUETA mode ──────────────────────────────────────────────────────
      if (gizmoStateRef.current.activeAxis === 'FREE') {
        _e.stopPropagation();
        gizmoStateRef.current.activeAxis = null;
        gizmoStateRef.current.dragAnchorIdx = undefined;
        isDraggingRef.current = false;
        try { (_e.target as Element).releasePointerCapture(_e.pointerId); } catch {}
        
        // Restore controls state based on global tool state
        if (controlsRef.current) {
          const isSiluetaActiveInThisViewport = !!(silueta.activePlane && 
            silueta.activePlane.toUpperCase() === type.toUpperCase()
          );
          controlsRef.current.enabled = !drawMode && !isSiluetaActiveInThisViewport;
        }
        return;
      }

      if (!drawMode) return;
      _e.stopPropagation();

      if (isDrawingHandleRef.current) {
        isDrawingHandleRef.current = false;
        updatePreview();
      }
    };

    const onDblClick = (_e: PointerEvent) => {
      if ((drawMode === 'line' || drawMode === 'bezier') && drawingPointsRef.current.length > 1) {
        // Reset double-click guard
        (onPointerDown as any)._lastMs  = 0;
        (onPointerDown as any)._skipOne = false;

        const pts  = [...drawingPointsRef.current];
        const hnds = [...drawingHandlesRef.current];

        // Remove duplicate last point if it's too close to the previous (dblclick artifact)
        if (pts.length >= 2 && pts[pts.length-1].distanceTo(pts[pts.length-2]) < 0.15) {
          pts.pop();
          hnds.pop();
        }
        if (pts.length < 2) {
          drawingPointsRef.current       = [];
          drawingHandlesRef.current      = [];
          drawingObjectIdRef.current     = null;
          drawingPreviewPointRef.current = null;
          updatePreview();
          return;
        }
        // Temporarily swap refs so finishStroke reads the cleaned pts
        drawingPointsRef.current  = pts;
        drawingHandlesRef.current = hnds;
        finishStroke(null); // no snap — just finish open
      }
    };

    // ── Register in CAPTURE phase ──────────────────────────────────────────
    // OrbitControls registers its listeners in bubble phase (default).
    // By using capture:true here our handlers run FIRST, and calling
    // e.stopPropagation() prevents OrbitControls from ever seeing the event.
    // This fixes: Bézier handles dragging the camera, and points placed at wrong coords.
    const CAPTURE = { capture: true } as const;
    canvas.addEventListener('pointerdown', onPointerDown, CAPTURE);
    canvas.addEventListener('pointermove', onPointerMove, CAPTURE);
    canvas.addEventListener('pointerup',   onPointerUp,   CAPTURE);
    canvas.addEventListener('dblclick',    onDblClick,    CAPTURE);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, CAPTURE);
      canvas.removeEventListener('pointermove', onPointerMove, CAPTURE);
      canvas.removeEventListener('pointerup',   onPointerUp,   CAPTURE);
      canvas.removeEventListener('dblclick',    onDblClick,    CAPTURE);
    };
  }, [drawMode, addShape, type, silueta, setSilueta]);

  // ── 5. Interaction Handlers ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const getCoincidentVertices = (geometry: THREE.BufferGeometry, index: number): number[] => {
      const pos = geometry.getAttribute('position');
      const x=pos.getX(index), y=pos.getY(index), z=pos.getZ(index);
      const out: number[] = [];
      for (let i=0; i<pos.count; i++)
        if (Math.abs(pos.getX(i)-x)<0.0001 && Math.abs(pos.getY(i)-y)<0.0001 && Math.abs(pos.getZ(i)-z)<0.0001) out.push(i);
      return out;
    };

    const getAxisHit = (mx: number, my: number): 'X'|'Y'|'Z'|'XY'|'YZ'|'XZ'|'FREE'|null => {
      if (!selectedObjectId && !selectedLightId && !selectedCameraId) return null;
      const selObj = selectedObjectId ? projectRef.current.objects.find(o=>o.id===selectedObjectId) : null;
      const selLight = selectedLightId ? projectRef.current.lights.find(l=>l.id===selectedLightId) : null;
      const selCam = selectedCameraId ? projectRef.current.cameras?.find(c=>c.id===selectedCameraId) : null;
      
      if (!selObj && !selLight && !selCam) return null;
      const camera=cameraRef.current, renderer=rendererRef.current;
      if (!camera||!renderer) return null;
      const w=renderer.domElement.clientWidth, h=renderer.domElement.clientHeight;

      let objPos = new THREE.Vector3();
      if (selLight) {
        objPos.fromArray(selLight.transform.position);
      } else if (selCam) {
        objPos.fromArray(selCam.transform.position);
      } else if (selObj) {
        if (editMode==='OBJECT') {
          const _interp = getInterpolatedTransform(selObj, currentTime);
          objPos.fromArray(_interp.position);
        } else {
          if (!selectedVertexIndices.length) return null;
          const mesh = primitivesGroupRef.current.children.find((c:any)=>c.userData.id===selectedObjectId) as THREE.Mesh|undefined;
          if (!mesh) return null;

          const isShape = selObj.type === 'SHAPE';
          const isBezier = isShape && selObj.parameters.shapeType === 'bezier';

          if (isBezier && selectedVertexIndices.some(idx => idx >= 10000)) {
            // Handle gizmo: position at the handle itself
            const idx = selectedVertexIndices[0];
            const anchorIdx = idx >= 20000 ? idx - 20000 : idx - 10000;
            const side = idx >= 20000 ? 'in' : 'out';
            const anchor = new THREE.Vector3(...selObj.vertices[anchorIdx]);
            const handleRel = new THREE.Vector3(...(selObj.bezierHandles?.[anchorIdx]?.[side] ?? [0,0,0]));
            objPos = anchor.add(handleRel).applyMatrix4(mesh.matrixWorld);
          } else if (isShape) {
            const centroid = new THREE.Vector3();
            let count = 0;
            selectedVertexIndices.forEach(idx => {
              if (idx < selObj.vertices.length) {
                const v = selObj.vertices[idx];
                const off = selObj.vertexOffsets?.[idx] ?? [0,0,0];
                centroid.add(new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]));
                count++;
              }
            });
            if (count > 0) {
              centroid.divideScalar(count).applyMatrix4(mesh.matrixWorld);
              objPos = centroid;
            } else {
              return null;
            }
          } else {
            const centroid=new THREE.Vector3();
            let count = 0;
            selectedVertexIndices.forEach(idx => {
              if (selObj.vertices && idx < selObj.vertices.length) {
                const v = selObj.vertices[idx];
                const off = selObj.vertexOffsets?.[idx] ?? [0,0,0];
                centroid.add(new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]));
                count++;
              }
            });
            if (count > 0) {
              centroid.divideScalar(count).applyMatrix4(mesh.matrixWorld);
              objPos=centroid;
            } else {
              return null;
            }
          }
        }
      }

      const projected=objPos.clone().project(camera);
      if (projected.z > 1 || projected.z < -1) return null; // Behind camera or past far plane
      const cx=(projected.x*0.5+0.5)*w, cy=(-projected.y*0.5+0.5)*h;
      const AXIS_LEN=Math.min(w,h)*0.12, HIT_RADIUS=25;

      if (transformMode === 'translate' || transformMode === 'scale') {
        if (Math.sqrt((mx-cx)**2+(my-cy)**2) < 15) return 'FREE';
      }

      const dirs: Record<string, {nx:number, ny:number}> = {};
      for (const {axis,dir} of [{axis:'X' as const,dir:new THREE.Vector3(1,0,0)},{axis:'Y' as const,dir:new THREE.Vector3(0,1,0)},{axis:'Z' as const,dir:new THREE.Vector3(0,0,1)}]) {
        const projEnd=objPos.clone().add(dir).project(camera);
        const ex=(projEnd.x*0.5+0.5)*w, ey=(-projEnd.y*0.5+0.5)*h;
        const sdx=ex-cx, sdy=ey-cy, len=Math.sqrt(sdx*sdx+sdy*sdy);
        dirs[axis] = { nx: len>0?(sdx/len)*AXIS_LEN:0, ny: len>0?(sdy/len)*AXIS_LEN:0 };
        
        const nx=dirs[axis].nx, ny=dirs[axis].ny;
        const tipX=cx+nx, tipY=cy+ny;
        const bx=tipX-cx, by=tipY-cy, bLen=Math.sqrt(bx*bx+by*by);
        if (!bLen) continue;
        const t=Math.max(0,Math.min(1,((mx-cx)*bx+(my-cy)*by)/(bLen*bLen)));
        const dist=Math.sqrt((mx-cx-t*bx)**2+(my-cy-t*by)**2);
        if (dist<HIT_RADIUS) return axis;
      }

      if (transformMode === 'translate' || transformMode === 'scale') {
        // Check 2D planes
        const checkPlane = (a1: string, a2: string, planeName: 'XY'|'YZ'|'XZ') => {
          const d1 = dirs[a1], d2 = dirs[a2];
          if (!d1 || !d2) return false;
          // Point in polygon check for the parallelogram
          const p0 = {x: cx, y: cy};
          const p1 = {x: cx + d1.nx*0.4, y: cy + d1.ny*0.4};
          const p2 = {x: cx + (d1.nx + d2.nx)*0.4, y: cy + (d1.ny + d2.ny)*0.4};
          const p3 = {x: cx + d2.nx*0.4, y: cy + d2.ny*0.4};
          
          const poly = [p0, p1, p2, p3];
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > my) !== (yj > my)) && (mx < (xj - xi) * (my - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        };

        if (checkPlane('X', 'Y', 'XY')) return 'XY';
        if (checkPlane('Y', 'Z', 'YZ')) return 'YZ';
        if (checkPlane('X', 'Z', 'XZ')) return 'XZ';
      }

      return null;
    };

    const handleMouseDown = (event: PointerEvent) => {
      if (event.button === 2) {
        // Right click expansion: first try to select what's under the cursor if nothing is selected or if we want to expand from here
        // We'll let the normal raycasting happen but trigger expansion after
        (mouseRef.current as any)._pendingExpand = true;
        // Don't return yet, let it raycast to select the element under the cursor
      }
      // ── Silueta interaction ───────────────────────────────────────────────
      const siluetaNow = siluetaRef.current;
      const isSiluetaViewport = !!(siluetaNow.activePlane &&
        siluetaNow.activePlane === type.toLowerCase());
      if (isSiluetaViewport && event.button === 0) {
        const planeKey = type.toLowerCase() as 'front'|'back'|'left'|'right'|'top'|'bottom';
        const contour = siluetaNow[planeKey] || [];
        if (!rendererRef.current || !cameraRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        // Hit-test existing silueta point spheres
        const siluetaHits = raycasterRef.current.intersectObjects(siluetaGroupRef.current.children, false);
        const sphereHit = siluetaHits.find(h => (h.object as THREE.Mesh).userData?.siluetaIdx !== undefined);

        if (sphereHit) {
          const idx = (sphereHit.object as THREE.Mesh).userData.siluetaIdx as number;
          if (event.altKey) {
            // Alt+click → delete point
            const newContour = contour.filter((_, i) => i !== idx);
            setSilueta({ [planeKey]: newContour });
          } else {
            // Start drag
            siluetaDragRef.current = { planeKey, pointIndex: idx };
            if (controlsRef.current) controlsRef.current.enabled = false;
          }
          event.stopPropagation(); event.preventDefault();
          return;
        }

        // Click on empty space → add / insert point (ignore Alt)
        if (!event.altKey) {
          const worldPt = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0)
            .unproject(cameraRef.current);
          let u: number, v: number;
          if (planeKey === 'front' || planeKey === 'back')     { u = worldPt.x; v =  worldPt.y; }
          else if (planeKey === 'left' || planeKey === 'right') { u = worldPt.z; v =  worldPt.y; }
          else                                                  { u = worldPt.x; v = -worldPt.z; }
          u = Math.max(-1, Math.min(1, u));
          v = Math.max(-1, Math.min(1, v));

          // Insert near closest segment, or append
          let bestIdx = contour.length;
          if (contour.length >= 2) {
            let bestDist = Infinity;
            for (let k = 0; k < contour.length; k++) {
              const k1 = (k + 1) % contour.length;
              const ax = contour[k][0], ay = contour[k][1];
              const bx = contour[k1][0], by = contour[k1][1];
              const ddx = bx - ax, ddy = by - ay;
              const len2 = ddx*ddx + ddy*ddy;
              const t = len2 > 0 ? Math.max(0, Math.min(1, ((u-ax)*ddx + (v-ay)*ddy)/len2)) : 0;
              const d = (ax + t*ddx - u)**2 + (ay + t*ddy - v)**2;
              if (d < bestDist) { bestDist = d; bestIdx = k + 1; }
            }
          }
          const newContour = [...contour];
          newContour.splice(bestIdx, 0, [u, v] as [number, number]);
          setSilueta({ [planeKey]: newContour });
          event.stopPropagation(); event.preventDefault();
        }
        return;
      }

      // ── Reference Image drag ──────────────────────────────────────────────
      if (moveReferenceMode && event.button === 0) {
        const viewKey = type.toLowerCase() as 'top'|'bottom'|'front'|'back'|'left'|'right';
        if (['top','bottom','front','back','left','right'].includes(viewKey)) {
          const refData = project.references[viewKey];
          if (refData?.url) {
            const point = getPoint(event, true);
            if (point) {
              refDragRef.current = {
                viewKey,
                startPos: [...(refData.position || [0,0,0])] as [number,number,number],
                startMouse: point.clone()
              };
              if (controlsRef.current) controlsRef.current.enabled = false;
              event.stopPropagation();
              event.preventDefault();
              return;
            }
          }
        }
      }

      if (drawMode) return;
      if (!containerRef.current||!cameraRef.current||!rendererRef.current) return;
      setActiveViewport(type);
      const rect=rendererRef.current.domElement.getBoundingClientRect();
      if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) return;
      const mx=event.clientX-rect.left, my=event.clientY-rect.top;

      // Store start position for drag detection
      gizmoStateRef.current.startScreenPos = { x: event.clientX, y: event.clientY };

      // Gizmo hit
      const gizmoHit=getAxisHit(mx,my);
      const { selectedCameraId } = useStore.getState();
      if (gizmoHit && (selectedObjectId || selectedLightId || selectedCameraId) && event.button === 0) {
        event.stopPropagation();
        event.preventDefault();
        if (controlsRef.current) controlsRef.current.enabled = false;
        
        const selObj = selectedObjectId ? projectRef.current.objects.find(o=>o.id===selectedObjectId) : null;
        const selLight = selectedLightId ? projectRef.current.lights.find(l=>l.id===selectedLightId) : null;
        const selCam = selectedCameraId ? projectRef.current.cameras?.find(c=>c.id===selectedCameraId) : null;

        if (selObj || selLight || selCam) {
          isDraggingRef.current=true;
          gizmoStateRef.current.activeAxis=gizmoHit;
          // startScreenPos already set above
          
          if (selLight) {
            gizmoStateRef.current.startPos=[...selLight.transform.position];
            gizmoStateRef.current.startRot=[...selLight.transform.rotation];
            gizmoStateRef.current.startScale=[...selLight.transform.scale];
          } else if (selCam) {
            gizmoStateRef.current.startPos=[...selCam.transform.position];
            gizmoStateRef.current.startRot=[...selCam.transform.rotation];
            gizmoStateRef.current.startScale=[...selCam.transform.scale];
          } else if (selObj) {
            const _interp = getInterpolatedTransform(selObj, currentTime);
            gizmoStateRef.current.startPos=[..._interp.position];
            gizmoStateRef.current.startRot=[..._interp.rotation];
            gizmoStateRef.current.startScale=[..._interp.scale];
          }

          // Store start transforms for all selected objects
          const startTransforms: Record<string, any> = {};
          selectedObjectIds.forEach(id => {
            const o = projectRef.current.objects.find(obj => obj.id === id);
            if (o) {
              const interp = getInterpolatedTransform(o, currentTime);
              startTransforms[id] = {
                position: [...interp.position],
                rotation: [...interp.rotation],
                scale: [...interp.scale]
              };
            }
          });
          if (selectedLightId) {
            const l = projectRef.current.lights.find(l => l.id === selectedLightId);
            if (l) {
              startTransforms[selectedLightId] = {
                position: [...l.transform.position],
                rotation: [...l.transform.rotation],
                scale: [...l.transform.scale]
              };
            }
          }
          if (selectedCameraId) {
            const c = projectRef.current.cameras?.find(c => c.id === selectedCameraId);
            if (c) {
              startTransforms[selectedCameraId] = {
                position: [...c.transform.position],
                rotation: [...c.transform.rotation],
                scale: [...c.transform.scale]
              };
            }
          }
          gizmoStateRef.current.startTransforms = startTransforms;
          if (editMode!=='OBJECT') {
            const offsets: Record<number,[number,number,number]>={};
            if (selObj.type === 'SHAPE') {
              const cht = gizmoStateRef.current.dragHandleType;
              const cai = gizmoStateRef.current.dragAnchorIdx;
              if ((cht === 'bezierOut' || cht === 'bezierIn') && cai !== undefined && selObj.bezierHandles) {
                // Capture handle position as start
                const h = selObj.bezierHandles[cai];
                const hKey = cht === 'bezierOut' ? cai+10000 : cai+20000;
                offsets[hKey] = cht === 'bezierOut' ? [...h.out] as [number,number,number] : [...h.in] as [number,number,number];
              } else {
                // Anchor drag: capture vertex offsets
                selectedVertexIndices.forEach(idx => {
                  if (idx < 10000) offsets[idx] = [...(selObj.vertexOffsets?.[idx] ?? [0,0,0])] as [number,number,number];
                });
              }
            } else {
              const mesh=primitivesGroupRef.current.children.find(ch=>ch.userData.id===selectedObjectId) as THREE.Mesh;
              if (mesh) {
                selectedVertexIndices.forEach(idx=>{ offsets[idx]=[...(selObj.vertexOffsets?.[idx]||[0,0,0])] as [number,number,number]; });
              }
            }
            gizmoStateRef.current.startVertexOffsets=offsets;
          }
          if (controlsRef.current) controlsRef.current.enabled=false;
          return;
        }
      }

      mouseRef.current.x=((event.clientX-rect.left)/rect.width)*2-1;
      mouseRef.current.y=-((event.clientY-rect.top)/rect.height)*2+1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      raycasterRef.current.params.Points.threshold=0.1;
      raycasterRef.current.params.Line.threshold=0.1;

      let hitSomething=false;

      if (editMode==='VERTEX') {
        const selObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
        const isShape = selObj?.type === 'SHAPE';
        
        if (isShape && primitivesGroupRef.current) {
          const sphereHits = raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, false);
          const sh = sphereHits.find(h => h.object.userData.handleType !== undefined);
          
          if (sh) {
            event.stopPropagation();
            event.preventDefault();
            hitSomething = true;
            const ht = sh.object.userData.handleType as string;
            const ai = sh.object.userData.anchorIdx as number;
            
            // Start drag immediately for vertices/handles
            gizmoStateRef.current.dragHandleType = ht as any;
            gizmoStateRef.current.dragAnchorIdx = ai;
            gizmoStateRef.current.activeAxis = 'FREE';
            isDraggingRef.current = true;
            
            if (ht === 'anchor') {
              if (!event.shiftKey && !selectedVertexIndices.includes(ai)) {
                setSelectedVertexIndices([ai]);
              } else if (event.shiftKey) {
                addSelectedVertexIndices([ai]);
              }
            } else if (ht === 'bezierOut') {
              setSelectedVertexIndices([ai + 10000]);
            } else if (ht === 'bezierIn') {
              setSelectedVertexIndices([ai + 20000]);
            }

            if (controlsRef.current) controlsRef.current.enabled = false;
          } else {
            // Click on the curve line → insert a new control point
            const lineHits = raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, false);
            const lh = lineHits.find(h => h.object.userData.handleType === 'curveLine');
            const shapeObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
            if (lh && shapeObj) {
              event.stopPropagation();
              event.preventDefault();
              hitSomething = true;
              const clickPt = lh.point.clone();
              const _interp = getInterpolatedTransform(shapeObj, currentTime);
              const mat = new THREE.Matrix4().compose(
                new THREE.Vector3().fromArray(_interp.position),
                new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
                new THREE.Vector3().fromArray(_interp.scale)
              );
              const localPt = clickPt.clone().applyMatrix4(mat.invert());
              const verts = shapeObj.vertices;
              const offsets = shapeObj.vertexOffsets ?? {};
              let bestIdx = verts.length;
              
              if (lh.index !== undefined) {
                const segCount = shapeObj.parameters.segments ?? 20;
                bestIdx = Math.floor(lh.index / segCount) + 1;
              } else {
                let bestDist = Infinity;
                const loopCount = shapeObj.parameters.closed ? verts.length : verts.length - 1;
                for (let k = 0; k < loopCount; k++) {
                  const k1 = (k + 1) % verts.length;
                  const offA = offsets[k] ?? [0,0,0];
                  const offB = offsets[k1] ?? [0,0,0];
                  const a = new THREE.Vector3(verts[k][0]+offA[0], verts[k][1]+offA[1], verts[k][2]+offA[2]);
                  const b = new THREE.Vector3(verts[k1][0]+offB[0], verts[k1][1]+offB[1], verts[k1][2]+offB[2]);
                  const seg = new THREE.Line3(a, b);
                  const closest = new THREE.Vector3();
                  seg.closestPointToPoint(localPt, true, closest);
                  const d = closest.distanceTo(localPt);
                  if (d < bestDist) { bestDist = d; bestIdx = k + 1; }
                }
              }
              const newVerts = [...verts];
              newVerts.splice(bestIdx, 0, [localPt.x, localPt.y, localPt.z] as [number,number,number]);
              const newHandles = shapeObj.bezierHandles ? [...shapeObj.bezierHandles] : [];
              if (newHandles.length > 0) newHandles.splice(bestIdx, 0, { out: [0,0,0], in: [0,0,0], broken: false });
              const newOffsets: Record<number,[number,number,number]> = {};
              Object.entries(shapeObj.vertexOffsets ?? {}).forEach(([k,v]) => {
                const ki = parseInt(k);
                if (ki >= bestIdx) newOffsets[ki+1] = v as [number,number,number];
                else newOffsets[ki] = v as [number,number,number];
              });
              useStore.getState().updateObject(selectedObjectId!, { 
                vertices: newVerts,
                bezierHandles: newHandles.length > 0 ? newHandles : undefined,
                vertexOffsets: newOffsets
              } as any);
              setSelectedVertexIndices([bestIdx]);
              saveHistory();
              if (controlsRef.current) controlsRef.current.enabled = false;
            }
          }
        }
      }

      if (!hitSomething && event.button === 0) {
        // Record pending marquee start — actual marquee only activates after 5px drag
        pendingMarqueeRef.current = { x: mx, y: my };
        (mouseRef.current as any)._pendingDeselect=true;
      }

      if ((mouseRef.current as any)._pendingExpand) {
        (mouseRef.current as any)._pendingExpand = false;
        useStore.getState().expandSelection();
      }
    };

    const handleMouseMove = (event: PointerEvent) => {
      // ── Reference Image drag ──────────────────────────────────────────────
      if (refDragRef.current) {
        const { viewKey, startPos, startMouse } = refDragRef.current;
        const point = getPoint(event, true);
        if (point) {
          const diff = point.clone().sub(startMouse);
          const newPos: [number,number,number] = [startPos[0], startPos[1], startPos[2]];
          if (viewKey === 'front' || viewKey === 'back') {
            newPos[0] += diff.x;
            newPos[1] += diff.y;
          } else if (viewKey === 'left' || viewKey === 'right') {
            newPos[2] += diff.z;
            newPos[1] += diff.y;
          } else {
            newPos[0] += diff.x;
            newPos[2] += diff.z;
          }
          setReference(viewKey, { position: newPos });
        }
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      // ── Silueta drag ──────────────────────────────────────────────────────
      if (siluetaDragRef.current && rendererRef.current && cameraRef.current) {
        const { planeKey, pointIndex } = siluetaDragRef.current;
        const contour = [...(siluetaRef.current[planeKey] || [])];
        if (pointIndex < contour.length) {
          const rect = rendererRef.current.domElement.getBoundingClientRect();
          const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          const worldPt = new THREE.Vector3(nx, ny, 0).unproject(cameraRef.current);
          let u: number, v: number;
          if (planeKey === 'front' || planeKey === 'back')     { u = worldPt.x; v =  worldPt.y; }
          else if (planeKey === 'left' || planeKey === 'right') { u = worldPt.z; v =  worldPt.y; }
          else                                                  { u = worldPt.x; v = -worldPt.z; }
          u = Math.max(-1, Math.min(1, u));
          v = Math.max(-1, Math.min(1, v));
          contour[pointIndex] = [u, v];
          setSilueta({ [planeKey]: contour });
        }
        event.stopPropagation(); event.preventDefault();
        return;
      }

      // ── Marquee selection ────────────────────────────────────────────────
      if (pendingMarqueeRef.current && rendererRef.current) {
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const dx = mx - pendingMarqueeRef.current.x;
        const dy = my - pendingMarqueeRef.current.y;
        
        // Marquee only activates if Shift or Ctrl is held OR if we are in a specific mode
        // This allows default left-drag to be used for OrbitControls (rotation)
        const isMarqueeKey = event.shiftKey || event.ctrlKey || event.metaKey;
        
        if (isMarqueeKey && Math.sqrt(dx*dx + dy*dy) > 5) {
          // Threshold crossed — activate marquee and lock out OrbitControls
          marqueeRef.current = { start: { ...pendingMarqueeRef.current }, end: { x: mx, y: my } };
          pendingMarqueeRef.current = null;
          if (controlsRef.current) controlsRef.current.enabled = false;
        }
      }

      if (marqueeRef.current && rendererRef.current) {
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        marqueeRef.current = { ...marqueeRef.current, end: { x: mx, y: my } };
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      const gs=gizmoStateRef.current, camera=cameraRef.current;
      if (!camera) return;
      if (!gs.activeAxis && rendererRef.current) {
        const rect=rendererRef.current.domElement.getBoundingClientRect();
        gs.hoveredAxis=getAxisHit(event.clientX-rect.left, event.clientY-rect.top);
        rendererRef.current.domElement.style.cursor=gs.hoveredAxis?'grab':'default';
      }
      if (!gs.activeAxis||(!selectedObjectId && !selectedLightId)) return;
      
      event.stopPropagation();
      event.preventDefault();
      
      const selObj = selectedObjectId ? projectRef.current.objects.find(o=>o.id===selectedObjectId) : null;
      const selLight = selectedLightId ? projectRef.current.lights.find(l=>l.id===selectedLightId) : null;

      if (!selObj && !selLight) return;
      const dx=event.clientX-gs.startScreenPos.x, dy=event.clientY-gs.startScreenPos.y;

      if (gs.activeAxis==='FREE' && transformMode==='translate') {
        const dist=camera.position.distanceTo(new THREE.Vector3(...gs.startPos));
        const ms=0.0025*Math.max(dist,1);
        const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
        const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
        const mov=new THREE.Vector3().addScaledVector(right,dx*ms).addScaledVector(up,-dy*ms);
        
        if (editMode === 'OBJECT') {
          if (selectedLightId) {
            const start = gs.startTransforms[selectedLightId];
            if (start) {
              useStore.getState().updateLight(selectedLightId, {
                transform: {
                  ...start,
                  position: [start.position[0] + mov.x, start.position[1] + mov.y, start.position[2] + mov.z]
                }
              });
            }
          } else if (selectedCameraId) {
            const camId = selectedCameraId;
            const start = gs.startTransforms[camId];
            if (start) {
              useStore.getState().updateCamera(camId, {
                transform: {
                  ...start,
                  position: [start.position[0] + mov.x, start.position[1] + mov.y, start.position[2] + mov.z]
                }
              });
            }
          } else {
            updateObjects(selectedObjectIds, (id) => {
              const start = gs.startTransforms[id];
              if (!start) return {};
              return {
                transform: {
                  ...start,
                  position: [start.position[0] + mov.x, start.position[1] + mov.y, start.position[2] + mov.z]
                }
              };
            });
          }
        } else {
          const curSelObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
          const cht = gs.dragHandleType;
          const cai = gs.dragAnchorIdx;
          if (curSelObj?.type === 'SHAPE' && (cht === 'bezierOut' || cht === 'bezierIn') && cai !== undefined) {
            const side = cht === 'bezierOut' ? 'out' : 'in';
            const startRel = gs.startVertexOffsets[cht === 'bezierOut' ? cai+10000 : cai+20000] ?? [0,0,0];
            const newRel: V3 = [startRel[0]+mov.x, startRel[1]+mov.y, startRel[2]+mov.z];
            const breakIt = event.altKey;
            useStore.getState().updateBezierHandle(selectedObjectId, cai, side, newRel, breakIt);
          } else {
            updateVertexOffsets(selectedObjectId, Object.entries(gs.startVertexOffsets).map(([idx,so])=>({
              index:parseInt(idx), offset:[so[0]+mov.x,so[1]+mov.y,so[2]+mov.z] as [number,number,number]
            })));
          }
        }
      } else if (gs.activeAxis!=='FREE' && transformMode==='translate') {
        let move = new THREE.Vector3();
        if (['XY', 'YZ', 'XZ'].includes(gs.activeAxis)) {
          const ax = gs.activeAxis;
          const normal = ax === 'XY' ? new THREE.Vector3(0,0,1) : ax === 'YZ' ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...gs.startPos));
          const raycaster = new THREE.Raycaster();
          const rect = rendererRef.current!.domElement.getBoundingClientRect();
          const sx = ((gs.startScreenPos.x - rect.left) / rect.width) * 2 - 1;
          const sy = -((gs.startScreenPos.y - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
          const startHit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
          const cx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const cy = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(cx, cy), camera);
          const curHit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
          if (startHit && curHit) move = curHit.sub(startHit);
        } else {
          const axisVec = gs.activeAxis==='X' ? new THREE.Vector3(1,0,0) : gs.activeAxis==='Y' ? new THREE.Vector3(0,1,0) : new THREE.Vector3(0,0,1);
          const startPos = new THREE.Vector3(...gs.startPos);
          
          // Build a plane passing through startPos containing axisVec and facing camera as much as possible
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          
          let planeNormal = new THREE.Vector3().crossVectors(camDir, axisVec).cross(axisVec);
          if (planeNormal.lengthSq() < 1e-5) {
            planeNormal = new THREE.Vector3().crossVectors(camera.up, axisVec);
            if (planeNormal.lengthSq() < 1e-5) {
              planeNormal = new THREE.Vector3(1,0,0);
            }
          }
          planeNormal.normalize();
          
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPos);
          const raycaster = new THREE.Raycaster();
          const rect = rendererRef.current!.domElement.getBoundingClientRect();
          
          const sx = ((gs.startScreenPos.x - rect.left) / rect.width) * 2 - 1;
          const sy = -((gs.startScreenPos.y - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
          const startHit = new THREE.Vector3();
          const hasStartHit = raycaster.ray.intersectPlane(plane, startHit);
          
          const cx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const cy = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(cx, cy), camera);
          const curHit = new THREE.Vector3();
          const hasCurHit = raycaster.ray.intersectPlane(plane, curHit);
          
          if (hasStartHit && hasCurHit) {
            const rawDelta = curHit.sub(startHit);
            const distOnAxis = rawDelta.dot(axisVec);
            move.copy(axisVec).multiplyScalar(distOnAxis);
          }
        }

        if (editMode==='OBJECT') {
          if (selectedLightId) {
            const start = gs.startTransforms[selectedLightId];
            if (start) {
              useStore.getState().updateLight(selectedLightId, {
                transform: {
                  ...start,
                  position: [start.position[0] + move.x, start.position[1] + move.y, start.position[2] + move.z]
                }
              });
            }
          } else if (selectedCameraId) {
            const camId = selectedCameraId;
            const start = gs.startTransforms[camId];
            if (start) {
              useStore.getState().updateCamera(camId, {
                transform: {
                  ...start,
                  position: [start.position[0] + move.x, start.position[1] + move.y, start.position[2] + move.z]
                }
              });
            }
          } else {
            updateObjects(selectedObjectIds, (id) => {
              const start = gs.startTransforms[id];
              if (!start) return {};
              return {
                transform: {
                  ...start,
                  position: [start.position[0] + move.x, start.position[1] + move.y, start.position[2] + move.z]
                }
              };
            });
          }
        } else {
          const curSelObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
          const cht = gs.dragHandleType;
          const cai = gs.dragAnchorIdx;
          if (curSelObj?.type === 'SHAPE' && (cht === 'bezierOut' || cht === 'bezierIn') && cai !== undefined) {
            // Dragging a bezier handle (in/out tangent)
            const anchor = curSelObj.vertices[cai];
            const hCur = curSelObj.bezierHandles?.[cai];
            if (hCur && anchor) {
              const side = cht === 'bezierOut' ? 'out' : 'in';
              const startRel = gs.startVertexOffsets[cht === 'bezierOut' ? cai+10000 : cai+20000] ?? [0,0,0];
              const newRel: V3 = [startRel[0]+move.x, startRel[1]+move.y, startRel[2]+move.z];
              const breakIt = event.altKey; // Alt = break symmetry
              useStore.getState().updateBezierHandle(selectedObjectId, cai, side, newRel, breakIt);
            }
          } else {
            updateVertexOffsets(selectedObjectId, Object.entries(gs.startVertexOffsets).map(([idx,so])=>({
              index:parseInt(idx), offset:[so[0]+move.x,so[1]+move.y,so[2]+move.z] as [number,number,number]
            })));
          }
        }
      } else if (gs.activeAxis!=='FREE' && transformMode==='rotate') {
        const angle=(dx+dy)*0.01;
        if (selectedLightId) {
          const start = gs.startTransforms[selectedLightId];
          if (start) {
            const r = [...start.rotation] as [number,number,number];
            useStore.getState().updateLight(selectedLightId, {
              transform: {
                ...start,
                rotation: [
                  r[0] + (gs.activeAxis === 'X' ? angle : 0),
                  r[1] + (gs.activeAxis === 'Y' ? angle : 0),
                  r[2] + (gs.activeAxis === 'Z' ? angle : 0)
                ]
              }
            });
          }
        } else if (selectedCameraId) {
          const camId = selectedCameraId;
          const start = gs.startTransforms[camId];
          if (start) {
            const r = [...start.rotation] as [number,number,number];
            useStore.getState().updateCamera(camId, {
              transform: {
                ...start,
                rotation: [
                  r[0] + (gs.activeAxis === 'X' ? angle : 0),
                  r[1] + (gs.activeAxis === 'Y' ? angle : 0),
                  r[2] + (gs.activeAxis === 'Z' ? angle : 0)
                ]
              }
            });
          }
        } else {
          updateObjects(selectedObjectIds, (id) => {
            const start = gs.startTransforms[id];
            if (!start) return {};
            const r = [...start.rotation] as [number,number,number];
            return {
              transform: {
                ...start,
                rotation: [
                  r[0] + (gs.activeAxis === 'X' ? angle : 0),
                  r[1] + (gs.activeAxis === 'Y' ? angle : 0),
                  r[2] + (gs.activeAxis === 'Z' ? angle : 0)
                ]
              }
            };
          });
        }
      } else if (gs.activeAxis && transformMode==='scale') {
        const delta=1+(dx-dy)*0.005;
        const ax = gs.activeAxis;
        const scaleX = ax === 'X' || ax === 'XY' || ax === 'XZ' || ax === 'FREE' ? delta : 1;
        const scaleY = ax === 'Y' || ax === 'XY' || ax === 'YZ' || ax === 'FREE' ? delta : 1;
        const scaleZ = ax === 'Z' || ax === 'XZ' || ax === 'YZ' || ax === 'FREE' ? delta : 1;

        if (editMode==='OBJECT') {
          // Scale the whole object
          updateObjects(selectedObjectIds, (id) => {
            const start = gs.startTransforms[id];
            if (!start) return {};
            const s = [...start.scale] as [number,number,number];
            return {
              transform: {
                ...start,
                scale: [
                  Math.max(0.01, s[0] * scaleX),
                  Math.max(0.01, s[1] * scaleY),
                  Math.max(0.01, s[2] * scaleZ)
                ]
              }
            };
          });
        } else {
          // Scale selected vertices around their centroid (local space)
          const mesh=primitivesGroupRef.current?.children.find((ch:any)=>ch.userData.id===selectedObjectId) as THREE.Mesh|undefined;
          if (mesh) {
            const pos=mesh.geometry.getAttribute('position');
            const centroid=new THREE.Vector3();
            const idxs=Object.keys(gs.startVertexOffsets).map(Number);
            idxs.forEach(idx=>centroid.add(new THREE.Vector3(pos.getX(idx),pos.getY(idx),pos.getZ(idx))));
            if (idxs.length) centroid.divideScalar(idxs.length);
            updateVertexOffsets(selectedObjectId, Object.entries(gs.startVertexOffsets).map(([idx,so])=>{
              const base=new THREE.Vector3(pos.getX(Number(idx)),pos.getY(Number(idx)),pos.getZ(Number(idx)));
              const s = so as [number,number,number];
              const fromCenter=new THREE.Vector3().subVectors(base.clone().add(new THREE.Vector3(...s)),centroid);
              // Scale only along the active axes
              const scaledFromCenter=fromCenter.clone();
              scaledFromCenter.x *= scaleX;
              scaledFromCenter.y *= scaleY;
              scaledFromCenter.z *= scaleZ;
              const newWorld=centroid.clone().add(scaledFromCenter);
              return {index:Number(idx), offset:[newWorld.x-base.x,newWorld.y-base.y,newWorld.z-base.z] as [number,number,number]};
            }));
          }
        }
      }

      // ── Update numeric gizmo display ─────────────────────────────────────
      if (gizmoDisplayRef.current && gs.activeAxis) {
        let display = '';
        const ax = gs.activeAxis;
        if (transformMode === 'translate') {
          const cur = projectRef.current.objects.find(o => o.id === selectedObjectId);
          if (cur && ['X', 'Y', 'Z'].includes(ax)) {
            const axIdx = ax === 'X' ? 0 : ax === 'Y' ? 1 : 2;
            display = `${ax}: ${cur.transform.position[axIdx].toFixed(3)}`;
          } else if (cur) {
            display = ax;
          }
        } else if (transformMode === 'rotate' && ax !== 'FREE') {
          const angleDeg = ((dx + dy) * 0.01 * 180 / Math.PI);
          display = `${ax}: ${angleDeg.toFixed(1)}°`;
        } else if (transformMode === 'scale') {
          const delta = 1 + (dx - dy) * 0.005;
          display = `${ax}: ×${delta.toFixed(3)}`;
        }
        if (display) {
          gizmoDisplayRef.current.style.display = 'block';
          gizmoDisplayRef.current.textContent = display;
        } else {
          gizmoDisplayRef.current.style.display = 'none';
        }
      }
    };

    const handleMouseUp = (event: PointerEvent) => {
      // Always clear pending marquee on release
      pendingMarqueeRef.current = null;

      // ── Marquee selection end ─────────────────────────────────────────────
      if (marqueeRef.current && rendererRef.current && cameraRef.current) {
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const box = {
          x1: Math.min(marqueeRef.current.start.x, marqueeRef.current.end.x),
          y1: Math.min(marqueeRef.current.start.y, marqueeRef.current.end.y),
          x2: Math.max(marqueeRef.current.start.x, marqueeRef.current.end.x),
          y2: Math.max(marqueeRef.current.start.y, marqueeRef.current.end.y)
        };
        
        const width = rect.width;
        const height = rect.height;
        const isMulti = event.shiftKey || event.ctrlKey || event.metaKey;
        
        if (Math.abs(box.x2 - box.x1) > 5 || Math.abs(box.y2 - box.y1) > 5) {
          // Box selection logic
          if (editMode === 'OBJECT') {
            const newSelection = isMulti ? [...selectedObjectIds] : [];
            projectRef.current.objects.forEach(obj => {
              if (!obj.visible) return;
              const _interp = getInterpolatedTransform(obj, currentTime);
              const mat4 = new THREE.Matrix4().compose(
                new THREE.Vector3().fromArray(_interp.position),
                new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
                new THREE.Vector3().fromArray(_interp.scale)
              );
              
              // Check origin first
              const originWorld = new THREE.Vector3(0,0,0).applyMatrix4(mat4);
              const originNDC = originWorld.project(cameraRef.current!);
              const osx = (originNDC.x * 0.5 + 0.5) * width;
              const osy = (originNDC.y * -0.5 + 0.5) * height;
              
              let hit = (osx >= box.x1 && osx <= box.x2 && osy >= box.y1 && osy <= box.y2);
              
              if (!hit) {
                // Check vertices if origin is not in box
                for (let i = 0; i < obj.vertices.length; i++) {
                  const v = obj.vertices[i];
                  const off = obj.vertexOffsets?.[i] ?? [0,0,0];
                  const world = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
                  const ndc = world.project(cameraRef.current!);
                  const sx = (ndc.x * 0.5 + 0.5) * width;
                  const sy = (ndc.y * -0.5 + 0.5) * height;
                  if (sx >= box.x1 && sx <= box.x2 && sy >= box.y1 && sy <= box.y2) {
                    hit = true; break;
                  }
                }
              }
              if (hit && !newSelection.includes(obj.id)) newSelection.push(obj.id);
            });
            
            if (newSelection.length > 0 || !isMulti) {
              useStore.setState({ 
                selectedObjectIds: newSelection, 
                selectedObjectId: newSelection[newSelection.length-1] ?? null 
              });
            }
          } else if (editMode === 'VERTEX' && selectedObjectId) {
            const obj = projectRef.current.objects.find(o => o.id === selectedObjectId);
            if (obj) {
              const _interp = getInterpolatedTransform(obj, currentTime);
              const mat4 = new THREE.Matrix4().compose(
                new THREE.Vector3().fromArray(_interp.position),
                new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
                new THREE.Vector3().fromArray(_interp.scale)
              );
              const newIndices = isMulti ? [...selectedVertexIndices] : [];
              obj.vertices.forEach((v, i) => {
                const off = obj.vertexOffsets?.[i] ?? [0,0,0];
                const world = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
                const ndc = world.project(cameraRef.current!);
                const sx = (ndc.x * 0.5 + 0.5) * width;
                const sy = (ndc.y * -0.5 + 0.5) * height;
                if (sx >= box.x1 && sx <= box.x2 && sy >= box.y1 && sy <= box.y2) {
                  if (!newIndices.includes(i)) newIndices.push(i);
                }
              });
              setSelectedVertexIndices(newIndices);
            }
          } else if (editMode === 'FACE' && selectedObjectId) {
            const obj = projectRef.current.objects.find(o => o.id === selectedObjectId);
            if (obj && obj.faces) {
              const _interp = getInterpolatedTransform(obj, currentTime);
              const mat4 = new THREE.Matrix4().compose(
                new THREE.Vector3().fromArray(_interp.position),
                new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
                new THREE.Vector3().fromArray(_interp.scale)
              );
              const newFaces = isMulti ? [...selectedFaceIndices] : [];
              const newVerts = isMulti ? new Set(selectedVertexIndices) : new Set<number>();
              
              obj.faces.forEach((face, fi) => {
                // Check if ALL vertices of the face are within the box
                let allIn = true;
                for (const vi of face.indices) {
                  const v = obj.vertices[vi];
                  const off = obj.vertexOffsets?.[vi] ?? [0,0,0];
                  const world = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
                  const ndc = world.project(cameraRef.current!);
                  const sx = (ndc.x * 0.5 + 0.5) * width;
                  const sy = (ndc.y * -0.5 + 0.5) * height;
                  if (!(sx >= box.x1 && sx <= box.x2 && sy >= box.y1 && sy <= box.y2)) {
                    allIn = false; break;
                  }
                }
                if (allIn) {
                  if (!newFaces.includes(fi)) {
                    newFaces.push(fi);
                    face.indices.forEach(vi => newVerts.add(vi));
                  }
                }
              });
              setSelectedFaceIndices(newFaces);
              setSelectedVertexIndices(Array.from(newVerts));
            }
          } else if (editMode === 'EDGE' && selectedObjectId) {
            const obj = projectRef.current.objects.find(o => o.id === selectedObjectId);
            if (obj && obj.faces) {
              const _interp = getInterpolatedTransform(obj, currentTime);
              const mat4 = new THREE.Matrix4().compose(
                new THREE.Vector3().fromArray(_interp.position),
                new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(_interp.rotation)),
                new THREE.Vector3().fromArray(_interp.scale)
              );
              const newEdges = isMulti ? [...selectedEdgeIndices] : [];
              const newVerts = isMulti ? new Set(selectedVertexIndices) : new Set<number>();
              
              // Extract all unique edges
              const edgeSet = new Set<string>();
              obj.faces.forEach(face => {
                for (let i = 0; i < face.indices.length; i++) {
                  const v1 = face.indices[i];
                  const v2 = face.indices[(i + 1) % face.indices.length];
                  const key = [v1, v2].sort().join(',');
                  if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    // Check if both vertices are in the box
                    const pts = [v1, v2].map(vi => {
                      const v = obj.vertices[vi];
                      const off = obj.vertexOffsets?.[vi] ?? [0,0,0];
                      const world = new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]).applyMatrix4(mat4);
                      const ndc = world.project(cameraRef.current!);
                      return { sx: (ndc.x * 0.5 + 0.5) * width, sy: (ndc.y * -0.5 + 0.5) * height };
                    });
                    if (pts.every(p => p.sx >= box.x1 && p.sx <= box.x2 && p.sy >= box.y1 && p.sy <= box.y2)) {
                      newEdges.push(v1, v2);
                      newVerts.add(v1); newVerts.add(v2);
                    }
                  }
                }
              });
              setSelectedEdgeIndices(newEdges);
              setSelectedVertexIndices(Array.from(newVerts));
            }
          }
          (mouseRef.current as any)._pendingDeselect = false;
        }

        marqueeRef.current = null;
        if (controlsRef.current) controlsRef.current.enabled = !drawMode;
        event.stopPropagation();
        return;
      }

      // ── Reference Image drag end ──────────────────────────────────────────
      if (refDragRef.current) {
        refDragRef.current = null;
        saveHistory();
        event.stopPropagation();
        
        if (controlsRef.current) {
          const isSiluetaActiveInThisViewport = !!(silueta.activePlane && 
            silueta.activePlane.toUpperCase() === type.toUpperCase()
          );
          controlsRef.current.enabled = !drawMode && !isSiluetaActiveInThisViewport && !moveReferenceMode;
        }
        return;
      }

      // ── Silueta drag end ──────────────────────────────────────────────────
      if (siluetaDragRef.current) {
        siluetaDragRef.current = null;
        event.stopPropagation();
        return;
      }

      if (gizmoStateRef.current.activeAxis!==null) { 
        gizmoStateRef.current.activeAxis=null; 
        saveHistory(); 
        event.stopPropagation();
      }
      if (gizmoDisplayRef.current) gizmoDisplayRef.current.style.display = 'none';
      
      if ((mouseRef.current as any)._pendingDeselect) {
        const dx = event.clientX - gizmoStateRef.current.startScreenPos.x;
        const dy = event.clientY - gizmoStateRef.current.startScreenPos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < 5) {
          // It was a click, not a drag. Perform selection raycast here.
          const rect = rendererRef.current!.domElement.getBoundingClientRect();
          mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
          
          let hitSomething = false;

          if (editMode === 'VERTEX' && vertexPointsRef.current) {
            if (cameraRef.current instanceof THREE.PerspectiveCamera) {
              const dist = cameraRef.current.position.distanceTo(vertexPointsRef.current.position);
              raycasterRef.current.params.Points.threshold = Math.max(0.1, dist * 0.02);
            } else {
              raycasterRef.current.params.Points.threshold = 0.5;
            }
            const hits = raycasterRef.current.intersectObject(vertexPointsRef.current);
            if (hits.length) {
              hitSomething = true;
              const index = hits[0].index;
              if (index !== undefined) {
                const indices = getCoincidentVertices(vertexPointsRef.current.geometry, index);
                const isCtrl = event.ctrlKey || event.metaKey || event.shiftKey;
                if (isCtrl) {
                  const cur = new Set(selectedVertexIndices);
                  if (indices.every(i => cur.has(i))) setSelectedVertexIndices(selectedVertexIndices.filter(i => !indices.includes(i)));
                  else addSelectedVertexIndices(indices);
                } else setSelectedVertexIndices(indices);
              }
            }
          } else if (editMode === 'FACE' && primitivesGroupRef.current) {
            const hits = raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, true);
            if (hits.length) {
              hitSomething = true;
              const intersect = hits[0];
              if (intersect.face) {
                const mesh = intersect.object as THREE.Mesh;
                const clickedId = mesh.userData.id;
                if (clickedId && clickedId !== selectedObjectId) selectObject(clickedId);
                if (clickedId) {
                  const faceMap = mesh.userData.faceMap as number[] | undefined;
                  const faceIndex = intersect.faceIndex;
                  if (faceMap && faceIndex !== undefined && faceIndex < faceMap.length) {
                    const logicalFaceIdx = faceMap[faceIndex];
                    const isCtrl = event.ctrlKey || event.metaKey || event.shiftKey;
                    let newFaces: number[];
                    if (isCtrl) {
                      const cur = new Set(selectedFaceIndices);
                      if (cur.has(logicalFaceIdx)) newFaces = selectedFaceIndices.filter(f => f !== logicalFaceIdx);
                      else newFaces = [...selectedFaceIndices, logicalFaceIdx];
                    } else newFaces = [logicalFaceIdx];
                    setSelectedFaceIndices(newFaces);

                    const vSet = new Set<number>();
                    const selObj = projectRef.current.objects.find(o => o.id === clickedId);
                    if (selObj && selObj.faces) {
                      newFaces.forEach(fIdx => {
                        const face = selObj.faces[fIdx];
                        if (face) face.indices.forEach(vi => vSet.add(vi));
                      });
                    }
                    setSelectedVertexIndices(Array.from(vSet));
                  }
                }
              }
            }
          } else if (editMode === 'EDGE' && primitivesGroupRef.current) {
            const hits = raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, true);
            if (hits.length) {
              hitSomething = true;
              const intersect = hits[0];
              if (intersect.face) {
                const mesh = intersect.object as THREE.Mesh;
                const clickedId = mesh.userData.id;
                if (clickedId && clickedId !== selectedObjectId) selectObject(clickedId);
                if (clickedId) {
                  const pos = mesh.geometry.getAttribute('position');
                  const a = intersect.face.a, b = intersect.face.b, c = intersect.face.c;
                  const pa = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)).applyMatrix4(mesh.matrixWorld);
                  const pb = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b)).applyMatrix4(mesh.matrixWorld);
                  const pc = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c)).applyMatrix4(mesh.matrixWorld);
                  const pt = intersect.point;
                  const dAB = new THREE.Line3(pa, pb).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);
                  const dBC = new THREE.Line3(pb, pc).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);
                  const dCA = new THREE.Line3(pc, pa).closestPointToPoint(pt, true, new THREE.Vector3()).distanceTo(pt);
                  let edge: [number, number];
                  if (dAB <= dBC && dAB <= dCA) edge = [a, b];
                  else if (dBC <= dAB && dBC <= dCA) edge = [b, c];
                  else edge = [c, a];
                  
                  const vertexMap = mesh.userData.vertexMap as number[] | undefined;
                  if (vertexMap) {
                    edge = [vertexMap[edge[0]], vertexMap[edge[1]]];
                  }

                  const isCtrl = event.ctrlKey || event.metaKey || event.shiftKey;
                  let ne: number[] = [];
                  if (isCtrl) {
                    // Toggle edge selection logic...
                    const edgeExists = (v1: number, v2: number) => {
                      for (let i = 0; i < selectedEdgeIndices.length; i += 2)
                        if ((selectedEdgeIndices[i] === v1 && selectedEdgeIndices[i + 1] === v2) || (selectedEdgeIndices[i] === v2 && selectedEdgeIndices[i + 1] === v1)) return true;
                      return false;
                    };
                    if (edgeExists(edge[0], edge[1])) {
                      for (let i = 0; i < selectedEdgeIndices.length; i += 2) {
                        const v1 = selectedEdgeIndices[i], v2 = selectedEdgeIndices[i + 1];
                        if (!((v1 === edge[0] && v2 === edge[1]) || (v1 === edge[1] && v2 === edge[0]))) ne.push(v1, v2);
                      }
                    } else {
                      ne = [...selectedEdgeIndices, edge[0], edge[1]];
                    }
                  } else {
                    ne = [edge[0], edge[1]];
                  }
                  setSelectedEdgeIndices(ne);
                  setSelectedVertexIndices(Array.from(new Set(ne)));
                }
              }
            }
          } else if (editMode === 'OBJECT') {
            raycasterRef.current.params.Line.threshold = 0.1; // Make lines easier to click
            const targets = [
              ...groupRef.current.children,
              ...(Array.from(lightsRef.current.values()) as THREE.Object3D[]),
              ...(Array.from(camerasRef.current.values()) as THREE.Object3D[])
            ];
            const hits = raycasterRef.current.intersectObjects(targets, true);
            if (hits.length) {
              hitSomething = true;
              const hit = hits[0];
              
              // Find the closest parent that has an ID
              let currentObj: THREE.Object3D | null = hit.object;
              let clickedId = null;
              let isLight = false;
              let isCamera = false;
              
              while (currentObj) {
                if (currentObj.userData?.id) {
                  clickedId = currentObj.userData.id;
                  isLight = !!currentObj.userData.isLight;
                  isCamera = !!currentObj.userData.isCamera;
                  break;
                }
                // Check if it's a helper (they usually have the original object as a property or we can infer from name/type)
                if (currentObj.type.includes('Helper') && currentObj.parent?.userData?.id) {
                   clickedId = currentObj.parent.userData.id;
                   isLight = !!currentObj.parent.userData.isLight;
                   isCamera = !!currentObj.parent.userData.isCamera;
                   break;
                }
                currentObj = currentObj.parent;
              }
              
              if (clickedId) {
                if (isLight) {
                  selectLight(clickedId);
                } else if (isCamera) {
                  selectCamera(clickedId);
                } else {
                  const isCtrl = event.shiftKey || event.ctrlKey || event.metaKey;
                  if (isCtrl && toggleObjectSelection) toggleObjectSelection(clickedId, true);
                  else selectObject(clickedId);
                }
              }
            } else {
              if (event.button === 0) {
                selectObject(null);
                selectLight(null);
                selectCamera(null);
              }
            }
          }
          
          if (!hitSomething && event.button === 0) {
            if (editMode === 'OBJECT') {
              selectObject(null);
              selectLight(null);
              selectCamera(null);
            }
            else clearSelection();
          }
        }
        (mouseRef.current as any)._pendingDeselect = false;
      }
      
      // Always re-enable controls so pan/orbit is never permanently stuck
      if (controlsRef.current) {
        const isSiluetaActiveInThisViewport = !!(silueta.activePlane && 
          silueta.activePlane.toUpperCase() === type.toUpperCase()
        );
        controlsRef.current.enabled = !drawMode && !isSiluetaActiveInThisViewport;
      }
      isDraggingRef.current = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // ── SHAPE / CURVE editing hotkeys ────────────────────────────────
      const shapeObj = selectedObjectId
        ? useStore.getState().project.objects.find(o => o.id === selectedObjectId)
        : null;
      const isShapeSelected = shapeObj?.type === 'SHAPE';

      // Delete selected control point (VERTEX mode on a SHAPE)
      if (isShapeSelected && editMode === 'VERTEX' &&
          (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'x') &&
          selectedVertexIndices.length > 0) {
        event.preventDefault();
        const obj = shapeObj!;
        const toRemove = new Set(selectedVertexIndices);
        console.log("Deleting vertices:", Array.from(toRemove));
        const newVertices = obj.vertices.filter((_, i) => !toRemove.has(i));
        const newHandles = obj.bezierHandles ? obj.bezierHandles.filter((_, i) => !toRemove.has(i)) : undefined;
        
        // Remap vertexOffsets
        const remapIdx: Record<number,number> = {};
        let ni = 0;
        obj.vertices.forEach((_, oi) => { if (!toRemove.has(oi)) remapIdx[oi] = ni++; });
        const newOffsets: Record<number,[number,number,number]> = {};
        Object.entries(obj.vertexOffsets ?? {}).forEach(([k,v]) => {
          const mapped = remapIdx[parseInt(k)];
          if (mapped !== undefined) newOffsets[mapped] = v as [number,number,number];
        });
        console.log("New vertices length:", newVertices.length);
        if (newVertices.length >= 2) {
          useStore.getState().updateObject(selectedObjectId!, { 
            vertices: newVertices, 
            vertexOffsets: newOffsets,
            bezierHandles: newHandles
          } as any);
          setSelectedVertexIndices([]);
          saveHistory();
        }
        return;
      }

      // Toggle close/open curve (C key on a SHAPE)
      if (isShapeSelected && (event.key === 'c' || event.key === 'C') && !event.ctrlKey) {
        event.preventDefault();
        const obj = shapeObj!;
        useStore.getState().updateObject(selectedObjectId!, {
          parameters: { ...obj.parameters, closed: !obj.parameters.closed }
        });
        saveHistory();
        return;
      }


      // ── Delete selected FACES (remove only faces, vertices stay intact) ───────
      if (editMode === 'FACE' && (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'x' || event.key === 'X')) {
        if (!selectedObjectId || selectedFaceIndices.length === 0) return;
        event.preventDefault();
        const objRefFace = useStore.getState().project.objects.find(o => o.id === selectedObjectId);
        if (!objRefFace || !objRefFace.faces) return;

        const toRemove = new Set(selectedFaceIndices);
        const newFaces = objRefFace.faces.filter((_, fi) => !toRemove.has(fi));

        // Safety: never delete all faces (would make object invisible permanently)
        if (newFaces.length === 0) return;

        useStore.getState().updateObject(selectedObjectId, { faces: newFaces } as any);
        setSelectedFaceIndices([]);
        setSelectedVertexIndices([]);
        saveHistory();
        return;
      }

      // Dissolve edge: Delete or X in EDGE mode
      if (editMode === 'EDGE' && (event.key === 'Delete' || event.key === 'x' || event.key === 'X')) {
        if (!selectedObjectId || selectedEdgeIndices.length < 2) return;
        const objRef = useStore.getState().project.objects.find(o => o.id === selectedObjectId);
        if (!objRef || !objRef.faces) return;

        // Process all selected edges
        let faces = [...objRef.faces.map(f => ({ ...f, indices: [...f.indices] }))];

        for (let ei = 0; ei < selectedEdgeIndices.length; ei += 2) {
          const eA = selectedEdgeIndices[ei], eB = selectedEdgeIndices[ei + 1];

          // Find the two faces sharing this edge
          const sharingFaces = faces.map((f, fi) => ({ f, fi })).filter(({ f }) => {
            const len = f.indices.length;
            for (let k = 0; k < len; k++) {
              const a = f.indices[k], b = f.indices[(k + 1) % len];
              if ((a === eA && b === eB) || (a === eB && b === eA)) return true;
            }
            return false;
          });

          if (sharingFaces.length !== 2) continue; // boundary edge, skip

          const [{ f: faceA, fi: fiA }, { f: faceB, fi: fiB }] = sharingFaces;

          // Merge faceA and faceB by removing the shared edge
          // Walk faceA: when we hit the shared edge, insert faceB's vertices instead
          const mergedIndices: number[] = [];
          const lenA = faceA.indices.length;
          for (let k = 0; k < lenA; k++) {
            const a = faceA.indices[k], b = faceA.indices[(k + 1) % lenA];
            mergedIndices.push(a);
            // If this is the shared edge, splice in faceB's vertices
            if ((a === eA && b === eB) || (a === eB && b === eA)) {
              // Find where b appears in faceB, then walk around faceB skipping a
              const lenB = faceB.indices.length;
              const startB = faceB.indices.indexOf(b);
              if (startB !== -1) {
                for (let m = 1; m < lenB - 1; m++) {
                  const idx = faceB.indices[(startB + m) % lenB];
                  if (idx !== a && idx !== b) mergedIndices.push(idx);
                }
              }
            }
          }

          // Remove duplicates while preserving order
          const seen = new Set<number>();
          const cleanMerged = mergedIndices.filter(v => { if (seen.has(v)) return false; seen.add(v); return true; });

          if (cleanMerged.length >= 3) {
            const mergedFace = { ...faceA, indices: cleanMerged };
            // Remove both faces and add merged
            faces = faces.filter((_, i) => i !== fiA && i !== fiB);
            faces.push(mergedFace);
          }
        }

        // Update object with new faces
        useStore.getState().updateObject(selectedObjectId, { faces } as any);
        setSelectedEdgeIndices([]);
        setSelectedVertexIndices([]);
        saveHistory();
        return;
      }

      if (editMode !== 'OBJECT') {
        if (event.key === '1') { useStore.getState().setEditMode('OBJECT'); return; }
        if (event.key === '2') { useStore.getState().setEditMode('FACE'); return; }
        if (event.key === '3') { useStore.getState().setEditMode('EDGE'); return; }
        if (event.key === '4') { useStore.getState().setEditMode('VERTEX'); return; }
      } else {
        if (event.key === '1') { useStore.getState().setEditMode('OBJECT'); return; }
        if (event.key === '2') { useStore.getState().setEditMode('FACE'); return; }
        if (event.key === '3') { useStore.getState().setEditMode('EDGE'); return; }
        if (event.key === '4') { useStore.getState().setEditMode('VERTEX'); return; }
      }

      switch(event.key.toLowerCase()) {
        case 'g': case 'w': setTransformMode('translate'); break;
        case 'r': case 'e': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
        case 'a': if (event.ctrlKey || event.metaKey) { event.preventDefault(); useStore.getState().selectAll(); } break;
        case 'd': if (event.ctrlKey || event.metaKey) { event.preventDefault(); useStore.getState().duplicateSelected(); } break;
        case 'e': if (event.ctrlKey || event.metaKey) { 
          event.preventDefault(); 
          const { selectedObjectId, selectedFaceIndices, editMode } = useStore.getState();
          if (selectedObjectId && editMode === 'FACE' && selectedFaceIndices.length > 0) {
            useStore.getState().extrudeFaces(selectedObjectId, selectedFaceIndices, 0.3);
          }
        } break;
      }
      if (event.key === 'Escape') {
        useStore.getState().deselectAll();
      }
    };

    const canvas=rendererRef.current?.domElement;
    if (canvas) { 
      canvas.addEventListener('pointerdown',handleMouseDown, { capture: true }); 
      canvas.addEventListener('pointermove',handleMouseMove, { capture: true }); 
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    window.addEventListener('pointerup',handleMouseUp, { capture: true });
    window.addEventListener('keydown',handleKeyDown);
    return () => {
      if (canvas) { 
        canvas.removeEventListener('pointerdown',handleMouseDown, { capture: true }); 
        canvas.removeEventListener('pointermove',handleMouseMove, { capture: true }); 
      }
      window.removeEventListener('pointerup',handleMouseUp, { capture: true });
      window.removeEventListener('keydown',handleKeyDown);
    };
  }, [editMode, transformMode, selectedObjectId, selectedObjectIds, selectObject, toggleObjectSelection, setTransformMode, project, updateVertexOffsets, updateObject, updateObjects, activeViewport, setActiveViewport, selectedVertexIndices, selectedFaceIndices, selectedEdgeIndices, setSelectedVertexIndices, setSelectedFaceIndices, setSelectedEdgeIndices, addSelectedVertexIndices, saveHistory, silueta, setSilueta, drawMode, selectedLightId, selectedCameraId]);

  // ── Draw 2D Canvas Gizmo ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas=gizmoCanvasRef.current;
    if (!canvas) return;
    const ctx=canvas.getContext('2d');
    if (!ctx) return;

    const drawGizmo = () => {
      const renderer=rendererRef.current;
      const w=renderer?renderer.domElement.clientWidth:canvas.width;
      const h=renderer?renderer.domElement.clientHeight:canvas.height;
      canvas.width=w||canvas.width; canvas.height=h||canvas.height;
      ctx.clearRect(0,0,canvas.width,canvas.height);

      // ── Draw marquee selection box (always, regardless of selection state) ──
      if (marqueeRef.current) {
        const mb = marqueeRef.current;
        ctx.save();
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(mb.start.x, mb.start.y, mb.end.x - mb.start.x, mb.end.y - mb.start.y);
        ctx.fillStyle = 'rgba(68, 136, 255, 0.08)';
        ctx.fillRect(mb.start.x, mb.start.y, mb.end.x - mb.start.x, mb.end.y - mb.start.y);
        ctx.restore();
      }

      if (!selectedObjectId && !selectedLightId && !selectedCameraId) return;

      let gizmoPos = new THREE.Vector3();
      
      if (selectedLightId) {
        const l = projectRef.current.lights.find(l => l.id === selectedLightId);
        if (!l || !cameraRef.current || !renderer) return;
        gizmoPos.fromArray(l.transform.position);
      } else if (selectedCameraId) {
        const c = projectRef.current.cameras?.find(c => c.id === selectedCameraId);
        if (!c || !cameraRef.current || !renderer) return;
        gizmoPos.fromArray(c.transform.position);
      } else if (selectedObjectId) {
        const selObj=projectRef.current.objects.find(o=>o.id===selectedObjectId);
        if (!selObj||!cameraRef.current||!renderer) return;

        const mesh = primitivesGroupRef.current.children.find((c:any)=>c.userData.id===selectedObjectId) as THREE.Mesh|undefined;

      if (['VERTEX','FACE','EDGE'].includes(editMode)) {
        if (!selectedVertexIndices.length) return;
        if (!mesh) return;

        const isShape = selObj.type === 'SHAPE';
        const isBezier = isShape && selObj.parameters.shapeType === 'bezier';

        if (isBezier && selectedVertexIndices.some(idx => idx >= 10000)) {
          const idx = selectedVertexIndices[0];
          const anchorIdx = idx >= 20000 ? idx - 20000 : idx - 10000;
          const side = idx >= 20000 ? 'in' : 'out';
          const anchor = new THREE.Vector3(...selObj.vertices[anchorIdx]);
          const handleRel = new THREE.Vector3(...(selObj.bezierHandles?.[anchorIdx]?.[side] ?? [0,0,0]));
          gizmoPos = anchor.add(handleRel).applyMatrix4(mesh.matrixWorld);
        } else {
          const centroid=new THREE.Vector3();
          let count = 0;
          selectedVertexIndices.forEach(idx => {
            if (selObj.vertices && idx < selObj.vertices.length) {
              const v = selObj.vertices[idx];
              const off = selObj.vertexOffsets?.[idx] ?? [0,0,0];
              centroid.add(new THREE.Vector3(v[0]+off[0], v[1]+off[1], v[2]+off[2]));
              count++;
            }
          });
          if (count > 0) {
            centroid.divideScalar(count).applyMatrix4(mesh.matrixWorld);
            gizmoPos=centroid;
          }
        }
      } else {
        // OBJECT mode: Use the mesh's world position which is already interpolated in Scene sync
        if (mesh) {
          mesh.getWorldPosition(gizmoPos);
        } else {
          const _interp = getInterpolatedTransform(selObj, currentTime);
          gizmoPos.fromArray(_interp.position);
        }
      }
      }

      const projected=gizmoPos.clone().project(cameraRef.current);
      if (projected.z>1) return;
      const cx=(projected.x*0.5+0.5)*w, cy=(-projected.y*0.5+0.5)*h;
      const AXIS_LEN=Math.min(w,h)*0.12;
      const gs=gizmoStateRef.current;

      const dirs: Record<string, {nx:number, ny:number, color:string}> = {};

      for (const {axis,color} of [{axis:'X' as const,color:'#ff3333'},{axis:'Y' as const,color:'#33ff33'},{axis:'Z' as const,color:'#4488ff'}]) {
        const dir=axis==='X'?new THREE.Vector3(1,0,0):axis==='Y'?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
        const pe=gizmoPos.clone().add(dir).project(cameraRef.current);
        const ex=(pe.x*0.5+0.5)*w, ey=(-pe.y*0.5+0.5)*h;
        const sdx=ex-cx, sdy=ey-cy, len=Math.sqrt(sdx*sdx+sdy*sdy);
        const nx=len>0?(sdx/len)*AXIS_LEN:0, ny=len>0?(sdy/len)*AXIS_LEN:0;
        dirs[axis] = { nx, ny, color };
        
        const tipX=cx+nx, tipY=cy+ny;
        const isHov=gs.hoveredAxis===axis||gs.activeAxis===axis;
        ctx.save();
        ctx.globalAlpha=isHov?1:0.9; ctx.strokeStyle=color; ctx.lineWidth=isHov?4:2.5;
        ctx.lineCap='round'; ctx.shadowColor=color; ctx.shadowBlur=isHov?8:3;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(tipX,tipY); ctx.stroke();
        const angle=Math.atan2(ny,nx), al=10;
        ctx.beginPath(); ctx.moveTo(tipX,tipY);
        ctx.lineTo(tipX-al*Math.cos(angle-0.4),tipY-al*Math.sin(angle-0.4));
        ctx.lineTo(tipX-al*Math.cos(angle+0.4),tipY-al*Math.sin(angle+0.4));
        ctx.closePath(); ctx.fillStyle=color; ctx.fill();
        ctx.shadowBlur=0; ctx.font='bold 11px monospace'; ctx.fillStyle=color;
        ctx.fillText(axis,tipX+5,tipY-5);
        ctx.restore();
      }

      // Draw 2D planes
      if (transformMode === 'translate' || transformMode === 'scale') {
        const drawPlane = (a1: string, a2: string, planeName: 'XY'|'YZ'|'XZ', color: string) => {
          const d1 = dirs[a1], d2 = dirs[a2];
          if (!d1 || !d2) return;
          const isHov = gs.hoveredAxis === planeName || gs.activeAxis === planeName;
          ctx.save();
          ctx.globalAlpha = isHov ? 0.6 : 0.2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(cx + d1.nx*0.15, cy + d1.ny*0.15);
          ctx.lineTo(cx + d1.nx*0.4, cy + d1.ny*0.4);
          ctx.lineTo(cx + (d1.nx + d2.nx)*0.4, cy + (d1.ny + d2.ny)*0.4);
          ctx.lineTo(cx + d2.nx*0.4, cy + d2.ny*0.4);
          ctx.lineTo(cx + d2.nx*0.15, cy + d2.ny*0.15);
          ctx.closePath();
          ctx.fill();
          if (isHov) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();
        };

        drawPlane('X', 'Y', 'XY', '#ffff33');
        drawPlane('Y', 'Z', 'YZ', '#33ffff');
        drawPlane('X', 'Z', 'XZ', '#ff33ff');

        // Draw center FREE
        const isFreeHov = gs.hoveredAxis === 'FREE' || gs.activeAxis === 'FREE';
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,isFreeHov?6:4,0,Math.PI*2);
        ctx.fillStyle=isFreeHov?'#fff':'#ccc'; ctx.shadowColor='#fff'; ctx.shadowBlur=isFreeHov?8:4; ctx.fill(); ctx.restore();
      }
    };

    let rafId: number;
    const loop=()=>{drawGizmo();rafId=requestAnimationFrame(loop);};
    loop();
    return ()=>cancelAnimationFrame(rafId);
  }, [selectedObjectId, editMode, transformMode, project, selectedVertexIndices]);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative w-full h-full border overflow-hidden bg-zinc-900 transition-colors touch-none ${
        silueta.activePlane ? (
          (type === 'FRONT') ? `border-red-500 shadow-[inset_0_0_0_${silueta.activePlane === 'front' ? '3px' : '1px'}_rgba(239,68,68,1)]` :
          (type === 'LEFT' || type === 'RIGHT') ? `border-cyan-400 shadow-[inset_0_0_0_${silueta.activePlane === type.toLowerCase() ? '3px' : '1px'}_rgba(34,211,238,1)]` :
          (type === 'TOP') ? `border-green-500 shadow-[inset_0_0_0_${silueta.activePlane === 'top' ? '3px' : '1px'}_rgba(34,197,94,1)]` :
          'border-zinc-800'
        ) : (
          activeViewport===type ? (isRecording ? 'border-red-500 shadow-[inset_0_0_0_2px_rgba(239,68,68,1)]' : 'border-blue-500 shadow-[inset_0_0_0_1px_rgba(59,130,246,1)]') : 'border-zinc-800'
        )
      }`}
      onPointerDown={()=>setActiveViewport(type)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="absolute top-1 left-1 sm:top-2 sm:left-2 z-40 flex items-center gap-1">
        <div
          className="px-1.5 py-0.5 sm:px-2 sm:py-1 bg-transparent hover:bg-black/40 text-[8px] sm:text-xs text-white rounded font-mono uppercase tracking-wider cursor-pointer hover:text-indigo-300 select-none border border-transparent hover:border-white/20 flex items-center gap-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-all"
          onPointerDown={e=>e.stopPropagation()}
          onClick={e=>{e.stopPropagation();setMaximizedViewport(maximizedViewport===type?null:type);}}
        >
          <span>{title} {maximizedViewport===type?'[-]':'[+]'}</span>
          {maximizedViewport === type && (
            <div 
              className="ml-2 px-1 bg-indigo-600 hover:bg-indigo-500 rounded text-[8px] font-bold"
              onClick={(e) => { e.stopPropagation(); setMaximizedViewport(null); }}
            >
              RESTAURAR 4 VISTAS
            </div>
          )}
        </div>

        {/* View Selector Dropdown */}
        <div className="relative group" onPointerDown={e=>e.stopPropagation()}>
          <button className="p-1 sm:p-1.5 bg-transparent hover:bg-black/40 text-white rounded border border-transparent hover:border-white/20 transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            <ChevronDown size={12} />
          </button>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-zinc-900 border border-white/10 rounded shadow-xl overflow-hidden min-w-[100px]">
            {(['PERSPECTIVE', 'TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT'] as ViewportType[]).map(v => (
              <button
                key={v}
                onClick={() => {
                  setType(v);
                  setTitle(v.charAt(0) + v.slice(1).toLowerCase());
                  setViewCameraId(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-indigo-600 transition-colors ${type === v && !viewCameraId ? 'text-indigo-400' : 'text-zinc-300'}`}
              >
                {v}
              </button>
            ))}
            {project.cameras && project.cameras.length > 0 && (
              <>
                <div className="h-px bg-white/10 my-1" />
                {project.cameras.map(cam => (
                  <button
                    key={cam.id}
                    onClick={() => {
                      setType('CAMERA');
                      setTitle(cam.name);
                      setViewCameraId(cam.id);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-indigo-600 transition-colors ${viewCameraId === cam.id ? 'text-indigo-400' : 'text-zinc-300'}`}
                  >
                    {cam.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {isRecording && activeViewport === type && (
          <span className="flex items-center gap-1 text-red-500 animate-pulse bg-black/60 px-2 py-1 rounded border border-red-500/30 text-[10px]">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            REC
          </span>
        )}
      </div>

      <div className="absolute top-10 left-1 sm:top-12 sm:left-2 z-40 flex flex-col gap-2">
        {[
          {fn:handleZoomIn,  title:'Acercar',  icon:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>},
          {fn:handleZoomOut, title:'Alejar', icon:<line x1="5" y1="12" x2="19" y2="12"/>},
          {fn:handleRecenter,title:'Recentrar',  icon:<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></>},
          {fn:handleResetView,title:'Reset Vista', icon:<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>},
          ...(selectedObjectId ? [
            {fn:handleRecenterPivot, title:'Centrar Pivote / Origen al Objeto', icon:<><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>},
            {fn:handleAlignToAxes, title:'Alinear a Ejes (90°)', icon:<><path d="M4 20h16"/><path d="M4 4v16"/><path d="M14 10l-4-4-4 4"/><path d="M10 14l4 4 4-4"/></>},
            {fn:handleAlignToFloor, title:'Alinear al Suelo (Y=0)', icon:<><path d="M2 22h20"/><path d="M12 2v14"/><path d="m7 11 5 5 5-5"/></>}
          ] : []),
        ].map(({fn,title:t,icon})=>(
          <button key={t} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();fn();}}
            className="p-2 sm:p-1.5 bg-zinc-800/95 hover:bg-zinc-700 text-white rounded-lg shadow-xl cursor-pointer touch-none active:bg-indigo-600 transition-colors border border-white/10" title={t}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
          </button>
        ))}
        {/* Grid snap toggle — only useful when drawMode is active */}
        {drawMode && (
          <button
            onPointerDown={e=>e.stopPropagation()}
            onClick={e=>{e.stopPropagation(); setGridSnapEnabled(!gridSnapEnabled);}}
            className={`p-2 sm:p-1.5 rounded-lg shadow-xl cursor-pointer touch-none transition-colors border text-[10px] font-bold leading-none
              ${gridSnapEnabled
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-zinc-800/95 border-white/10 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
            title={gridSnapEnabled ? 'Snap a cuadrícula: ON' : 'Snap a cuadrícula: OFF'}
          >
            ⊞
          </button>
        )}
      </div>

      {activeViewport===type && project.objects.find(o=>o.id===selectedObjectId) && (
        <div className="absolute bottom-1 left-1 z-30 px-1.5 py-0.5 bg-black/50 text-[10px] text-white font-mono rounded pointer-events-none">
          {(()=>{
            const obj = project.objects.find(o=>o.id===selectedObjectId)!;
            const _interp = getInterpolatedTransform(obj, currentTime);
            const pos = _interp.position;
            return `X:${pos[0].toFixed(2)} Y:${pos[1].toFixed(2)} Z:${pos[2].toFixed(2)}${obj.keyframes?.length ? ` [${obj.keyframes.length}kf]` : ''}`;
          })()}
        </div>
      )}

      {/* Gizmo numeric value display — shown while dragging an axis */}
      <div
        ref={gizmoDisplayRef}
        className="absolute top-1/2 left-1/2 z-50 pointer-events-none hidden font-mono text-sm text-white bg-black/85 border border-indigo-500 rounded px-3 py-1.5 shadow-lg"
        style={{ transform: 'translate(-50%, calc(-50% - 60px))', minWidth: '110px', textAlign: 'center' }}
      />

      <div 
        ref={containerRef} 
        onContextMenu={e => e.preventDefault()}
        className={`w-full h-full ${moveReferenceMode ? 'cursor-move' : ''}`}
      />
      <canvas ref={gizmoCanvasRef} className="absolute inset-0 w-full h-full" style={{zIndex:20,pointerEvents:'none'}} width={600} height={400}/>
    </div>
  );
};