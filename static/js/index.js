import * as THREE from "../vendor/three/three.module.js";
import { TrackballControls } from "../vendor/three/controls/TrackballControls.js";
import { PLYLoader } from "../vendor/three/loaders/PLYLoader.js";

const METHOD_LABELS = {
  ours: "Ours",
  direct: "Direct",
  reflect3d: "Reflect3D",
};

const METHOD_COLORS = {
  ours: 0x7ab6ff,
  direct: 0xe0bf6d,
  reflect3d: 0x7bcf9b,
};

const elements = {
  burger: document.querySelector(".navbar-burger"),
  menu: document.querySelector(".navbar-menu"),
  sceneTabs: document.getElementById("scene-tabs"),
  methodButtons: Array.from(document.querySelectorAll(".method-button")),
  methodLabel: document.getElementById("active-method-label"),
  sceneLabel: document.getElementById("active-scene-label"),
  inputImage: document.getElementById("input-image"),
  inputImageOverlay: document.getElementById("input-image-overlay"),
  viewerContainer: document.getElementById("viewer-container"),
  viewerOverlay: document.getElementById("viewer-overlay"),
  pointSize: document.getElementById("point-size"),
  pointSizeValue: document.getElementById("point-size-value"),
  planeOpacity: document.getElementById("plane-opacity"),
  planeOpacityValue: document.getElementById("plane-opacity-value"),
};

const state = {
  manifest: null,
  activeScene: "",
  activeMethod: "ours",
  pointSize: sliderToPointSize(elements.pointSize.value),
  planeOpacity: sliderToOpacity(elements.planeOpacity.value),
  bbox: null,
  loadToken: 0,
};

const pointCloudCache = new Map();
const planeCache = new Map();
const imageCache = new Map();
const plyLoader = new PLYLoader();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f141c);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
camera.position.set(4, 4, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
elements.viewerContainer.appendChild(renderer.domElement);

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 4.0;
controls.zoomSpeed = 1.15;
controls.panSpeed = 0.9;
controls.dynamicDampingFactor = 0.12;
controls.staticMoving = false;

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
keyLight.position.set(5, 8, 6);
scene.add(keyLight);

const pointCloudGroup = new THREE.Group();
const planeGroup = new THREE.Group();
scene.add(pointCloudGroup, planeGroup);

const grid = new THREE.GridHelper(10, 10, 0x3d5161, 0x24313d);
(Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((material) => {
  material.opacity = 0.18;
  material.transparent = true;
});
scene.add(grid);

const resizeObserver = new ResizeObserver(() => {
  const width = elements.viewerContainer.clientWidth;
  const height = elements.viewerContainer.clientHeight;
  if (!width || !height) {
    return;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  controls.handleResize();
});
resizeObserver.observe(elements.viewerContainer);
renderer.setSize(elements.viewerContainer.clientWidth || 800, elements.viewerContainer.clientHeight || 640, false);
controls.handleResize();

function setActiveButton(buttons, activeButton) {
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button === activeButton);
  });
}

function sliderToPointSize(value) {
  return Math.max(Number(value) / 1000, 0.001);
}

function pointSizeToSlider(value) {
  return String(Math.max(Math.round(Number(value) * 1000), 1));
}

function sliderToOpacity(value) {
  return THREE.MathUtils.clamp(Number(value) / 100, 0, 1);
}

function opacityToSlider(value) {
  return String(Math.round(THREE.MathUtils.clamp(Number(value), 0, 1) * 100));
}

function updateSliderLabels() {
  elements.pointSizeValue.textContent = state.pointSize.toFixed(3);
  elements.planeOpacityValue.textContent = state.planeOpacity.toFixed(2);
}

function setPointSizeUI(value) {
  state.pointSize = Math.max(Number(value), 0.001);
  elements.pointSize.value = pointSizeToSlider(state.pointSize);
  updateSliderLabels();
}

function setPlaneOpacityUI(value) {
  state.planeOpacity = THREE.MathUtils.clamp(Number(value), 0, 1);
  elements.planeOpacity.value = opacityToSlider(state.planeOpacity);
  updateSliderLabels();
}

