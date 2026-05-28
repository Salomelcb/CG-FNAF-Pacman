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

// pizza fica na mesma posição que no cenário principal
const POS = new THREE.Vector3(2, 7.1, 8.5);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(2, 10, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.target.set(POS.x, POS.y + 0.3, POS.z);
controls.minDistance = 1;
controls.maxDistance = 40;

// luzes iguais ao cenário principal
scene.add(new THREE.AmbientLight(0x111111, 1.8));

const lanterna = new THREE.SpotLight(0xffffff, 220);
lanterna.angle = 0.5;
lanterna.penumbra = 0.8;
lanterna.decay = 2;
lanterna.distance = 150;
lanterna.position.set(POS.x, POS.y + 5, POS.z + 3);
lanterna.target.position.copy(POS);
scene.add(lanterna);
scene.add(lanterna.target);

// carregar sala do restaurante como fundo
const loader = new GLTFLoader();
loader.load('../Models/scene.glb', (gltf) => scene.add(gltf.scene));

function criarPizza() {
    const grupo = new THREE.Group();

    const matMassa    = new THREE.MeshStandardMaterial({ color: 0xd4882a, roughness: 0.85 });
    const matCrosta   = new THREE.MeshStandardMaterial({ color: 0xb8621a, roughness: 0.9 });
    const matMolho    = new THREE.MeshStandardMaterial({ color: 0xc41a0f, roughness: 0.7 });
    const matQueijo   = new THREE.MeshStandardMaterial({ color: 0xf2c840, roughness: 0.55, emissive: 0x221500, emissiveIntensity: 0.2 });
    const matPepper   = new THREE.MeshStandardMaterial({ color: 0x7a1208, roughness: 0.75 });
    const matPimento  = new THREE.MeshStandardMaterial({ color: 0x2a7a18, roughness: 0.8 });

    // massa
    const massa = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.82, 0.2, 48), matMassa);
    massa.position.y = 0.1;
    grupo.add(massa);

    // crosta em volta
    const crosta = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.17, 14, 64), matCrosta);
    crosta.rotation.x = Math.PI / 2;
    crosta.position.y = 0.2;
    grupo.add(crosta);

    const molho = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.05, 48), matMolho);
    molho.position.y = 0.225;
    grupo.add(molho);

    const queijo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 48), matQueijo);
    queijo.position.y = 0.27;
    grupo.add(queijo);

    // pepperoni espalhados
    const pepGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.04, 20);
    [
        [ 0.0,   0.0 ], [ 0.72,  0.22], [-0.68,  0.30],
        [ 0.18,  0.78], [-0.28, -0.68],
        [ 0.78, -0.48], [-0.78, -0.22], [ 0.45, -0.72]
    ].forEach(([x, z]) => {
        const pep = new THREE.Mesh(pepGeo, matPepper);
        pep.position.set(x, 0.3, z);
        grupo.add(pep);
    });

    // tiras de pimento
    const pimentoGeo = new THREE.BoxGeometry(0.1, 0.04, 0.42);
    [[0.35, 0.15], [-0.45, -0.28], [0.6, -0.38]].forEach(([x, z], i) => {
        const strip = new THREE.Mesh(pimentoGeo, matPimento);
        strip.position.set(x, 0.3, z);
        strip.rotation.y = i * 1.3;
        grupo.add(strip);
    });

    return { grupo };
}

const { grupo: pizza } = criarPizza();
pizza.scale.setScalar(0.22);
pizza.position.copy(POS);
scene.add(pizza);

// loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
