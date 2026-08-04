import * as THREE from 'three';
import type { V3, MeshFace, CSGObject } from '../types';

/**
 * Repair mesh issues and weld duplicate/coincident vertices across gaps:
 * 1. Merge duplicate/coincident vertices within spatial tolerance (using 3x3x3 grid search)
 * 2. Remove degenerate faces (< 3 unique verts)
 * 3. Remove duplicate faces
 */
export function repairMesh(
  obj: CSGObject | { vertices: V3[]; faces: MeshFace[]; vertexOffsets?: Record<number, V3> },
  tolerance: number = 0.001
): { vertices: V3[]; faces: MeshFace[]; report: string[] } {
  const report: string[] = [];
  if (!obj.vertices || obj.vertices.length === 0) return { vertices: [], faces: [], report: ['Sin vértices'] };

  // 0. Bake vertex offsets if they exist
  const baseVertices = obj.vertices.map((v, i) => {
    const off = (obj as any).vertexOffsets?.[i] || [0, 0, 0];
    return [v[0] + off[0], v[1] + off[1], v[2] + off[2]] as V3;
  });

  // 1. Weld duplicates with spatial grid search across 3x3x3 neighborhood
  const n = baseVertices.length;
  const tol = Math.max(0.00001, tolerance);
  const tolSq = tol * tol;
  const cellSize = tol;

  const gridMap = new Map<string, number[]>();
  const weldedVerts: V3[] = [];
  const remap: number[] = new Array(n);
  let mergedCount = 0;

  for (let i = 0; i < n; i++) {
    const v = baseVertices[i];
    const gx = Math.floor(v[0] / cellSize);
    const gy = Math.floor(v[1] / cellSize);
    const gz = Math.floor(v[2] / cellSize);

    let foundIdx = -1;

    for (let dx = -1; dx <= 1 && foundIdx === -1; dx++) {
      for (let dy = -1; dy <= 1 && foundIdx === -1; dy++) {
        for (let dz = -1; dz <= 1 && foundIdx === -1; dz++) {
          const key = `${gx + dx}_${gy + dy}_${gz + dz}`;
          const candidates = gridMap.get(key);
          if (candidates) {
            for (const candIdx of candidates) {
              const cv = weldedVerts[candIdx];
              const d0 = v[0] - cv[0];
              const d1 = v[1] - cv[1];
              const d2 = v[2] - cv[2];
              if (d0 * d0 + d1 * d1 + d2 * d2 <= tolSq) {
                foundIdx = candIdx;
                break;
              }
            }
          }
        }
      }
    }

    if (foundIdx !== -1) {
      remap[i] = foundIdx;
      mergedCount++;
    } else {
      const newIdx = weldedVerts.length;
      remap[i] = newIdx;
      weldedVerts.push([...v] as V3);

      const key = `${gx}_${gy}_${gz}`;
      let list = gridMap.get(key);
      if (!list) {
        list = [];
        gridMap.set(key, list);
      }
      list.push(newIdx);
    }
  }

  if (mergedCount > 0) report.push(`${mergedCount} vértices fusionados/soldados (distancia <= ${tol})`);

  // 2. Remap + remove degenerate faces
  let degenerateCount = 0, dupFaceCount = 0;
  const faceSet = new Set<string>();
  const cleanFaces: MeshFace[] = [];

  for (const face of obj.faces) {
    const remapped = face.indices.map(i => remap[i]);
    const unique = new Set(remapped);
    if (unique.size < 3) { degenerateCount++; continue; }
    const key = [...remapped].sort((a,b)=>a-b).join(',');
    if (faceSet.has(key)) { dupFaceCount++; continue; }
    faceSet.add(key);
    cleanFaces.push({ ...face, indices: remapped });
  }
  if (degenerateCount > 0) report.push(`${degenerateCount} caras degeneradas eliminadas`);
  if (dupFaceCount > 0)     report.push(`${dupFaceCount} caras duplicadas eliminadas`);

  // 3. Remove unused vertices
  const used = new Set<number>();
  for (const f of cleanFaces) for (const i of f.indices) used.add(i);
  const compact: number[] = new Array(weldedVerts.length).fill(-1);
  const finalVerts: V3[] = [];
  const sortedUsed = [...used].sort((a,b)=>a-b);
  for (const i of sortedUsed) {
    compact[i] = finalVerts.length;
    finalVerts.push(weldedVerts[i]);
  }
  const finalFaces = cleanFaces.map(f => ({ 
    ...f,
    indices: f.indices.map(i => compact[i]) 
  }));

  if (report.length === 0) report.push('Malla limpia');

  return { vertices: finalVerts, faces: finalFaces, report };
}

export const weldMesh = repairMesh;

/**
 * Fills holes based on a selection of faces.
 * It finds the boundary edges of the selected faces and fills the loops.
 */