function prettifySceneName(name) {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSceneDisplayName(sceneName) {
  const entry = state.manifest?.scenes?.[sceneName];
  if (entry?.display_name) {
    return entry.display_name;
  }
  return prettifySceneName(sceneName);
}

function showOverlay(title, message, tone = "neutral") {
  elements.viewerOverlay.classList.remove("is-hidden", "is-error");
  if (tone === "error") {
    elements.viewerOverlay.classList.add("is-error");
  }
  elements.viewerOverlay.innerHTML = `
    <p class="placeholder-label">${title}</p>
    <h3 class="title is-4">${message}</h3>
  `;
}

function hideOverlay() {
  elements.viewerOverlay.classList.add("is-hidden");
}

function showImageOverlay(title, message) {
  elements.inputImage.classList.add("is-hidden");
  elements.inputImage.removeAttribute("src");
  elements.inputImageOverlay.classList.remove("is-hidden");
  elements.inputImageOverlay.innerHTML = `
    <p class="placeholder-label">${title}</p>
    <h3 class="title is-4">${message}</h3>
  `;
}

function showInputImage(url) {
  const cacheBustedUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  elements.inputImage.src = cacheBustedUrl;
  elements.inputImage.classList.remove("is-hidden");
  elements.inputImageOverlay.classList.add("is-hidden");
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[0];
    child.traverse?.((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((material) => material.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
    group.remove(child);
  }
}

function fitCameraToBox(box) {
  if (!box) {
    return;
  }

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    return;
  }

  controls.target.copy(sphere.center);
  const distance = sphere.radius * 2.8;
  camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z - distance);
  camera.up.set(0, -1, 0);
  camera.near = Math.max(sphere.radius / 200, 0.01);
  camera.far = sphere.radius * 40;
  camera.updateProjectionMatrix();
  controls.update();
}

function vectorFromArray(value, fallback = null) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }
  return new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
}

function updatePointMaterialSize() {
  pointCloudGroup.traverse((node) => {
    if (node.isPoints) {
      node.material.size = state.pointSize;
      node.material.needsUpdate = true;
    }
  });
}

function updatePlaneOpacity() {
  planeGroup.traverse((node) => {
    if (node.isMesh) {
      node.material.opacity = state.planeOpacity;
      node.material.needsUpdate = true;
    } else if (node.isLineSegments) {
      node.material.opacity = Math.min(state.planeOpacity + 0.45, 0.95);
      node.material.needsUpdate = true;
    }
  });
}

function setLabels() {
  elements.sceneLabel.textContent = state.activeScene ? getSceneDisplayName(state.activeScene) : "None";
  elements.methodLabel.textContent = METHOD_LABELS[state.activeMethod] || "None";
}

function updateMethodButtons(availableVariants) {
  const fallback = availableVariants[0] || "";
  if (!availableVariants.includes(state.activeMethod)) {
    state.activeMethod = fallback;
  }

  elements.methodButtons.forEach((button) => {
    const method = button.dataset.method;
    const enabled = availableVariants.includes(method);
    button.disabled = !enabled;
    button.classList.toggle("is-disabled", !enabled);
    button.classList.toggle("is-active", enabled && method === state.activeMethod);
  });

  setLabels();
}

function renderSceneTabs() {
  const sceneNames = Object.keys(state.manifest?.scenes || {});
  elements.sceneTabs.innerHTML = "";

  sceneNames.forEach((sceneName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-tab";
    button.textContent = getSceneDisplayName(sceneName);
    button.dataset.scene = sceneName;
    button.addEventListener("click", () => {
      loadScene(sceneName);
    });
    if (sceneName === state.activeScene) {
      button.classList.add("is-active");
    }
    elements.sceneTabs.appendChild(button);
  });
}

function setActiveSceneTab(sceneName) {
  const buttons = Array.from(elements.sceneTabs.querySelectorAll(".scene-tab"));
  const activeButton = buttons.find((button) => button.dataset.scene === sceneName);
  if (activeButton) {
    setActiveButton(buttons, activeButton);
  }
}

