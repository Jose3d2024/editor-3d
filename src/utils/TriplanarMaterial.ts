import * as THREE from 'three';

export function setupTriplanarMaterial(material: THREE.Material, mData: any) {
  material.onBeforeCompile = (shader) => {
    // Add uniforms
    shader.uniforms.triplanarScale = { value: mData.mapRepeat ? new THREE.Vector2(mData.mapRepeat[0], mData.mapRepeat[1]) : new THREE.Vector2(1, 1) };
    
    // Vertex shader modifications
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      `
    );
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vLocalPosition = position;
      vLocalNormal = normal;
      `
    );

    // Fragment shader modifications
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      uniform vec2 triplanarScale;
      
      vec4 triplanarBlend(vec3 normal) {
        vec3 blend = abs(normal);
        blend = normalize(max(blend, 0.00001));
        float b = (blend.x + blend.y + blend.z);
        blend /= vec3(b, b, b);
        return vec4(blend, 1.0);
      }
      
      vec4 getTriplanarTexture(sampler2D tex, vec3 pos, vec3 normal, vec2 scale) {
        vec4 blend = triplanarBlend(normal);
        vec4 cx = texture2D(tex, pos.yz * scale);
        vec4 cy = texture2D(tex, pos.xz * scale);
        vec4 cz = texture2D(tex, pos.xy * scale);
        return cx * blend.x + cy * blend.y + cz * blend.z;
      }
      `
    );

    // Replace map
    if (mData.map) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec4 texelColor = getTriplanarTexture(map, vLocalPosition, vLocalNormal, triplanarScale);
          texelColor = mapTexelToLinear(texelColor);
          diffuseColor *= texelColor;
        #endif
        `
      );
    }
    
    // Replace normal map
    if (mData.normalMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #ifdef USE_NORMALMAP
          // Simplified triplanar normal mapping
          vec4 nx = texture2D(normalMap, vLocalPosition.yz * triplanarScale);
          vec4 ny = texture2D(normalMap, vLocalPosition.xz * triplanarScale);
          vec4 nz = texture2D(normalMap, vLocalPosition.xy * triplanarScale);
          
          vec3 blend = abs(vLocalNormal);
          blend = normalize(max(blend, 0.00001));
          float b = (blend.x + blend.y + blend.z);
          blend /= vec3(b, b, b);
          
          vec3 tnormal = (nx.xyz * 2.0 - 1.0) * blend.x +
                         (ny.xyz * 2.0 - 1.0) * blend.y +
                         (nz.xyz * 2.0 - 1.0) * blend.z;
                         
          normal = normalize(vLocalNormal + tnormal * normalScale.x);
        #endif
        `
      );
    }
    
    // Replace roughness map
    if (mData.roughnessMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = getTriplanarTexture(roughnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          roughnessFactor *= texelRoughness.g;
        #endif
        `
      );
    }
    
    // Replace metalness map
    if (mData.metalnessMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `
        float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          vec4 texelMetalness = getTriplanarTexture(metalnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          metalnessFactor *= texelMetalness.b;
        #endif
        `
      );
    }
  };
  
  material.needsUpdate = true;
}
