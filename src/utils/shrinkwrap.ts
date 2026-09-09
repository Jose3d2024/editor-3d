/**
 * shrinkwrap.ts — Blender-style Shrinkwrap (Envolver) & Solidify (Solidificar) Modifiers
 *
 * Implements retopology surface snapping, shrinkwrap deformation and physical thickness:
 * 1. Nearest Surface Point (Punto de superficie más cercano)
 * 2. Project along Axis (Proyectar a lo largo de ejes X, Y, Z / +/- / Ambas)
 * 3. Nearest Vertex (Vértice más cercano)
 * 4. Target Normal Project (Proyección según normales de la superficie)
 *
 * Includes normal offset to prevent Z-fighting, vertex-group filtering, and Solidify.
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CSGObject, MeshFace, V3, ShrinkwrapConfig } from '../types';
import { createBaseGeometry } from './csg';
import { fromThreeGeometry, subdivideMesh } from './modifiers';

/**
 * Computes world matrix for an object given its transform (position, rotation in radians, scale)
 */
export function getObjectWorldMatrix(obj: CSGObject): THREE.Matrix4 {
  const t = obj.transform;
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(...t.position);
  const rot = new THREE.Euler(...t.rotation);
  const scale = new THREE.Vector3(...t.scale);
  mat.compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
  return mat;
}

/**
 * Extracts a Three.js BufferGeometry from target CSGObject or imported model
 * First checks the live Three.js scene graph for 100% precision on multi-part/imported models
 */
