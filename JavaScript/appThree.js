import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let cena, camara, renderer;
let pizza; 

document.addEventListener('DOMContentLoaded', Start);

function Start() {
    // 1. Cena e Câmara 
    cena = new THREE.Scene();
    cena.background = new THREE.Color(0x050505);

    camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camara.position.set(0, 5, 10);

    // 2. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 3. Luzes 
    const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.6);
    cena.add(luzAmbiente);

    const luzPonto = new THREE.PointLight(0xff0000, 1, 100);
    luzPonto.position.set(0, 5, 0);
    cena.add(luzPonto);

    // 4. Carregar o Mapa GLB
    const loader = new GLTFLoader();
    //loader.load('./Models/fnaf_pizzeria.glb', function(gltf) {
    //    cena.add(gltf.scene);
    //});

    // 5. CHAMADA DA FUNÇÃO DO OBJETO COMPLEXO
    pizza = criarFatiaPizza();
    pizza.position.set(0, 1, 0);
    cena.add(pizza);

    window.addEventListener('resize', onWindowResize);
    loop();
}

/*
 * Construção de objeto complexo com primitivas 
 * Aqui usamos um Grupo para juntar várias mmesh
 */


function criarFatiaPizza() {
    const grupoPizza = new THREE.Group();

    // 1. A MASSA (Base) - Triângulo
    const geoMassa = new THREE.CylinderGeometry(1, 1, 0.2, 3);
    const matMassa = new THREE.MeshStandardMaterial({ 
        color: 0xcc9966, 
        roughness: 0.9 
    }); 
    const massa = new THREE.Mesh(geoMassa, matMassa);
    grupoPizza.add(massa);

    // 2. A CÔDEA (Borda arredondada atrás)
    const geoBorda = new THREE.TorusGeometry(0.85, 0.12, 12, 12, Math.PI / 1.5);
    const matBorda = new THREE.MeshStandardMaterial({ 
        color: 0x8b4513,
        roughness: 0.8 
    });
    const borda = new THREE.Mesh(geoBorda, matBorda);
    borda.rotation.x = Math.PI / 2;
    borda.rotation.z = Math.PI / 0.88; 
    borda.position.set(0, 0.1, -0.4); 
    grupoPizza.add(borda);

    // 3. O QUEIJO 
    const geoQueijo = new THREE.CylinderGeometry(0.92, 0.92, 0.1, 3);
    const matQueijo = new THREE.MeshStandardMaterial({ 
        color: 0xffcc33, 
        roughness: 0.3,
        metalness: 0.1 
    });
    const queijo = new THREE.Mesh(geoQueijo, matQueijo);
    queijo.position.y = 0.08; 
    grupoPizza.add(queijo);

    // 3.1 GOTAS DE QUEIJO 
    const geoGota = new THREE.SphereGeometry(0.08, 8, 8);
    const posGotas = [
        {x: 0.4, y: 0, z: 0.5},
        {x: -0.3, y: -0.1, z: 0.6},
        {x: 0, y: -0.15, z: 0.9}
    ];

    posGotas.forEach(p => {
        const gota = new THREE.Mesh(geoGota, matQueijo);
        gota.position.set(p.x, p.y, p.z);
        gota.scale.set(0.6, 1.5, 0.6); // Esticar para parecer que escorre
        grupoPizza.add(gota);
    });

    // 4. PEPPERONIS 
    const geoPep = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8);
    const matPep = new THREE.MeshStandardMaterial({ 
        color: 0xad2a1a, 
        roughness: 0.5 
    });

    const posicoesPep = [
        {x: 0.3, z: 0.1, r: 0.5}, 
        {x: -0.2, z: 0.4, r: 1.2}, 
        {x: -0.1, z: -0.3, r: 0}, 
        {x: 0.4, z: -0.4, r: 2.1}
    ];

    posicoesPep.forEach(pos => {
        const p = new THREE.Mesh(geoPep, matPep);
        p.position.set(pos.x, 0.14, pos.z);
        p.rotation.y = pos.r; 
        grupoPizza.add(p);
    });

    // 5. AZEITONAS
    const geoAzeitona = new THREE.TorusGeometry(0.06, 0.03, 10, 20);
    const matAzeitona = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        roughness: 0.2 
    });
    
    const azPos = [{x: -0.4, z: -0.1}, {x: 0.1, z: 0.2}];
    azPos.forEach(pos => {
        const az = new THREE.Mesh(geoAzeitona, matAzeitona);
        az.rotation.x = Math.PI / 2;
        az.position.set(pos.x, 0.14, pos.z);
        grupoPizza.add(az);
    });

    return grupoPizza;
}

function loop() {
    requestAnimationFrame(loop);
    
    // Animação simples para mostrar que é um objeto 3D
    if (pizza) {
        pizza.rotation.y += 0.01;
    }

    renderer.render(cena, camara);
}

function onWindowResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}