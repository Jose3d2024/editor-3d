/**
 * faceSnap.ts — Face Snapping & Surface Projection Utilities for Retopology
 *
 * Implements real-time magnet snapping to high-poly surfaces:
 * - Project Individual Elements: Snaps each moved vertex to the face directly underneath
 * - Offset: Offsets along surface normal to eliminate Z-fighting
 * - BVH & Raycast surface detection with visual feedback
 */

import * as THREE from 'three';

export interface FaceSnapHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
  faceIndex?: number;
}

export interface SnapVertexResult {
  snappedPoint: THREE.Vector3;
  normal: THREE.Vector3;
  hit: boolean;
}

/**
 * Snaps a single candidate world point onto target meshes
 */
export function snapPointToSurfaces(
  candidateWorldPos: THREE.Vector3,
  targetMeshes: THREE.Object3D[],
  camera?: THREE.Camera,
  offset: number = 0.002
): SnapVertexResult {
  if (!targetMeshes || targetMeshes.length === 0) {
    return { snappedPoint: candidateWorldPos.clone(), normal: new THREE.Vector3(0, 1, 0), hit: false };
  }

  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;

  let bestHit: FaceSnapHit | null = null;

  // 1. Raycast from camera through candidate position
  if (camera) {
    const rayDir = candidateWorldPos.clone().sub(camera.position).normalize();
    raycaster.set(camera.position, rayDir);

    const intersects = raycaster.intersectObjects(targetMeshes, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const normal = hit.face
        ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
        : new THREE.Vector3(0, 1, 0);

      bestHit = {
        point: hit.point.clone(),
        normal,
        distance: hit.distance,
        object: hit.object,
        faceIndex: hit.faceIndex
      };
    }
  }

  // 2. If camera raycast didn't hit, cast along -Y (downwards) or towards origin of nearest object
  if (!bestHit) {
    const downRay = new THREE.Raycaster(candidateWorldPos.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0));
    downRay.firstHitOnly = true;
    const downHits = downRay.intersectObjects(targetMeshes, true);
    if (downHits.length > 0) {
      const hit = downHits[0];
      const normal = hit.face
        ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
        : new THREE.Vector3(0, 1, 0);

      bestHit = {
        point: hit.point.clone(),
        normal,
        distance: hit.distance,
        object: hit.object,
        faceIndex: hit.faceIndex
      };
    }
  }

  if (bestHit) {
    const snapped = bestHit.point.clone();
    if (offset !== 0) {
      snapped.addScaledVector(bestHit.normal, offset);
    }
    return {
      snappedPoint: snapped,
      normal: bestHit.normal,
      hit: true
    };
  }

  return { snappedPoint: candidateWorldPos.clone(), normal: new THREE.Vector3(0, 1, 0), hit: false };
}

/**
 * Projects multiple vertices onto surface faces.
 * If projectIndividualElements is true, each vertex is snapped to the face directly underneath it.
 * If false, the cluster is translated rigidly based on the centroid's snap.
 */
export function projectVerticesToFaces(
  verticesWithOffsets: { index: number; candidateWorldPos: THREE.Vector3; baseLocalPos: THREE.Vector3 }[],
  targetMeshes: THREE.Object3D[],
  meshMatrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
  options: {
    projectIndividualElements: boolean;
    offset: number;
  }
): {
  updates: { index: number; offset: [number, number, number] }[];
  snapIndicators: { point: THREE.Vector3; normal: THREE.Vector3 }[];
} {
  const invMatrixWorld = meshMatrixWorld.clone().invert();
  const snapIndicators: { point: THREE.Vector3; normal: THREE.Vector3 }[] = [];

  if (options.projectIndividualElements) {
    // ── PROYECTAR ELEMENTOS INDIVIDUALES: Cada vértice se ajusta a la cara debajo ──
    const updates = verticesWithOffsets.map(({ index, candidateWorldPos, baseLocalPos }) => {
      const snapRes = snapPointToSurfaces(candidateWorldPos, targetMeshes, camera, options.offset);
      
      let finalWorldPos = candidateWorldPos;
      if (snapRes.hit) {
        finalWorldPos = snapRes.snappedPoint;
        snapIndicators.push({ point: snapRes.snappedPoint.clone(), normal: snapRes.normal.clone() });
      }

      const finalLocalPos = finalWorldPos.clone().applyMatrix4(invMatrixWorld);
      return {
        index,
        offset: [
          finalLocalPos.x - baseLocalPos.x,
          finalLocalPos.y - baseLocalPos.y,
          finalLocalPos.z - baseLocalPos.z
        ] as [number, number, number]
      };
    });

    return { updates, snapIndicators };
  } else {
    // ── MODO RÍGIDO: Se calcula el snap del centroide y se aplica el mismo delta a todos ──
    const centroid = new THREE.Vector3();
    for (const v of verticesWithOffsets) {
      centroid.add(v.candidateWorldPos);
    }
    if (verticesWithOffsets.length > 0) {
      centroid.divideScalar(verticesWithOffsets.length);
    }

    const snapRes = snapPointToSurfaces(centroid, targetMeshes, camera, options.offset);
    const deltaWorld = snapRes.hit ? snapRes.snappedPoint.clone().sub(centroid) : new THREE.Vector3(0, 0, 0);

    if (snapRes.hit) {
      snapIndicators.push({ point: snapRes.snappedPoint.clone(), normal: snapRes.normal.clone() });
    }

    const updates = verticesWithOffsets.map(({ index, candidateWorldPos, baseLocalPos }) => {
      const finalWorldPos = candidateWorldPos.clone().add(deltaWorld);
      const finalLocalPos = finalWorldPos.applyMatrix4(invMatrixWorld);
      return {
        index,
        offset: [
          finalLocalPos.x - baseLocalPos.x,
          finalLocalPos.y - baseLocalPos.y,
          finalLocalPos.z - baseLocalPos.z
        ] as [number, number, number]
      };
    });

    return { updates, snapIndicators };
  }
}