export async function extractTargetGeometry(targetObj: CSGObject): Promise<THREE.BufferGeometry> {
  // 1. Try extracting directly from live Three.js scene (most accurate for complex/imported/multi-mesh models like AT-AT)
  if (typeof window !== 'undefined' && (window as any).__getObjectMesh) {
    try {
      const liveMeshOrGroup = (window as any).__getObjectMesh(targetObj.id);
      if (liveMeshOrGroup) {
        liveMeshOrGroup.updateMatrixWorld(true);
        const geometries: THREE.BufferGeometry[] = [];
        liveMeshOrGroup.traverse((child: any) => {
          if (child.isMesh && child.geometry && !child.userData?.isWireOverlay && child.visible !== false) {
            const g = child.geometry.clone();
            // Apply child's world matrix
            g.applyMatrix4(child.matrixWorld);
            if (!g.index) {
              const posCount = g.attributes.position ? g.attributes.position.count : 0;
              if (posCount > 0) {
                const indices = new Uint32Array(posCount);
                for (let k = 0; k < posCount; k++) indices[k] = k;
                g.setIndex(new THREE.BufferAttribute(indices, 1));
              }
            }
            if (g.attributes.position && g.attributes.position.count > 0) {
              // Retain only position and normal to ensure merge compatibility
              const cleanG = new THREE.BufferGeometry();
              cleanG.setAttribute('position', g.attributes.position);
              if (g.attributes.normal) {
                cleanG.setAttribute('normal', g.attributes.normal);
              } else {
                cleanG.computeVertexNormals();
              }
              if (g.index) {
                cleanG.setIndex(g.index);
              }
              geometries.push(cleanG);
            }
          }
        });

        if (geometries.length > 0) {
          const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
          if (merged && merged.attributes.position && merged.attributes.position.count > 0) {
            // Merged is in world space; convert to target local space so BVH matches getObjectWorldMatrix(targetObj)
            const tgtWorldMat = getObjectWorldMatrix(targetObj);
            const tgtInv = tgtWorldMat.clone().invert();
            merged.applyMatrix4(tgtInv);
            if (!merged.attributes.normal) {
              merged.computeVertexNormals();
            }
            return merged;
          }
        }
      }
    } catch (e) {
      console.warn('Could not extract from live mesh group:', e);
    }
  }

  let workingObj = targetObj;
  // If target has no vertices or is an imported model (GLB, GLTF, OBJ, STL), convert it to get full geometry
  if ((!workingObj.vertices || workingObj.vertices.length === 0) && workingObj.meshData) {
    try {
      const { convertImportedToCSG } = await import('./modifiers_advanced');
      workingObj = await convertImportedToCSG(workingObj);
    } catch (err) {
      console.warn('Error converting imported target for shrinkwrap:', err);
    }
  }

  const geo = createBaseGeometry(workingObj);
  // Ensure normals exist for projection
  if (geo.attributes.position && !geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * Calculates smooth vertex normals for an array of vertices and faces
 */
export function computeMeshVertexNormals(vertices: V3[], faces: MeshFace[]): THREE.Vector3[] {
  const normals: THREE.Vector3[] = vertices.map(() => new THREE.Vector3(0, 0, 0));

  for (const face of faces) {
    const idx = face.indices;
    if (idx.length < 3) continue;

    const v0 = new THREE.Vector3(...vertices[idx[0]]);
    const v1 = new THREE.Vector3(...vertices[idx[1]]);
    const v2 = new THREE.Vector3(...vertices[idx[2]]);

    const fn = new THREE.Vector3().crossVectors(
      v1.clone().sub(v0),
      v2.clone().sub(v0)
    ).normalize();

    for (let i = 0; i < idx.length; i++) {
      normals[idx[i]].add(fn);
    }
  }

  for (let i = 0; i < normals.length; i++) {
    if (normals[i].lengthSq() > 1e-8) {
      normals[i].normalize();
    } else {
      normals[i].set(0, 1, 0);
    }
  }

  return normals;
}

export interface ShrinkwrapResult {
  updatedObject: CSGObject;
  modifiedVerticesCount: number;
  report: string[];
}

/**
 * Applies the Shrinkwrap (Envolver) modifier from sourceObj onto targetObj
 */
export async function applyShrinkwrap(
  sourceObj: CSGObject,
  targetObj: CSGObject,
  config: ShrinkwrapConfig
): Promise<ShrinkwrapResult> {
  let resolvedSource = sourceObj;
  let resolvedTarget = targetObj;

  // Convert source if imported
  if ((!resolvedSource.vertices || resolvedSource.vertices.length === 0) && resolvedSource.meshData) {
    try {
      const { convertImportedToCSG } = await import('./modifiers_advanced');
      resolvedSource = await convertImportedToCSG(resolvedSource);
    } catch (err) {
      console.warn('Error converting imported source for shrinkwrap:', err);
    }
  }

  // Convert target if imported
  if ((!resolvedTarget.vertices || resolvedTarget.vertices.length === 0) && resolvedTarget.meshData) {
    try {
      const { convertImportedToCSG } = await import('./modifiers_advanced');
      resolvedTarget = await convertImportedToCSG(resolvedTarget);
    } catch (err) {
      console.warn('Error converting imported target for shrinkwrap:', err);
    }
  }

  const report: string[] = [];
  const srcVerts = resolvedSource.vertices ? [...resolvedSource.vertices] : [];
  const srcFaces = resolvedSource.faces || [];
  const numVerts = srcVerts.length;

  if (numVerts === 0) {
    return {
      updatedObject: resolvedSource,
      modifiedVerticesCount: 0,
      report: ['El objeto de origen no contiene vértices.']
    };
  }

  // 1. Prepare Target Geometry and BVH acceleration structure
  const targetGeo = await extractTargetGeometry(resolvedTarget);
  if (!targetGeo.attributes.position || targetGeo.attributes.position.count === 0) {
    return {
      updatedObject: resolvedSource,
      modifiedVerticesCount: 0,
      report: ['El objeto destino no contiene geometría válida para proyectar.']
    };
  }

  const targetBvh = new MeshBVH(targetGeo);

  // Matrices to handle arbitrary world positions/rotations/scales
  const srcWorldMat = getObjectWorldMatrix(resolvedSource);
  const srcWorldInv = srcWorldMat.clone().invert();

  const tgtWorldMat = getObjectWorldMatrix(resolvedTarget);
  const tgtWorldInv = tgtWorldMat.clone().invert();

  // Vertex normals for normal projection modes
  const srcNormalsLocal = computeMeshVertexNormals(srcVerts, srcFaces);
  const srcNormalMat = new THREE.Matrix3().getNormalMatrix(srcWorldMat);
  const tgtNormalMat = new THREE.Matrix3().getNormalMatrix(tgtWorldMat);

  const selectedSet = config.onlySelectedVertices && (config as any).selectedVertexIndices?.length
    ? new Set<number>((config as any).selectedVertexIndices)
    : null;

  let modifiedCount = 0;
  const offsetDistance = Number.isFinite(config.offset) ? config.offset : 0.002;

  // Pre-allocate working vectors
  const vLocal = new THREE.Vector3();
  const vWorld = new THREE.Vector3();
  const vTargetLocal = new THREE.Vector3();
  const closestTargetHit: { point: THREE.Vector3; distance: number; faceIndex: number } = {
    point: new THREE.Vector3(),
    distance: Infinity,
    faceIndex: -1
  };
  const normalWorld = new THREE.Vector3();

  // Extract target position attribute and index for face normals
  const tgtPosAttr = targetGeo.getAttribute('position');
  const tgtIndex = targetGeo.getIndex();

  const getTargetFaceNormal = (faceIndex: number): THREE.Vector3 => {
    if (faceIndex < 0 || !tgtPosAttr) return new THREE.Vector3(0, 1, 0);

    let i0 = faceIndex * 3;
    let i1 = faceIndex * 3 + 1;
    let i2 = faceIndex * 3 + 2;

    if (tgtIndex) {
      i0 = tgtIndex.getX(i0);
      i1 = tgtIndex.getX(i1);
      i2 = tgtIndex.getX(i2);
    }

    if (i0 >= tgtPosAttr.count || i1 >= tgtPosAttr.count || i2 >= tgtPosAttr.count) {
      return new THREE.Vector3(0, 1, 0);
    }

    const p0 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i0);
    const p1 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i1);
    const p2 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i2);

    const e1 = new THREE.Vector3().subVectors(p1, p0);
    const e2 = new THREE.Vector3().subVectors(p2, p0);
    const fnLocal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (fnLocal.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
    return fnLocal.applyMatrix3(tgtNormalMat).normalize();
  };

  for (let i = 0; i < numVerts; i++) {
    if (selectedSet && !selectedSet.has(i)) {
      continue;
    }

    // Reset closest target hit per vertex
    closestTargetHit.distance = Infinity;
    closestTargetHit.faceIndex = -1;

    // Source vertex in world space
    vLocal.set(srcVerts[i][0], srcVerts[i][1], srcVerts[i][2]);
    vWorld.copy(vLocal).applyMatrix4(srcWorldMat);

    // Express point in target local space for fast BVH evaluation
    vTargetLocal.copy(vWorld).applyMatrix4(tgtWorldInv);

    let snappedWorldPoint: THREE.Vector3 | null = null;
    let snappedWorldNormal: THREE.Vector3 | null = null;

    if (config.mode === 'NEAREST_SURFACE_POINT') {
      // ── MODO 1: Punto de superficie más cercano ─────────────────────────
      const res = targetBvh.closestPointToPoint(vTargetLocal, closestTargetHit as any);
      if (res && res.point) {
        // Compute world position of closest point
        const ptWorld = res.point.clone().applyMatrix4(tgtWorldMat);
        const normWorld = getTargetFaceNormal(res.faceIndex);

        snappedWorldPoint = ptWorld;
        snappedWorldNormal = normWorld;
      }
    } else if (config.mode === 'PROJECT') {
      // ── MODO 2: Proyectar a lo largo de un eje (X, Y, Z) ─────────────────
      const axis = config.projectAxis || 'Z';
      const dirMode = config.projectDirection || 'BOTH';

      const rayDirWorld = new THREE.Vector3(
        axis === 'X' ? 1 : 0,
        axis === 'Y' ? 1 : 0,
        axis === 'Z' ? 1 : 0
      );

      // Convert ray direction to target local space
      const rayDirLocal = rayDirWorld.clone().transformDirection(tgtWorldInv).normalize();

      const hits: { hit: any; sign: number }[] = [];

      if (dirMode === 'POSITIVE' || dirMode === 'BOTH') {
        const rayPos = new THREE.Ray(vTargetLocal, rayDirLocal);
        const hitPos = targetBvh.raycastFirst(rayPos);
        if (hitPos) hits.push({ hit: hitPos, sign: 1 });
      }

      if (dirMode === 'NEGATIVE' || dirMode === 'BOTH') {
        const rayNeg = new THREE.Ray(vTargetLocal, rayDirLocal.clone().negate());
        const hitNeg = targetBvh.raycastFirst(rayNeg);
        if (hitNeg) hits.push({ hit: hitNeg, sign: -1 });
      }

      if (hits.length > 0) {
        // Pick the hit with minimal distance
        hits.sort((a, b) => a.hit.distance - b.hit.distance);
        const best = hits[0].hit;
        snappedWorldPoint = best.point.clone().applyMatrix4(tgtWorldMat);
        snappedWorldNormal = best.normal
          ? best.normal.clone().applyMatrix3(tgtNormalMat).normalize()
          : getTargetFaceNormal(best.faceIndex);
      } else {
        // Fallback: closest point on surface
        const res = targetBvh.closestPointToPoint(vTargetLocal, closestTargetHit as any);
        if (res && res.point) {
          snappedWorldPoint = res.point.clone().applyMatrix4(tgtWorldMat);
          snappedWorldNormal = getTargetFaceNormal(res.faceIndex);
        }
      }
    } else if (config.mode === 'NEAREST_VERTEX') {
      // ── MODO 3: Vértice más cercano ──────────────────────────────────────
      let minDistSq = Infinity;
      let closestVIdx = -1;
      const count = tgtPosAttr.count;

      const pCur = new THREE.Vector3();
      for (let k = 0; k < count; k++) {
        pCur.fromBufferAttribute(tgtPosAttr, k);
        const dSq = pCur.distanceToSquared(vTargetLocal);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closestVIdx = k;
        }
      }

      if (closestVIdx >= 0) {
        const pLocal = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, closestVIdx);
        snappedWorldPoint = pLocal.applyMatrix4(tgtWorldMat);

        // Try to get normal from attribute or face
        const tgtNormAttr = targetGeo.getAttribute('normal');
        if (tgtNormAttr) {
          snappedWorldNormal = new THREE.Vector3()
            .fromBufferAttribute(tgtNormAttr, closestVIdx)
            .applyMatrix3(tgtNormalMat)
            .normalize();
        } else {
          snappedWorldNormal = new THREE.Vector3(0, 1, 0);
        }
      }
    } else if (config.mode === 'TARGET_NORMAL_PROJECT') {
      // ── MODO 4: Proyección de normales del objetivo / superficie ─────────
      const srcNormWorld = srcNormalsLocal[i].clone().applyMatrix3(srcNormalMat).normalize();
      const srcNormTarget = srcNormWorld.clone().transformDirection(tgtWorldInv).normalize();

      // Raycast inward and outward along vertex normal
      const rayIn = new THREE.Ray(vTargetLocal, srcNormTarget.clone().negate());
      const hitIn = targetBvh.raycastFirst(rayIn);

      const rayOut = new THREE.Ray(vTargetLocal, srcNormTarget);
      const hitOut = targetBvh.raycastFirst(rayOut);

      let chosenHit: any = null;
      if (hitIn && hitOut) {
        chosenHit = hitIn.distance <= hitOut.distance ? hitIn : hitOut;
      } else {
        chosenHit = hitIn || hitOut;
      }

      if (chosenHit) {
        snappedWorldPoint = chosenHit.point.clone().applyMatrix4(tgtWorldMat);
        snappedWorldNormal = chosenHit.normal
          ? chosenHit.normal.clone().applyMatrix3(tgtNormalMat).normalize()
          : getTargetFaceNormal(chosenHit.faceIndex);
      } else {
        // Fallback to closest surface point
        const res = targetBvh.closestPointToPoint(vTargetLocal, closestTargetHit as any);
        if (res && res.point) {
          snappedWorldPoint = res.point.clone().applyMatrix4(tgtWorldMat);
          snappedWorldNormal = getTargetFaceNormal(res.faceIndex);
        }
      }
    }

    if (snappedWorldPoint) {
      const normal = snappedWorldNormal || new THREE.Vector3(0, 1, 0);
      // Desplazamiento (Offset) para evitar Z-fighting
      if (offsetDistance !== 0) {
        snappedWorldPoint.addScaledVector(normal, offsetDistance);
      }

      // Convert snapped point back to source object local space
      const newLocalPos = snappedWorldPoint.clone().applyMatrix4(srcWorldInv);
      srcVerts[i] = [newLocalPos.x, newLocalPos.y, newLocalPos.z];
      modifiedCount++;
    }
  }

  // Cleanup BVH resources
  targetGeo.dispose();

  report.push(`Shrinkwrap aplicado con éxito: ${modifiedCount} de ${numVerts} vértices proyectados.`);
  report.push(`Modo: ${config.mode}, Offset: ${offsetDistance.toFixed(4)}`);

  return {
    updatedObject: {
      ...resolvedSource,
      vertices: srcVerts,
      faces: srcFaces,
      meshData: undefined, // Fully baked into editable CSG mesh
      vertexOffsets: {}, // Clear temporary gizmo offsets once baked into base vertices
      stats: {
        ...(resolvedSource.stats || {}),
        vertices: srcVerts.length,
        faces: srcFaces.length
      }
    },
    modifiedVerticesCount: modifiedCount,
    report
  };
}

