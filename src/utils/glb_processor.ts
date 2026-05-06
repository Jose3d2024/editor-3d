import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CSGObject, V3, MeshFace } from '../types';
import { smoothMesh, subdivideMesh } from './modifiers';

export async function processGLBMeshes(
  obj: CSGObject,
  processor: (vertices: V3[], faces: MeshFace[]) => { vertices: V3[]; faces: MeshFace[] }
): Promise<CSGObject> {
  if (!obj.meshData || obj.meshData.type !== 'gltf') return obj;

  try {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);
    const gltf = await new Promise<any>((resolve, reject) => 
      loader.load(obj.meshData!.data, resolve, undefined, reject)
    );

    const scene = gltf.scene;
    let modified = false;

    scene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.Mesh;
        let geometry = mesh.geometry;
        
        // Extract vertices and faces
        const posAttr = geometry.getAttribute('position');
        const indexAttr = geometry.index;
        
        if (posAttr) {
          const vertices: V3[] = [];
          for (let i = 0; i < posAttr.count; i++) {
            vertices.push([posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]);
          }
          
          const faces: MeshFace[] = [];
          if (indexAttr) {
            for (let i = 0; i < indexAttr.count; i += 3) {
              faces.push({ indices: [indexAttr.getX(i), indexAttr.getX(i+1), indexAttr.getX(i+2)] });
            }
          } else {
            for (let i = 0; i < posAttr.count; i += 3) {
              faces.push({ indices: [i, i+1, i+2] });
            }
          }

          const result = processor(vertices, faces);
          
          if (result && (result.vertices.length !== vertices.length || result.faces.length !== faces.length || result.vertices !== vertices)) {
            const newPos = new Float32Array(result.vertices.length * 3);
            result.vertices.forEach((v, i) => {
              newPos[i*3] = v[0];
              newPos[i*3+1] = v[1];
              newPos[i*3+2] = v[2];
            });
            
            if (result.vertices.length === vertices.length && result.faces.length === faces.length) {
              // Only positions changed (e.g. smoothing)
              geometry.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
              geometry.computeVertexNormals();
              modified = true;
            } else {
              // Topology changed (e.g. subdivision)
              const newIndices = [];
              for (const f of result.faces) {
                if (f.indices.length === 3) {
                  newIndices.push(f.indices[0], f.indices[1], f.indices[2]);
                } else {
                  // Triangulate if needed
                  for (let i = 1; i < f.indices.length - 1; i++) {
                    newIndices.push(f.indices[0], f.indices[i], f.indices[i+1]);
                  }
                }
              }
              
              const newGeo = new THREE.BufferGeometry();
              newGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
              newGeo.setIndex(newIndices);
              newGeo.computeVertexNormals();
              
              // Note: UVs and other attributes are lost in this simple conversion.
              // For a full solution, we would need to interpolate UVs, normals, skin weights, etc.
              // But for now, this preserves the hierarchy and animations.
              mesh.geometry = newGeo;
              modified = true;
            }
          }
        }
      }
    });

    if (!modified) return obj;

    const exporter = new GLTFExporter();
    const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        scene,
        (gltfData) => resolve(gltfData as ArrayBuffer),
        (error) => reject(error),
        { binary: true, animations: gltf.animations }
      );
    });

    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);

    // Recalculate meshes list
    const meshesList: { id: string, name: string, vertices: number, faces: number }[] = [];
    let meshIdx = 0;
    scene.traverse((child: any) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        let verts = 0;
        let faces = 0;
        if (geometry) {
          verts = geometry.attributes.position ? geometry.attributes.position.count : 0;
          faces = geometry.index ? geometry.index.count / 3 : verts / 3;
        }
        meshesList.push({
          id: `mesh-${meshIdx++}`,
          name: child.name || 'Unnamed Mesh',
          vertices: Math.floor(verts),
          faces: Math.floor(faces)
        });
      }
    });

    return {
      ...obj,
      meshData: {
        type: 'gltf',
        data: url,
        animations: gltf.animations.map((a: any) => a.toJSON()),
        meshes: meshesList
      }
    };
  } catch (err) {
    console.error('Error processing GLB:', err);
    return obj;
  }
}

export async function smoothGLB(obj: CSGObject, factor: number): Promise<CSGObject> {
  return processGLBMeshes(obj, (vertices, faces) => smoothMesh({ ...obj, vertices, faces }, factor, 1));
}

export async function subdivideGLB(obj: CSGObject): Promise<CSGObject> {
  return processGLBMeshes(obj, (vertices, faces) => subdivideMesh({ ...obj, vertices, faces }));
}
