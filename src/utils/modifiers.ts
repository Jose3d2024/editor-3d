/**
 * modifiers.ts — Mesh modification utilities
 *
 * All operations work on the CSGObject data model (vertices: V3[], faces: MeshFace[])
 * and return a new { vertices, faces } pair without mutating the input.
 */

import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import type { CSGObject, MeshFace, V3, CSGOperation } from '../types';
import { generatePrimitive } from './geometry';
import { repairMesh, fillHoles, capSelectedFaces } from './meshUtils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function vecAdd(a: V3, b: V3): V3      { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vecScale(v: V3, s: number): V3 { return [v[0]*s, v[1]*s, v[2]*s]; }
function vecDist(a: V3, b: V3): number  {
  const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/** Build adjacency list: vertex → list of connected vertex indices (through face edges) */
function buildAdjacency(verts: V3[], faces: MeshFace[]): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < verts.length; i++) adj.set(i, new Set());
  for (const face of faces) {
    const n = face.indices.length;
    for (let i = 0; i < n; i++) {
      const a = face.indices[i], b = face.indices[(i + 1) % n];
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }
  return adj;
}

/** Convert CSGObject vertices+faces to an indexed Three.js BufferGeometry with UV support */
function toThreeGeometry(obj: { vertices: V3[]; faces: MeshFace[] }): THREE.BufferGeometry {
  const hasUVs = obj.faces.some(f => f.uvs && f.uvs.length > 0);
  const indices: number[] = [];
  const finalPositions: number[] = [];
  const finalUvs: number[] = [];
  const vertMap = new Map<string, number>();

  if (hasUVs) {
    obj.faces.forEach(face => {
      const faceIndices: number[] = [];
      face.indices.forEach((posIdx, i) => {
        const uv = face.uvs?.[i] || [0, 0];
        const key = `${posIdx}_${uv[0].toFixed(4)}_${uv[1].toFixed(4)}`;
        if (vertMap.has(key)) {
          faceIndices.push(vertMap.get(key)!);
        } else {
          const newIdx = finalPositions.length / 3;
          const v = obj.vertices[posIdx];
          finalPositions.push(...v);
          finalUvs.push(...uv);
          vertMap.set(key, newIdx);
          faceIndices.push(newIdx);
        }
      });
      for (let i = 1; i < faceIndices.length - 1; i++) {
        indices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
      }
    });
  } else {
    const positions: number[] = [];
    for (const [x, y, z] of obj.vertices) positions.push(x, y, z);
    obj.faces.forEach(face => {
      for (let i = 1; i < face.indices.length - 1; i++) {
        indices.push(face.indices[0], face.indices[i], face.indices[i + 1]);
      }
    });
    finalPositions.push(...positions);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(finalPositions, 3));
  if (hasUVs) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(finalUvs, 2));
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Convert a Three.js BufferGeometry back to {vertices, faces} (triangles) with UV support */
export function fromThreeGeometry(geo: THREE.BufferGeometry): { vertices: V3[]; faces: MeshFace[] } {
  if (!geo.getAttribute('position')) {
    return { vertices: [], faces: [] };
  }

  // Make sure it's indexed
  if (!geo.index) geo = geo.toNonIndexed();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const vertices: V3[] = [];
  for (let i = 0; i < pos.count; i++) vertices.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);

  const faces: MeshFace[] = [];
  if (geo.index) {
    for (let i = 0; i < geo.index.count; i += 3) {
      const i1 = geo.index.getX(i);
      const i2 = geo.index.getX(i + 1);
      const i3 = geo.index.getX(i + 2);
      const face: MeshFace = { indices: [i1, i2, i3] };
      if (uv) {
        face.uvs = [
          [uv.getX(i1), uv.getY(i1)],
          [uv.getX(i2), uv.getY(i2)],
          [uv.getX(i3), uv.getY(i3)]
        ];
      }
      faces.push(face);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      const face: MeshFace = { indices: [i, i + 1, i + 2] };
      if (uv) {
        face.uvs = [
          [uv.getX(i), uv.getY(i)],
          [uv.getX(i + 1), uv.getY(i + 1)],
          [uv.getX(i + 2), uv.getY(i + 2)]
        ];
      }
      faces.push(face);
    }
  }
  return { vertices, faces };
}

// ─── Smooth ───────────────────────────────────────────────────────────────────

/**
 * Laplacian smoothing: move each vertex toward the average position of its neighbors.
 * @param factor  0–1: how much to move toward neighbor average (0 = no change, 1 = full average)
 * @param iterations  number of smoothing passes
 */