/**
 * Blender-style Solidify modifier: gives physical thickness to an open or surface mesh
 * - Duplicates faces with inverted normals
 * - Offsets outer and inner surfaces along vertex normals
 * - Bridges boundary edges with quadrilaterals
 */
export function solidifyMesh(
  obj: CSGObject,
  thickness: number = 0.05,
  offsetFactor: number = 0.0 // -1.0 = inner only, 0.0 = centered, 1.0 = outer only
): CSGObject {
  const origVerts = obj.vertices;
  const origFaces = obj.faces;
  const numOrigVerts = origVerts.length;

  if (numOrigVerts === 0 || origFaces.length === 0) return obj;

  const normals = computeMeshVertexNormals(origVerts, origFaces);

  // Compute outer and inner vertices
  // offsetFactor: 1.0 -> extrude +thickness outward
  // 0.0 -> -thickness/2 to +thickness/2
  // -1.0 -> extrude -thickness inward
  const halfT = thickness * 0.5;
  const outerDist = halfT + (offsetFactor * halfT);
  const innerDist = -halfT + (offsetFactor * halfT);

  const newVertices: V3[] = [];

  // Front vertices [0 .. numOrigVerts - 1]
  for (let i = 0; i < numOrigVerts; i++) {
    const v = origVerts[i];
    const n = normals[i];
    newVertices.push([
      v[0] + n.x * outerDist,
      v[1] + n.y * outerDist,
      v[2] + n.z * outerDist
    ]);
  }

  // Back vertices [numOrigVerts .. 2*numOrigVerts - 1]
  for (let i = 0; i < numOrigVerts; i++) {
    const v = origVerts[i];
    const n = normals[i];
    newVertices.push([
      v[0] + n.x * innerDist,
      v[1] + n.y * innerDist,
      v[2] + n.z * innerDist
    ]);
  }

  const newFaces: MeshFace[] = [];

  // 1. Front faces (pointing outward, original winding)
  for (const f of origFaces) {
    newFaces.push({
      ...f,
      indices: [...f.indices]
    });
  }

  // 2. Back faces (pointing inward, reversed winding + offset index)
  for (const f of origFaces) {
    const revIdx = [...f.indices].reverse().map(idx => idx + numOrigVerts);
    newFaces.push({
      ...f,
      indices: revIdx
    });
  }

  // 3. Find boundary edges and create side rim faces
  // An edge is boundary if it is shared by only 1 face
  const edgeCount = new Map<string, { v0: number; v1: number; count: number }>();

  for (const f of origFaces) {
    const idx = f.indices;
    const len = idx.length;
    for (let i = 0; i < len; i++) {
      const v0 = idx[i];
      const v1 = idx[(i + 1) % len];
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      const existing = edgeCount.get(key);
      if (existing) {
        existing.count++;
      } else {
        edgeCount.set(key, { v0, v1, count: 1 });
      }
    }
  }

  // Bridge boundaries
  for (const { v0, v1, count } of edgeCount.values()) {
    if (count === 1) {
      // Boundary edge: create quad (two triangles) connecting front & back
      const f0 = v0;
      const f1 = v1;
      const b0 = v0 + numOrigVerts;
      const b1 = v1 + numOrigVerts;

      // Outer to inner bridging
      newFaces.push({ indices: [f0, b0, b1] });
      newFaces.push({ indices: [f0, b1, f1] });
    }
  }

  return {
    ...obj,
    vertices: newVertices,
    faces: newFaces,
    vertexOffsets: {},
    stats: {
      vertices: newVertices.length,
      faces: newFaces.length
    }
  };
}

