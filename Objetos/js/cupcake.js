import * as THREE from 'three';
import { OrbitControls } from 'OrbitControls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// cupcake fica na mesma posição que no cenário principal
const POS = new THREE.Vector3(5, 7.1, 3);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 10, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.target.set(POS.x, POS.y + 0.5, POS.z);
controls.minDistance = 1;
controls.maxDistance = 40;

// luzes iguais ao cenário principal
scene.add(new THREE.AmbientLight(0x111111, 1.8));

const lanterna = new THREE.SpotLight(0xffffff, 220);
lanterna.angle = 0.5;
lanterna.penumbra = 0.8;
lanterna.decay = 2;
lanterna.distance = 150;
lanterna.position.set(POS.x, POS.y + 4, POS.z + 4);
lanterna.target.position.copy(POS);
scene.add(lanterna);
scene.add(lanterna.target);

// carregar sala do restaurante como fundo
const loader = new GLTFLoader();
loader.load('../Models/scene.glb', (gltf) => scene.add(gltf.scene));

// textura do invólucro (canelado castanho)
function makeWrapperTex() {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5c2208';
    ctx.fillRect(0, 0, 512, 256);
    const ridges = 18;
    const rw = 512 / ridges;
    for (let i = 0; i < ridges; i++) {
        const cx = i * rw + rw / 2;
        const g = ctx.createRadialGradient(cx, 160, 4, cx, 128, rw * 0.52);
        g.addColorStop(0,    'rgba(195, 95, 35, 0.95)');
        g.addColorStop(0.45, 'rgba(150, 62, 18, 0.65)');
        g.addColorStop(1,    'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(i * rw, 0, rw, 256);
        const gt = ctx.createRadialGradient(cx, 10, 2, cx, 10, rw * 0.42);
        gt.addColorStop(0, 'rgba(220, 115, 45, 0.85)');
        gt.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gt;
        ctx.fillRect(i * rw, 0, rw, 60);
        const gs = ctx.createLinearGradient(i * rw, 0, i * rw + 9, 0);
        gs.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        gs.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gs;
        ctx.fillRect(i * rw, 0, 10, 256);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
}

// textura da vela (chevrons amarelo/branco)
function makeCandleTex() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f2edd5';
    ctx.fillRect(0, 0, 64, 256);
    const sh = 30;
    ctx.fillStyle = '#c9a500';
    for (let row = -1; row < Math.ceil(256 / sh) + 1; row++) {
        const y0 = row * sh;
        ctx.beginPath();
        ctx.moveTo(0,    y0 + sh * 0.45);
        ctx.lineTo(32,   y0);
        ctx.lineTo(64,   y0 + sh * 0.45);
        ctx.lineTo(64,   y0 + sh);
        ctx.lineTo(32,   y0 + sh * 0.55);
        ctx.lineTo(0,    y0 + sh);
        ctx.closePath();
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// objeto complexo — cupcake de Chica
// primitivas: CylinderGeometry, SphereGeometry, BoxGeometry, ConeGeometry
function criarCupcake() {
    const grupo = new THREE.Group();

    const matWrapper  = new THREE.MeshStandardMaterial({ map: makeWrapperTex(), roughness: 0.88 });
    const matFrost    = new THREE.MeshStandardMaterial({ color: 0xcc1055, roughness: 0.6, metalness: 0.03 });
    const matEyeRing  = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.85 });
    const matSclera   = new THREE.MeshStandardMaterial({ color: 0xf0e8d5, roughness: 0.4 });
    const matIris     = new THREE.MeshStandardMaterial({ color: 0x904800, roughness: 0.35 });
    const matPupil    = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 });
    const matHL       = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
    const matMouth    = new THREE.MeshStandardMaterial({ color: 0x0d0005, roughness: 0.95 });
    const matTeeth    = new THREE.MeshStandardMaterial({ color: 0xe8e4d0, roughness: 0.5 });
    const matVela     = new THREE.MeshStandardMaterial({ map: makeCandleTex(), roughness: 0.85 });
    const matWick     = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1.0 });
    const matWax      = new THREE.MeshStandardMaterial({ color: 0xf0e8c8, roughness: 0.9 });
    const matFlameOut = new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0xff5500, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    const matFlameIn  = new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 3, transparent: true, opacity: 0.85 });

    // invólucro — CylinderGeometry (cone truncado)
    const wrapper = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.78, 1.1, 32), matWrapper);
    wrapper.position.y = 0.55;
    grupo.add(wrapper);

    // anel de transição — CylinderGeometry
    const frostRing = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.06, 0.12, 32), matFrost);
    frostRing.position.y = 1.15;
    grupo.add(frostRing);

    // cúpula de cobertura — SphereGeometry (metade superior)
    const frostDome = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
        matFrost
    );
    frostDome.position.y = 1.12;
    grupo.add(frostDome);

    // olhos — SphereGeometry ×5 por olho (anel, sclera, íris, pupila, highlight)
    function criarOlho(xOff) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.305, 24, 24), matEyeRing));
        const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.255, 24, 24), matSclera);
        sclera.position.z = 0.09; g.add(sclera);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 20), matIris);
        iris.position.z = 0.22; g.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), matPupil);
        pupil.position.z = 0.30; g.add(pupil);
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), matHL);
        hl.position.set(0.055, 0.055, 0.33); g.add(hl);
        g.scale.set(1, 0.88, 1);
        g.position.set(xOff, 1.72, 0.78);
        return g;
    }
    grupo.add(criarOlho(-0.38));
    grupo.add(criarOlho(0.38));

    // boca — BoxGeometry
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.06), matMouth);
    mouth.position.set(0, 1.36, 1.06);
    grupo.add(mouth);

    // dentes — BoxGeometry ×3
    for (let i = -1; i <= 1; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.07), matTeeth);
        tooth.position.set(i * 0.148, 1.33, 1.08);
        grupo.add(tooth);
    }

    // vela — CylinderGeometry
    const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.92, 16), matVela);
    vela.position.set(0, 2.38, 0);
    grupo.add(vela);

    // topo de cera — CylinderGeometry
    const velaTopo = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.095, 0.05, 16), matWax);
    velaTopo.position.set(0, 2.88, 0);
    grupo.add(velaTopo);

    // pavio — CylinderGeometry
    const pavio = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), matWick);
    pavio.position.set(0, 3.0, 0);
    grupo.add(pavio);

    // chama exterior — SphereGeometry
    const chamaExt = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 12), matFlameOut);
    chamaExt.position.set(0, 3.12, 0);
    grupo.add(chamaExt);

    // chama interior (ponta) — ConeGeometry
    const chamaInt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 12), matFlameIn);
    chamaInt.position.set(0, 3.22, 0);
    grupo.add(chamaInt);

    // luz da chama (dentro do grupo, segue a escala e posição)
    const flameLight = new THREE.PointLight(0xff8800, 1.5, 5);
    flameLight.position.set(0, 3.5, 0);
    grupo.add(flameLight);

    return { grupo, chamaExt, chamaInt, flameLight };
}

const { grupo: cupcake, chamaExt, chamaInt, flameLight } = criarCupcake();
cupcake.scale.setScalar(0.28);
cupcake.position.copy(POS);
scene.add(cupcake);

// loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    controls.update();

    // flickering da chama
    const flk = 0.92 + Math.sin(t * 19.3) * 0.08 + Math.sin(t * 37.1) * 0.04;
    chamaExt.scale.setScalar(flk);
    chamaInt.scale.set(flk, 0.94 + Math.sin(t * 24) * 0.06, flk);
    flameLight.intensity = 1.2 + Math.sin(t * 16) * 0.3 + (Math.random() - 0.5) * 0.15;

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