function planeEntryToRenderable(entry) {
  const center = vectorFromArray(entry.center);
  const axisU = vectorFromArray(entry.axis_u ?? entry.axisU);
  const axisV = vectorFromArray(entry.axis_v ?? entry.axisV);
  let normal = vectorFromArray(entry.normal);

  if (!center || !axisU || !axisV) {
    return null;
  }

  axisU.normalize();
  axisV.normalize();
  if (!normal || normal.lengthSq() < 1e-8) {
    normal = new THREE.Vector3().crossVectors(axisU, axisV);
  }
  normal.normalize();

  const width = Number(entry.width ?? entry.side_length ?? entry.plane_side_length ?? 1);
  const height = Number(entry.height ?? entry.side_length ?? entry.plane_side_length ?? width);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { center, axisU, axisV, normal, width, height };
}

function buildPlaneVisualization(planePayload) {
  clearGroup(planeGroup);

  const planeEntries = Array.isArray(planePayload?.planes) ? planePayload.planes : [];
  const color = METHOD_COLORS[state.activeMethod] || 0x7ab6ff;

  planeEntries.forEach((entry) => {
    const plane = planeEntryToRenderable(entry);
    if (!plane) {
      return;
    }

    const geometry = new THREE.PlaneGeometry(plane.width, plane.height);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: state.planeOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const basis = new THREE.Matrix4().makeBasis(plane.axisU, plane.axisV, plane.normal);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(plane.center);
    planeGroup.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: 0xf7f7f7,
        transparent: true,
        opacity: Math.min(state.planeOpacity + 0.45, 0.95),
      })
    );
    edges.quaternion.copy(mesh.quaternion);
    edges.position.copy(mesh.position);
    planeGroup.add(edges);
  });
}

