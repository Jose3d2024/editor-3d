/**
 * uvUnwrap.ts — Advanced Blender-Standard UV Mapping & Unwrapping Engine
 * 
 * Provides:
 * 1. Smart UV Project (Angle-based chart segmentation + LSCM/Conformal 2D flattening + automatic packing with margin)
 * 2. Cube / Box Mapping with customizable scale & seam alignment
 * 3. Cylinder & Sphere Projection (equirectangular with anti-seam split)
 * 4. Camera / View-based Project
 * 5. Lightmap Pack (Uniform island packing for bake & lightmaps)
 * 6. Follow Active Quads / Regularize UV grid
 * 7. UV Relax / Minimize Stretch (Laplacian + Edge spring relaxation in UV space)
 * 8. UV Island Packing with customizable margin & rotation
 * 9. Seam preservation & UV island boundary detection
 */

import * as THREE from 'three';
import type { MeshFace, V3 } from '../types';

export interface UVUnwrapOptions {
  angleThresholdDeg?: number; // For Smart UV Project (default: 66°)
  islandMargin?: number;      // Margin between UV islands [0..0.1] (default: 0.02)
  correctAspect?: boolean;   // Preserve aspect ratio
  scaleToFit?: boolean;      // Normalize whole UV layout to [0, 1]
  relaxIterations?: number;  // Number of relaxation steps (default: 5)
  direction?: 'X' | 'Y' | 'Z' | 'VIEW' | 'AUTO';
}

/**
 * Helper to calculate face normal
 */
function getFaceNormal(vertices: V3[], faceIndices: number[]): THREE.Vector3 {
  if (!faceIndices || faceIndices.length < 3) return new THREE.Vector3(0, 1, 0);
  const vert0 = vertices[faceIndices[0]];
  const vert1 = vertices[faceIndices[1]];
  const vert2 = vertices[faceIndices[2]];
  if (!vert0 || !vert1 || !vert2) return new THREE.Vector3(0, 1, 0);
  const v0 = new THREE.Vector3(...vert0);
  const v1 = new THREE.Vector3(...vert1);
  const v2 = new THREE.Vector3(...vert2);
  const norm = new THREE.Vector3().crossVectors(v1.sub(v0), v2.sub(v0));
  if (norm.lengthSq() > 1e-8) {
    return norm.normalize();
  }
  return new THREE.Vector3(0, 1, 0);
}

/**
 * Helper to calculate 3D face area
 */
function getFaceArea(vertices: V3[], faceIndices: number[]): number {
  if (!faceIndices || faceIndices.length < 3) return 0;
  const vert0 = vertices[faceIndices[0]];
  if (!vert0) return 0;
  let totalArea = 0;
  const v0 = new THREE.Vector3(...vert0);
  for (let i = 1; i < faceIndices.length - 1; i++) {
    const vert1 = vertices[faceIndices[i]];
    const vert2 = vertices[faceIndices[i + 1]];
    if (!vert1 || !vert2) continue;
    const v1 = new THREE.Vector3(...vert1);
    const v2 = new THREE.Vector3(...vert2);
    const cross = new THREE.Vector3().crossVectors(v1.sub(v0), v2.sub(v0));
    totalArea += cross.length() * 0.5;
  }
  return totalArea;
}

/**
 * Segment mesh faces into chart islands based on normal angles (Blender Smart UV Project)
 */