export function smoothMesh(
  obj: CSGObject,
  factor: number,
  iterations: number = 1,
): { vertices: V3[]; faces: MeshFace[] } {
  let vertices = obj.vertices.map(v => [...v] as V3);
  const faces = obj.faces;
  const f = Math.max(0, Math.min(1, factor));

  const adj = buildAdjacency(vertices, faces);

  for (let iter = 0; iter < iterations; iter++) {
    const next = vertices.map((v, i) => {
      const neighbours = [...(adj.get(i) ?? [])];
      if (neighbours.length === 0) return v;
      const avg: V3 = [0, 0, 0];
      for (const j of neighbours) {
        avg[0] += vertices[j][0];
        avg[1] += vertices[j][1];
        avg[2] += vertices[j][2];
      }
      avg[0] /= neighbours.length;
      avg[1] /= neighbours.length;
      avg[2] /= neighbours.length;
      return [
        v[0] + (avg[0] - v[0]) * f,
        v[1] + (avg[1] - v[1]) * f,
        v[2] + (avg[2] - v[2]) * f,
      ] as V3;
    });
    vertices = next;
  }

  return { vertices, faces };
}

// ─── Subdivide ─────────────────────────────────────────────────────────────────

/**
 * Simple subdivision: splits each face into smaller faces by adding a vertex at the center
 * and at the midpoint of each edge.
 *
 * ⚠️ BUG FIX NOTE — vertex selection after subdivision:
 *   After calling this function, the store MUST reset `vertexOffsets: {}` on the
 *   updated object. If the Viewport renders vertex handles by iterating the keys of
 *   `vertexOffsets` instead of the full `vertices` array, only the original vertices
 *   will appear selectable. Resetting vertexOffsets forces a full rebuild.
 *   In Toolbar.tsx the subdivision button already handles this:
 *     subdivideFaces(id, faces);
 *     updateObject(id, { vertexOffsets: {} });
 */
