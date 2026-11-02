import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('aphrodite-canvas');
if (!canvas) throw new Error('Missing #aphrodite-canvas');

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.45;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0, 8.6);
camera.lookAt(0, 0, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environmentIntensity = 0.6;

const hemi = new THREE.HemisphereLight(0x1a0308, 0x0d0004, 0.3);
scene.add(hemi);
const key = new THREE.DirectionalLight(0x3d1520, 1.2);
key.position.set(-4, 6, 7);
scene.add(key);
const rim = new THREE.DirectionalLight(0x1a1025, 0.8);
rim.position.set(5, 1, -4);
scene.add(rim);

const bustGroup = new THREE.Group();
scene.add(bustGroup);

const dracoLoader = new DRACOLoader();
/* The glTF-targeted decoder three ships, one quarter smaller than the generic
   one. Its paths derive from the addon's own CDN URL, so there is no three
   version to keep in sync here. */
dracoLoader.setDecoderPath(DRACO_GLTF_CONFIG);
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

try {
    try {
        const hdr = await new RGBELoader()
            .loadAsync('/wooden_studio_09_1k.hdr');
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment =
            pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
    } catch (e) {
        console.warn(
            'HDR environment unavailable, using fallback.', e
        );
        scene.environment =
            pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }

    const { scene: model } = await gltfLoader
        .loadAsync('/aphrodite-bust.glb');
    model.scale.setScalar(0.5);

    /* Centre the model on its bounding box so it rotates
       around its own geometric midpoint. */
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    /* Darken the material to sit in the page's palette and
       make sure the frozen material picks up our environment. */
    model.traverse(obj => {
        if (obj.isMesh && obj.material) {
            obj.material.envMapIntensity = 0.5;
        }
    });

    bustGroup.add(model);
    dracoLoader.dispose();
} catch (error) {
    console.error('Could not load the Aphrodite model:', error);
}

/* ── drag-to-rotate on the fixed Y axis ────────────────── */

const ROTATE_SPEED = 0.0004;
const DRAG_SENSITIVITY = 0.008;
const BOB_AMPLITUDE = 0.040;
const BOB_SPEED = 0.0015;

let dragging = false;
let pointerX = 0;
let autoTimeOffset = 0;   // keeps auto-rotation seamless

canvas.style.cursor = 'grab';
canvas.style.touchAction = 'pan-y';

canvas.addEventListener('pointerdown', e => {
    dragging = true;
    pointerX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - pointerX;
    pointerX = e.clientX;
    bustGroup.rotation.y += dx * DRAG_SENSITIVITY;
});

function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    if (e && e.pointerId && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
    }
    /* Sync offset so auto-rotation resumes from the current
       angle without jumping. */
    autoTimeOffset =
        bustGroup.rotation.y / ROTATE_SPEED - performance.now();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ── resize ─────────────────────────────────────────────── */

const BASE_FOV = 32;

function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;

    const winWidth = window.innerWidth;
    let camZ = 8.6;
    if (winWidth <= 480) {
        camZ = 5.8;
    } else if (winWidth <= 760) {
        camZ = 4.8;
    } else if (winWidth <= 1080) {
        /* Proportionally scale down for tablets / narrower viewports
           (e.g. iPad Mini 820x1180 portrait) so the bust fits cleanly
           within the 50vw canvas width without clipping. */
        const widthProgress = (winWidth - 760) / (1080 - 760);
        const interpolatedZ = 12.8 - widthProgress * 4.2;
        const aspectGuardZ = 4.4 / (w / h);
        camZ = Math.max(interpolatedZ, aspectGuardZ);
    }
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}
resize();
addEventListener('resize', resize);
if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
}

/* ── render loop ────────────────────────────────────────── */

renderer.setAnimationLoop(time => {
    bustGroup.position.y = Math.sin(time * BOB_SPEED) * BOB_AMPLITUDE;
    if (!dragging) {
        bustGroup.rotation.y =
            (time + autoTimeOffset) * ROTATE_SPEED;
    }
    renderer.render(scene, camera);
});