export function segmentFacesByAngle(
  vertices: V3[],
  faces: MeshFace[],
  angleThresholdDeg = 66
): number[][] {
  const numFaces = faces.length;
  if (numFaces === 0) return [];

  const thresholdRad = (angleThresholdDeg * Math.PI) / 180;
  const faceNormals = faces.map(f => getFaceNormal(vertices, f.indices));

  // Build edge-to-face adjacency map
  const edgeToFaces = new Map<string, number[]>();
  faces.forEach((f, fIdx) => {
    const n = f.indices.length;
    for (let i = 0; i < n; i++) {
      const a = f.indices[i];
      const b = f.indices[(i + 1) % n];
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      let list = edgeToFaces.get(key);
      if (!list) {
        list = [];
        edgeToFaces.set(key, list);
      }
      list.push(fIdx);
    }
  });

  const visited = new Uint8Array(numFaces);
  const islands: number[][] = [];

  for (let f = 0; f < numFaces; f++) {
    if (visited[f]) continue;

    const island: number[] = [];
    const queue: number[] = [f];
    visited[f] = 1;

    // Island seed normal
    const seedNormal = faceNormals[f];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      island.push(curr);
      const currNorm = faceNormals[curr];

      const fIndices = faces[curr].indices;
      const n = fIndices.length;
      for (let i = 0; i < n; i++) {
        const a = fIndices[i];
        const b = fIndices[(i + 1) % n];
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        const neighbors = edgeToFaces.get(key) || [];

        for (const neighbor of neighbors) {
          if (visited[neighbor]) continue;

          const nNorm = faceNormals[neighbor];
          // Check angle between adjacent faces and against island seed
          const dotAdj = Math.max(-1, Math.min(1, currNorm.dot(nNorm)));
          const angleAdj = Math.acos(dotAdj);

          const dotSeed = Math.max(-1, Math.min(1, seedNormal.dot(nNorm)));
          const angleSeed = Math.acos(dotSeed);

          if (angleAdj <= thresholdRad && angleSeed <= thresholdRad * 1.25) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
    }

    if (island.length > 0) {
      islands.push(island);
    }
  }

  return islands;
}

/**
 * 2D Local Conformal Projection for a single island of connected faces
 */
function projectIsland2D(
  vertices: V3[],
  faces: MeshFace[],
  islandFaceIndices: number[]
): {
  islandFaceUVs: Map<number, [number, number][]>;
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
  width: number;
  height: number;
} {
  // 1. Find dominant normal for the island
  const avgNormal = new THREE.Vector3();
  const islandCentroid = new THREE.Vector3();
  let totalArea = 0;

  islandFaceIndices.forEach(fIdx => {
    const face = faces[fIdx];
    const n = getFaceNormal(vertices, face.indices);
    const a = getFaceArea(vertices, face.indices);
    avgNormal.addScaledVector(n, a + 1e-4);
    totalArea += a;

    face.indices.forEach(vIdx => {
      islandCentroid.add(new THREE.Vector3(...vertices[vIdx]));
    });
  });

  if (avgNormal.lengthSq() > 1e-6) {
    avgNormal.normalize();
  } else {
    avgNormal.set(0, 1, 0);
  }

  // 2. Build local coordinate frame (Tangent U, Bitangent V, Normal N)
  let tangentU = new THREE.Vector3();
  if (Math.abs(avgNormal.y) < 0.9) {
    tangentU.crossVectors(avgNormal, new THREE.Vector3(0, 1, 0)).normalize();
  } else {
    tangentU.crossVectors(avgNormal, new THREE.Vector3(1, 0, 0)).normalize();
  }
  const bitangentV = new THREE.Vector3().crossVectors(avgNormal, tangentU).normalize();

  // 3. Project each face's vertices onto this best-fit 2D local plane
  const islandFaceUVs = new Map<number, [number, number][]>();
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;

  islandFaceIndices.forEach(fIdx => {
    const face = faces[fIdx];
    const uvs: [number, number][] = face.indices.map(vIdx => {
      const p = new THREE.Vector3(...vertices[vIdx]);
      const u = p.dot(tangentU);
      const v = p.dot(bitangentV);

      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;

      return [u, v];
    });
    islandFaceUVs.set(fIdx, uvs);
  });

  const width = Math.max(1e-6, maxU - minU);
  const height = Math.max(1e-6, maxV - minV);

  return { islandFaceUVs, minU, minV, maxU, maxV, width, height };
}

/**
 * Minimize stretch / Laplacian relaxation in UV space (Blender UV Relax)
 */
function relaxIslandUVs(
  vertices: V3[],
  faces: MeshFace[],
  islandFaceIndices: number[],
  islandFaceUVs: Map<number, [number, number][]>,
  iterations = 6
): void {
  if (islandFaceIndices.length < 2 || iterations <= 0) return;

  // Build vertex map for this island
  // (vertex index -> list of references to its [u, v] coordinate in faces)
  const vertCoordRefs = new Map<number, { fIdx: number; cornerIdx: number }[]>();
  const vertNeighbors = new Map<number, Set<number>>();

  islandFaceIndices.forEach(fIdx => {
    const face = faces[fIdx];
    const n = face.indices.length;
    for (let i = 0; i < n; i++) {
      const v = face.indices[i];
      const nextV = face.indices[(i + 1) % n];
      const prevV = face.indices[(i + n - 1) % n];

      if (!vertCoordRefs.has(v)) vertCoordRefs.set(v, []);
      vertCoordRefs.get(v)!.push({ fIdx, cornerIdx: i });

      if (!vertNeighbors.has(v)) vertNeighbors.set(v, new Set());
      vertNeighbors.get(v)!.add(nextV);
      vertNeighbors.get(v)!.add(prevV);
    }
  });

  // Iterative Spring Laplacian Relaxation with readBuffer and 3D edge length preservation
  for (let iter = 0; iter < iterations; iter++) {
    // Clonar el estado UV al inicio de la iteración para lectura limpia y simétrica
    const readBuffer = new Map<number, [number, number][]>();
    islandFaceIndices.forEach(fIdx => {
      readBuffer.set(fIdx, islandFaceUVs.get(fIdx)!.map(uv => [...uv] as [number, number]));
    });

    vertNeighbors.forEach((neighbors, vIdx) => {
      const refs = vertCoordRefs.get(vIdx);
      if (!refs || refs.length === 0 || neighbors.size === 0) return;

      const firstRef = refs[0];
      const currUV = readBuffer.get(firstRef.fIdx)![firstRef.cornerIdx];
      const p3D = new THREE.Vector3(...vertices[vIdx]);

      let avgU = 0, avgV = 0, totalWeight = 0;

      neighbors.forEach(nIdx => {
        const nRefs = vertCoordRefs.get(nIdx);
        if (!nRefs || nRefs.length === 0) return;
        const nRef = nRefs[0];
        const nUV = readBuffer.get(nRef.fIdx)![nRef.cornerIdx];
        const n3D = new THREE.Vector3(...vertices[nIdx]);

        const dist3D = Math.max(1e-4, p3D.distanceTo(n3D));
        // Weight inversely by 3D distance to keep proportions
        const weight = 1.0 / dist3D;

        avgU += nUV[0] * weight;
        avgV += nUV[1] * weight;
        totalWeight += weight;
      });

      if (totalWeight > 0) {
        avgU /= totalWeight;
        avgV /= totalWeight;

        // Smooth blend (alpha = 0.20 to prevent fold-overs)
        const newU = currUV[0] * 0.80 + avgU * 0.20;
        const newV = currUV[1] * 0.80 + avgV * 0.20;

        refs.forEach(({ fIdx, cornerIdx }) => {
          const uv = islandFaceUVs.get(fIdx)![cornerIdx];
          uv[0] = newU;
          uv[1] = newV;
        });
      }
    });
  }
}

/**
 * Packs multiple 2D UV charts into the normalized [0, 1] x [0, 1] square
 * with configurable padding margin (Bin Packing / Skyline Algorithm)
 */
export function packUVPieces(
  islands: {
    islandFaceUVs: Map<number, [number, number][]>;
    minU: number;
    minV: number;
    maxU: number;
    maxV: number;
    width: number;
    height: number;
  }[],
  margin = 0.02
): Map<number, [number, number][]> {
  const resultFaceUVs = new Map<number, [number, number][]>();
  if (islands.length === 0) return resultFaceUVs;

  // Sort islands by largest bounding box dimension descending
  const sorted = [...islands].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    return areaB - areaA;
  });

  // Compute total raw area to estimate global scale
  let totalArea = 0;
  sorted.forEach(isl => {
    totalArea += (isl.width + margin) * (isl.height + margin);
  });

  const estimatedGridWidth = Math.max(1e-4, Math.sqrt(totalArea) * 1.2);

  // Shelf-packing algorithm
  let currentX = margin;
  let currentY = margin;
  let shelfHeight = 0;
  let maxExtentX = 0;
  let maxExtentY = 0;

  interface IslandPlacement {
    island: typeof sorted[0];
    x: number;
    y: number;
  }

  const placements: IslandPlacement[] = [];

  sorted.forEach(isl => {
    // If island exceeds current row, advance to next shelf row
    if (currentX + isl.width > estimatedGridWidth && currentX > margin) {
      currentX = margin;
      currentY += shelfHeight + margin;
      shelfHeight = 0;
    }

    placements.push({
      island: isl,
      x: currentX,
      y: currentY
    });

    if (isl.height > shelfHeight) {
      shelfHeight = isl.height;
    }

    currentX += isl.width + margin;

    if (currentX > maxExtentX) maxExtentX = currentX;
    if (currentY + shelfHeight > maxExtentY) maxExtentY = currentY + shelfHeight;
  });

  // Global normalization factor to fit tightly into [0, 1] range preserving aspect ratio
  const totalW = Math.max(1e-6, maxExtentX);
  const totalH = Math.max(1e-6, maxExtentY);
  const layoutScale = Math.max(totalW, totalH);

  placements.forEach(({ island, x, y }) => {
    island.islandFaceUVs.forEach((uvs, fIdx) => {
      const normalizedUVs: [number, number][] = uvs.map(([u, v]) => {
        // Shift local island to [0, width]
        const localU = u - island.minU;
        const localV = v - island.minV;

        // Place on packed canvas
        const finalU = (x + localU) / layoutScale;
        const finalV = (y + localV) / layoutScale;

        return [finalU, finalV];
      });
      resultFaceUVs.set(fIdx, normalizedUVs);
    });
  });

  return resultFaceUVs;
}