export function subdivideMesh(
  obj: CSGObject,
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = obj.vertices.map(v => [...v] as V3);
  const faces = obj.faces;
  
  const edgeMidpoints = new Map<string, number>();
  const getEdgeKey = (v1: number, v2: number) => Math.min(v1, v2) + '_' + Math.max(v1, v2);
  
  const newFaces: MeshFace[] = [];
  
  faces.forEach(face => {
    const n = face.indices.length;
    if (n < 3) return;
    
    let cx = 0, cy = 0, cz = 0;
    face.indices.forEach(vIdx => {
      const base = vertices[vIdx];
      cx += base[0]; cy += base[1]; cz += base[2];
    });
    cx /= n; cy /= n; cz /= n;
    
    const centerIdx = vertices.length;
    vertices.push([cx, cy, cz]);
    
    const midIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      const v1 = face.indices[i];
      const v2 = face.indices[(i + 1) % n];
      const edgeKey = getEdgeKey(v1, v2);
      
      if (edgeMidpoints.has(edgeKey)) {
        midIndices.push(edgeMidpoints.get(edgeKey)!);
      } else {
        const b1 = vertices[v1];
        const b2 = vertices[v2];
        const mx = (b1[0] + b2[0]) / 2;
        const my = (b1[1] + b2[1]) / 2;
        const mz = (b1[2] + b2[2]) / 2;
        
        const midIdx = vertices.length;
        vertices.push([mx, my, mz]);
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

  // NO smoothing — preserve vertex positions exactly.
  // Use 'Suavizar malla' separately if you want smoothing.
  return { vertices, faces: newFaces };
}

// ─── Optimize (decimate) ──────────────────────────────────────────────────────

/**
 * Mesh optimization: merge vertices that are within a distance threshold,
 * remove degenerate faces, and optionally collapse short edges.
 * @param ratio  0–1: higher = more aggressive merging (threshold = ratio * bounding diagonal * 0.05)
 */
export function optimizeMesh(
  obj: CSGObject,
  ratio: number,
): { vertices: V3[]; faces: MeshFace[] } {
  if (obj.vertices.length === 0) return { vertices: [], faces: [] };

  // Compute bounding box diagonal for adaptive threshold
  let minX=Infinity, minY=Infinity, minZ=Infinity, maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  for (const [x,y,z] of obj.vertices) {
    if (x<minX) minX=x; if (y<minY) minY=y; if (z<minZ) minZ=z;
    if (x>maxX) maxX=x; if (y>maxY) maxY=y; if (z>maxZ) maxZ=z;
  }
  const diag = Math.sqrt((maxX-minX)**2+(maxY-minY)**2+(maxZ-minZ)**2);
  const threshold = Math.max(0.0001, diag * ratio * 0.04);

  // Step 1: merge close vertices
  const remap: number[] = new Array(obj.vertices.length).fill(-1);
  const newVerts: V3[] = [];

  for (let i = 0; i < obj.vertices.length; i++) {
    if (remap[i] !== -1) continue;
    remap[i] = newVerts.length;
    newVerts.push([...obj.vertices[i]] as V3);
    // Find other vertices within threshold
    for (let j = i + 1; j < obj.vertices.length; j++) {
      if (remap[j] !== -1) continue;
      if (vecDist(obj.vertices[i], obj.vertices[j]) <= threshold) {
        remap[j] = remap[i];
      }
    }
  }

  // Step 2: remap faces, remove degenerate, PRESERVE UVs
  const newFaces: MeshFace[] = [];
  for (const face of obj.faces) {
    const remapped = face.indices.map(i => remap[i]);
    // Remove degenerate: any two indices the same
    const unique = [...new Set(remapped)];
    if (unique.length < 3) continue; // degenerate
    
    // Preserve other properties
    newFaces.push({ 
      ...face,
      indices: remapped 
    });
  }

  // Step 3: remove unused vertices
  const used = new Set<number>();
  for (const f of newFaces) for (const i of f.indices) used.add(i);
  const compact: number[] = new Array(newVerts.length).fill(-1);
  const finalVerts: V3[] = [];
  const sortedUsed = [...used].sort((a,b)=>a-b);
  for (const i of sortedUsed) {
    compact[i] = finalVerts.length;
    finalVerts.push(newVerts[i]);
  }
  const finalFaces = newFaces.map(f => ({ 
    ...f,
    indices: f.indices.map(i => compact[i]) 
  }));

  return { vertices: finalVerts, faces: finalFaces };
}

export { repairMesh, fillHoles, capSelectedFaces };

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  vertexCount: number;
  faceCount: number;
  edgeCount: number;
  duplicateVertices: number;
  degenerateFaces: number;
  openEdges: number;           // Edges shared by only 1 face (non-manifold boundary)
  nonManifoldEdges: number;    // Edges shared by >2 faces
  issues: string[];
  suggestions: string[];
}

export function validateMesh(obj: CSGObject): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    vertexCount: obj.vertices.length,
    faceCount: obj.faces.length,
    edgeCount: 0,
    duplicateVertices: 0,
    degenerateFaces: 0,
    openEdges: 0,
    nonManifoldEdges: 0,
    issues: [],
    suggestions: [],
  };

  if (obj.vertices.length === 0) {
    result.isValid = false;
    result.issues.push('Sin vértices');
    return result;
  }

  // Check duplicate vertices
  const vMap = new Map<string, number>();
  for (const v of obj.vertices) {
    const k = `${v[0].toFixed(5)},${v[1].toFixed(5)},${v[2].toFixed(5)}`;
    vMap.set(k, (vMap.get(k) ?? 0) + 1);
  }
  result.duplicateVertices = [...vMap.values()].reduce((s,c) => s + (c > 1 ? c - 1 : 0), 0);
  if (result.duplicateVertices > 0) {
    result.isValid = false;
    result.issues.push(`${result.duplicateVertices} vértices duplicados`);
    result.suggestions.push('Usar "Reparar" para fusionar vértices duplicados');
  }

  // Edge manifold check
  const edgeFaceCount = new Map<string, number>();
  for (const face of obj.faces) {
    const n = face.indices.length;
    if (n < 3) { result.degenerateFaces++; continue; }
    for (let i = 0; i < n; i++) {
      const a = face.indices[i], b = face.indices[(i+1)%n];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);
    }
  }
  result.edgeCount = edgeFaceCount.size;

  for (const [, count] of edgeFaceCount) {
    if (count === 1) result.openEdges++;
    else if (count > 2) result.nonManifoldEdges++;
  }

  if (result.degenerateFaces > 0) {
    result.isValid = false;
    result.issues.push(`${result.degenerateFaces} caras degeneradas`);
    result.suggestions.push('Usar "Reparar" para eliminar caras degeneradas');
  }
  if (result.openEdges > 0) {
    result.isValid = false;
    result.issues.push(`${result.openEdges} aristas abiertas (malla no cerrada)`);
    result.suggestions.push('La malla tiene huecos — revisar antes de imprimir en 3D');
  }
  if (result.nonManifoldEdges > 0) {
    result.isValid = false;
    result.issues.push(`${result.nonManifoldEdges} aristas no-manifold (>2 caras)`);
    result.suggestions.push('Usar "Reparar" para limpiar geometría no-manifold');
  }

  return result;
}

/**
 * Generates UV coordinates for a mesh using box projection.
 * Normalizes coordinates to [0, 1] range based on bounding box.
 */
