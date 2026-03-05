import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/useStore';
import { performCSG, createPrimitiveMesh } from '../utils/csg';
import { Plus, Minus } from 'lucide-react';


interface ViewportProps {
  type: 'PERSPECTIVE' | 'TOP' | 'FRONT' | 'SIDE';
  title: string;
}

export const Viewport: React.FC<ViewportProps> = ({ type, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group>(new THREE.Group());
  const primitivesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const vertexPointsRef = useRef<THREE.Points | null>(null);
  
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const selectedVertexIndexRef = useRef<number | null>(null);
  const selectedVertexIndicesRef = useRef<number[]>([]);
  const isDraggingRef = useRef(false);

  const gizmoStateRef = useRef<{
    hoveredAxis: 'X' | 'Y' | 'Z' | null;
    activeAxis: 'X' | 'Y' | 'Z' | 'FREE' | null;
    startMouseWorld: THREE.Vector3;
    startPos: [number,number,number];
    startRot: [number,number,number];
    startScale: [number,number,number];
    startScreenPos: {x:number, y:number};
    startVertexOffsets: Record<number, [number,number,number]>;
  }>({
    hoveredAxis: null,
    activeAxis: null,
    startMouseWorld: new THREE.Vector3(),
    startPos: [0,0,0],
    startRot: [0,0,0],
    startScale: [1,1,1],
    startScreenPos: {x:0,y:0},
    startVertexOffsets: {},
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
    project, currentTime, viewMode, selectedObjectId, selectedObjectIds, selectObject,
    toggleObjectSelection, editMode, transformMode, setTransformMode, transformSpace,
    updateVertexOffset, updateVertexOffsets, updateObject,
    activeViewport, setActiveViewport, selectedVertexIndices, setSelectedVertexIndices,
    addSelectedVertexIndices, selectedFaceIndices, setSelectedFaceIndices,
    selectedEdgeIndices, setSelectedEdgeIndices, clearSelection,
    maximizedViewport, setMaximizedViewport, saveHistory
  } = useStore();

  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  // ── Helpers ──────────────────────────────────────────────────────────────
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
    const selObj = projectRef.current.objects.find(o => o.id === selectedObjectId);
    const target = selObj ? new THREE.Vector3(...selObj.transform.position) : new THREE.Vector3(0,0,0);
    const cam = cameraRef.current;
    if (!cam) return;
    if (type === 'PERSPECTIVE') {
      const controls = controlsRef.current;
      const scale = selObj ? selObj.transform.scale : [1,1,1];
      const radius = Math.max(...scale) * 2.5;
      if (controls) {
        controls.target.copy(target);
        const dir = new THREE.Vector3().subVectors(cam.position, controls.target).normalize();
        cam.position.copy(target).addScaledVector(dir.lengthSq()>0 ? dir : new THREE.Vector3(1,1,1).normalize(), radius*3);
        controls.update();
      } else {
        cam.position.set(target.x+radius*2, target.y+radius*2, target.z+radius*2);
        cam.lookAt(target);
      }
    } else {
      const orthoCam = cam as THREE.OrthographicCamera;
      if (type==='TOP') { orthoCam.position.set(target.x, target.y+10, target.z); orthoCam.up.set(0,0,-1); }
      else if (type==='FRONT') { orthoCam.position.set(target.x, target.y, target.z+10); orthoCam.up.set(0,1,0); }
      else if (type==='SIDE') { orthoCam.position.set(target.x+10, target.y, target.z); orthoCam.up.set(0,1,0); }
      orthoCam.lookAt(target);
      orthoCam.zoom = 1;
      orthoCam.updateProjectionMatrix();
    }
  };

  const handleZoomIn = () => {
    if (cameraRef.current instanceof THREE.OrthographicCamera) {
      cameraRef.current.zoom = Math.min(cameraRef.current.zoom*1.2, 10);
      cameraRef.current.updateProjectionMatrix();
    } else if (controlsRef.current) {
      const dist = cameraRef.current!.position.distanceTo(controlsRef.current.target);
      const dir = new THREE.Vector3().subVectors(cameraRef.current!.position, controlsRef.current.target).normalize();
      cameraRef.current!.position.copy(controlsRef.current.target).add(dir.multiplyScalar(dist*0.8));
      controlsRef.current.update();
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current instanceof THREE.OrthographicCamera) {
      cameraRef.current.zoom = Math.max(cameraRef.current.zoom/1.2, 0.1);
      cameraRef.current.updateProjectionMatrix();
    } else if (controlsRef.current) {
      const dist = cameraRef.current!.position.distanceTo(controlsRef.current.target);
      const dir = new THREE.Vector3().subVectors(cameraRef.current!.position, controlsRef.current.target).normalize();
      cameraRef.current!.position.copy(controlsRef.current.target).add(dir.multiplyScalar(dist*1.2));
      controlsRef.current.update();
    }
  };

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 7.5);
    scene.add(dl);

    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    if (type==='FRONT') grid.rotation.x = Math.PI/2;
    if (type==='SIDE')  grid.rotation.z = Math.PI/2;
    scene.add(grid);

    let camera: THREE.Camera;
    if (type === 'PERSPECTIVE') {
      camera = new THREE.PerspectiveCamera(50, width/height, 0.1, 1000);
      camera.position.set(5,5,5);
    } else {
      const asp = width/height, size = 10;
      camera = new THREE.OrthographicCamera(-size*asp/2, size*asp/2, size/2, -size/2, 0.1, 1000);
      if (type==='TOP')   { camera.position.set(0,10,0); (camera as any).up.set(0,0,-1); camera.lookAt(0,0,0); }
      if (type==='FRONT') { camera.position.set(0,0,10); camera.lookAt(0,0,0); }
      if (type==='SIDE')  { camera.position.set(10,0,0); camera.lookAt(0,0,0); }
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x1a1a1a, 1);
    if (containerRef.current) {
      while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
      containerRef.current.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    }
    rendererRef.current = renderer;

    if (type === 'PERSPECTIVE') {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controlsRef.current = controls;
    }

    renderer.render(scene, camera);
    return () => { rendererRef.current?.dispose(); };
  }, [type]);

  // ── 1.2 Resize Observer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      if (!w || !h) return;
      rendererRef.current.setSize(w, h);
      if (cameraRef.current instanceof THREE.PerspectiveCamera) {
        cameraRef.current.aspect = w/h; cameraRef.current.updateProjectionMatrix();
      } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
        const asp = w/h, size = 10;
        cameraRef.current.left=-size*asp/2; cameraRef.current.right=size*asp/2;
        cameraRef.current.top=size/2; cameraRef.current.bottom=-size/2;
        cameraRef.current.updateProjectionMatrix();
      }
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
          rendererRef.current.render(sceneRef.current, cameraRef.current);
          controlsRef.current?.update();
        }
      } catch {}
    };
    animate();
    return () => cancelAnimationFrame(id);
  }, []);

  // ── 1.6 Reference Image ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const existing = sceneRef.current.getObjectByName('reference-plane');
    if (existing) sceneRef.current.remove(existing);

    const viewKey = type.toLowerCase() as 'top'|'front'|'side';
    if (!['top','front','side'].includes(viewKey)) return;
    const refData = project.references[viewKey];
    if (!refData?.url) return;

    new THREE.TextureLoader().load(refData.url, tex => {
      const old = sceneRef.current?.getObjectByName('reference-plane');
      if (old) sceneRef.current!.remove(old);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1,1),
        new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:refData.opacity, side:THREE.DoubleSide, depthWrite:false })
      );
      plane.name = 'reference-plane';
      const s = refData.scale[0];
      plane.scale.set(s, s, s);
      if (type==='TOP')   plane.rotation.x = -Math.PI/2;
      if (type==='SIDE')  plane.rotation.y =  Math.PI/2;
      sceneRef.current?.add(plane);
    });
  }, [project.references, type]);

  // ── 2. Scene sync — builds geometry from vertices/faces (unified mesh) ───
  useEffect(() => {
    const group = groupRef.current;
    const primitivesGroup = primitivesGroupRef.current;
    if (!group || !primitivesGroup) return;
    group.clear();
    primitivesGroup.clear();
    vertexPointsRef.current = null;

    project.objects.forEach(obj => {
      if (!obj.visible) return;

      // ── Build BufferGeometry from mesh topology ──────────────────────────
      const geometry = new THREE.BufferGeometry();

      // 1. Positions (base + vertexOffsets baked in for display)
      const posArr: number[] = [];
      obj.vertices.forEach((v, i) => {
        const off = obj.vertexOffsets?.[i] || [0,0,0];
        posArr.push(v[0]+off[0], v[1]+off[1], v[2]+off[2]);
      });
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));

      // 2. Triangulate faces (fan) + build faceMap (triangleIdx → faceIdx)
      const indices: number[] = [];
      const faceMap: number[] = [];
      obj.faces?.forEach((face, fIdx) => {
        for (let i = 1; i < face.indices.length-1; i++) {
          indices.push(face.indices[0], face.indices[i], face.indices[i+1]);
          faceMap.push(fIdx);
        }
      });
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      // Object transform
      const mat4 = new THREE.Matrix4().compose(
        new THREE.Vector3(...obj.transform.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.transform.rotation)),
        new THREE.Vector3(...obj.transform.scale),
      );

      const isSelected = (selectedObjectIds ?? [selectedObjectId]).includes(obj.id);

      // ── Solid mesh ───────────────────────────────────────────────────────
      if (viewMode !== 'WIREFRAME') {
        const opacity = obj.opacity ?? 1;
        const solidMesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
          color: new THREE.Color(obj.color),
          transparent: true, 
          opacity: opacity,
          side: THREE.DoubleSide, shininess: 40, flatShading: true,
          depthWrite: opacity >= 1, // Only write depth if fully opaque to avoid sorting issues with transparency
        }));
        solidMesh.applyMatrix4(mat4);
        solidMesh.userData.id = obj.id;
        group.add(solidMesh);
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
          color: viewMode==='WIREFRAME' ? (isSelected?0x4f8ef7:0x22dd44) : 0xffffff,
          opacity: viewMode==='WIREFRAME' ? 1 : (isSelected?0.6:0.15),
          transparent: viewMode!=='WIREFRAME',
          depthTest: false, // Make edges always visible on top
          depthWrite: false
        })
      );
      edgeLines.applyMatrix4(mat4);
      edgeLines.renderOrder = 1; // Ensure it renders on top of the solid mesh
      group.add(edgeLines);

      // ── Sub-object edit helpers ──────────────────────────────────────────
      if (isSelected && editMode !== 'OBJECT') {
        const posAttr = geometry.getAttribute('position');

        if (editMode === 'VERTEX') {
          const pts = new THREE.Points(geometry, new THREE.PointsMaterial({ visible:true, transparent:true, opacity:0, size:0.1 }));
          pts.applyMatrix4(mat4);
          pts.updateMatrixWorld(true);
          vertexPointsRef.current = pts;

          const selectedSet = new Set(selectedVertexIndices);
          for (let i = 0; i < posAttr.count; i++) {
            const dot = new THREE.Mesh(
              new THREE.SphereGeometry(0.025, 6, 6),
              new THREE.MeshBasicMaterial({ color: selectedSet.has(i)?0xffaa00:0x888888, depthTest:false })
            );
            const world = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat4);
            dot.position.copy(world);
            dot.renderOrder = 2;
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
                faceVerts.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
              });
            }
            const fGeo = new THREE.BufferGeometry();
            fGeo.setAttribute('position', new THREE.Float32BufferAttribute(faceVerts, 3));
            const fm = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({
              color:0xff6600, transparent:true, opacity:0.55, side:THREE.DoubleSide, depthTest:false,
            }));
            fm.applyMatrix4(mat4);
            fm.renderOrder = 1;
            group.add(fm);
          });
        }

        if (editMode === 'EDGE' && selectedEdgeIndices.length > 0) {
          const edgePos: number[] = [];
          for (let i = 0; i < selectedEdgeIndices.length; i+=2) {
            const a = selectedEdgeIndices[i], b = selectedEdgeIndices[i+1];
            if (a < posAttr.count && b < posAttr.count) {
              edgePos.push(posAttr.getX(a),posAttr.getY(a),posAttr.getZ(a), posAttr.getX(b),posAttr.getY(b),posAttr.getZ(b));
            }
          }
          if (edgePos.length) {
            const eGeo = new THREE.BufferGeometry();
            eGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
            const el = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color:0x39ff14, linewidth:3, depthTest:false }));
            el.applyMatrix4(mat4);
            el.renderOrder = 1;
            group.add(el);
          }
        }
      }

      // ── Invisible raycasting proxy ───────────────────────────────────────
      const pickMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible:true, transparent:true, opacity:0, side:THREE.DoubleSide }));
      pickMesh.applyMatrix4(mat4);
      pickMesh.updateMatrixWorld(true);
      pickMesh.userData.id = obj.id;
      pickMesh.userData.faceMap = faceMap;
      primitivesGroup.add(pickMesh);
    });
  }, [project, currentTime, viewMode, selectedObjectId, selectedObjectIds, editMode, selectedVertexIndices, selectedFaceIndices, selectedEdgeIndices]);

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

    const getAxisHit = (mx: number, my: number): 'X'|'Y'|'Z'|null => {
      if (!selectedObjectId) return null;
      const selObj = projectRef.current.objects.find(o=>o.id===selectedObjectId);
      if (!selObj) return null;
      const camera=cameraRef.current, renderer=rendererRef.current;
      if (!camera||!renderer) return null;
      const w=renderer.domElement.clientWidth, h=renderer.domElement.clientHeight;

      let objPos = new THREE.Vector3();
      if (editMode==='OBJECT') {
        objPos.fromArray(selObj.transform.position);
      } else {
        if (!selectedVertexIndices.length) return null;
        const mesh = primitivesGroupRef.current.children.find((c:any)=>c.userData.id===selectedObjectId) as THREE.Mesh|undefined;
        if (!mesh) return null;
        const positions=mesh.geometry.getAttribute('position');
        const centroid=new THREE.Vector3();
        selectedVertexIndices.forEach(idx=>centroid.add(new THREE.Vector3(positions.getX(idx),positions.getY(idx),positions.getZ(idx))));
        centroid.divideScalar(selectedVertexIndices.length).applyMatrix4(mesh.matrixWorld);
        objPos=centroid;
      }

      const projected=objPos.clone().project(camera);
      const cx=(projected.x*0.5+0.5)*w, cy=(-projected.y*0.5+0.5)*h;
      const AXIS_LEN=Math.min(w,h)*0.12, HIT_RADIUS=15;

      for (const {axis,dir} of [{axis:'X' as const,dir:new THREE.Vector3(1,0,0)},{axis:'Y' as const,dir:new THREE.Vector3(0,1,0)},{axis:'Z' as const,dir:new THREE.Vector3(0,0,1)}]) {
        const projEnd=objPos.clone().add(dir).project(camera);
        const ex=(projEnd.x*0.5+0.5)*w, ey=(-projEnd.y*0.5+0.5)*h;
        const sdx=ex-cx, sdy=ey-cy, len=Math.sqrt(sdx*sdx+sdy*sdy);
        const nx=len>0?(sdx/len)*AXIS_LEN:0, ny=len>0?(sdy/len)*AXIS_LEN:0;
        const tipX=cx+nx, tipY=cy+ny;
        const bx=tipX-cx, by=tipY-cy, bLen=Math.sqrt(bx*bx+by*by);
        if (!bLen) continue;
        const t=Math.max(0,Math.min(1,((mx-cx)*bx+(my-cy)*by)/(bLen*bLen)));
        const dist=Math.sqrt((mx-cx-t*bx)**2+(my-cy-t*by)**2);
        if (dist<HIT_RADIUS) return axis;
      }
      return null;
    };

    const handleMouseDown = (event: PointerEvent) => {
      if (!containerRef.current||!cameraRef.current||!rendererRef.current) return;
      setActiveViewport(type);
      const rect=rendererRef.current.domElement.getBoundingClientRect();
      if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) return;
      const mx=event.clientX-rect.left, my=event.clientY-rect.top;

      // Store start position for drag detection
      gizmoStateRef.current.startScreenPos = { x: event.clientX, y: event.clientY };

      // Gizmo hit
      const gizmoHit=getAxisHit(mx,my);
      if (gizmoHit && selectedObjectId && event.button === 0) {
        const selObj=projectRef.current.objects.find(o=>o.id===selectedObjectId);
        if (selObj) {
          isDraggingRef.current=true;
          gizmoStateRef.current.activeAxis=gizmoHit;
          // startScreenPos already set above
          gizmoStateRef.current.startPos=[...selObj.transform.position] as [number,number,number];
          gizmoStateRef.current.startRot=[...selObj.transform.rotation] as [number,number,number];
          gizmoStateRef.current.startScale=[...selObj.transform.scale] as [number,number,number];
          if (editMode!=='OBJECT') {
            const mesh=primitivesGroupRef.current.children.find(c=>c.userData.id===selectedObjectId) as THREE.Mesh;
            if (mesh) {
              const offsets: Record<number,[number,number,number]>={};
              selectedVertexIndices.forEach(idx=>{ offsets[idx]=[...(selObj.vertexOffsets?.[idx]||[0,0,0])] as [number,number,number]; });
              gizmoStateRef.current.startVertexOffsets=offsets;
            }
          }
          if (controlsRef.current) controlsRef.current.enabled=false;
          return;
        }
      }

      mouseRef.current.x=((event.clientX-rect.left)/rect.width)*2-1;
      mouseRef.current.y=-((event.clientY-rect.top)/rect.height)*2+1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      raycasterRef.current.params.Points.threshold=0.3;
      raycasterRef.current.params.Line.threshold=0.1;

      let hitSomething=false;

      if (editMode==='VERTEX' && vertexPointsRef.current) {
        const hits=raycasterRef.current.intersectObject(vertexPointsRef.current);
        if (hits.length) {
          hitSomething=true;
          const index=hits[0].index;
          if (index!==undefined) {
            const indices=getCoincidentVertices(vertexPointsRef.current.geometry, index);
            const isCtrl=event.ctrlKey||event.metaKey||event.shiftKey;
            if (isCtrl) {
              const cur=new Set(selectedVertexIndices);
              if (indices.every(i=>cur.has(i))) setSelectedVertexIndices(selectedVertexIndices.filter(i=>!indices.includes(i)));
              else addSelectedVertexIndices(indices);
            } else setSelectedVertexIndices(indices);
            if (controlsRef.current) controlsRef.current.enabled=false;
          }
        }
      } else if (editMode==='FACE' && primitivesGroupRef.current) {
        const hits=raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, true);
        if (hits.length) {
          hitSomething=true;
          const intersect=hits[0];
          if (intersect.face) {
            const mesh=intersect.object as THREE.Mesh;
            const clickedId=mesh.userData.id;
            if (clickedId && clickedId!==selectedObjectId) selectObject(clickedId);
            if (!clickedId) return;
            
            const faceMap = mesh.userData.faceMap as number[] | undefined;
            const faceIndex = intersect.faceIndex;
            
            if (faceMap && faceIndex !== undefined && faceIndex < faceMap.length) {
              const logicalFaceIdx = faceMap[faceIndex];
              const isCtrl = event.ctrlKey || event.metaKey || event.shiftKey;
              
              if (isCtrl) {
                const cur = new Set(selectedFaceIndices);
                if (cur.has(logicalFaceIdx)) {
                  setSelectedFaceIndices(selectedFaceIndices.filter(f => f !== logicalFaceIdx));
                } else {
                  setSelectedFaceIndices([...selectedFaceIndices, logicalFaceIdx]);
                }
              } else {
                setSelectedFaceIndices([logicalFaceIdx]);
              }
              
              const selObj = projectRef.current.objects.find(o => o.id === clickedId);
              if (selObj && selObj.faces[logicalFaceIdx]) {
                const face = selObj.faces[logicalFaceIdx];
                if (!isCtrl) {
                   setSelectedVertexIndices([...face.indices]);
                } else {
                   const newSelectedFaces = isCtrl 
                      ? (selectedFaceIndices.includes(logicalFaceIdx) 
                          ? selectedFaceIndices.filter(f => f !== logicalFaceIdx) 
                          : [...selectedFaceIndices, logicalFaceIdx])
                      : [logicalFaceIdx];
                   
                   const newVertexIndices = new Set<number>();
                   newSelectedFaces.forEach(fIdx => {
                      const f = selObj.faces[fIdx];
                      if (f) f.indices.forEach(v => newVertexIndices.add(v));
                   });
                   setSelectedVertexIndices(Array.from(newVertexIndices));
                }
              }
            }
            
            if (controlsRef.current) controlsRef.current.enabled=false;
          }
        }
      } else if (editMode==='EDGE' && primitivesGroupRef.current) {
        const hits=raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, true);
        if (hits.length) {
          hitSomething=true;
          const intersect=hits[0];
          if (intersect.face) {
            const mesh=intersect.object as THREE.Mesh;
            const pos=mesh.geometry.getAttribute('position');
            const a=intersect.face.a, b=intersect.face.b, c=intersect.face.c;
            const pa=new THREE.Vector3(pos.getX(a),pos.getY(a),pos.getZ(a)).applyMatrix4(mesh.matrixWorld);
            const pb=new THREE.Vector3(pos.getX(b),pos.getY(b),pos.getZ(b)).applyMatrix4(mesh.matrixWorld);
            const pc=new THREE.Vector3(pos.getX(c),pos.getY(c),pos.getZ(c)).applyMatrix4(mesh.matrixWorld);
            const pt=intersect.point;
            const dAB=new THREE.Line3(pa,pb).closestPointToPoint(pt,true,new THREE.Vector3()).distanceTo(pt);
            const dBC=new THREE.Line3(pb,pc).closestPointToPoint(pt,true,new THREE.Vector3()).distanceTo(pt);
            const dCA=new THREE.Line3(pc,pa).closestPointToPoint(pt,true,new THREE.Vector3()).distanceTo(pt);
            let edge: [number,number];
            if (dAB<=dBC&&dAB<=dCA) edge=[a,b];
            else if (dBC<=dAB&&dBC<=dCA) edge=[b,c];
            else edge=[c,a];
            const geo=mesh.geometry;
            const allI=new Set<number>([...getCoincidentVertices(geo,edge[0]),...getCoincidentVertices(geo,edge[1])]);
            const isCtrl=event.ctrlKey||event.metaKey||event.shiftKey;
            const edgeExists=(v1:number,v2:number)=>{
              for (let i=0;i<selectedEdgeIndices.length;i+=2)
                if ((selectedEdgeIndices[i]===v1&&selectedEdgeIndices[i+1]===v2)||(selectedEdgeIndices[i]===v2&&selectedEdgeIndices[i+1]===v1)) return true;
              return false;
            };
            if (isCtrl) {
              if (edgeExists(edge[0],edge[1])) {
                const ne:number[]=[];
                for (let i=0;i<selectedEdgeIndices.length;i+=2) {
                  const v1=selectedEdgeIndices[i],v2=selectedEdgeIndices[i+1];
                  if (!((v1===edge[0]&&v2===edge[1])||(v1===edge[1]&&v2===edge[0]))) ne.push(v1,v2);
                }
                setSelectedEdgeIndices(ne);
                const av=new Set<number>();
                for (let i=0;i<ne.length;i+=2) {
                  getCoincidentVertices(geo,ne[i]).forEach(v=>av.add(v));
                  getCoincidentVertices(geo,ne[i+1]).forEach(v=>av.add(v));
                }
                setSelectedVertexIndices(Array.from(av));
              } else {
                addSelectedVertexIndices(Array.from(allI));
                setSelectedEdgeIndices([...selectedEdgeIndices,edge[0],edge[1]]);
              }
            } else {
              setSelectedVertexIndices(Array.from(allI));
              setSelectedEdgeIndices([edge[0],edge[1]]);
            }
            if (controlsRef.current) controlsRef.current.enabled=false;
          }
        }
      } else if (editMode==='OBJECT') {
        const hits=raycasterRef.current.intersectObjects(primitivesGroupRef.current.children, true);
        if (hits.length) {
          hitSomething=true;
          const clickedId=hits[0].object.userData.id;
          if (clickedId) {
            if ((event.shiftKey||event.ctrlKey||event.metaKey)&&toggleObjectSelection) toggleObjectSelection(clickedId,true);
            else selectObject(clickedId);
          }
        } else {
          // Only deselect if left click
          if (event.button === 0) {
            (mouseRef.current as any)._pendingDeselect=true;
          }
        }
      }
      
      // Removed the block that enabled 'FREE' axis drag on empty click
      // This allows OrbitControls to handle the interaction (rotation)
    };

    const handleMouseMove = (event: PointerEvent) => {
      const gs=gizmoStateRef.current, camera=cameraRef.current;
      if (!camera) return;
      if (!gs.activeAxis && rendererRef.current) {
        const rect=rendererRef.current.domElement.getBoundingClientRect();
        gs.hoveredAxis=getAxisHit(event.clientX-rect.left, event.clientY-rect.top);
        rendererRef.current.domElement.style.cursor=gs.hoveredAxis?'grab':'default';
      }
      if (!gs.activeAxis||!selectedObjectId) return;
      const selObj=projectRef.current.objects.find(o=>o.id===selectedObjectId);
      if (!selObj) return;
      const dx=event.clientX-gs.startScreenPos.x, dy=event.clientY-gs.startScreenPos.y;

      if (gs.activeAxis==='FREE' && transformMode==='translate') {
        // This block is now effectively unreachable for new interactions, 
        // but kept for safety if activeAxis is set elsewhere
        const dist=camera.position.distanceTo(new THREE.Vector3(...gs.startPos));
        const ms=0.0025*Math.max(dist,1);
        const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
        const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
        const mov=new THREE.Vector3().addScaledVector(right,dx*ms).addScaledVector(up,-dy*ms);
        updateObject(selectedObjectId,{transform:{...selObj.transform,position:[gs.startPos[0]+mov.x,gs.startPos[1]+mov.y,gs.startPos[2]+mov.z]}});
      } else if (gs.activeAxis!=='FREE' && transformMode==='translate') {
        const axisVec=gs.activeAxis==='X'?new THREE.Vector3(1,0,0):gs.activeAxis==='Y'?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
        const op=new THREE.Vector3(...gs.startPos), ae=op.clone().add(axisVec);
        op.project(camera); ae.project(camera);
        const as=new THREE.Vector2(ae.x-op.x,-(ae.y-op.y)).normalize();
        const rect=rendererRef.current!.domElement.getBoundingClientRect();
        const proj=new THREE.Vector2(dx,dy).dot(as)/Math.min(rect.width,rect.height)*10;
        const ms=Math.max(camera.position.distanceTo(new THREE.Vector3(...gs.startPos)),1)*0.3;
        if (editMode==='OBJECT') {
          updateObject(selectedObjectId,{transform:{...selObj.transform,position:[
            gs.startPos[0]+(gs.activeAxis==='X'?proj*ms:0),
            gs.startPos[1]+(gs.activeAxis==='Y'?proj*ms:0),
            gs.startPos[2]+(gs.activeAxis==='Z'?proj*ms:0),
          ]}});
        } else {
          const move=new THREE.Vector3().addScaledVector(axisVec,proj*ms);
          updateVertexOffsets(selectedObjectId, Object.entries(gs.startVertexOffsets).map(([idx,so])=>({
            index:parseInt(idx), offset:[so[0]+move.x,so[1]+move.y,so[2]+move.z] as [number,number,number]
          })));
        }
      } else if (gs.activeAxis!=='FREE' && transformMode==='rotate') {
        const angle=(dx+dy)*0.01, r=[...gs.startRot] as [number,number,number];
        updateObject(selectedObjectId,{transform:{...selObj.transform,rotation:[
          r[0]+(gs.activeAxis==='X'?angle:0),r[1]+(gs.activeAxis==='Y'?angle:0),r[2]+(gs.activeAxis==='Z'?angle:0)
        ]}});
      } else if (gs.activeAxis!=='FREE' && transformMode==='scale') {
        const delta=1+(dx-dy)*0.005, s=[...gs.startScale] as [number,number,number];
        updateObject(selectedObjectId,{transform:{...selObj.transform,scale:[
          Math.max(0.01,s[0]*(gs.activeAxis==='X'?delta:1)),
          Math.max(0.01,s[1]*(gs.activeAxis==='Y'?delta:1)),
          Math.max(0.01,s[2]*(gs.activeAxis==='Z'?delta:1)),
        ]}});
      }
    };

    const handleMouseUp = (event: PointerEvent) => {
      if (gizmoStateRef.current.activeAxis!==null) { gizmoStateRef.current.activeAxis=null; saveHistory(); }
      
      if ((mouseRef.current as any)._pendingDeselect) {
        // Check if mouse moved significantly (drag vs click)
        const dx = event.clientX - gizmoStateRef.current.startScreenPos.x;
        const dy = event.clientY - gizmoStateRef.current.startScreenPos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < 5) { // Only deselect if movement is small (click)
          selectObject(null);
        }
        (mouseRef.current as any)._pendingDeselect=false;
      }
      
      if (controlsRef.current) controlsRef.current.enabled=true;
      isDraggingRef.current=false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (editMode!=='OBJECT') return;
      switch(event.key.toLowerCase()) {
        case 'g': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
      }
    };

    const canvas=rendererRef.current?.domElement;
    if (canvas) { canvas.addEventListener('pointerdown',handleMouseDown); canvas.addEventListener('pointermove',handleMouseMove); }
    window.addEventListener('pointerup',handleMouseUp);
    window.addEventListener('keydown',handleKeyDown);
    return () => {
      if (canvas) { canvas.removeEventListener('pointerdown',handleMouseDown); canvas.removeEventListener('pointermove',handleMouseMove); }
      window.removeEventListener('pointerup',handleMouseUp);
      window.removeEventListener('keydown',handleKeyDown);
    };
  }, [editMode, selectedObjectId, selectObject, toggleObjectSelection, setTransformMode, project, updateVertexOffsets, updateObject, activeViewport, setActiveViewport, selectedVertexIndices, selectedFaceIndices, selectedEdgeIndices, setSelectedVertexIndices, setSelectedFaceIndices, setSelectedEdgeIndices, addSelectedVertexIndices, saveHistory]);

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
      if (!selectedObjectId) return;
      const selObj=projectRef.current.objects.find(o=>o.id===selectedObjectId);
      if (!selObj||!cameraRef.current||!renderer) return;

      let gizmoPos=new THREE.Vector3(...selObj.transform.position);
      if (['VERTEX','FACE','EDGE'].includes(editMode)) {
        if (!selectedVertexIndices.length) return;
        const mesh=primitivesGroupRef.current.children.find((c:any)=>c.userData.id===selectedObjectId) as THREE.Mesh|undefined;
        if (!mesh) return;
        const pos=mesh.geometry.getAttribute('position');
        const centroid=new THREE.Vector3();
        selectedVertexIndices.forEach(idx=>centroid.add(new THREE.Vector3(pos.getX(idx),pos.getY(idx),pos.getZ(idx))));
        centroid.divideScalar(selectedVertexIndices.length).applyMatrix4(mesh.matrixWorld);
        gizmoPos=centroid;
      }

      const projected=gizmoPos.clone().project(cameraRef.current);
      if (projected.z>1) return;
      const cx=(projected.x*0.5+0.5)*w, cy=(-projected.y*0.5+0.5)*h;
      const AXIS_LEN=Math.min(w,h)*0.12;
      const gs=gizmoStateRef.current;

      for (const {axis,color} of [{axis:'X' as const,color:'#ff3333'},{axis:'Y' as const,color:'#33ff33'},{axis:'Z' as const,color:'#4488ff'}]) {
        const dir=axis==='X'?new THREE.Vector3(1,0,0):axis==='Y'?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
        const pe=gizmoPos.clone().add(dir).project(cameraRef.current);
        const ex=(pe.x*0.5+0.5)*w, ey=(-pe.y*0.5+0.5)*h;
        const sdx=ex-cx, sdy=ey-cy, len=Math.sqrt(sdx*sdx+sdy*sdy);
        const nx=len>0?(sdx/len)*AXIS_LEN:0, ny=len>0?(sdy/len)*AXIS_LEN:0;
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
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=4; ctx.fill(); ctx.restore();
    };

    let rafId: number;
    const loop=()=>{drawGizmo();rafId=requestAnimationFrame(loop);};
    loop();
    return ()=>cancelAnimationFrame(rafId);
  }, [selectedObjectId, editMode, project, selectedVertexIndices]);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative w-full h-full border overflow-hidden bg-zinc-900 transition-colors touch-none ${activeViewport===type?'border-blue-500 shadow-[inset_0_0_0_1px_rgba(59,130,246,1)]':'border-zinc-800'}`}
      onPointerDown={()=>setActiveViewport(type)}
    >
      <div
        className="absolute top-1 left-1 sm:top-2 sm:left-2 z-40 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-black/60 backdrop-blur-sm text-[8px] sm:text-xs text-white rounded font-mono uppercase tracking-wider cursor-pointer hover:text-blue-400 select-none border border-white/10"
        onPointerDown={e=>e.stopPropagation()}
        onClick={e=>{e.stopPropagation();setMaximizedViewport(maximizedViewport===type?null:type);}}
      >
        {title} {maximizedViewport===type?'[-]':'[+]'}
      </div>

      <div className="absolute top-10 left-1 sm:top-12 sm:left-2 z-40 flex flex-col gap-2">
        {[
          {fn:handleZoomIn,  title:'Acercar',  icon:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>},
          {fn:handleZoomOut, title:'Alejar', icon:<line x1="5" y1="12" x2="19" y2="12"/>},
          {fn:handleRecenter,title:'Recentrar',  icon:<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></>},
        ].map(({fn,title:t,icon})=>(
          <button key={t} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();fn();}}
            className="p-2 sm:p-1.5 bg-zinc-800/95 hover:bg-zinc-700 text-white rounded-lg shadow-xl cursor-pointer touch-none active:bg-indigo-600 transition-colors border border-white/10" title={t}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
          </button>
        ))}
      </div>

      {activeViewport===type && project.objects.find(o=>o.id===selectedObjectId) && (
        <div className="absolute bottom-1 left-1 z-30 px-1.5 py-0.5 bg-black/50 text-[10px] text-white font-mono rounded pointer-events-none">
          {(()=>{const obj=project.objects.find(o=>o.id===selectedObjectId)!;return`X:${obj.transform.position[0].toFixed(2)} Y:${obj.transform.position[1].toFixed(2)} Z:${obj.transform.position[2].toFixed(2)}`;})()}
        </div>
      )}

      <div ref={containerRef} className="w-full h-full"/>
      <canvas ref={gizmoCanvasRef} className="absolute inset-0 w-full h-full" style={{zIndex:20,pointerEvents:'none'}} width={600} height={400}/>
    </div>
  );
};