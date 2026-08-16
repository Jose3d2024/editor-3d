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
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3, MeshFace, BezierHandle } from '../types';
import {
  createDefaultNurbsCurve,
  createDefaultNurbsCircle,
  createDefaultNurbsSurface,
  createDefaultNurbsCylinder,
  createDefaultNurbsCone,
  createDefaultNurbsSphere,
  createDefaultNurbsTorus,
  tessellateNurbsSurface,
  tessellateNurbsCurveToMesh,
} from './nurbs';

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

/** TUBE: 3D hollow pipe with inner/outer walls and ring caps */
function buildTube(inner: number, outer: number, height: number, N: number): PrimitiveGeom {
  N = Math.max(3, N);
  const halfH = height / 2;
  const verts: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    verts.push([cos * outer, halfH, sin * outer]); // top outer
    verts.push([cos * inner, halfH, sin * inner]); // top inner
    verts.push([cos * outer, -halfH, sin * outer]); // bottom outer
    verts.push([cos * inner, -halfH, sin * inner]); // bottom inner
  }
  const faces: MeshFace[] = [];
  for (let i = 0; i < N; i++) {
    const oT0 = i * 4,     iT0 = i * 4 + 1;
    const oB0 = i * 4 + 2, iB0 = i * 4 + 3;
    const oT1 = (i + 1) * 4,     iT1 = (i + 1) * 4 + 1;
    const oB1 = (i + 1) * 4 + 2, iB1 = (i + 1) * 4 + 3;

    faces.push({ indices: [oT0, oT1, iT1, iT0] }); // top cap
    faces.push({ indices: [oB0, iB0, iB1, oB1] }); // bottom cap
    faces.push({ indices: [oT0, oB0, oB1, oT1] }); // outer wall
    faces.push({ indices: [iT0, iT1, iB1, iB0] }); // inner wall
  }
  return weldVertices(verts, faces);
}

/** WEDGE: 3D ramp / triangular prism */
function buildWedge(): PrimitiveGeom {
  const verts: V3[] = [
    [-0.5, -0.5,  0.5], // 0: bottom-left-front
    [ 0.5, -0.5,  0.5], // 1: bottom-right-front
    [-0.5,  0.5,  0.5], // 2: top-left-front
    [-0.5, -0.5, -0.5], // 3: bottom-left-back
    [ 0.5, -0.5, -0.5], // 4: bottom-right-back
    [-0.5,  0.5, -0.5], // 5: top-left-back
  ];
  const faces: MeshFace[] = [
    { indices: [0, 1, 4, 3] }, // Bottom
    { indices: [0, 3, 5, 2] }, // Back
    { indices: [1, 2, 5, 4] }, // Ramp
    { indices: [0, 2, 1] },    // Front
    { indices: [3, 4, 5] },    // Back triangle
  ];
  return weldVertices(verts, faces);
}

/** ARC: 3D hollow pipe segment spanning specified degrees (0° - 360°) */
function buildArc(inner: number, outer: number, arcAngleDeg: number, height: number, N: number): PrimitiveGeom {
  N = Math.max(3, N);
  const angleRad = (Math.max(1, Math.min(360, arcAngleDeg)) * Math.PI) / 180;
  const isClosedLoop = Math.abs(arcAngleDeg - 360) < 0.1;
  const halfH = height / 2;

  const verts: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * angleRad;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    verts.push([cos * outer, halfH, sin * outer]);  // top outer
    verts.push([cos * inner, halfH, sin * inner]);  // top inner
    verts.push([cos * outer, -halfH, sin * outer]); // bottom outer
    verts.push([cos * inner, -halfH, sin * inner]); // bottom inner
  }

  const faces: MeshFace[] = [];
  for (let i = 0; i < N; i++) {
    const oT0 = i * 4,     iT0 = i * 4 + 1;
    const oB0 = i * 4 + 2, iB0 = i * 4 + 3;
    const oT1 = (i + 1) * 4,     iT1 = (i + 1) * 4 + 1;
    const oB1 = (i + 1) * 4 + 2, iB1 = (i + 1) * 4 + 3;

    faces.push({ indices: [oT0, oT1, iT1, iT0] }); // top cap
    faces.push({ indices: [oB0, iB0, iB1, oB1] }); // bottom cap
    faces.push({ indices: [oT0, oB0, oB1, oT1] }); // outer wall
    faces.push({ indices: [iT0, iT1, iB1, iB0] }); // inner wall
  }

  if (!isClosedLoop) {
    faces.push({ indices: [0, 1, 3, 2] });
    const n4 = N * 4;
    faces.push({ indices: [n4, n4 + 2, n4 + 3, n4 + 1] });
  }

  return weldVertices(verts, faces);
}