export function capSelectedFaces(
  obj: CSGObject | { vertices: V3[]; faces: MeshFace[] },
  selectedFaceIndices: number[]
): { vertices: V3[]; faces: MeshFace[]; report: string[] } {
  if (selectedFaceIndices.length === 0) return { ...obj, report: ['No hay caras seleccionadas'] };

  const report: string[] = [];
  const vertices = [...obj.vertices];
  const faces = [...obj.faces];

  // 1. Find boundary edges of the selection
  const edgeMap = new Map<string, { a: number, b: number, count: number }>();
  selectedFaceIndices.forEach(fIdx => {
    const face = faces[fIdx];
    if (!face) return;
    for (let i = 0; i < face.indices.length; i++) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % face.indices.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const entry = edgeMap.get(key) || { a, b, count: 0 };
      entry.count++;
      edgeMap.set(key, entry);
    }
  });

  // Boundary edges of the selection are those that appear only once in the selection
  const boundaryEdges = Array.from(edgeMap.values()).filter(e => e.count === 1);
  
  // 2. Chain edges into loops
  // (Similar logic to fillHoles but restricted to selection boundary)
  const adj = new Map<number, number[]>();
  boundaryEdges.forEach(e => {
    // We need to find which face this edge belongs to in the selection to get orientation
    for (const fIdx of selectedFaceIndices) {
      const face = faces[fIdx];
      for(let i=0; i<face.indices.length; i++) {
        const a = face.indices[i];
        const b = face.indices[(i+1)%face.indices.length];
        if ((a === e.a && b === e.b) || (a === e.b && b === e.a)) {
          // In the selection, the edge goes a -> b.
          // To "cap" it, we should go b -> a.
          if (!adj.has(b)) adj.set(b, []);
          adj.get(b)!.push(a);
        }
      }
    }
  });

  // ... rest of the loop detection and filling logic is the same as fillHoles ...
  // I'll refactor fillHoles to use a common loop-filling helper.
  return fillHolesFromAdj(vertices, faces, adj, report);
}

function fillHolesFromAdj(vertices: V3[], faces: MeshFace[], adj: Map<number, number[]>, report: string[]): { vertices: V3[]; faces: MeshFace[]; report: string[] } {
  const visitedEdges = new Set<string>();
  const loops: number[][] = [];

  for (const [startNode, neighbors] of adj.entries()) {
    for (const neighbor of neighbors) {
      const edgeKey = `${startNode}->${neighbor}`;
      if (visitedEdges.has(edgeKey)) continue;

      const loop: number[] = [startNode];
      visitedEdges.add(edgeKey);
      let current = neighbor;

      while (true) {
        loop.push(current);
        const nextNeighbors = adj.get(current);
        if (!nextNeighbors) break;

        let foundNext = false;
        for (const next of nextNeighbors) {
          const nextKey = `${current}->${next}`;
          if (!visitedEdges.has(nextKey)) {
            visitedEdges.add(nextKey);
            current = next;
            foundNext = true;
            break;
          }
        }

        if (!foundNext || current === startNode) {
          if (current === startNode && loop.length >= 3) {
            loop.pop();
            loops.push(loop);
          }
          break;
        }
      }
    }
  }

  let holesFilled = 0;
  loops.forEach(loop => {
    if (loop.length < 3) return;
    const loopVerts = loop.map(idx => new THREE.Vector3(...vertices[idx]));
    const normal = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < loopVerts.length; i++) {
      const curr = loopVerts[i];
      const next = loopVerts[(i + 1) % loopVerts.length];
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
    }
    normal.normalize();
    const absX = Math.abs(normal.x), absY = Math.abs(normal.y), absZ = Math.abs(normal.z);
    let uAxis: 'x' | 'y' | 'z', vAxis: 'x' | 'y' | 'z';
    if (absX > absY && absX > absZ) { uAxis = 'y'; vAxis = 'z'; }
    else if (absY > absX && absY > absZ) { uAxis = 'x'; vAxis = 'z'; }
    else { uAxis = 'x'; vAxis = 'y'; }

    const points2D = loopVerts.map(v => new THREE.Vector2(v[uAxis], v[vAxis]));
    let triangles: number[][] = [];
    try {
      triangles = THREE.ShapeUtils.triangulateShape(points2D, []);
    } catch (e) {
      for (let i = 1; i < loop.length - 1; i++) triangles.push([0, i, i + 1]);
    }

    const loopUVs = loop.map(vIdx => {
      for (const f of faces) {
        const idx = f.indices.indexOf(vIdx);
        if (idx !== -1 && f.uvs && f.uvs[idx]) return f.uvs[idx];
      }
      return [0, 0] as [number, number];
    });

    triangles.forEach(tri => {
      faces.push({
        indices: [loop[tri[0]], loop[tri[1]], loop[tri[2]]],
        uvs: [loopUVs[tri[0]], loopUVs[tri[1]], loopUVs[tri[2]]]
      });
    });
    holesFilled++;
  });

  if (holesFilled > 0) report.push(`${holesFilled} huecos cerrados`);
  return { vertices, faces, report };
}

/**
 * Detects open boundaries (edges shared by only one face) and fills them.
 */