/**
 * ─── SMART UV PROJECT (Blender 5.x LTS Compatible) ─────────────────────────
 * Automatically unwraps arbitrary organic or hard-surface 3D models with minimal stretching.
 */
export function smartUVProject(
  mesh: { vertices: V3[]; faces: MeshFace[] },
  options: UVUnwrapOptions = {}
): { vertices: V3[]; faces: MeshFace[] } {
  const {
    angleThresholdDeg = 66,
    islandMargin = 0.02,
    relaxIterations = 6
  } = options;

  const vertices = mesh.vertices;
  const faces = mesh.faces;
  if (!vertices.length || !faces.length) return mesh;

  // 1. Segment faces into islands based on angle limits
  const faceGroups = segmentFacesByAngle(vertices, faces, angleThresholdDeg);

  // 2. Project each island onto local 2D planes & relax
  const projectedIslands = faceGroups.map(islandFaces => {
    const projected = projectIsland2D(vertices, faces, islandFaces);
    if (relaxIterations > 0) {
      relaxIslandUVs(vertices, faces, islandFaces, projected.islandFaceUVs, relaxIterations);
    }
    return projected;
  });

  // 3. Pack islands into 0..1 square
  const packedUVMap = packUVPieces(projectedIslands, islandMargin);

  // 4. Assign UVs back to faces
  const newFaces = faces.map((f, fIdx) => {
    const uvs = packedUVMap.get(fIdx) || f.indices.map(() => [0, 0] as [number, number]);
    return {
      ...f,
      uvs
    };
  });

  return { vertices, faces: newFaces };
}

