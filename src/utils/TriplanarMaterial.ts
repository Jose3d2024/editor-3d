import * as THREE from 'three';

export function setupTriplanarMaterial(material: THREE.Material, mData: any) {
  const prevOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) {
      prevOnBeforeCompile(shader, renderer);
    }

    // ── 1. EXTRAER EL VALOR EXACTO Y PURO DE TU SLIDER DE INTERFAZ ──
    let tileX = 1.0;
    let tileY = 1.0;
    if (Array.isArray(mData?.tiling)) {
      tileX = mData.tiling[0] ?? 1.0;
      tileY = mData.tiling[1] ?? 1.0;
    } else if (typeof mData?.tiling === 'number') {
      tileX = mData.tiling;
      tileY = mData.tiling;
    } else if (Array.isArray(mData?.mapRepeat)) {
      tileX = mData.mapRepeat[0] ?? 1.0;
      tileY = mData.mapRepeat[1] ?? 1.0;
    } else if (typeof mData?.mapRepeat === 'number') {
      tileX = mData.mapRepeat;
      tileY = mData.mapRepeat;
    } else if (typeof mData?.triplanarScale === 'number') {
      tileX = mData.triplanarScale;
      tileY = mData.triplanarScale;
    }
    const sliderVal = tileX;
    const scaleVec = new THREE.Vector2(tileX, tileY);

    // Suavizado de bordes / Blend (0.0 = corte duro, 0.5 = equilibrado, 1.0 = difuminado ultra suave)
    const rawBlendVal = typeof mData?.triplanarBlend === 'number' ? mData.triplanarBlend : 0.5;
    const blendClamped = Math.min(1.0, Math.max(0.0, rawBlendVal));

    // Actualización directa de uniforms si el shader ya existe en userData
    const existingShader = (material as any).userData?.triplanarShader;
    if (existingShader && existingShader.uniforms) {
      if (existingShader.uniforms.uMixosScale) existingShader.uniforms.uMixosScale.value = sliderVal;
      if (existingShader.uniforms.triplanarScale) existingShader.uniforms.triplanarScale.value.copy(scaleVec);
      if (existingShader.uniforms.uTriplanarBlend) existingShader.uniforms.uTriplanarBlend.value = blendClamped;
    }

    // ── 2. ASIGNAR LOS UNIFORMS VIVOS A LA GPU ──
    shader.uniforms.uMixosScale = { value: sliderVal };
    shader.uniforms.triplanarScale = { value: scaleVec };
    shader.uniforms.uTriplanarBlend = { value: blendClamped };
    (material as any).userData.triplanarShader = shader;
    
    // Vertex shader modifications
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      #define TRIPLANAR_SCALE
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      varying vec3 vMixosPosition;
      varying vec3 vMixosNormal;
      uniform float uMixosScale;
      uniform vec2 triplanarScale;
      uniform float uTriplanarBlend;
      `
    );
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vLocalPosition = position;
      vLocalNormal = normalize(normal);
      vMixosPosition = position;
      vMixosNormal = normalize(normal);
      `
    );

    // Fragment shader modifications: Stochastic Triplanar Mapping with Smooth Edge Blend
    const mixosAntiTilingCode = `
      varying vec3 vLocalPosition;
      varying vec3 vLocalNormal;
      varying vec3 vMixosPosition;
      varying vec3 vMixosNormal;
      uniform float uMixosScale;
      uniform vec2 triplanarScale;
      uniform float uTriplanarBlend;

      vec3 getTriplanarWeights(vec3 normal, float blendFactor) {
        vec3 norm = length(normal) > 0.0001 ? normalize(normal) : vec3(0.0, 1.0, 0.0);
        vec3 absN = abs(norm);
        
        // Corte duro (0% blend): 100% al eje dominante sin mezclar
        if (blendFactor <= 0.01) {
          if (absN.x >= absN.y && absN.x >= absN.z) return vec3(1.0, 0.0, 0.0);
          if (absN.y >= absN.x && absN.y >= absN.z) return vec3(0.0, 1.0, 0.0);
          return vec3(0.0, 0.0, 1.0);
        }
        
        // Transición progresiva de suavizado (0% -> 100%)
        float expVal = mix(64.0, 1.0, pow(blendFactor, 0.5));
        vec3 blend = pow(absN, vec3(expVal));
        float total = blend.x + blend.y + blend.z + 0.00001;
        return blend / total;
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal, vec2 scale, bool isNormalMap) {
        vec3 blend = getTriplanarWeights(normal, uTriplanarBlend);
        
        vec2 uvX = vec2(normal.x < 0.0 ? -pos.z : pos.z, pos.y);
        vec2 uvY = vec2(pos.x, normal.y < 0.0 ? -pos.z : pos.z);
        vec2 uvZ = vec2(normal.z < 0.0 ? -pos.x : pos.x, pos.y);

        vec4 cx = texture2D(tex, uvX * scale);
        vec4 cy = texture2D(tex, uvY * scale);
        vec4 cz = texture2D(tex, uvZ * scale);

        if (isNormalMap) {
          vec3 n1 = cx.xyz * 2.0 - 1.0;
          vec3 n2 = cy.xyz * 2.0 - 1.0;
          vec3 n3 = cz.xyz * 2.0 - 1.0;
          vec3 normBlend = normalize(n1 * blend.x + n2 * blend.y + n3 * blend.z);
          return vec4(normBlend * 0.5 + 0.5, (cx.w * blend.x + cy.w * blend.y + cz.w * blend.z));
        }

        return cx * blend.x + cy * blend.y + cz * blend.z;
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal, vec2 scale) {
        return sampleMixosTriplanar(tex, pos, normal, scale, false);
      }

      vec4 sampleMixosTriplanar(sampler2D tex, vec3 pos, vec3 normal) {
        return sampleMixosTriplanar(tex, pos, normal, vec2(uMixosScale, uMixosScale), false);
      }
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${mixosAntiTilingCode}`
    );

    const hasMap = !!((material as any).map || mData.map || mData.mapAlbedo);
    const hasNormal = !!((material as any).normalMap || mData.normalMap || mData.mapNormal);
    const hasRoughness = !!((material as any).roughnessMap || mData.roughnessMap || mData.mapRoughness);
    const hasMetalness = !!((material as any).metalnessMap || mData.metalnessMap || mData.mapMetalness);

    // Replace map
    if (hasMap) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec4 texelColor = sampleMixosTriplanar(map, vLocalPosition, vLocalNormal, triplanarScale);
          diffuseColor *= texelColor;
        #endif
        `
      );
    }
    
    // Replace normal map
    if (hasNormal) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #ifdef USE_NORMALMAP
          vec4 mapN = sampleMixosTriplanar(normalMap, vLocalPosition, vLocalNormal, triplanarScale, true);
          vec3 tnormal = mapN.xyz * 2.0 - 1.0;
          normal = normalize(vLocalNormal + tnormal * normalScale.x);
        #endif
        `
      );
    }
    
    // Replace roughness map
    if (hasRoughness) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = sampleMixosTriplanar(roughnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          roughnessFactor *= texelRoughness.g;
        #endif
        `
      );
    }
    
    // Replace metalness map
    if (hasMetalness) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `
        float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          vec4 texelMetalness = sampleMixosTriplanar(metalnessMap, vLocalPosition, vLocalNormal, triplanarScale);
          metalnessFactor *= texelMetalness.b;
        #endif
        `
      );
    }
  };
  
  material.needsUpdate = true;
}

