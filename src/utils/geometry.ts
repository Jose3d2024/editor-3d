/**
 * geometry.ts — generatePrimitive
 *
 * Returns { vertices: V3[], faces: MeshFace[] } for every primitive type.
 *
 * KEY DESIGN RULE: flat primitives (PLANE, RING, CIRCLE) use QUAD faces so the
 * wireframe overlay never shows the internal triangulation diagonal.
 * For solid 3-D primitives we extract from Three.js and merge triangle pairs
 * back into quads wherever BoxGeometry emits them in the standard (a,b,d)+(b,c,d) pattern.
 */

import * as THREE from 'three';
import type { V3, MeshFace, BezierHandle } from '../types';

// PrimitiveType is a union string – we avoid importing the enum to keep this file lightweight.
type PT = string;
interface PrimitiveGeom { vertices: V3[]; faces: MeshFace[]; }

// ─── helpers ────────────────────────────────────────────────────────────────

/** Round float to 6 decimal places to avoid floating-point duplicates */
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Deduplicate vertices and remap face indices */
function weldVertices(rawVerts: V3[], faces: MeshFace[]): PrimitiveGeom {
  const map = new Map<string, number>();
  const verts: V3[] = [];
  const remap = rawVerts.map(v => {
    const key = `${r6(v[0])},${r6(v[1])},${r6(v[2])}`;
    if (!map.has(key)) { map.set(key, verts.length); verts.push(v); }
    return map.get(key)!;
  });
  return {
    vertices: verts,
    faces: faces.map(f => ({ ...f, indices: f.indices.map(i => remap[i]) })),
  };
}

/**
 * Extract vertices + triangle faces from a Three.js indexed geometry,
 * then merge consecutive triangle pairs (a,b,d)+(b,c,d) into quads [a,b,c,d].
 * This matches the pattern emitted by BoxGeometry and PlaneGeometry.
 */
function extractAndMergeQuads(geo: THREE.BufferGeometry): PrimitiveGeom {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
  const rawVerts: V3[] = [];
  for (let i = 0; i < pos.count; i++) rawVerts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);

  const faces: MeshFace[] = [];
  const idx = geo.index;

  const getUVs = (indices: number[]) => {
    if (!uvAttr) return undefined;
    return indices.map(i => [uvAttr.getX(i), uvAttr.getY(i)] as [number, number]);
  };

  if (idx) {
    let i = 0;
    while (i < idx.count) {
      const a = idx.getX(i), b = idx.getX(i+1), d = idx.getX(i+2);
      // Try to merge with next triangle: pattern (b, c, d)
      if (i + 5 < idx.count) {
        const b2 = idx.getX(i+3), c = idx.getX(i+4), d2 = idx.getX(i+5);
        if (b2 === b && d2 === d) {
          // Standard Three.js quad pattern: merge to [a, b, c, d]
          faces.push({ indices: [a, b, c, d], uvs: getUVs([a, b, c, d]) });
          i += 6;
          continue;
        }
      }
      // No merge – keep as triangle
      faces.push({ indices: [a, b, d], uvs: getUVs([a, b, d]) });
      i += 3;
    }
  } else {
    // Non-indexed
    for (let i = 0; i < pos.count; i += 3) {
      const indices = [i, i+1, i+2];
      faces.push({ indices, uvs: getUVs(indices) });
    }
  }

  return weldVertices(rawVerts, faces);
}

// ─── Flat primitives with hand-built quad topology ──────────────────────────

/** PLANE: (N+1)×(N+1) grid in XZ plane (y=0), N×N quads */
function buildPlane(N: number): PrimitiveGeom {
  N = Math.max(1, N);
  const verts: V3[] = [];
  for (let row = 0; row <= N; row++) {
    for (let col = 0; col <= N; col++) {
      verts.push([col / N - 0.5, 0, row / N - 0.5]);
    }
  }
  const stride = N + 1;
  const faces: MeshFace[] = [];
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      faces.push({ indices: [a, b, c, d] });
    }
  }
  return { vertices: verts, faces };
}