export interface RetopoQuadPlaneOptions {
  targetObj?: CSGObject | null;
  subdivisions?: number;
  orientation?: 'FRONT' | 'TOP' | 'SIDE';
  marginFactor?: number;
  customWidth?: number;
  customHeight?: number;
}

export function getObjectRealBoundingBox(obj: CSGObject): {
  center: [number, number, number];
  size: [number, number, number];
  maxDim: number;
} {
  const box = new THREE.Box3();
  let found = false;

  // 1. Check window.__getObjectMesh
  const getMesh = typeof window !== 'undefined' ? (window as any).__getObjectMesh : undefined;
  if (getMesh) {
    const mesh = getMesh(obj.id);
    if (mesh) {
      mesh.updateMatrixWorld(true);
      box.setFromObject(mesh);
      if (!box.isEmpty() && isFinite(box.min.x) && isFinite(box.max.x)) {
        found = true;
      }
    }
  }

  // 2. Procedural vertices
  if (!found && obj.vertices && obj.vertices.length > 0) {
    obj.vertices.forEach(v => {
      box.expandByPoint(new THREE.Vector3(v[0], v[1], v[2]));
    });
    const scale = obj.transform?.scale || [1, 1, 1];
    const pos = obj.transform?.position || [0, 0, 0];
    box.min.multiply(new THREE.Vector3(scale[0], scale[1], scale[2])).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
    box.max.multiply(new THREE.Vector3(scale[0], scale[1], scale[2])).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
    found = true;
  }

  if (!found || box.isEmpty() || !isFinite(box.min.x)) {
    const pos = obj.transform?.position || [0, 0, 0];
    const scale = obj.transform?.scale || [1, 1, 1];
    const s = Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]), 5);
    return {
      center: [pos[0], pos[1], pos[2]],
      size: [s * 2, s * 2, s * 2],
      maxDim: s * 2
    };
  }

  const centerVec = new THREE.Vector3();
  const sizeVec = new THREE.Vector3();
  box.getCenter(centerVec);
  box.getSize(sizeVec);

  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 0.5);

  return {
    center: [centerVec.x, centerVec.y, centerVec.z],
    size: [sizeVec.x, sizeVec.y, sizeVec.z],
    maxDim
  };
}