export function fillHoles(obj: CSGObject | { vertices: V3[]; faces: MeshFace[] }): { vertices: V3[]; faces: MeshFace[]; report: string[] } {
  const repaired = repairMesh(obj);
  const report: string[] = [...repaired.report];
  const vertices = [...repaired.vertices];
  const faces = [...repaired.faces];

  const edgeMap = new Map<string, { a: number, b: number, faces: number[] }>();
  faces.forEach((face, fIdx) => {
    for (let i = 0; i < face.indices.length; i++) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % face.indices.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { a, b, faces: [] });
      edgeMap.get(key)!.faces.push(fIdx);
    }
  });

  const boundaryEdges = Array.from(edgeMap.values()).filter(e => e.faces.length === 1);
  if (boundaryEdges.length === 0) return { vertices, faces, report: ['No se detectaron huecos (malla cerrada)'] };

  const adj = new Map<number, number[]>();
  boundaryEdges.forEach(e => {
    const face = faces[e.faces[0]];
    for(let i=0; i<face.indices.length; i++) {
      const a = face.indices[i];
      const b = face.indices[(i+1)%face.indices.length];
      if ((a === e.a && b === e.b) || (a === e.b && b === e.a)) {
        if (!adj.has(b)) adj.set(b, []);
        adj.get(b)!.push(a);
        break;
      }
    }
  });

  return fillHolesFromAdj(vertices, faces, adj, report);
}

/**
 * Computes smooth vertex normals across split vertices sharing the same 3D spatial position.
 * Prevents shading seams and artifacts on bevels, rounded boxes, and smooth primitives
 * where vertices were split for distinct UVs or seams.
 */
export function computeSmoothNormalsByPosition(
  geometry: THREE.BufferGeometry,
  creaseAngleRad: number = Math.PI / 3 // Default 60 degrees threshold
): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!posAttr) return;

  const count = posAttr.count;
  const normals = new Float32Array(count * 3);

  // Group vertex indices by spatial position
  const posMap = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${Math.round(x * 100000)}_${Math.round(y * 100000)}_${Math.round(z * 100000)}`;
    let list = posMap.get(key);
    if (!list) {
      list = [];
      posMap.set(key, list);
    }
    list.push(i);
  }

  // Compute face normals and face vertex connections
  const faceNormals: THREE.Vector3[] = [];
  const faceIndices: [number, number, number][] = [];

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  const numTriangles = indexAttr ? indexAttr.count / 3 : count / 3;

  for (let f = 0; f < numTriangles; f++) {
    let iA = f * 3;
    let iB = f * 3 + 1;
    let iC = f * 3 + 2;
    if (indexAttr) {
      iA = indexAttr.getX(f * 3);
      iB = indexAttr.getX(f * 3 + 1);
      iC = indexAttr.getX(f * 3 + 2);
    }

    pA.fromBufferAttribute(posAttr, iA);
    pB.fromBufferAttribute(posAttr, iB);
    pC.fromBufferAttribute(posAttr, iC);

    cb.subVectors(pC, pB);
    ab.subVectors(pA, pB);
    const norm = new THREE.Vector3().crossVectors(cb, ab);
    if (norm.lengthSq() > 1e-12) {
      faceNormals.push(norm); // Area weighted
    } else {
      faceNormals.push(new THREE.Vector3(0, 1, 0));
    }
    faceIndices.push([iA, iB, iC]);
  }

  // Map each vertex index to the face indices using it
  const vertToFaces: number[][] = Array.from({ length: count }, () => []);
  for (let f = 0; f < faceIndices.length; f++) {
    const [iA, iB, iC] = faceIndices[f];
    vertToFaces[iA].push(f);
    vertToFaces[iB].push(f);
    vertToFaces[iC].push(f);
  }

  const cosMaxAngle = Math.cos(creaseAngleRad);
  const tempNormal = new THREE.Vector3();
  const normA = new THREE.Vector3();
  const normB = new THREE.Vector3();

  posMap.forEach((vertIndices) => {
    // Gather all faces touching any vertex at this spatial location
    const touchingFaces: number[] = [];
    vertIndices.forEach((vi) => {
      vertToFaces[vi].forEach((fi) => {
        if (!touchingFaces.includes(fi)) touchingFaces.push(fi);
      });
    });

    vertIndices.forEach((vi) => {
      const myFaces = vertToFaces[vi];
      if (myFaces.length === 0) return;

      normA.copy(faceNormals[myFaces[0]]).normalize();
      tempNormal.set(0, 0, 0);

      touchingFaces.forEach((fi) => {
        normB.copy(faceNormals[fi]).normalize();
        if (normA.dot(normB) >= cosMaxAngle) {
          tempNormal.add(faceNormals[fi]);
        }
      });

      if (tempNormal.lengthSq() > 1e-12) {
        tempNormal.normalize();
      } else {
        tempNormal.copy(normA);
      }

      normals[vi * 3] = tempNormal.x;
      normals[vi * 3 + 1] = tempNormal.y;
      normals[vi * 3 + 2] = tempNormal.z;
    });
  });

  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}