export function generateUVs(obj: { vertices: V3[]; faces: MeshFace[] }): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = obj.vertices;
  if (vertices.length === 0) return obj;

  // Calculate bounding box for normalization
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  vertices.forEach(v => {
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });

  const size = [
    max[0] - min[0] || 1,
    max[1] - min[1] || 1,
    max[2] - min[2] || 1
  ];

  const faces = obj.faces.map(face => {
    if (face.uvs && face.uvs.length === face.indices.length) return face;

    // Calculate normal once per face
    const v0 = new THREE.Vector3(...vertices[face.indices[0]]);
    const v1 = new THREE.Vector3(...vertices[face.indices[1]]);
    const v2 = new THREE.Vector3(...vertices[face.indices[2]]);
    const normal = new THREE.Vector3().crossVectors(
      v1.clone().sub(v0),
      v2.clone().sub(v0)
    ).normalize();

    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    const uvs: [number, number][] = face.indices.map(vIdx => {
      const [x, y, z] = vertices[vIdx];
      
      let u = 0, v = 0;
      if (absX > absY && absX > absZ) {
        u = (z - min[2]) / size[2];
        v = (y - min[1]) / size[1];
      } else if (absY > absX && absY > absZ) {
        u = (x - min[0]) / size[0];
        v = (z - min[2]) / size[2];
      } else {
        u = (x - min[0]) / size[0];
        v = (y - min[1]) / size[1];
      }
      return [u, v] as [number, number];
    });

    return { ...face, uvs };
  });

  return { vertices, faces };
}

/**
 * Applies a specific UVW mapping projection to the mesh.
 */
export function applyUVWMapping(obj: { vertices: V3[]; faces: MeshFace[] }, type: string): { vertices: V3[]; faces: MeshFace[] } {
  const vertices = obj.vertices;
  if (vertices.length === 0) return obj;

  // Calculate bounding box for normalization
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  vertices.forEach(v => {
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });

  const size = [
    max[0] - min[0] || 1,
    max[1] - min[1] || 1,
    max[2] - min[2] || 1
  ];
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];

  const faces = obj.faces.map(face => {
    // Calculate normal once per face for projections that need it
    const v0 = new THREE.Vector3(...vertices[face.indices[0]]);
    const v1 = new THREE.Vector3(...vertices[face.indices[1]]);
    const v2 = new THREE.Vector3(...vertices[face.indices[2]]);
    const normal = new THREE.Vector3().crossVectors(
      v1.clone().sub(v0),
      v2.clone().sub(v0)
    ).normalize();

    let uvs: [number, number][] = face.indices.map(vIdx => {
      const [x, y, z] = vertices[vIdx];
      let u = 0, v = 0;

      switch (type) {
        case 'BOX':
        case 'TRIPLANAR': {
          const absX = Math.abs(normal.x);
          const absY = Math.abs(normal.y);
          const absZ = Math.abs(normal.z);
          const maxSize = Math.max(size[0], size[1], size[2]) || 1;
          if (absX > absY && absX > absZ) {
            u = (z - min[2]) / maxSize;
            v = (y - min[1]) / maxSize;
          } else if (absY > absX && absY > absZ) {
            u = (x - min[0]) / maxSize;
            v = (z - min[2]) / maxSize;
          } else {
            u = (x - min[0]) / maxSize;
            v = (y - min[1]) / maxSize;
          }
          break;
        }
        case 'SPHERICAL': {
          const dx = x - center[0];
          const dy = y - center[1];
          const dz = z - center[2];
          const radius = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
          u = 0.5 + Math.atan2(dz, dx) / (2 * Math.PI);
          v = 0.5 - Math.asin(dy / radius) / Math.PI;
          break;
        }
        case 'CYLINDRICAL': {
          const dx = x - center[0];
          const dz = z - center[2];
          u = 0.5 + Math.atan2(dz, dx) / (2 * Math.PI);
          v = (y - min[1]) / size[1];
          break;
        }
        case 'PLANAR':
        default:
          u = (x - min[0]) / size[0];
          v = (y - min[1]) / size[1];
          break;
      }
      return [u, v] as [number, number];
    });

    // Fix UV seams for Spherical and Cylindrical mappings
    if (type === 'SPHERICAL' || type === 'CYLINDRICAL') {
      let maxU = -Infinity;
      let minU = Infinity;
      uvs.forEach(uv => {
        if (uv[0] > maxU) maxU = uv[0];
        if (uv[0] < minU) minU = uv[0];
      });
      
      // If the difference is large (e.g. > 0.5), it means the face crosses the seam
      if (maxU - minU > 0.5) {
        uvs = uvs.map(uv => {
          if (uv[0] < 0.5) {
            return [uv[0] + 1, uv[1]];
          }
          return uv;
        });
      }
    }

    return { ...face, uvs };
  });

  return { vertices, faces };
}

// ─── Boolean (wrapper around three-csg-ts) ────────────────────────────────────

