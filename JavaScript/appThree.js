import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let cena, camara, renderer, lanterna, alvoLanterna;

let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let botoes = [];

let btnStart, btnOptions, btnExit;
let parede1, parede2;

document.addEventListener('DOMContentLoaded', Start);

function Start() {

    cena = new THREE.Scene();
    cena.background = new THREE.Color(0x000000);

    camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camara.position.set(-18.36, 7.75, 0.13);
    camara.lookAt(0, 5, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    document.body.appendChild(renderer.domElement);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const luzAmbiente = new THREE.AmbientLight(0x404040, 0.6);
    cena.add(luzAmbiente);

    lanterna = new THREE.SpotLight(0xffffff, 250); 
    lanterna.angle = 0.6;
    lanterna.penumbra = 0.8;
    lanterna.decay = 2;
    lanterna.distance = 150;

    alvoLanterna = new THREE.Object3D();
    cena.add(alvoLanterna);
    lanterna.target = alvoLanterna;

    cena.add(lanterna);

    const loader = new GLTFLoader();

    loader.load('./Models/scene.glb', function (gltf) {

        const modelo = gltf.scene;
        cena.add(modelo);

        parede1 = modelo.getObjectByName("mesh_1");
        parede2 = modelo.getObjectByName("mesh_3");

        const geoPupila = new THREE.SphereGeometry(0.12, 16, 16);

        const matPupila = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true
        });

        const pupilaE = new THREE.Mesh(geoPupila, matPupila);
        const pupilaD = new THREE.Mesh(geoPupila, matPupila);

        pupilaE.renderOrder = 999;
        pupilaD.renderOrder = 999;

        // POSIÇÕES
        pupilaE.position.set(17.30, 12.70, 12.20);
        pupilaD.position.set(16.45, 12.60, 12.90);

        cena.add(pupilaE);
        cena.add(pupilaD);

        console.log("👀 Eyes locked!");

        // BOTÕES
        criarBotoes();

        console.log("Mapa + tudo carregado!");
    });

    // EVENTOS
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    loop();
}

function criarBotoes() {

    const textureLoader = new THREE.TextureLoader();

    function criarBotao(texturePath, parent, x, y) {

        const textura = textureLoader.load(texturePath);

        textura.minFilter = THREE.LinearFilter;
        textura.magFilter = THREE.LinearFilter;
        textura.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const material = new THREE.MeshStandardMaterial({
            map: textura,
            transparent: true,
            emissive: 0xffffff,
            emissiveMap: textura,
            emissiveIntensity: 2
        });

        const geometry = new THREE.PlaneGeometry(3.5, 1.5);
        const botao = new THREE.Mesh(geometry, material);

        parent.add(botao);

        botao.position.set(x, y, 1.2);
        botao.rotation.y = Math.PI;

        return botao;
    }

    btnPACMAN  = criarBotao('Textures/pacman.png', parede1, 0, 3);
    btnStart   = criarBotao('Textures/comecar.png', parede1, 0, 1);
    btnOptions = criarBotao('Textures/opcoes.png', parede1, 0, -1);
    btnExit    = criarBotao('Textures/sair.png', parede1, 0, -3);

    botoes.push(btnStart, btnOptions, btnExit, btnPACMAN);
}

// 
function onClick(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camara);

    const intersects = raycaster.intersectObjects(botoes, true);

    if (intersects.length > 0) {

        const objeto = intersects[0].object;

        if (objeto === btnStart) console.log("COMEÇAR JOGO");
        if (objeto === btnOptions) console.log("OPÇÕES");
        if (objeto === btnExit) console.log("SAIR");
    }
}


function onMouseMove(event) {

    let x = (event.clientX / window.innerWidth) * 2 - 1;
    let y = -(event.clientY / window.innerHeight) * 2 + 1;

    let vetor = new THREE.Vector3(x, y, 0.5);
    vetor.unproject(camara);

    let direcao = vetor.sub(camara.position).normalize();

    let alvo = camara.position.clone().add(direcao.multiplyScalar(20));
    alvoLanterna.position.copy(alvo);
}


function loop() {
    requestAnimationFrame(loop);

    if (lanterna) {
        lanterna.position.copy(camara.position);
    }

    renderer.render(cena, camara);
}


function onWindowResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}