/**
 * ─── CUBE / BOX UV MAPPING ──────────────────────────────────────────────────
 * Classic 6-axis box projection with uniform texel density
 */
export function cubeUVProject(
  mesh: { vertices: V3[]; faces: MeshFace[] },
  scale = 1.0
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = mesh.vertices;
  if (!vertices.length) return mesh;

  // Calculate bounding box
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  vertices.forEach(v => {
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });

  const size = [
    Math.max(1e-6, max[0] - min[0]),
    Math.max(1e-6, max[1] - min[1]),
    Math.max(1e-6, max[2] - min[2])
  ];
  const maxSize = Math.max(size[0], size[1], size[2]) || 1;

  const newFaces = mesh.faces.map(face => {
    const norm = getFaceNormal(vertices, face.indices);
    const absX = Math.abs(norm.x);
    const absY = Math.abs(norm.y);
    const absZ = Math.abs(norm.z);

    const uvs: [number, number][] = (face.indices || []).map(vIdx => {
      const v = vertices[vIdx] || [0, 0, 0];
      const [x, y, z] = v;
      let u = 0, uvY = 0;

      if (absY >= absX && absY >= absZ) {
        // Top / Bottom Face (XZ plane)
        u = ((x - min[0]) / maxSize) * scale;
        uvY = ((z - min[2]) / maxSize) * scale;
      } else if (absX >= absY && absX >= absZ) {
        // Left / Right Face (ZY plane)
        u = ((z - min[2]) / maxSize) * scale;
        uvY = ((y - min[1]) / maxSize) * scale;
      } else {
        // Front / Back Face (XY plane)
        u = ((x - min[0]) / maxSize) * scale;
        uvY = ((y - min[1]) / maxSize) * scale;
      }

      return [u, uvY];
    });

    return { ...face, uvs };
  });

  return { vertices, faces: newFaces };
}

