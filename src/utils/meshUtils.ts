import * as THREE from 'three';
import type { V3, MeshFace, CSGObject } from '../types';

/**
 * Repair mesh issues:
 * 1. Merge duplicate vertices (exact)
 * 2. Remove degenerate faces (< 3 unique verts)
 * 3. Remove duplicate faces
 */
export function repairMesh(
  obj: CSGObject | { vertices: V3[]; faces: MeshFace[]; vertexOffsets?: Record<number, V3> },
): { vertices: V3[]; faces: MeshFace[]; report: string[] } {
  const report: string[] = [];
  if (obj.vertices.length === 0) return { vertices: [], faces: [], report: ['Sin vértices'] };

  // 0. Bake vertex offsets if they exist
  const baseVertices = obj.vertices.map((v, i) => {
    const off = (obj as any).vertexOffsets?.[i] || [0, 0, 0];
    return [v[0] + off[0], v[1] + off[1], v[2] + off[2]] as V3;
  });

  // 1. Weld duplicates with tolerance
  const tolerance = 0.0001;
  const weldedVerts: V3[] = [];
  const remap: number[] = new Array(baseVertices.length);
  let mergedCount = 0;

  for (let i = 0; i < baseVertices.length; i++) {
    const v = baseVertices[i];
    let found = -1;
    // Búsqueda espacial simple (podría optimizarse con octree si la malla es enorme)
    for (let j = 0; j < weldedVerts.length; j++) {
      const wv = weldedVerts[j];
      const dist = Math.sqrt((v[0]-wv[0])**2 + (v[1]-wv[1])**2 + (v[2]-wv[2])**2);
      if (dist < tolerance) {
        found = j;
        break;
      }
    }

    if (found !== -1) {
      remap[i] = found;
      mergedCount++;
    } else {
      remap[i] = weldedVerts.length;
      weldedVerts.push([...v] as V3);
    }
  }
  if (mergedCount > 0) report.push(`${mergedCount} vértices duplicados fusionados`);

  // 2. Remap + remove degenerate faces
  let degenerateCount = 0, dupFaceCount = 0;
  const faceSet = new Set<string>();
  const cleanFaces: MeshFace[] = [];

  for (const face of obj.faces) {
    const remapped = face.indices.map(i => remap[i]);
    // Check degenerate
    const unique = new Set(remapped);
    if (unique.size < 3) { degenerateCount++; continue; }
    // Check duplicate face (sorted key)
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
