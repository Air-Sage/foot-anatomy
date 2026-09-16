import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export function createRendering(scene, camera, host) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  scene.background = new THREE.Color("#edf1ee");
  host.appendChild(renderer.domElement);

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.035);
  scene.environment = environmentTarget.texture;
  environment.dispose();
  pmrem.dispose();

  const fill = new THREE.HemisphereLight(0xf4f8ff, 0xc6c7bf, 0.65);
  scene.add(fill);
  [
    [[3, 5, 4], 0xfff7ef, 2.0],
    [[-4, 2, -3], 0xe5efff, 1.2],
    [[-2, -3, 2], 0xffffff, 0.55],
    [[3, 0, -4], 0xffffff, 0.75],
  ].forEach(([position, color, intensity]) => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  });
  const cameraFill = new THREE.DirectionalLight(0xffffff, 0.45);
  camera.add(cameraFill);
  cameraFill.position.set(0, 1, 3);
  scene.add(camera);

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
  });
  target.samples = renderer.capabilities.isWebGL2 ? 2 : 0;
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, 1, 1, 16);
  ao.kernelRadius = 0.055;
  ao.minDistance = 0.0002;
  ao.maxDistance = 0.012;
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  const api = {
    renderer,
    setSettings({ exposure, environmentStrength, occlusion, xray }) {
      renderer.toneMappingExposure = exposure;
      fill.intensity = 0.65 * environmentStrength;
      scene.traverse((object) => {
        if (object.isMesh && object.userData.partId)
          object.material.envMapIntensity = 0.55 * environmentStrength;
      });
      ao.enabled = occlusion && !xray;
    },
    resize(width, height) {
      renderer.setSize(width, height);
      composer.setSize(width, height);
      const scale = Math.min(devicePixelRatio, 1);
      ao.setSize(Math.round(width * scale), Math.round(height * scale));
    },
    render() {
      // The camera projection also changes during focus and viewport resizing.
      ao.ssaoMaterial.uniforms.cameraNear.value = camera.near;
      ao.ssaoMaterial.uniforms.cameraFar.value = camera.far;
      ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
        camera.projectionMatrix,
      );
      ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
        camera.projectionMatrixInverse,
      );
      composer.render();
    },
  };
  api.resize(host.clientWidth, host.clientHeight);
  return api;
}

export function tissueMaterial(source, layer, renderer) {
  const material = new THREE.MeshPhysicalMaterial();
  // Preserve authored UV maps and normals, especially muscle-to-tendon transitions.
  THREE.MeshStandardMaterial.prototype.copy.call(material, source);
  material.metalness = 0;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.transmission = 0;
  material.emissive.setHex(0);
  material.emissiveIntensity = 0;
  material.envMapIntensity = 0.55;
  material.roughness =
    {
      bone: 0.64,
      cartilage: 0.32,
      muscle: 0.57,
      ligament: 0.63,
      fascia: 0.72,
      artery: 0.45,
      vein: 0.48,
      nerve: 0.58,
      bursa: 0.38,
    }[layer] ?? 0.6;
  material.clearcoat = ["muscle", "cartilage", "artery", "vein"].includes(layer)
    ? 0.12
    : 0.03;
  material.clearcoatRoughness = 0.5;
  material.ior = 1.4;
  material.specularIntensity = 0.45;
  if (!material.map) {
    const colors = {
      bone: "#e4d8c3",
      cartilage: "#cadbd6",
      ligament: "#d9d5bc",
      fascia: "#d5d4c6",
      muscle: "#ad554a",
      artery: "#b64740",
      vein: "#566e95",
      nerve: "#d4af55",
      bursa: "#b4c7c3",
    };
    material.color.set(colors[layer] || "#d5d4c6");
  }
  if (material.normalMap) material.normalScale.multiplyScalar(0.65);
  for (const key of ["map", "normalMap", "roughnessMap", "aoMap"]) {
    if (material[key])
      material[key].anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
  }
  return material;
}