export function applyBooleanOperation(
  target: CSGObject,
  tool: CSGObject,
  operation: CSGOperation,
): { vertices: V3[]; faces: MeshFace[] } | null {
  try {
    const matA = new THREE.MeshStandardMaterial();
    const matB = new THREE.MeshStandardMaterial();

    const geoA = toThreeGeometry(target).toNonIndexed();
    const geoB = toThreeGeometry(tool).toNonIndexed();

    const meshA = new THREE.Mesh(geoA, matA);
    meshA.position.set(...target.transform.position);
    meshA.rotation.set(...target.transform.rotation);
    meshA.scale.set(...target.transform.scale);
    meshA.updateMatrixWorld(true);

    const meshB = new THREE.Mesh(geoB, matB);
    meshB.position.set(...tool.transform.position);
    meshB.rotation.set(...tool.transform.rotation);
    meshB.scale.set(...tool.transform.scale);
    meshB.updateMatrixWorld(true);

    const csgA = CSG.fromMesh(meshA);
    const csgB = CSG.fromMesh(meshB);

    let resultCSG;
    if (operation === 'ADD')           resultCSG = csgA.union(csgB);
    else if (operation === 'SUBTRACT') resultCSG = csgA.subtract(csgB);
    else                               resultCSG = csgA.intersect(csgB);

    const resultMesh = CSG.toMesh(resultCSG, new THREE.Matrix4(), matA);
    return fromThreeGeometry(resultMesh.geometry);

  } catch (e) {
    console.error('Boolean operation failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── GENERATIVE TOOLS ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Polígono regular ─────────────────────────────────────────────────────────

/**
 * Genera un polígono regular plano (triángulo, hexágono, octógono, etc.)
 * en el plano XZ con la cara mirando hacia arriba (+Y).
 *
 * @param sides   Número de lados (mínimo 3)
 * @param radius  Radio exterior
 * @param height  Altura Y del polígono
 */
export function generatePolygon(
  sides: number,
  radius: number = 1,
  height: number = 0,
): { vertices: V3[]; faces: MeshFace[] } {
  sides = Math.max(3, Math.round(sides));
  const vertices: V3[] = [];
  const faces: MeshFace[] = [];

  // Vértices del perímetro
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    vertices.push([Math.cos(angle) * radius, height, Math.sin(angle) * radius]);
  }
  // Centro
  const centerIdx = vertices.length;
  vertices.push([0, height, 0]);

  // Caras triangulares desde el centro
  for (let i = 0; i < sides; i++) {
    faces.push({ indices: [centerIdx, (i + 1) % sides, i] });
  }

  return { vertices, faces };
}

// ─── Arco / Tarta ─────────────────────────────────────────────────────────────

/**
 * Genera un arco o sector circular en el plano XZ.
 *
 * @param radius        Radio
 * @param startAngleDeg Ángulo inicial en grados
 * @param endAngleDeg   Ángulo final en grados
 * @param segments      Número de segmentos de la curva
 * @param filled        true = sector/tarta (con cara); false = sólo arco (línea)
 */
export function generateArc(
  radius: number = 1,
  startAngleDeg: number = 0,
  endAngleDeg: number = 360,
  segments: number = 32,
  filled: boolean = true,
): { vertices: V3[]; faces: MeshFace[] } {
  const vertices: V3[] = [];
  const faces: MeshFace[] = [];

  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad   = (endAngleDeg   * Math.PI) / 180;

  // Vértices del arco
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startRad + (endRad - startRad) * t;
    vertices.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }

  if (filled) {
    // Centro
    const centerIdx = vertices.length;
    vertices.push([0, 0, 0]);
    for (let i = 0; i < segments; i++) {
      faces.push({ indices: [centerIdx, i, i + 1] });
    }
  }

  return { vertices, faces };
}

// ─── Torno / Lathe ────────────────────────────────────────────────────────────

/**
 * Perfiles predefinidos para el torno.
 * Cada punto es [radio, altura] donde altura 0 = base y 1 = cima (se escala).
 */
export const LATHE_PRESETS: Record<string, Array<[number, number]>> = {
  columna:  [[0.30,0],[0.32,0.05],[0.25,0.35],[0.25,0.75],[0.32,0.90],[0.30,1]],
  jarra:    [[0.05,0],[0.40,0.10],[0.45,0.45],[0.35,0.80],[0.20,0.92],[0.15,1]],
  botella:  [[0.05,0],[0.05,0.12],[0.32,0.30],[0.30,0.72],[0.18,0.88],[0.18,1]],
  copa:     [[0.05,0],[0.30,0.12],[0.40,0.32],[0.10,0.60],[0.10,0.78],[0.32,0.90],[0.30,1]],
  tazón:    [[0,0],[0.40,0.10],[0.45,0.52],[0.35,0.82],[0.30,0.90]],
  columnaD: [[0.28,0],[0.35,0.04],[0.20,0.12],[0.20,0.86],[0.35,0.94],[0.28,1]],
};

/**
 * Genera una superficie de revolución girando un perfil 2D alrededor del eje Y.
 *
 * @param profile    Array de [radio, altura] — radio >= 0, altura en [0,1] (se escala a `totalHeight`)
 * @param segments   Divisiones angulares (8 = low-poly, 24 = suave)
 * @param totalHeight Escala del eje Y
 * @param startAngle Ángulo inicial en radianes (0 = completo)
 * @param endAngle   Ángulo final en radianes (2π = completo)
 */
export function latheMesh(
  profile: Array<[number, number]>,
  segments: number = 16,
  totalHeight: number = 2,
  startAngle: number = 0,
  endAngle: number = Math.PI * 2,
): { vertices: V3[]; faces: MeshFace[] } {
  if (profile.length < 2) return { vertices: [], faces: [] };

  const vertices: V3[] = [];
  const faces: MeshFace[] = [];
  const n = profile.length;
  const fullCircle = Math.abs(endAngle - startAngle - Math.PI * 2) < 0.001;
  const ringCount  = fullCircle ? segments : segments + 1;

  // Generar anillos de vértices
  for (let s = 0; s < ringCount; s++) {
    const t     = s / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    const cos   = Math.cos(angle);
    const sin   = Math.sin(angle);
    for (const [r, h] of profile) {
      vertices.push([r * cos, h * totalHeight, r * sin]);
    }
  }

  // Generar caras cuadriláteras entre anillos
  for (let s = 0; s < segments; s++) {
    const nextS = fullCircle ? (s + 1) % ringCount : s + 1;
    for (let p = 0; p < n - 1; p++) {
      const a = s     * n + p;
      const b = s     * n + (p + 1);
      const c = nextS * n + (p + 1);
      const d = nextS * n + p;
      faces.push({ indices: [a, b, c, d] });
    }
  }

  // Tapas superior e inferior si el perfil empieza/termina en radio 0
  const topR    = profile[0][1];
  const bottomR = profile[n - 1][1];

  if (profile[0][0] < 0.001) {
    // Tapa superior: abanico desde el primer vértice de cada anillo
    for (let s = 0; s < segments; s++) {
      const nextS = fullCircle ? (s + 1) % ringCount : s + 1;
      faces.push({ indices: [s * n, nextS * n, s * n] }); // degenerate — skip
    }
  }

  return { vertices, faces };
}

// ─── Sweep (extrusión a lo largo de un camino) ────────────────────────────────

/**
 * Perfiles 2D predefinidos para Sweep.
 * Puntos [x, y] en espacio local de la sección transversal.
 */
export const SWEEP_PROFILES: Record<string, Array<[number, number]>> = {
  círculo: Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [Math.cos(a) * 0.15, Math.sin(a) * 0.15] as [number, number];
  }),
  cuadrado:  [[-0.15,-0.15],[0.15,-0.15],[0.15,0.15],[-0.15,0.15]],
  triángulo: [[0,0.20],[-0.17,-0.10],[0.17,-0.10]],
  moldura:   [[-0.10,0],[-0.15,0.05],[-0.15,0.15],[-0.10,0.20],[0.10,0.20],[0.15,0.15],[0.15,0.05],[0.10,0]],
  L:         [[-0.15,-0.15],[0.15,-0.15],[0.15,0.00],[-0.05,0.00],[-0.05,0.15],[-0.15,0.15]],
};