export function createRetopoQuadPlane(options: RetopoQuadPlaneOptions): CSGObject {
  const {
    targetObj,
    subdivisions = 100,
    orientation = 'FRONT',
    marginFactor = 1.15,
    customWidth,
    customHeight
  } = options;

  let center: [number, number, number] = [0, 0, 0];
  let size: [number, number, number] = [10, 10, 10];

  if (targetObj) {
    const b = getObjectRealBoundingBox(targetObj);
    center = b.center;
    size = b.size;
  }

  let width = customWidth || Math.max(2, size[0] * marginFactor);
  let height = customHeight || Math.max(2, size[1] * marginFactor);
  let position: [number, number, number] = [center[0], center[1], center[2] + Math.max(size[2] * 0.55, 0.8)];
  let rotation: [number, number, number] = [0, 0, 0];

  if (orientation === 'TOP') {
    width = customWidth || Math.max(2, size[0] * marginFactor);
    height = customHeight || Math.max(2, size[2] * marginFactor);
    position = [center[0], center[1] + Math.max(size[1] * 0.55, 0.8), center[2]];
    rotation = [-Math.PI / 2, 0, 0];
  } else if (orientation === 'SIDE') {
    width = customWidth || Math.max(2, size[2] * marginFactor);
    height = customHeight || Math.max(2, size[1] * marginFactor);
    position = [center[0] + Math.max(size[0] * 0.55, 0.8), center[1], center[2]];
    rotation = [0, Math.PI / 2, 0];
  }

  const segs = Math.max(1, Math.min(250, Math.round(subdivisions)));
  const vertices: [number, number, number][] = [];
  const faces: MeshFace[] = [];

  const halfW = width / 2;
  const halfH = height / 2;

  for (let iy = 0; iy <= segs; iy++) {
    const y = -halfH + (iy / segs) * height;
    for (let ix = 0; ix <= segs; ix++) {
      const x = -halfW + (ix / segs) * width;
      vertices.push([x, y, 0]);
    }
  }

  const stride = segs + 1;
  for (let iy = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = (iy + 1) * stride + (ix + 1);
      const d = (iy + 1) * stride + ix;
      faces.push({
        indices: [a, b, c, d],
        uvs: [
          [ix / segs, iy / segs],
          [(ix + 1) / segs, iy / segs],
          [(ix + 1) / segs, (iy + 1) / segs],
          [ix / segs, (iy + 1) / segs]
        ]
      });
    }
  }

  const planeId = 'retopo_plane_' + Math.random().toString(36).substring(2, 8);
  const targetLabel = targetObj ? ` (${targetObj.name || 'Malla'})` : '';

  return {
    id: planeId,
    name: `Plano Retopo Quads ${segs}x${segs}${targetLabel}`,
    type: 'MESH',
    operation: 'ADD',
    keyframes: [],
    visible: true,
    color: '#06b6d4',
    opacity: 0.9,
    smoothShading: true,
    transform: {
      position,
      rotation,
      scale: [1, 1, 1],
    },
    parameters: {
      isRetopoPlane: true,
      subdivisions: segs,
      targetId: targetObj?.id
    },
    vertices,
    faces,
    stats: {
      vertices: vertices.length,
      faces: faces.length
    }
  };
}