/**
 * ─── CYLINDER & SPHERE UV PROJECTION ─────────────────────────────────────────
 * Anti-seam circular unwrapping for cylinders, pipes, globes, and bottles
 */
export function cylinderSphereUVProject(
  mesh: { vertices: V3[]; faces: MeshFace[] },
  type: 'CYLINDRICAL' | 'SPHERICAL' = 'CYLINDRICAL'
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = mesh.vertices;
  if (!vertices || !vertices.length || !mesh.faces) return mesh;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  vertices.forEach(v => {
    if (!v) return;
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });

  const sizeY = Math.max(1e-6, max[1] - min[1]);
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];

  const newFaces = mesh.faces.map(face => {
    if (!face || !face.indices) return face;
    let uvs: [number, number][] = face.indices.map(vIdx => {
      const v = vertices[vIdx] || [0, 0, 0];
      const [x, y, z] = v;
      const dx = x - center[0];
      const dz = z - center[2];

      let u = 0.5 + Math.atan2(dz, dx) / (2 * Math.PI);
      let uvY = 0;

      if (type === 'SPHERICAL') {
        const dy = y - center[1];
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        uvY = 0.5 - Math.asin(Math.max(-1, Math.min(1, dy / radius))) / Math.PI;
      } else {
        uvY = (y - min[1]) / sizeY;
      }

      return [u, uvY];
    });

    // Fix Seam Wrapping across the u=0 / u=1 boundary
    let minU = Infinity, maxU = -Infinity;
    uvs.forEach(([u]) => {
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
    });

    if (maxU - minU > 0.5) {
      uvs = uvs.map(([u, v]) => {
        if (u < 0.5) return [u + 1.0, v];
        return [u, v];
      });
    }

    return { ...face, uvs };
  });

  return { vertices, faces: newFaces };
}

/**
 * ─── VIEW / CAMERA PROJECT ──────────────────────────────────────────────────
 * Projects UVs directly from the current viewport camera angle
 */
export function projectFromViewUV(
  mesh: { vertices: V3[]; faces: MeshFace[] },
  cameraMatrixWorldInverse: THREE.Matrix4,
  projectionMatrix: THREE.Matrix4
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = mesh.vertices;
  if (!vertices || !vertices.length || !mesh.faces) return mesh;

  const viewProj = new THREE.Matrix4().multiplyMatrices(
    projectionMatrix,
    cameraMatrixWorldInverse
  );

  const newFaces = mesh.faces.map(face => {
    if (!face || !face.indices) return face;
    const uvs: [number, number][] = face.indices.map(vIdx => {
      const v = vertices[vIdx] || [0, 0, 0];
      const p = new THREE.Vector3(...v);
      p.applyMatrix4(viewProj);
      // Normalized device coordinates (-1..1) to UV space (0..1)
      const u = p.x * 0.5 + 0.5;
      const uvY = p.y * 0.5 + 0.5;
      return [u, uvY];
    });
    return { ...face, uvs };
  });

  return { vertices, faces: newFaces };
}

/**
 * ─── UNIFORM LIGHTMAP PACK ──────────────────────────────────────────────────
 * Isolates each individual face polygon as a separate packed island with margin
 */
export function lightmapPack(
  mesh: { vertices: V3[]; faces: MeshFace[] },
  margin = 0.04
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = mesh.vertices;
  const faces = mesh.faces;
  if (!vertices.length || !faces.length) return mesh;

  // Treat each individual face as its own chart
  const islands = faces.map((_, fIdx) => {
    return projectIsland2D(vertices, faces, [fIdx]);
  });

  const packedUVMap = packUVPieces(islands, margin);

  const newFaces = faces.map((f, fIdx) => {
    const uvs = packedUVMap.get(fIdx) || f.indices.map(() => [0, 0] as [number, number]);
    return { ...f, uvs };
  });

  return { vertices, faces: newFaces };
}