/**
 * Caminos predefinidos para Sweep.
 */
export function makeStraightPath(length: number = 2, segments: number = 8): V3[] {
  return Array.from({ length: segments + 1 }, (_, i) => [0, 0, (i / segments) * length] as V3);
}

export function makeArcPath(
  radius: number = 1.5,
  angleDeg: number = 180,
  segments: number = 16,
): V3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t     = i / segments;
    const angle = (angleDeg * t * Math.PI) / 180;
    return [Math.cos(angle) * radius - radius, 0, Math.sin(angle) * radius] as V3;
  });
}

export function makeHelixPath(
  radius: number = 1,
  height: number = 3,
  turns: number = 2,
  segments: number = 32,
): V3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t     = i / segments;
    const angle = t * turns * Math.PI * 2;
    return [Math.cos(angle) * radius, t * height, Math.sin(angle) * radius] as V3;
  });
}

/**
 * Barre un perfil 2D a lo largo de un camino 3D (extrusión de trayectoria).
 * Ideal para molduras, marcos, tuberías, cadenas, barandillas.
 *
 * @param profile       Puntos 2D [x, y] de la sección transversal
 * @param path          Puntos 3D que definen el camino
 * @param closedProfile true = perfil cerrado (tubo); false = perfil abierto (moldura)
 */