/** STAR: 3D extruded star with customizable number of points (puntas) */
function buildStar(points: number, inner: number, outer: number, height: number): PrimitiveGeom {
  points = Math.max(3, Math.round(points));
  const numVerts = points * 2;
  const halfH = height / 2;
  const verts: V3[] = [];

  const topCenterIdx = 0;
  const bottomCenterIdx = 1;
  verts.push([0, halfH, 0]);  // 0: top center
  verts.push([0, -halfH, 0]); // 1: bottom center

  for (let i = 0; i < numVerts; i++) {
    const theta = (i / numVerts) * Math.PI * 2;
    const r = (i % 2 === 0) ? outer : inner;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    verts.push([cos * r, halfH, sin * r]);  // top ring vertex
    verts.push([cos * r, -halfH, sin * r]); // bottom ring vertex
  }

  const faces: MeshFace[] = [];
  for (let i = 0; i < numVerts; i++) {
    const nextI = (i + 1) % numVerts;
    const topCurr = 2 + i * 2;
    const botCurr = 2 + i * 2 + 1;
    const topNext = 2 + nextI * 2;
    const botNext = 2 + nextI * 2 + 1;

    faces.push({ indices: [topCenterIdx, topCurr, topNext] });
    faces.push({ indices: [bottomCenterIdx, botNext, botCurr] });
    faces.push({ indices: [topCurr, botCurr, botNext, topNext] });
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
      const sphereType = p.sphereType || 'UV';
      if (sphereType === 'ICO') {
        const detail = Math.max(0, Math.min(5, Math.round(p.detail ?? 2)));
        return extractAndMergeQuads(new THREE.IcosahedronGeometry(0.5, detail));
      } else {
        const S = Math.max(3, Math.round(p.segments ?? 32));
        const H = Math.max(2, Math.round(p.heightSegments ?? Math.round(S / 2)));
        return extractAndMergeQuads(new THREE.SphereGeometry(0.5, S, H));
      }
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
    case 'PYRAMID': {
      const H = Math.max(1, Math.round(p.heightSegments ?? 1));
      return extractAndMergeQuads(new THREE.ConeGeometry(0.5, 1, 4, H));
    }
    case 'PRISM': {
      const H = Math.max(1, Math.round(p.heightSegments ?? 1));
      return extractAndMergeQuads(new THREE.CylinderGeometry(0.5, 0.5, 1, 3, H));
    }
    case 'CAPSULE': {
      const S = Math.max(4, Math.round(p.segments ?? 16));
      return extractAndMergeQuads(new THREE.CapsuleGeometry(0.25, 0.5, 8, S));
    }
    case 'TETRAHEDRON':
      return extractAndMergeQuads(new THREE.TetrahedronGeometry(0.5, Math.max(0, Math.round(p.detail ?? 0))));
    case 'OCTAHEDRON':
      return extractAndMergeQuads(new THREE.OctahedronGeometry(0.5, Math.max(0, Math.round(p.detail ?? 0))));
    case 'TUBE': {
      return buildTube(
        p.innerRadius ?? 0.25,
        p.outerRadius ?? 0.5,
        1.0,
        Math.max(3, Math.round(p.segments ?? 16))
      );
    }
    case 'WEDGE':
      return buildWedge();
    case 'ARC': {
      return buildArc(
        p.innerRadius ?? 0.25,
        p.outerRadius ?? 0.5,
        p.arcAngle ?? 180,
        p.height ?? 0.5,
        Math.max(4, Math.round(p.segments ?? 32))
      );
    }
    case 'STAR': {
      return buildStar(
        Math.max(3, Math.round(p.starPoints ?? p.points ?? 5)),
        p.innerRadius ?? 0.25,
        p.outerRadius ?? 0.5,
        p.height ?? 0.5
      );
    }
    case 'HEMISPHERE': {
      const S = Math.max(4, Math.round(p.segments ?? 16));
      const sphereGeo = new THREE.SphereGeometry(0.5, S, Math.max(2, Math.round(S / 2)), 0, Math.PI * 2, 0, Math.PI / 2);
      const circleGeo = new THREE.CircleGeometry(0.5, S);
      circleGeo.rotateX(Math.PI / 2);
      try {
        const merged = BufferGeometryUtils.mergeGeometries([sphereGeo, circleGeo]);
        return extractAndMergeQuads(merged);
      } catch {
        return extractAndMergeQuads(sphereGeo);
      }
    }

    // ── NURBS Primitives ──────────────────────────────────────────────────
    case 'NURBS_CURVE': {
      const curve = p.nurbsCurve ?? createDefaultNurbsCurve();
      return tessellateNurbsCurveToMesh(curve, Math.max(16, p.segments ?? 32), p.radius ?? 0.03);
    }
    case 'NURBS_CIRCLE': {
      const circle = p.nurbsCurve ?? createDefaultNurbsCircle(p.radius ?? 1.0);
      return tessellateNurbsCurveToMesh(circle, Math.max(24, p.segments ?? 48), p.tube ?? 0.03);
    }
    case 'NURBS_SURFACE': {
      const surface = p.nurbsSurface ?? createDefaultNurbsSurface(p.height ?? 2.0);
      return tessellateNurbsSurface(surface, p.nurbsResolutionU ?? 16, p.nurbsResolutionV ?? 16);
    }
    case 'NURBS_CYLINDER': {
      const surface = p.nurbsSurface ?? createDefaultNurbsCylinder(p.radius ?? 0.8, p.height ?? 2.0);
      return tessellateNurbsSurface(surface, p.nurbsResolutionU ?? 16, p.nurbsResolutionV ?? 32);
    }
    case 'NURBS_CONE': {
      const surface = p.nurbsSurface ?? createDefaultNurbsCone(p.radius ?? 1.0, p.height ?? 2.0);
      return tessellateNurbsSurface(surface, p.nurbsResolutionU ?? 16, p.nurbsResolutionV ?? 32);
    }
    case 'NURBS_SPHERE': {
      const surface = p.nurbsSurface ?? createDefaultNurbsSphere(p.radius ?? 1.0);
      return tessellateNurbsSurface(surface, p.nurbsResolutionU ?? 24, p.nurbsResolutionV ?? 32);
    }
    case 'NURBS_TORUS': {
      const surface = p.nurbsSurface ?? createDefaultNurbsTorus(p.radius ?? 1.0, p.tube ?? 0.35);
      return tessellateNurbsSurface(surface, p.nurbsResolutionU ?? 24, p.nurbsResolutionV ?? 32);
    }

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