export interface RetopoCageOptions {
  targetObj?: CSGObject;
  subdivisions?: number;
  marginFactor?: number;
  shape?: 'ELLIPSOID' | 'BOX';
}

/**
 * Creates a proportional 3D Cage wrapper adapted to the real dimensions (length, height, width) of the target model
 */
export function createRetopoCage(options: RetopoCageOptions = {}): CSGObject {
  const {
    targetObj,
    subdivisions = 64, // 64x64 produces 8.192 faces, capable of conforming into complex contours and limb gaps
    marginFactor = 1.08,
    shape = 'ELLIPSOID'
  } = options;

  let center: [number, number, number] = [0, 0, 0];
  let size: [number, number, number] = [10, 10, 10];

  if (targetObj) {
    const b = getObjectRealBoundingBox(targetObj);
    center = b.center;
    size = b.size;
  }

  const segs = Math.max(8, Math.min(128, Math.round(subdivisions)));
  let geo: THREE.BufferGeometry;

  if (shape === 'BOX') {
    const boxSegs = Math.max(4, Math.round(segs / 2));
    geo = new THREE.BoxGeometry(
      Math.max(size[0] * marginFactor, 1),
      Math.max(size[1] * marginFactor, 1),
      Math.max(size[2] * marginFactor, 1),
      boxSegs,
      boxSegs,
      boxSegs
    );
  } else {
    // Proportional Ellipsoid: matches target object's length, height, and width!
    const baseSphere = new THREE.SphereGeometry(1, segs, segs);
    baseSphere.scale(
      Math.max(size[0] * 0.55 * marginFactor, 0.6),
      Math.max(size[1] * 0.55 * marginFactor, 0.6),
      Math.max(size[2] * 0.55 * marginFactor, 0.6)
    );
    geo = baseSphere;
  }

  const { vertices, faces } = fromThreeGeometry(geo);
  const cageId = 'retopo_cage_' + Math.random().toString(36).substring(2, 8);
  const targetLabel = targetObj ? ` (${targetObj.name || 'Malla'})` : '';

  return {
    id: cageId,
    name: `Cage Envoltura ${shape === 'BOX' ? 'Caja' : 'Elipsoide'} ${segs}x${segs}${targetLabel}`,
    type: 'MESH',
    operation: 'ADD',
    keyframes: [],
    visible: true,
    color: '#38bdf8',
    opacity: 0.55,
    smoothShading: true,
    transform: {
      position: center,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    parameters: {
      isWrapperCage: true,
      subdivisions: segs,
      targetId: targetObj?.id,
      cageShape: shape
    },
    vertices,
    faces,
    stats: {
      vertices: vertices.length,
      faces: faces.length
    }
  };
}

export interface SilhouetteVacuumWrapConfig {
  autoSubdivide?: boolean;
  minFacesTarget?: number;
  iterations?: number;
  relaxation?: number;
  offset?: number;
}

/**
 * Vacuum Shrinkwrap (Ajuste Profundo a Silueta Completa)
 *
 * Designed specifically for complex models with limbs, concavities, underbellies, and hollows:
 * 1. Automatically subdivides low-resolution cages (e.g. 480 faces -> 1.920 -> 7.680 faces) so the mesh
 *    has sufficient vertex density to conform between legs, neck, and under the chassis.
 * 2. Runs iterative projection with Laplacian relaxation (inward vacuum suction).
 *    During relaxation, vertices suspended in mid-air across open gaps are pulled inward towards
 *    neighboring surface vertices, allowing the mesh to drop into hollow bays and hug the full silhouette.
 * 3. Finishes with high-precision normal projection and configurable clearance offset.
 */
export async function applySilhouetteVacuumWrap(
  sourceObj: CSGObject,
  targetObj: CSGObject,
  config: SilhouetteVacuumWrapConfig = {}
): Promise<ShrinkwrapResult> {
  let resolvedSource = sourceObj;
  let resolvedTarget = targetObj;

  // Convert source if imported
  if ((!resolvedSource.vertices || resolvedSource.vertices.length === 0) && resolvedSource.meshData) {
    try {
      const { convertImportedToCSG } = await import('./modifiers_advanced');
      resolvedSource = await convertImportedToCSG(resolvedSource);
    } catch (err) {
      console.warn('Error converting imported source for vacuum wrap:', err);
    }
  }

  // Convert target if imported
  if ((!resolvedTarget.vertices || resolvedTarget.vertices.length === 0) && resolvedTarget.meshData) {
    try {
      const { convertImportedToCSG } = await import('./modifiers_advanced');
      resolvedTarget = await convertImportedToCSG(resolvedTarget);
    } catch (err) {
      console.warn('Error converting imported target for vacuum wrap:', err);
    }
  }

  let srcVerts = resolvedSource.vertices ? [...resolvedSource.vertices.map(v => [...v] as V3)] : [];
  let srcFaces = resolvedSource.faces ? [...resolvedSource.faces] : [];

  if (srcVerts.length === 0 || srcFaces.length === 0) {
    return {
      updatedObject: resolvedSource,
      modifiedVerticesCount: 0,
      report: ['La malla de origen no contiene vértices o caras válidas.']
    };
  }

  const {
    autoSubdivide = true,
    minFacesTarget = 4000,
    iterations = 5,
    relaxation = 0.42,
    offset = 0.003
  } = config;

  const report: string[] = [];

  // Step 1: Check if subdivision is needed to follow complex concavities and limbs
  if (autoSubdivide) {
    let currentFaces = srcFaces.length;
    let subdivLevels = 0;
    while (currentFaces < minFacesTarget && subdivLevels < 2) {
      const subRes = subdivideMesh({ vertices: srcVerts, faces: srcFaces });
      srcVerts = subRes.vertices;
      srcFaces = subRes.faces;
      currentFaces = srcFaces.length;
      subdivLevels++;
    }
    if (subdivLevels > 0) {
      report.push(`Subdivisión adaptativa aplicada: ${subdivLevels} nivel(es), ${srcFaces.length} caras finales.`);
    }
  }

  // Step 2: Extract target geometry with BVH
  const targetGeo = await extractTargetGeometry(resolvedTarget);
  if (!targetGeo.attributes.position || targetGeo.attributes.position.count === 0) {
    return {
      updatedObject: resolvedSource,
      modifiedVerticesCount: 0,
      report: ['El objeto destino no contiene geometría válida para proyectar.']
    };
  }

  const targetBvh = new MeshBVH(targetGeo);

  const srcWorldMat = getObjectWorldMatrix(resolvedSource);
  const srcWorldInv = srcWorldMat.clone().invert();

  const tgtWorldMat = getObjectWorldMatrix(resolvedTarget);
  const tgtWorldInv = tgtWorldMat.clone().invert();
  const tgtNormalMat = new THREE.Matrix3().getNormalMatrix(tgtWorldMat);

  const tgtPosAttr = targetGeo.getAttribute('position');
  const tgtIndex = targetGeo.getIndex();

  const getTargetFaceNormal = (faceIndex: number): THREE.Vector3 => {
    if (faceIndex < 0 || !tgtPosAttr) return new THREE.Vector3(0, 1, 0);

    let i0 = faceIndex * 3;
    let i1 = faceIndex * 3 + 1;
    let i2 = faceIndex * 3 + 2;

    if (tgtIndex) {
      i0 = tgtIndex.getX(i0);
      i1 = tgtIndex.getX(i1);
      i2 = tgtIndex.getX(i2);
    }

    if (i0 >= tgtPosAttr.count || i1 >= tgtPosAttr.count || i2 >= tgtPosAttr.count) {
      return new THREE.Vector3(0, 1, 0);
    }

    const p0 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i0);
    const p1 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i1);
    const p2 = new THREE.Vector3().fromBufferAttribute(tgtPosAttr, i2);

    const e1 = new THREE.Vector3().subVectors(p1, p0);
    const e2 = new THREE.Vector3().subVectors(p2, p0);
    const fnLocal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (fnLocal.lengthSq() < 1e-6) return new THREE.Vector3(0, 1, 0);
    return fnLocal.applyMatrix3(tgtNormalMat).normalize();
  };

  // Step 3: Build neighbor topology graph for Laplacian relaxation
  const numVerts = srcVerts.length;
  const neighbors: number[][] = Array.from({ length: numVerts }, () => []);
  const edgeSet = new Set<string>();

  for (const face of srcFaces) {
    const idx = face.indices;
    const len = idx.length;
    for (let j = 0; j < len; j++) {
      const a = idx[j];
      const b = idx[(j + 1) % len];
      if (a === b) continue;
      const key1 = `${a}_${b}`;
      const key2 = `${b}_${a}`;
      if (!edgeSet.has(key1)) {
        edgeSet.add(key1);
        edgeSet.add(key2);
        neighbors[a].push(b);
        neighbors[b].push(a);
      }
    }
  }

  // Pre-allocate working vectors in target-local coordinates
  const currentPositions: THREE.Vector3[] = srcVerts.map(v => {
    const vLocal = new THREE.Vector3(v[0], v[1], v[2]);
    const vWorld = vLocal.applyMatrix4(srcWorldMat);
    return vWorld.applyMatrix4(tgtWorldInv);
  });

  const closestHit: { point: THREE.Vector3; distance: number; faceIndex: number } = {
    point: new THREE.Vector3(),
    distance: Infinity,
    faceIndex: -1
  };

  const finalNormals: THREE.Vector3[] = Array.from({ length: numVerts }, () => new THREE.Vector3(0, 1, 0));

  // Step 4: Iterative Projection + Laplacian Inward Vacuum Suction
  for (let pass = 0; pass < iterations; pass++) {
    const isFinalPass = pass === iterations - 1;

    // A. Project every vertex to nearest point on target surface
    for (let i = 0; i < numVerts; i++) {
      closestHit.distance = Infinity;
      closestHit.faceIndex = -1;

      const res = targetBvh.closestPointToPoint(currentPositions[i], closestHit as any);
      if (res && res.point) {
        currentPositions[i].copy(res.point);
        if (isFinalPass) {
          finalNormals[i] = getTargetFaceNormal(res.faceIndex);
        }
      }
    }

    // B. Laplacian Relaxation between passes (pulls vertices into concavities and limb spaces)
    if (!isFinalPass) {
      const smoothed = currentPositions.map(p => p.clone());
      for (let i = 0; i < numVerts; i++) {
        const nbs = neighbors[i];
        if (nbs.length > 0) {
          const avg = new THREE.Vector3();
          for (let k = 0; k < nbs.length; k++) {
            avg.add(currentPositions[nbs[k]]);
          }
          avg.divideScalar(nbs.length);
          // Inward suction vector towards local neighborhood centroid
          smoothed[i].addScaledVector(avg.sub(currentPositions[i]), relaxation);
        }
      }
      for (let i = 0; i < numVerts; i++) {
        currentPositions[i].copy(smoothed[i]);
      }
    }
  }

  // Step 5: Final surface clearance offset & convert back to source local space
  let modifiedCount = 0;
  for (let i = 0; i < numVerts; i++) {
    // World space position of snapped point
    const worldPoint = currentPositions[i].clone().applyMatrix4(tgtWorldMat);

    // Apply offset along target normal
    if (offset !== 0) {
      worldPoint.addScaledVector(finalNormals[i], offset);
    }

    // Convert back to source object's local coordinates
    const localPoint = worldPoint.applyMatrix4(srcWorldInv);
    srcVerts[i] = [localPoint.x, localPoint.y, localPoint.z];
    modifiedCount++;
  }

  targetGeo.dispose();

  report.push(`Envoltura al vacío completada con éxito:`);
  report.push(`- ${modifiedCount} vértices adaptados ceñidos a la silueta.`);
  report.push(`- ${iterations} iteraciones de succión y relajación laplaciana.`);
  report.push(`- Offset final: ${offset.toFixed(4)} unidades.`);

  return {
    updatedObject: {
      ...resolvedSource,
      vertices: srcVerts,
      faces: srcFaces,
      meshData: undefined,
      vertexOffsets: {},
      stats: {
        ...(resolvedSource.stats || {}),
        vertices: srcVerts.length,
        faces: srcFaces.length
      }
    },
    modifiedVerticesCount: modifiedCount,
    report
  };
}