export function sweepMesh(
  profile: Array<[number, number]>,
  path: V3[],
  closedProfile: boolean = true,
): { vertices: V3[]; faces: MeshFace[] } {
  if (path.length < 2 || profile.length < 2) return { vertices: [], faces: [] };

  const vertices: V3[] = [];
  const faces: MeshFace[] = [];
  const n = profile.length;

  // Genera un frame de Frenet-Serret estabilizado para cada punto del camino
  let prevRight = new THREE.Vector3(1, 0, 0);

  for (let pi = 0; pi < path.length; pi++) {
    const curr = new THREE.Vector3(...path[pi]);

    // Tangente
    let tangent: THREE.Vector3;
    if (pi === 0) {
      tangent = new THREE.Vector3(...path[1]).sub(curr).normalize();
    } else if (pi === path.length - 1) {
      tangent = curr.clone().sub(new THREE.Vector3(...path[pi - 1])).normalize();
    } else {
      tangent = new THREE.Vector3(...path[pi + 1]).sub(new THREE.Vector3(...path[pi - 1])).normalize();
    }

    // Parallel transport para evitar giro del perfil
    const right = prevRight.clone().sub(
      tangent.clone().multiplyScalar(tangent.dot(prevRight))
    ).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    prevRight = right.clone();

    for (const [px, py] of profile) {
      const v = curr.clone()
        .addScaledVector(right, px)
        .addScaledVector(up, py);
      vertices.push([v.x, v.y, v.z]);
    }
  }

  // Caras entre secciones
  for (let pi = 0; pi < path.length - 1; pi++) {
    for (let i = 0; i < n; i++) {
      const nextI = closedProfile ? (i + 1) % n : i + 1;
      if (!closedProfile && i === n - 1) continue;
      const a = pi       * n + i;
      const b = pi       * n + nextI;
      const c = (pi + 1) * n + nextI;
      const d = (pi + 1) * n + i;
      faces.push({ indices: [a, b, c, d] });
    }
  }

  return { vertices, faces };
}

// ─── Loft (solevado) ─────────────────────────────────────────────────────────

/**
 * Crea una superficie interpolando entre múltiples secciones transversales.
 * Las secciones deben tener el mismo número de vértices.
 * Permite pasar de un círculo a un cuadrado a una estrella, etc.
 *
 * @param sections      Array de secciones; cada sección es un array de V3
 * @param closedProfile true = el último vértice conecta con el primero (perfil cerrado)
 */
export function loftMesh(
  sections: V3[][],
  closedProfile: boolean = true,
): { vertices: V3[]; faces: MeshFace[] } {
  if (sections.length < 2) return { vertices: [], faces: [] };

  const n = sections[0].length;
  // Asegurar que todas las secciones tienen el mismo número de puntos
  const normalizedSections = sections.map(sec => {
    if (sec.length === n) return sec;
    // Re-muestrear si difiere (interpolación simple)
    return Array.from({ length: n }, (_, i) => {
      const t   = i / n;
      const idx = t * (sec.length - 1);
      const lo  = Math.floor(idx);
      const hi  = Math.min(lo + 1, sec.length - 1);
      const f   = idx - lo;
      return [
        sec[lo][0] + (sec[hi][0] - sec[lo][0]) * f,
        sec[lo][1] + (sec[hi][1] - sec[lo][1]) * f,
        sec[lo][2] + (sec[hi][2] - sec[lo][2]) * f,
      ] as V3;
    });
  });

  const vertices: V3[] = normalizedSections.flat();
  const faces: MeshFace[] = [];

  for (let s = 0; s < normalizedSections.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const nextI = closedProfile ? (i + 1) % n : i + 1;
      if (!closedProfile && i === n - 1) continue;
      const a = s       * n + i;
      const b = s       * n + nextI;
      const c = (s + 1) * n + nextI;
      const d = (s + 1) * n + i;
      faces.push({ indices: [a, b, c, d] });
    }
  }

  // Tapas (fan triangulation)
  const capSection = (sectionOffset: number, reversed: boolean) => {
    const center: V3 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      center[0] += vertices[sectionOffset + i][0] / n;
      center[1] += vertices[sectionOffset + i][1] / n;
      center[2] += vertices[sectionOffset + i][2] / n;
    }
    const ci = vertices.length;
    vertices.push(center);
    for (let i = 0; i < n; i++) {
      const a = sectionOffset + i;
      const b = sectionOffset + (i + 1) % n;
      faces.push({ indices: reversed ? [ci, b, a] : [ci, a, b] });
    }
  };

  capSection(0, true);
  capSection((normalizedSections.length - 1) * n, false);

  return { vertices, faces };
}

/**
 * Utilidad: genera una sección circular (para usar en loftMesh / sweepMesh).
 */
export function circleSection(
  radius: number,
  y: number,
  segments: number = 8,
  offsetAngle: number = 0,
): V3[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2 + offsetAngle;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as V3;
  });
}

/**
 * Utilidad: genera una sección cuadrada.
 */
export function squareSection(size: number, y: number): V3[] {
  const h = size / 2;
  return [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]] as V3[];
}

/**
 * Utilidad: genera una sección en forma de estrella.
 */
export function starSection(
  outerR: number,
  innerR: number,
  points: number,
  y: number,
): V3[] {
  const verts: V3[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r     = i % 2 === 0 ? outerR : innerR;
    verts.push([Math.cos(angle) * r, y, Math.sin(angle) * r]);
  }
  return verts;
}

