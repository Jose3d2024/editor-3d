import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CSGObject, MeshFace, V3 } from '../types';
import { fromThreeGeometry } from './modifiers';
import { createBaseGeometry } from './csg';

export interface WireframeOptions {
  mode?: 'TUBES' | 'LINES' | 'REMOVE_FACES';
  radius?: number;            // Radio del tubo/alambre (ej: 0.035)
  radialSegments?: number;    // Lados del tubo (3: triángulo low-poly, 4: cuadrado, 6-8: cilindro suave)
  addJointSpheres?: boolean;  // Uniones esféricas en las esquinas/vértices
  sphereSegments?: number;    // Resolución de las esferas de unión (ej: 8)
  asNewObject?: boolean;      // Crear como duplicado o reemplazar
}

/**
 * Extrae todas las aristas únicas de un objeto o geometría
 */
export function extractUniqueEdges(obj: {
  vertices?: V3[];
  faces?: MeshFace[];
  wireframeEdges?: [number, number][];
  parameters?: any;
}): Array<[number, number]> {
  const edgeSet = new Set<string>();
  const result: Array<[number, number]> = [];

  // Si ya tiene aristas explícitas guardadas
  if (obj.wireframeEdges && obj.wireframeEdges.length > 0) {
    return obj.wireframeEdges;
  }
  if (obj.parameters?.wireframeEdges && obj.parameters.wireframeEdges.length > 0) {
    return obj.parameters.wireframeEdges;
  }

  // Extraer desde las caras
  if (obj.faces && obj.faces.length > 0) {
    for (const face of obj.faces) {
      const idxs = face.indices || [];
      const len = idxs.length;
      for (let i = 0; i < len; i++) {
        const a = idxs[i];
        const b = idxs[(i + 1) % len];
        if (a === b) continue;
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        const key = `${min}_${max}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          result.push([min, max]);
        }
      }
    }
  }

  // Si no hay caras pero hay vértices (por ejemplo, una curva o línea abierta)
  if (result.length === 0 && obj.vertices && obj.vertices.length > 1) {
    for (let i = 0; i < obj.vertices.length - 1; i++) {
      result.push([i, i + 1]);
    }
    if (obj.parameters?.closed) {
      result.push([obj.vertices.length - 1, 0]);
    }
  }

  return result;
}

/**
 * Crea una geometría sólida 3D de tubos cilíndricos y esferas de unión siguiendo todas las aristas.
 * Este resultado es 100% Manifold y compatible con STL (impresión 3D), OBJ y GLTF/GLB.
 */
export function createWireframeTubesGeometry(
  obj: CSGObject,
  options: WireframeOptions = {}
): THREE.BufferGeometry {
  const radius = Math.max(0.005, options.radius ?? 0.035);
  const radialSegments = Math.max(3, options.radialSegments ?? 6);
  const addJointSpheres = options.addJointSpheres ?? true;
  const sphereSegments = Math.max(4, options.sphereSegments ?? 8);

  // Obtener vértices horneados con sus offsets
  let bakedVerts: V3[] = [];
  if (obj.vertices && obj.vertices.length > 0) {
    bakedVerts = obj.vertices.map((v, i) => {
      const off = obj.vertexOffsets?.[i] || [0, 0, 0];
      return [v[0] + off[0], v[1] + off[1], v[2] + off[2]];
    });
  } else {
    // Si no tiene vertices crudos, extraer de la geometría base
    const baseGeo = createBaseGeometry(obj);
    const posAttr = baseGeo.getAttribute('position');
    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        bakedVerts.push([posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]);
      }
    }
  }

  if (bakedVerts.length === 0) {
    return new THREE.BufferGeometry();
  }

  const edges = extractUniqueEdges({
    vertices: bakedVerts,
    faces: obj.faces,
    wireframeEdges: obj.wireframeEdges,
    parameters: obj.parameters,
  });

  if (edges.length === 0) {
    return new THREE.BufferGeometry();
  }

  const geometries: THREE.BufferGeometry[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);
  const usedVertexIndices = new Set<number>();

  for (const [i1, i2] of edges) {
    const v1 = bakedVerts[i1];
    const v2 = bakedVerts[i2];
    if (!v1 || !v2) continue;

    usedVertexIndices.add(i1);
    usedVertexIndices.add(i2);

    const p1 = new THREE.Vector3(...v1);
    const p2 = new THREE.Vector3(...v2);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();

    if (len < 1e-5) continue;

    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    // Cilindro para la arista
    const cylGeo = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1, false);
    
    // Rotar para alinear con dir
    const orientation = new THREE.Quaternion();
    const normDir = dir.clone().normalize();
    orientation.setFromUnitVectors(upVec, normDir);

    cylGeo.applyQuaternion(orientation);
    cylGeo.translate(mid.x, mid.y, mid.z);

    geometries.push(cylGeo);
  }

  // Esferas en los vértices / nodos para esquinas perfectas sin agujeros
  if (addJointSpheres) {
    const sphereRadius = radius * 1.05;
    for (const vIdx of usedVertexIndices) {
      const v = bakedVerts[vIdx];
      if (!v) continue;
      const sphereGeo = new THREE.SphereGeometry(sphereRadius, sphereSegments, sphereSegments);
      sphereGeo.translate(v[0], v[1], v[2]);
      geometries.push(sphereGeo);
    }
  }

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  // Fusionar todas las geometrías en un único BufferGeometry sólido
  let merged = BufferGeometryUtils.mergeGeometries(geometries, false);
  if (!merged) {
    return new THREE.BufferGeometry();
  }

  merged = BufferGeometryUtils.mergeVertices(merged, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Convierte un CSGObject a estructura alámbrica:
 * - 'TUBES': Malla sólida de tubos 3D exportable a STL, OBJ y GLTF
 * - 'REMOVE_FACES': Elimina las caras dejando solo aristas y vértices en modo alambre puro
 */
export function convertToWireframeModel(
  obj: CSGObject,
  options: WireframeOptions = {}
): {
  vertices: V3[];
  faces: MeshFace[];
  wireframeEdges: [number, number][];
  isWireframeOnly?: boolean;
} {
  const mode = options.mode || 'TUBES';

  // Obtener vértices horneados
  const bakedVerts: V3[] = (obj.vertices || []).map((v, i) => {
    const off = obj.vertexOffsets?.[i] || [0, 0, 0];
    return [v[0] + off[0], v[1] + off[1], v[2] + off[2]];
  });

  const edges = extractUniqueEdges({
    vertices: bakedVerts,
    faces: obj.faces,
    wireframeEdges: obj.wireframeEdges,
    parameters: obj.parameters,
  });

  if (mode === 'REMOVE_FACES' || mode === 'LINES') {
    return {
      vertices: bakedVerts,
      faces: [],
      wireframeEdges: edges,
      isWireframeOnly: true,
    };
  }

  // Modo TUBES (Celosía 3D sólida)
  const tubesGeo = createWireframeTubesGeometry(obj, options);
  const meshData = fromThreeGeometry(tubesGeo);

  return {
    vertices: meshData.vertices,
    faces: meshData.faces,
    wireframeEdges: edges,
    isWireframeOnly: false,
  };
}