/** RING: N quads connecting inner ring to outer ring */
function buildRing(inner: number, outer: number, N: number): PrimitiveGeom {
  N = Math.max(3, N);
  const verts: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    verts.push([cos * inner, 0, sin * inner]); // inner
    verts.push([cos * outer, 0, sin * outer]); // outer
  }
  const faces: MeshFace[] = [];
  for (let i = 0; i < N; i++) {
    const i0 = i * 2, o0 = i * 2 + 1;
    const i1 = (i + 1) * 2, o1 = (i + 1) * 2 + 1;
    faces.push({ indices: [i0, o0, o1, i1] });
  }
  return weldVertices(verts, faces);
}

/** CIRCLE: N triangular sectors (fan) */
function buildCircle(radius: number, N: number): PrimitiveGeom {
  N = Math.max(3, N);
  const verts: V3[] = [[0, 0, 0]]; // center at 0
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2;
    verts.push([Math.cos(theta) * radius, 0, Math.sin(theta) * radius]);
  }
  const faces: MeshFace[] = [];
  for (let i = 0; i < N; i++) {
    faces.push({ indices: [0, i + 1, i + 2] });
  }
  return weldVertices(verts, faces);
}

/**
 * Extrude a 2D profile along an axis.
 * If profileBezierHandles is provided, it samples the curve first.
 */