// ─── Bisel / Bevel ────────────────────────────────────────────────────────────

/**
 * Aplica un bisel por inserción (face inset): cada cara es reemplazada
 * por una versión más pequeña centrada, rodeada de caras laterales trapezoidales.
 * Equivale a un "inset" de Blender.
 *
 * @param obj    Objeto fuente
 * @param amount Cantidad de bisel (0 = sin cambio, 1 = colapsa al centro)
 * @param offset Desplazamiento Y opcional de la cara interior (para efecto chamfer)
 */
export function bevelMesh(
  obj: CSGObject,
  amount: number = 0.15,
  offset: number = 0,
): { vertices: V3[]; faces: MeshFace[] } {
  const amount01 = Math.max(0, Math.min(0.99, amount));
  const newVerts: V3[] = obj.vertices.map(v => [...v] as V3);
  const newFaces: MeshFace[] = [];

  for (const face of obj.faces) {
    const n = face.indices.length;
    if (n < 3) continue;

    // Centro de la cara
    const center: V3 = [0, 0, 0];
    for (const idx of face.indices) {
      center[0] += obj.vertices[idx][0] / n;
      center[1] += obj.vertices[idx][1] / n;
      center[2] += obj.vertices[idx][2] / n;
    }

    // Normal de la cara (para el desplazamiento Y del offset)
    const v0 = new THREE.Vector3(...obj.vertices[face.indices[0]]);
    const v1 = new THREE.Vector3(...obj.vertices[face.indices[1]]);
    const v2 = new THREE.Vector3(...obj.vertices[face.indices[2]]);
    const normal = new THREE.Vector3()
      .crossVectors(v1.clone().sub(v0), v2.clone().sub(v0))
      .normalize();

    // Crear vértices del inset
    const insetIndices: number[] = [];
    for (const idx of face.indices) {
      const v = obj.vertices[idx];
      const inset: V3 = [
        v[0] + (center[0] - v[0]) * amount01 + normal.x * offset,
        v[1] + (center[1] - v[1]) * amount01 + normal.y * offset,
        v[2] + (center[2] - v[2]) * amount01 + normal.z * offset,
      ];
      insetIndices.push(newVerts.length);
      newVerts.push(inset);
    }

    // Cara interior (el original reducido)
    newFaces.push({ indices: [...insetIndices] });

    // Caras laterales trapezoidales (exterior → interior)
    for (let i = 0; i < n; i++) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % n];
      const c = insetIndices[(i + 1) % n];
      const d = insetIndices[i];
      newFaces.push({ indices: [a, b, c, d] });
    }
  }

  return { vertices: newVerts, faces: newFaces };
}

// ─── PathDeform ───────────────────────────────────────────────────────────────

/**
 * Deforma un objeto existente doblándolo para seguir una curva/camino.
 * Funciona en el eje Z local del objeto: redistribuye los vértices
 * proyectando su coordenada Z a lo largo del camino.
 *
 * @param obj   Objeto a deformar
 * @param path  Camino 3D de puntos (debe cubrir el rango Z del objeto)
 */
export function pathDeformMesh(
  obj: CSGObject,
  path: V3[],
): { vertices: V3[]; faces: MeshFace[] } {
  if (path.length < 2 || obj.vertices.length === 0) return { vertices: obj.vertices, faces: obj.faces };

  // Calcular longitud total del camino
  const lengths: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + vecDist(path[i - 1], path[i]));
  }
  const totalLength = lengths[lengths.length - 1];

  // Rango Z del objeto
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of obj.vertices) {
    if (v[2] < minZ) minZ = v[2];
    if (v[2] > maxZ) maxZ = v[2];
  }
  const rangeZ = maxZ - minZ || 1;

  const newVerts: V3[] = obj.vertices.map(v => {
    // Normalizar Z a [0,1] → posición en el camino
    const t  = ((v[2] - minZ) / rangeZ) * totalLength;

    // Encontrar segmento del camino
    let seg = 0;
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i] >= t) { seg = i - 1; break; }
    }
    seg = Math.min(seg, path.length - 2);

    const segLen = lengths[seg + 1] - lengths[seg];
    const localT = segLen > 0 ? (t - lengths[seg]) / segLen : 0;

    const p0 = new THREE.Vector3(...path[seg]);
    const p1 = new THREE.Vector3(...path[seg + 1]);

    // Tangente en el punto
    const tangent = p1.clone().sub(p0).normalize();
    const worldUp = Math.abs(tangent.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right   = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const up      = new THREE.Vector3().crossVectors(right, tangent).normalize();

    // Posición en el camino + desplazamiento XY local
    const pathPos = p0.clone().lerp(p1, localT);
    const result  = pathPos
      .addScaledVector(right, v[0])
      .addScaledVector(up,    v[1]);

    return [result.x, result.y, result.z] as V3;
  });

  return { vertices: newVerts, faces: obj.faces };
}