function showPointCloud(geometry) {
  clearGroup(pointCloudGroup);

  const instanceGeometry = geometry.clone();
  instanceGeometry.boundingBox = geometry.boundingBox?.clone() || null;
  instanceGeometry.boundingSphere = geometry.boundingSphere?.clone() || null;

  const hasColors = instanceGeometry.hasAttribute("color");
  const material = new THREE.PointsMaterial({
    size: state.pointSize,
    color: hasColors ? undefined : 0xeaeef4,
    vertexColors: hasColors,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(instanceGeometry, material);
  pointCloudGroup.add(points);

  instanceGeometry.computeBoundingBox();
  state.bbox = instanceGeometry.boundingBox?.clone() || null;
  if (state.bbox) {
    const size = new THREE.Vector3();
    state.bbox.getSize(size);
    const gridScale = Math.max(size.length() * 0.75, 2);
    grid.scale.setScalar(gridScale / 10);
    fitCameraToBox(state.bbox);
  }
}

function loadPly(url) {
  return new Promise((resolve, reject) => {
    plyLoader.load(url, resolve, undefined, reject);
  });
}

function testImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function getPointCloud(url) {
  if (!pointCloudCache.has(url)) {
    pointCloudCache.set(url, loadPly(url));
  }
  return pointCloudCache.get(url);
}

async function getPlanePayload(url) {
  if (!planeCache.has(url)) {
    planeCache.set(url, fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load ${url}`);
      }
      return response.json();
    }));
  }
  return planeCache.get(url);
}

async function getSceneImageUrl(sceneEntry) {
  const manifestImage = sceneEntry.image || sceneEntry.input_image || sceneEntry.inputImage || null;
  const pointcloudPath = sceneEntry.pointcloud || "";
  const sceneRoot = pointcloudPath.endsWith("/pointcloud.ply")
    ? pointcloudPath.slice(0, -"/pointcloud.ply".length)
    : pointcloudPath.replace(/\/[^/]+$/, "");

  const candidates = manifestImage
    ? [manifestImage]
    : [`${sceneRoot}/image.png`];

  const cacheKey = manifestImage || sceneRoot;
  if (!imageCache.has(cacheKey)) {
    imageCache.set(cacheKey, (async () => {
      for (const candidate of candidates) {
        const match = await testImage(candidate);
        if (match) {
          return match;
        }
      }
      return null;
    })());
  }

  return imageCache.get(cacheKey);
}

function applyTuningDefaults(planePayload) {
  const tuning = planePayload?.tuning || {};
  if (Number.isFinite(Number(tuning.point_size))) {
    setPointSizeUI(Number(tuning.point_size));
  }
  if (Number.isFinite(Number(tuning.plane_opacity))) {
    setPlaneOpacityUI(Number(tuning.plane_opacity));
  }
}

async function loadScene(sceneName, requestedMethod = null) {
  const sceneEntry = state.manifest?.scenes?.[sceneName];
  if (!sceneEntry) {
    showOverlay("Missing Scene", `Scene '${sceneName}' is not in static/data/scenes.json.`, "error");
    return;
  }

  const availableVariants = Array.isArray(sceneEntry.variants) ? sceneEntry.variants : [];
  if (requestedMethod && availableVariants.includes(requestedMethod)) {
    state.activeMethod = requestedMethod;
  } else if (!availableVariants.includes(state.activeMethod)) {
    state.activeMethod = availableVariants[0] || "";
  }

  const previousScene = state.activeScene;
  const preserveView = previousScene === sceneName && !!previousScene && pointCloudGroup.children.length > 0;

  updateMethodButtons(availableVariants);
  state.activeScene = sceneName;
  setLabels();
  setActiveSceneTab(sceneName);

  const loadToken = ++state.loadToken;
  showOverlay("Loading Viewer", `Loading ${getSceneDisplayName(sceneName)} (${METHOD_LABELS[state.activeMethod] || "variant"})...`);

  const pointcloudPath = sceneEntry.pointcloud;
  const planePath = `${sceneEntry.plane_dir}/${state.activeMethod}.json`;

  try {
    const requests = [getPlanePayload(planePath), getSceneImageUrl(sceneEntry)];
    if (!preserveView) {
      requests.unshift(getPointCloud(pointcloudPath));
    }

    const results = await Promise.all(requests);

    if (loadToken !== state.loadToken) {
      return;
    }

    const imageUrl = results[results.length - 1];
    const planePayload = results[results.length - 2];
    applyTuningDefaults(planePayload);

    if (!preserveView) {
      const geometry = results[0];
      showPointCloud(geometry);
    }

    if (imageUrl) {
      showInputImage(imageUrl);
    } else {
      showImageOverlay("Input Image", "No image found for this scene.");
    }

    buildPlaneVisualization(planePayload);
    updatePointMaterialSize();
    updatePlaneOpacity();
    hideOverlay();
    setLabels();
  } catch (error) {
    if (loadToken !== state.loadToken) {
      return;
    }
    clearGroup(pointCloudGroup);
    clearGroup(planeGroup);
    showImageOverlay("Input Image", "Could not load image for this scene.");
    showOverlay("Viewer Error", error.message, "error");
  }
}

async function loadManifest() {
  showOverlay("Waiting For Data", "Load exported scenes into static/data/scenes and refresh.");

  try {
    const response = await fetch("./static/data/scenes.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load static/data/scenes.json.");
    }

    state.manifest = await response.json();
    const sceneNames = Object.keys(state.manifest?.scenes || {});
    if (!sceneNames.length) {
      showOverlay("No Scenes Found", "scenes.json loaded, but it does not contain any scenes.", "error");
      return;
    }

    renderSceneTabs();
    await loadScene(sceneNames[0]);
  } catch (error) {
    showOverlay("Missing Data", `${error.message} Export from plane-roll-tuner into this site first.`, "error");
  }
}

function bindEvents() {
  if (elements.burger && elements.menu) {
    elements.burger.addEventListener("click", () => {
      elements.burger.classList.toggle("is-active");
      elements.menu.classList.toggle("is-active");
    });
  }

  elements.methodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled || !state.activeScene) {
        return;
      }
      state.activeMethod = button.dataset.method;
      loadScene(state.activeScene, state.activeMethod);
    });
  });

  elements.pointSize.addEventListener("input", () => {
    state.pointSize = sliderToPointSize(elements.pointSize.value);
    updateSliderLabels();
    updatePointMaterialSize();
  });

  elements.planeOpacity.addEventListener("input", () => {
    state.planeOpacity = sliderToOpacity(elements.planeOpacity.value);
    updateSliderLabels();
    updatePlaneOpacity();
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

bindEvents();
updateSliderLabels();
showOverlay("Loading Viewer", "Initializing...");
window.addEventListener("error", (event) => {
  showOverlay("Viewer Error", event.message, "error");
});
animate();
loadManifest();
