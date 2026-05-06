import Module from 'manifold-3d';
import type { V3, MeshFace } from '../types';

let manifoldModule: any = null;

export async function initManifold() {
  if (manifoldModule) return manifoldModule;
  manifoldModule = await Module();
  // Set up the manifold library
  manifoldModule.setup();
  return manifoldModule;
}

/**
 * Utiliza Manifold para "curar" una malla, asegurando que sea cerrada y sin errores.
 * Esto es ideal para aplicar después de operaciones que rompen la topología.
 */
export async function healMesh(vertices: V3[], faces: MeshFace[]): Promise<{ vertices: V3[]; faces: MeshFace[] }> {
  const manifold = await initManifold();
  
  // 1. Preparar datos para Manifold
  const vertArray = new Float32Array(vertices.flat());
  const triArray = new Uint32Array(faces.flatMap(f => {
    // Manifold solo acepta triángulos
    if (f.indices.length === 3) return f.indices;
    // Si no es triángulo, lo triangulamos (fan simple)
    const tris: number[] = [];
    for (let i = 1; i < f.indices.length - 1; i++) {
      tris.push(f.indices[0], f.indices[i], f.indices[i+1]);
    }
    return tris;
  }));

  // 2. Crear objeto Manifold
  const mesh = {
    vertProperties: vertArray,
    triVerts: triArray,
    numProp: 3
  };
  
  const m = manifold.Manifold.fromMesh(mesh);
  
  // 3. Realizar limpieza (Manifold lo hace automáticamente al crear el objeto)
  // Podemos forzar un refinamiento si es necesario
  const cleanMesh = m.getMesh();
  
  // 4. Convertir de vuelta
  const outVerts: V3[] = [];
  for (let i = 0; i < cleanMesh.vertProperties.length; i += 3) {
    outVerts.push([cleanMesh.vertProperties[i], cleanMesh.vertProperties[i+1], cleanMesh.vertProperties[i+2]]);
  }
  
  const outFaces: MeshFace[] = [];
  for (let i = 0; i < cleanMesh.triVerts.length; i += 3) {
    outFaces.push({
      indices: [cleanMesh.triVerts[i], cleanMesh.triVerts[i+1], cleanMesh.triVerts[i+2]]
    });
  }
  
  // Limpiar memoria WASM
  m.delete();
  
  return { vertices: outVerts, faces: outFaces };
}