function buildExtrusion(p: Record<string, any>): PrimitiveGeom {
  const depth = p.extrusionDepth ?? 0;
  const axis = p.extrusionAxis ?? 'y';
  const closed = p.closed ?? false;
  const segments = Math.max(1, Math.round(p.segments ?? 16));
  
  let profile: V3[] = p.profileVertices ?? [];
  const handles: BezierHandle[] = p.profileBezierHandles ?? [];

  // ── Sample Bezier if needed ─────────────────────────────────────────────
  const hasHandles = handles.length > 0 && handles.some(h => 
    h.out[0] !== 0 || h.out[1] !== 0 || h.out[2] !== 0 || 
    h.in[0] !== 0 || h.in[1] !== 0 || h.in[2] !== 0
  );

  if (hasHandles && profile.length >= 2) {
    const ctrlPts = profile.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    const allPts: THREE.Vector3[] = [];
    const segCount = closed ? ctrlPts.length : ctrlPts.length - 1;
    
    for (let i = 0; i < segCount; i++) {
      const i1 = (i + 1) % ctrlPts.length;
      const p0 = ctrlPts[i];
      const hOut = handles[i]?.out ?? [0,0,0];
      const hIn = handles[i1]?.in ?? [0,0,0];
      
      const p1 = p0.clone().add(new THREE.Vector3(...hOut));
      const p3 = ctrlPts[i1];
      const p2 = p3.clone().add(new THREE.Vector3(...hIn));
      
      // If both handles are zero, it's a straight line
      if (hOut[0] === 0 && hOut[1] === 0 && hOut[2] === 0 && 
          hIn[0] === 0 && hIn[1] === 0 && hIn[2] === 0) {
        allPts.push(p0);
      } else {
        const seg = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
        const pts = seg.getPoints(segments);
        if (allPts.length > 0) pts.shift();
        allPts.push(...pts);
      }
    }
    // Add last point for non-closed
    if (!closed) {
      allPts.push(ctrlPts[ctrlPts.length - 1]);
    }
    
    // Remove duplicate endpoint if closed
    if (closed && allPts.length > 1 && allPts[0].distanceTo(allPts[allPts.length - 1]) < 0.001)
      allPts.pop();
    profile = allPts.map(pt => [pt.x, pt.y, pt.z] as V3);
  }

  const n = profile.length;
  if (n < 3) return { vertices: [], faces: [] };

  // ── Build 3D mesh ───────────────────────────────────────────────────────
  const depthSegments = Math.max(1, Math.round(p.depthSegments ?? 1));
  const vertices: V3[] = [];
  
  for (let s = 0; s <= depthSegments; s++) {
    const t = s / depthSegments;
    profile.forEach(v => {
      const newV: V3 = [...v];
      const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      newV[idx] += depth * t;
      vertices.push(newV);
    });
  }

  const faces: MeshFace[] = [];
  // Bottom cap
  faces.push({ indices: Array.from({ length: n }, (_, i) => n - 1 - i) });
  // Top cap
  const topStart = depthSegments * n;
  faces.push({ indices: Array.from({ length: n }, (_, i) => topStart + i) });
  
  // Side quads
  for (let s = 0; s < depthSegments; s++) {
    const r0 = s * n;
    const r1 = (s + 1) * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push({ indices: [r0 + i, r0 + j, r1 + j, r1 + i] });
    }
  }

  return { vertices, faces };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generatePrimitive(type: PT, params: Record<string, any>): PrimitiveGeom {
  const p = params ?? {};

  switch (type) {
    // ── Flat 2D (explicit quad/fan topology) ────────────────────────────────
    case 'PLANE':
      return buildPlane(Math.max(1, Math.round(p.segments ?? 1)));

    case 'RING':
      return buildRing(
        p.innerRadius ?? 0.25,
        p.outerRadius ?? 0.5,
        Math.max(3, Math.round(p.thetaSegments ?? 16)),
      );

    case 'CIRCLE':
      return buildCircle(0.5, Math.max(3, Math.round(p.segments ?? 16)));

    // ── Solid 3D — extract from Three.js, merge quad pairs ─────────────────
    case 'CUBE': {
      const N = Math.max(1, Math.round(p.segments ?? 1));
      return extractAndMergeQuads(new THREE.BoxGeometry(1, 1, 1, N, N, N));
    }
    case 'SPHERE': {
      const S = Math.max(3, Math.round(p.segments ?? 16));
      return extractAndMergeQuads(new THREE.SphereGeometry(0.5, S, Math.max(2, Math.round(S / 2))));
    }
    case 'CYLINDER': {
      const S = Math.max(3, Math.round(p.segments ?? 16));
      const H = Math.max(1, Math.round(p.heightSegments ?? 1));
      return extractAndMergeQuads(new THREE.CylinderGeometry(0.5, 0.5, 1, S, H));
    }
    case 'CONE': {
      const S = Math.max(3, Math.round(p.segments ?? 16));
      const H = Math.max(1, Math.round(p.heightSegments ?? 1));
      return extractAndMergeQuads(new THREE.ConeGeometry(0.5, 1, S, H));
    }
    case 'TORUS': {
      return extractAndMergeQuads(new THREE.TorusGeometry(
        p.radius ?? 0.5, p.tube ?? 0.2,
        Math.max(3,  Math.round(p.radialSegments  ?? 16)),
        Math.max(6,  Math.round(p.tubularSegments ?? 32)),
      ));
    }
    case 'ICOSAHEDRON':
      return extractAndMergeQuads(new THREE.IcosahedronGeometry(0.5, Math.max(0, Math.round(p.detail ?? 0))));
    case 'DODECAHEDRON':
      return extractAndMergeQuads(new THREE.DodecahedronGeometry(0.5, Math.max(0, Math.round(p.detail ?? 0))));

    // ── SHAPE / custom — return empty (will be populated by drawing) ─────────
    case 'SHAPE':
      if (p.extrusionDepth !== undefined) {
        return buildExtrusion(p);
      }
      return { vertices: [], faces: [] };

    case 'MESH':
      return { vertices: [], faces: [] };

    default: {
      // Fallback: simple unit cube
      return extractAndMergeQuads(new THREE.BoxGeometry(1, 1, 1));
    }
  }
}
