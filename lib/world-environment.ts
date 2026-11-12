import * as THREE from 'three';
import type { TerrainOptions } from './terrain';

export function createWorldEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const group = new THREE.Group();
  scene.add(group);
  const hemisphere = new THREE.HemisphereLight('#cbdce7', '#3f4b33', 1.2);
  const sun = new THREE.DirectionalLight('#fff0da', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 2;
  sun.shadow.bias = -0.00002;
  scene.add(hemisphere, sun, sun.target);
  const direction = new THREE.Vector3();
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sun: { value: direction },
      daylight: { value: 1 },
      time: { value: 0 },
      clouds: { value: 0.1 },
      rain: { value: 0 },
    },
    vertexShader:
      'varying vec3 skyRay; void main(){skyRay=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 skyRay; uniform vec3 sun; uniform float daylight; uniform float time; uniform float clouds; uniform float rain;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      void main(){vec3 ray=normalize(skyRay);float horizon=pow(1.0-max(ray.y,0.0),3.0);
        vec3 top=mix(vec3(0.016,0.025,0.045),vec3(0.28,0.47,0.64),daylight);
        vec3 bottom=mix(vec3(0.055,0.065,0.075),vec3(0.72,0.75,0.67),daylight);
        float dawn=1.0-smoothstep(0.05,0.5,abs(sun.y));bottom=mix(bottom,vec3(0.84,0.59,0.40),dawn*daylight*0.55);
        vec3 color=mix(top,bottom,horizon);
        vec3 belowHorizon=mix(vec3(0.018,0.027,0.03),vec3(0.034,0.062,0.049),daylight);
        color=mix(color,belowHorizon,smoothstep(0.0,0.24,-ray.y));
        float alignment=max(dot(ray,sun),0.0);
        color+=vec3(1.0,0.76,0.48)*pow(alignment,48.0)*0.3*daylight;
        color+=vec3(1.0,0.87,0.66)*smoothstep(0.9995,0.9998,alignment)*daylight;
        vec2 p=ray.xz/(max(ray.y,0.06))*1.3+vec2(time*0.0015,0.0);
        float cloud=noise(p)*0.52+noise(p*2.2)*0.3+noise(p*5.1)*0.18;
        float cover=smoothstep(0.77-clouds*0.32,0.86-clouds*0.25,cloud)*smoothstep(0.01,0.14,ray.y);
        vec3 cloudColor=mix(vec3(0.11,0.13,0.16),vec3(0.92,0.93,0.89),daylight)*(1.0-rain*0.35);
        color=mix(color,cloudColor,cover*min(1.0,clouds+0.35));
        vec2 starCell=floor(ray.xz/max(ray.y,0.05)*420.0);float star=step(0.9987,hash(starCell))*smoothstep(0.1,0.4,ray.y);
        color+=star*(1.0-daylight)*0.6;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  group.add(sky);
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      opacity: { value: 0.5 },
      tint: { value: new THREE.Color('#e9ece7') },
      shade: { value: new THREE.Color('#9aaab0') },
      time: { value: 0 },
    },
    vertexShader: `varying vec2 cloudUv; uniform float time;
      void main() {
        cloudUv = uv;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        center.x += sin(time * .005) * 120.0;
        center.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `varying vec2 cloudUv; uniform float opacity; uniform vec3 tint; uniform vec3 shade;
      float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      void main(){
        vec2 p = cloudUv * 2.0 - 1.0;
        float detail = noise(cloudUv * 5.0)*.65 + noise(cloudUv*13.0)*.35;
        float body = 1.0 - smoothstep(.18 + detail*.1, .9, length(p));
        float alpha = body * opacity * (.48 + detail * .52);
        if (alpha < .01) discard;
        gl_FragColor = vec4(mix(shade,tint,smoothstep(.03,.9,cloudUv.y)*.8+detail*.2), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const cloudGeometry = new THREE.PlaneGeometry(1, 1);
  const cloudBank = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 112);
  const cloudTransform = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    const x = Math.sin(i * 113.7) * 39000,
      z = Math.cos(i * 87.3) * 27000;
    const height = 3000 + Math.sin(i * 67.1) * 450;
    for (let puff = 0; puff < 4; puff++) {
      cloudTransform.position.set(
        x + (puff - 1.5) * 650,
        height + Math.sin(puff * 2) * 180,
        z + Math.cos(puff * 3) * 350,
      );
      cloudTransform.scale.set(
        1800 + puff * 190,
        850 + Math.sin(puff * 3) * 220,
        1,
      );
      cloudTransform.updateMatrix();
      cloudBank.setMatrixAt(i * 4 + puff, cloudTransform.matrix);
    }
  }
  cloudBank.frustumCulled = false;
  cloudBank.renderOrder = 4;
  group.add(cloudBank);
  const mistMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      opacity: { value: 0 },
      tint: { value: new THREE.Color('#bacac4') },
    },
    vertexShader:
      'varying vec2 mistUv;void main(){mistUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 mistUv; uniform float time; uniform float opacity; uniform vec3 tint;
      void main(){vec2 p=mistUv;float edge=smoothstep(0.0,0.2,p.x)*smoothstep(0.0,0.2,p.y)*smoothstep(0.0,0.2,1.0-p.x)*smoothstep(0.0,0.2,1.0-p.y);float wisps=0.48+0.23*sin(p.x*27.0+p.y*11.0+time*0.06)+0.2*sin(p.y*41.0-p.x*13.0-time*0.04);gl_FragColor=vec4(tint,opacity*edge*wisps);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const mist = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(14000, 14000),
      mistMaterial,
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = i * 24;
    mist.add(plane);
  }
  group.add(mist);
  const rainGeometry = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(1400 * 6);
  const rainEnds = new Float32Array(1400 * 2);
  for (let i = 0; i < 1400; i++) {
    const x = ((Math.sin(i * 171.17) * 4353.21) % 1) * 420;
    const y = ((Math.sin(i * 73.19) * 2147.7) % 1) * 180;
    const z = ((Math.sin(i * 133.73) * 5759.13) % 1) * 420;
    rainPositions.set([x, y, z, x + 0.6, y - 7, z], i * 6);
    rainEnds[i * 2 + 1] = 1;
  }
  rainGeometry.setAttribute('rainEnd', new THREE.BufferAttribute(rainEnds, 1));
  rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const rainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, opacity: { value: 0.25 } },
    vertexShader:
      'attribute float rainEnd; uniform float time;void main(){vec3 p=position;p.y=mod(p.y+rainEnd*7.0-time*78.0,360.0)-180.0-rainEnd*7.0;p.x+=sin(time*0.5)*8.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
    fragmentShader:
      'uniform float opacity;void main(){gl_FragColor=vec4(0.76,0.83,0.85,opacity);}',
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  group.add(rain);
  let options: TerrainOptions;
  let shadowKey = '';
  let fogDensity = 0.00001;
  let exportHidden = false;
  const update = (next: TerrainOptions) => {
    options = next;
    const angle = ((next.timeOfDay - 6) / 12) * Math.PI;
    direction.set(Math.cos(angle), Math.sin(angle) * 0.95, -0.38).normalize();
    const daylight = THREE.MathUtils.smoothstep(direction.y, -0.14, 0.12);
    const weather = next.weatherIntensity;
    const cloudCover =
      next.weather === 'clear'
        ? 0.14
        : next.weather === 'mist'
          ? 0.45
          : 0.35 + weather * 0.65;
    sun.intensity =
      THREE.MathUtils.lerp(0.8, 3.3, daylight) *
      (1 - (next.weather === 'rain' ? weather * 0.66 : cloudCover * 0.3));
    sun.color.set(
      daylight < 0.25 ? '#b5c8eb' : direction.y < 0.25 ? '#ffd09a' : '#fff2dc',
    );
    hemisphere.intensity =
      THREE.MathUtils.lerp(0.85, 1.15, daylight) *
      (next.weather === 'rain' ? 0.83 : 1);
    hemisphere.color.set(daylight < 0.2 ? '#9aafc7' : '#cdddeb');
    skyMaterial.uniforms.daylight.value = daylight;
    skyMaterial.uniforms.clouds.value = next.clouds ? cloudCover : 0;
    cloudBank.visible = next.clouds;
    cloudBank.count = next.weather === 'clear' ? 48 : 112;
    cloudMaterial.uniforms.opacity.value =
      next.weather === 'clear' ? 0.46 : 0.5 + weather * 0.22;
    cloudMaterial.uniforms.tint.value.set(
      daylight < 0.2 ? '#526779' : direction.y < 0.3 ? '#e0bc91' : '#f2f4ed',
    );
    cloudMaterial.uniforms.shade.value.set(
      daylight < 0.2
        ? '#26394d'
        : next.weather === 'rain'
          ? '#74848e'
          : '#a6b7be',
    );
    skyMaterial.uniforms.rain.value = next.weather === 'rain' ? weather : 0;
    rain.visible = next.weather === 'rain';
    rainMaterial.uniforms.opacity.value = 0.1 + weather * 0.22;
    mist.visible = next.weather === 'mist';
    mistMaterial.uniforms.opacity.value =
      next.weather === 'mist' ? 0.06 + weather * 0.16 : 0;
    const fogColor = new THREE.Color(
      daylight < 0.2
        ? '#243344'
        : next.weather === 'rain'
          ? '#7d9197'
          : '#b7c9c5',
    );
    scene.fog = new THREE.FogExp2(
      fogColor,
      next.weather === 'mist'
        ? 0.000035 + weather * 0.000055
        : next.weather === 'rain'
          ? 0.000022 + weather * 0.000026
          : 0.00001,
    );
    fogDensity = (scene.fog as THREE.FogExp2).density;
    shadowKey = '';
    renderer.shadowMap.needsUpdate = true;
  };
  return {
    group,
    update,
    tick(time: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
      const distance = camera.position.distanceTo(target);
      if (scene.fog instanceof THREE.FogExp2)
        scene.fog.density = fogDensity / Math.max(1, distance / 8500);
      sky.position.copy(camera.position);
      sky.scale.setScalar(camera.far * 0.65);
      rain.position.copy(camera.position);
      mist.position.set(target.x, target.y + 80, target.z);
      skyMaterial.uniforms.time.value = time;
      rainMaterial.uniforms.time.value = time;
      mistMaterial.uniforms.time.value = time;
      cloudMaterial.uniforms.time.value = time;
      const span = Math.max(
        160,
        Math.min(16000, camera.position.distanceTo(target) * 0.65),
      );
      const texel = (span * 2) / 2048;
      const center = target.clone();
      center.x = Math.round(center.x / texel) * texel;
      center.z = Math.round(center.z / texel) * texel;
      const key = `${Math.round(center.x)},${Math.round(center.y)},${Math.round(center.z)},${Math.round(span)}`;
      if (key !== shadowKey) {
        shadowKey = key;
        const lightDirection =
          direction.y >= 0 ? direction : direction.clone().negate();
        sun.target.position.copy(center);
        sun.position
          .copy(center)
          .addScaledVector(lightDirection, span * 3 + 8000);
        Object.assign(sun.shadow.camera, {
          left: -span,
          right: span,
          top: span,
          bottom: -span,
          near: 100,
          far: span * 6 + 20000,
        });
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.normalBias = Math.max(0.35, span / 3000);
        renderer.shadowMap.needsUpdate = true;
      }
      return (
        (options.clouds || options.weather !== 'clear') && !options.worldPaused
      );
    },
    hideForExport(hidden: boolean) {
      exportHidden = hidden;
      group.visible = !hidden;
      if (hidden) scene.fog = null;
      else update(options);
    },
    dispose() {
      group.removeFromParent();
      hemisphere.removeFromParent();
      sun.removeFromParent();
      sun.target.removeFromParent();
      sky.geometry.dispose();
      skyMaterial.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      mist.children.forEach((o) => (o as THREE.Mesh).geometry.dispose());
      mistMaterial.dispose();
      rainGeometry.dispose();
      rainMaterial.dispose();
      sun.shadow.dispose();
      if (!exportHidden) scene.fog = null;
    },
  };
}
