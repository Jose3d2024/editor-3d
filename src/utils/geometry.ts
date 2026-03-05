import * as THREE from 'three';
import { PrimitiveType, ShapeParameters, V3, MeshFace } from '../types';

export function generatePrimitive(type: PrimitiveType, params: ShapeParameters): { vertices: V3[], faces: MeshFace[] } {
  // Special case for CUBE to ensure quads
  if (type === 'CUBE') {
    // 8 vertices
    const vertices: V3[] = [
      // Front
      [-0.5, -0.5,  0.5], // 0
      [ 0.5, -0.5,  0.5], // 1
      [ 0.5,  0.5,  0.5], // 2
      [-0.5,  0.5,  0.5], // 3
      // Back
      [-0.5, -0.5, -0.5], // 4
      [ 0.5, -0.5, -0.5], // 5
      [ 0.5,  0.5, -0.5], // 6
      [-0.5,  0.5, -0.5], // 7
    ];

    const faces: MeshFace[] = [
      { indices: [0, 1, 2, 3], normal: [0, 0, 1] }, // Front
      { indices: [5, 4, 7, 6], normal: [0, 0, -1] }, // Back
      { indices: [4, 0, 3, 7], normal: [-1, 0, 0] }, // Left
      { indices: [1, 5, 6, 2], normal: [1, 0, 0] }, // Right
      { indices: [3, 2, 6, 7], normal: [0, 1, 0] }, // Top
      { indices: [4, 5, 1, 0], normal: [0, -1, 0] }, // Bottom
    ];

    return { vertices, faces };
  }

  let geometry: THREE.BufferGeometry;

  // For other primitives, use Three.js to generate geometry
  switch (type) {
    case 'SPHERE':
      if (params.sphereType === 'ICO') {
        geometry = new THREE.IcosahedronGeometry(0.5, params.detail ?? 1);
      } else {
        // Default to UV Sphere
        geometry = new THREE.SphereGeometry(0.5, Math.max(3, params.segments ?? 16), Math.max(2, (params.segments ?? 16) / 2));
      }
      break;
    case 'CYLINDER':
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(3, params.segments ?? 16));
      break;
    case 'CONE':
      geometry = new THREE.ConeGeometry(0.5, 1, Math.max(3, params.segments ?? 16));
      break;
    case 'TORUS':
      geometry = new THREE.TorusGeometry(params.radius ?? 0.5, params.tube ?? 0.2, Math.max(3, params.radialSegments ?? 16), Math.max(6, params.tubularSegments ?? 32));
      break;
    case 'ICOSAHEDRON':
      geometry = new THREE.IcosahedronGeometry(0.5, params.detail ?? 0);
      break;
    case 'DODECAHEDRON':
      geometry = new THREE.DodecahedronGeometry(0.5, params.detail ?? 0);
      break;
    case 'PLANE':
      geometry = new THREE.PlaneGeometry(1, 1, Math.max(1, params.segments ?? 1), Math.max(1, params.segments ?? 1));
      break;
    case 'CIRCLE':
      geometry = new THREE.CircleGeometry(0.5, Math.max(3, params.segments ?? 16));
      break;
    case 'RING':
      geometry = new THREE.RingGeometry(params.innerRadius ?? 0.25, params.outerRadius ?? 0.5, Math.max(3, params.thetaSegments ?? 16));
      break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  // Extract vertices and faces from BufferGeometry
  // We merge vertices by position to get a shared-vertex mesh
  
  const posAttr = geometry.getAttribute('position');
  const vertices: V3[] = [];
  const keyMap = new Map<string, number>();
  const faces: MeshFace[] = [];

  // Helper to get or add vertex
  const getOrAddVertex = (x: number, y: number, z: number) => {
    // Use a precision to merge close vertices
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    if (keyMap.has(key)) return keyMap.get(key)!;
    const idx = vertices.length;
    vertices.push([x, y, z]);
    keyMap.set(key, idx);
    return idx;
  };

  if (geometry.index) {
    const indexAttr = geometry.index;
    for (let i = 0; i < indexAttr.count; i += 3) {
      const a = indexAttr.getX(i);
      const b = indexAttr.getX(i+1);
      const c = indexAttr.getX(i+2);
      
      const vA = getOrAddVertex(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
      const vB = getOrAddVertex(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));
      const vC = getOrAddVertex(posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c));
      
      faces.push({ indices: [vA, vB, vC] });
    }
  } else {
    // Non-indexed
    for (let i = 0; i < posAttr.count; i += 3) {
      const vA = getOrAddVertex(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const vB = getOrAddVertex(posAttr.getX(i+1), posAttr.getY(i+1), posAttr.getZ(i+1));
      const vC = getOrAddVertex(posAttr.getX(i+2), posAttr.getY(i+2), posAttr.getZ(i+2));
      
      faces.push({ indices: [vA, vB, vC] });
    }
  }

  return { vertices, faces };
}
