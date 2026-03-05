import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import { CSGObject, V3, MeshFace, CSGOperation } from '../types';
import { createPrimitiveMesh } from './csg';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function geometryToMeshData(geo: THREE.BufferGeometry): { vertices: V3[], faces: MeshFace[] } {
  // Ensure we have an indexed geometry with merged vertices for better topology
  const mergedGeo = BufferGeometryUtils.mergeVertices(geo);
  
  const posAttribute = mergedGeo.getAttribute('position');
  const vertices: V3[] = [];
  
  for (let i = 0; i < posAttribute.count; i++) {
    vertices.push([posAttribute.getX(i), posAttribute.getY(i), posAttribute.getZ(i)]);
  }

  const faces: MeshFace[] = [];
  const index = mergedGeo.getIndex();

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      faces.push({
        indices: [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      });
    }
  } else {
    for (let i = 0; i < posAttribute.count; i += 3) {
      faces.push({
        indices: [i, i + 1, i + 2]
      });
    }
  }

  return { vertices, faces };
}

// ─── Boolean Operations ────────────────────────────────────────────────────────

export function applyBooleanOperation(target: CSGObject, tool: CSGObject, operation: CSGOperation): { vertices: V3[], faces: MeshFace[] } | null {
  try {
    const targetMesh = createPrimitiveMesh(target, 0);
    const toolMesh = createPrimitiveMesh(tool, 0);

    // Update matrices to ensure world transforms are correct
    targetMesh.updateMatrix();
    toolMesh.updateMatrix();

    const csgTarget = CSG.fromMesh(targetMesh);
    const csgTool = CSG.fromMesh(toolMesh);

    let resultCSG;
    if (operation === 'ADD') resultCSG = csgTarget.union(csgTool);
    else if (operation === 'SUBTRACT') resultCSG = csgTarget.subtract(csgTool);
    else if (operation === 'INTERSECT') resultCSG = csgTarget.intersect(csgTool);
    else return null;

    const resultMesh = CSG.toMesh(resultCSG, targetMesh.matrix, targetMesh.material);
    
    // Merge vertices to ensure the mesh is watertight and connected
    // This is crucial for subsequent operations like smoothing
    let geo = resultMesh.geometry;
    if (geo.attributes.uv) geo.deleteAttribute('uv'); // Remove UVs to prevent split vertices
    geo = BufferGeometryUtils.mergeVertices(geo, 1e-4);
    geo.computeVertexNormals();
    
    return geometryToMeshData(geo);
  } catch (e) {
    console.error("Boolean operation failed", e);
    return null;
  }
}

// ─── Repair & Validation ───────────────────────────────────────────────────────

export function repairMesh(object: CSGObject): { vertices: V3[], faces: MeshFace[] } {
  try {
    const mesh = createPrimitiveMesh(object, 0);
    let geo = mesh.geometry.clone();
    
    // Remove attributes that might prevent merging
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (geo.attributes.normal) geo.deleteAttribute('normal');
    if (geo.attributes.color) geo.deleteAttribute('color');

    // Merge vertices to close gaps
    geo = BufferGeometryUtils.mergeVertices(geo, 1e-3);
    geo.computeVertexNormals();

    return geometryToMeshData(geo);
  } catch (e) {
    console.error("Repair failed", e);
    return { vertices: object.vertices, faces: object.faces };
  }
}

export function validateMesh(object: CSGObject): { valid: boolean, errors: string[], openEdges: number } {
  const edgeCount = new Map<string, number>();
  
  object.faces.forEach(face => {
    const indices = face.indices;
    for (let i = 0; i < indices.length; i++) {
      const a = indices[i];
      const b = indices[(i + 1) % indices.length];
      // Create a unique key for the edge (sorted indices)
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  });

  let openEdges = 0;
  let nonManifoldEdges = 0;
  
  edgeCount.forEach(count => {
    if (count === 1) openEdges++;
    if (count > 2) nonManifoldEdges++;
  });

  const errors: string[] = [];
  if (openEdges > 0) errors.push(`Malla abierta: ${openEdges} bordes abiertos.`);
  if (nonManifoldEdges > 0) errors.push(`Geometría no válida: ${nonManifoldEdges} bordes compartidos por >2 caras.`);

  return {
    valid: errors.length === 0,
    errors,
    openEdges
  };
}

// ─── Smoothing ─────────────────────────────────────────────────────────────────

export function smoothMesh(object: CSGObject, factor: number = 0.5, iterations: number = 1): { vertices: V3[], faces: MeshFace[] } {
  // Simple Laplacian smoothing
  // For each vertex, move it towards the average of its neighbors
  
  let currentVertices = [...object.vertices];
  const faces = object.faces;

  // Build adjacency list
  const adjacency: number[][] = Array(currentVertices.length).fill(null).map(() => []);
  
  faces.forEach(face => {
    const indices = face.indices;
    for (let i = 0; i < indices.length; i++) {
      const a = indices[i];
      const b = indices[(i + 1) % indices.length];
      if (!adjacency[a].includes(b)) adjacency[a].push(b);
      if (!adjacency[b].includes(a)) adjacency[b].push(a);
    }
  });

  for (let iter = 0; iter < iterations; iter++) {
    const nextVertices = [...currentVertices];
    
    for (let i = 0; i < currentVertices.length; i++) {
      const neighbors = adjacency[i];
      if (neighbors.length === 0) continue;

      let avgX = 0, avgY = 0, avgZ = 0;
      neighbors.forEach(nIdx => {
        avgX += currentVertices[nIdx][0];
        avgY += currentVertices[nIdx][1];
        avgZ += currentVertices[nIdx][2];
      });
      
      avgX /= neighbors.length;
      avgY /= neighbors.length;
      avgZ /= neighbors.length;

      const v = currentVertices[i];
      nextVertices[i] = [
        v[0] + (avgX - v[0]) * factor,
        v[1] + (avgY - v[1]) * factor,
        v[2] + (avgZ - v[2]) * factor
      ];
    }
    currentVertices = nextVertices;
  }

  return { vertices: currentVertices, faces };
}

// ─── Optimization ──────────────────────────────────────────────────────────────

export function optimizeMesh(object: CSGObject, ratio: number): { vertices: V3[], faces: MeshFace[] } {
  // ratio is 0..1, where 0 is no optimization (original), 1 is max optimization (0 faces)
  // SimplifyModifier takes a count of vertices to remove, or we can use it iteratively.
  // Actually SimplifyModifier.modify(geometry, count) removes 'count' vertices.
  
  const mesh = createPrimitiveMesh(object, 0);
  const geometry = mesh.geometry.clone();
  
  // Convert to non-indexed if needed? SimplifyModifier works on indexed geometry usually.
  // But our geometry might be disconnected.
  
  const modifier = new SimplifyModifier();
  
  const vertexCount = geometry.attributes.position.count;
  const targetCount = Math.floor(vertexCount * (1 - ratio));
  
  if (targetCount >= vertexCount) return { vertices: object.vertices, faces: object.faces };
  
  try {
    const simplified = modifier.modify(geometry, vertexCount - targetCount);
    return geometryToMeshData(simplified);
  } catch (e) {
    console.error("Optimization failed", e);
    return { vertices: object.vertices, faces: object.faces };
  }
}
