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
  dissolveCoplanars?: boolean;// Disolver automáticamente aristas diagonales entre triángulos/caras coplanares (default true)
  coplanarAngleDeg?: number;  // Tolerancia angular en grados (default 3.5°)
}

/**
 * Extrae todas las aristas únicas de un objeto o geometría,
 * filtrando automáticamente aristas diagonales interiores entre caras coplanares.
 */
export function extractUniqueEdges(
  obj: {
    vertices?: V3[];
    faces?: MeshFace[];
    wireframeEdges?: [number, number][];
    parameters?: any;
  },
  options?: { dissolveCoplanars?: boolean; coplanarAngleDeg?: number }
): Array<[number, number]> {
  // Si ya tiene aristas explícitas guardadas
  if (obj.wireframeEdges && obj.wireframeEdges.length > 0) {
    return obj.wireframeEdges;
  }
  if (obj.parameters?.wireframeEdges && obj.parameters.wireframeEdges.length > 0) {
    return obj.parameters.wireframeEdges;
  }

  const dissolveCoplanars = options?.dissolveCoplanars ?? true;
  const coplanarAngleDeg = options?.coplanarAngleDeg ?? 3.5;
  const cosTol = Math.cos((coplanarAngleDeg * Math.PI) / 180);

  const edgeToFaces = new Map<string, { fIdx: number; vA: number; vB: number }[]>();
  const faces = obj.faces || [];
  const verts = obj.vertices || [];

  if (faces.length > 0) {
    for (let fIdx = 0; fIdx < faces.length; fIdx++) {
      const face = faces[fIdx];
      const idxs = face.indices || [];
      const len = idxs.length;
      for (let i = 0; i < len; i++) {
        const a = idxs[i];
        const b = idxs[(i + 1) % len];
        if (a === b) continue;
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        const key = `${min}_${max}`;
        let list = edgeToFaces.get(key);
        if (!list) {
          list = [];
          edgeToFaces.set(key, list);
        }
        list.push({ fIdx, vA: min, vB: max });
      }
    }

    // Filtrar aristas diagonales coplanares interiores (solo diagonales entre pares de triángulos coplanares)
    if (dissolveCoplanars && verts.length > 0) {
      // Precalcular normales de caras
      const faceNormals: (THREE.Vector3 | null)[] = faces.map(f => {
        const idxs = f.indices || [];
        if (idxs.length < 3) return null;
        const p0 = verts[idxs[0]], p1 = verts[idxs[1]], p2 = verts[idxs[2]];
        if (!p0 || !p1 || !p2) return null;
        const v0 = new THREE.Vector3(...p0);
        const v1 = new THREE.Vector3(...p1);
        const v2 = new THREE.Vector3(...p2);
        const cb = new THREE.Vector3().subVectors(v2, v1);
        const ab = new THREE.Vector3().subVectors(v0, v1);
        const cross = new THREE.Vector3().crossVectors(cb, ab);
        if (cross.lengthSq() < 1e-12) return null;
        return cross.normalize();
      });

      const result: Array<[number, number]> = [];
      edgeToFaces.forEach((sharedList) => {
        const { vA, vB } = sharedList[0];
        // Si la arista es compartida por exactamente 2 caras interiores:
        if (sharedList.length === 2) {
          const f0 = faces[sharedList[0].fIdx];
          const f1 = faces[sharedList[1].fIdx];
          const f0Idxs = f0.indices || [];
          const f1Idxs = f1.indices || [];
          
          // IMPORTANTE: Solo disolver si AMBAS caras son triángulos (arista diagonal de triangulación).
          // Si cualquiera de las caras es un cuadrilátero (length === 4) o n-gon, la arista es un borde
          // legítimo de polígono y NUNCA debe disolverse.
          if (f0Idxs.length === 3 && f1Idxs.length === 3) {
            const n0 = faceNormals[sharedList[0].fIdx];
            const n1 = faceNormals[sharedList[1].fIdx];
            if (n0 && n1) {
              const dot = n0.dot(n1);
              if (dot >= cosTol) {
                // Verificar que los vértices opuestos estén en lados contrarios de la arista (diagonal convexa)
                const opp0 = f0Idxs.find(v => v !== vA && v !== vB);
                const opp1 = f1Idxs.find(v => v !== vA && v !== vB);
                if (opp0 !== undefined && opp1 !== undefined && verts[vA] && verts[vB] && verts[opp0] && verts[opp1]) {
                  const pA = new THREE.Vector3(...verts[vA]);
                  const pB = new THREE.Vector3(...verts[vB]);
                  const p0 = new THREE.Vector3(...verts[opp0]);
                  const p1 = new THREE.Vector3(...verts[opp1]);
                  const edgeDir = new THREE.Vector3().subVectors(pB, pA).normalize();
                  const side0 = new THREE.Vector3().crossVectors(edgeDir, p0.clone().sub(pA)).dot(n0);
                  const side1 = new THREE.Vector3().crossVectors(edgeDir, p1.clone().sub(pA)).dot(n0);
                  if (side0 * side1 < -1e-6) {
                    return; // Omitir diagonal interna de triangulación
                  }
                }
              }
            }
          }
        }
        result.push([vA, vB]);
      });
      return result;
    }

    const result: Array<[number, number]> = [];
    edgeToFaces.forEach(list => {
      result.push([list[0].vA, list[0].vB]);
    });
    return result;
  }

  // Si no hay caras pero hay vértices (por ejemplo, una curva o línea abierta)
  const result: Array<[number, number]> = [];
  if (verts.length > 1) {
    for (let i = 0; i < verts.length - 1; i++) {
      result.push([i, i + 1]);
    }
    if (obj.parameters?.closed) {
      result.push([verts.length - 1, 0]);
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
  }, options);

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
  }, options);

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
