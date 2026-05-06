import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let cena, camara, renderer, lanterna, alvoLanterna;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let btnStart, btnOptions, btnExit;
let botoesClicaveis = [];
let spritesPacman = [];
let hoveredBtn = null;
let parede1;
let alvoCameraSmooth = new THREE.Vector3(0, 5, 0);
let alvoCameraAlvo   = new THREE.Vector3(0, 5, 0);
const CAM_BASE = new THREE.Vector3(-18.36, 7.75, 0.13);

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
    renderer.toneMappingExposure = 1.1;
    document.body.appendChild(renderer.domElement);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const luzAmbiente = new THREE.AmbientLight(0x111111, 1.8);
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

        const geoPupila = new THREE.SphereGeometry(0.12, 16, 16);
        const matPupila = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
        const pupilaE = new THREE.Mesh(geoPupila, matPupila);
        const pupilaD = new THREE.Mesh(geoPupila, matPupila);
        pupilaE.renderOrder = 999;
        pupilaD.renderOrder = 999;
        pupilaE.position.set(17.30, 12.70, 12.20);
        pupilaD.position.set(16.45, 12.60, 12.90);
        cena.add(pupilaE);
        cena.add(pupilaD);

        criarMenuNeon();
    });

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
    loop();
}

// ─── GERADOR DE TEXTURA HORROR ───────────────────────────────────────────────

function hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function gerarTexturaHorror(lines, corBase, corGlow, corInner, W, H, fs) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const glowHex  = '#' + corGlow.toString(16).padStart(6,'0');
    const innerHex = '#' + corInner.toString(16).padStart(6,'0');
    const lineH = H / lines.length;

    lines.forEach((txt, li) => {
        const cy = lineH * li + lineH / 2;
        const font = `700 ${fs}px Impact, Arial Black, sans-serif`;

        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // glow largo exterior — espalha muito
        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = 80;
        ctx.shadowColor = glowHex;
        ctx.fillStyle = glowHex;
        ctx.fillText(txt, W/2, cy);

        ctx.globalAlpha = 0.7;
        ctx.shadowBlur = 40;
        ctx.fillText(txt, W/2, cy);

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // fill interior — cor mais clara/quente no centro
        ctx.fillStyle = innerHex;
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowHex;
        ctx.fillText(txt, W/2, cy);
        ctx.shadowBlur = 0;

        // stroke da cor principal por cima
        ctx.strokeStyle = glowHex;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.shadowColor = glowHex;
        ctx.strokeText(txt, W/2, cy);
        ctx.shadowBlur = 0;
    });

    return cv;
}

function criarSprite(canvas, posicao, scaleX, scaleY, clicavel, corLuz, intensidadeLuz) {
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true , sizeAttenuation: true, });
    const sprite = new THREE.Sprite(material);

    sprite.position.set(posicao.x, posicao.y, posicao.z);
    sprite.scale.set(scaleX, scaleY, 1);
    cena.add(sprite);

    if (corLuz) {
        const luz = new THREE.PointLight(corLuz, intensidadeLuz, 6);
        luz.position.set(posicao.x, posicao.y, posicao.z);
        cena.add(luz);
        sprite.userData.luz = luz;
        sprite.userData.intensidadeBase = intensidadeLuz;
    }

    sprite.userData.clicavel = clicavel;
    return sprite;
}

// ─── CRIAR MENU ──────────────────────────────────────────────────────────────

function criarMenuNeon() {

    // PACMAN — roxo escuro, interior roxo médio
    const cvPacman = gerarTexturaHorror(['PACMAN'], 0, 0x7700cc, 0xaa44ff, 700, 150, 118);
    const spPacman = criarSprite(cvPacman, { x: 4, y: 16, z: 7.5 }, 8, 1.6, false, 0x4400aa, 0.5);
    spritesPacman.push(spPacman);

    const cvSub = gerarTexturaHorror(["Five Nights at Freddy's"], 0, 0x5500aa, 0x8833dd, 700, 75, 46);
    const spSub = criarSprite(cvSub, { x: 1.5, y: 14, z: 6.7 }, 10, 1.2, false, null, 0);
    spritesPacman.push(spSub);

    // COMEÇAR JOGO — vermelho escuro, interior laranja quente como na referência
    const cvStart = gerarTexturaHorror(['COMECAR', 'JOGO'], 0, 0xcc0000, 0xff4400, 512, 220, 84);
    btnStart = criarSprite(cvStart, { x: 2, y: 9, z: -0.7 }, 5.5, 2.0, true, 0x880000, 1.5);
    botoesClicaveis.push(btnStart);

    // OPÇÕES — âmbar escuro exterior, interior dourado brilhante
    const cvOpcoes = gerarTexturaHorror(['OPCOES'], 0, 0xaa6600, 0xffcc00, 700, 150, 88);
    btnOptions = criarSprite(cvOpcoes, { x: 2, y: 10.5, z: 12 }, 5.5, 1.3, true, 0xaa6600, 0.8);
    botoesClicaveis.push(btnOptions);

    // SAIR — verde vibrante, interior verde saturado
    const cvSair = gerarTexturaHorror(['SAIR'], 0, 0x00cc00, 0x66ff44, 700, 150, 96);
    btnExit    = criarSprite(cvSair,   { x: 2, y: 8.5, z: 12 }, 5.5, 1.3, true, 0x00aa00, 0.8);
    botoesClicaveis.push(btnExit);
}

// ─── EVENTOS ─────────────────────────────────────────────────────────────────

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    let vetor = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vetor.unproject(camara);
    let direcao = vetor.sub(camara.position).normalize();
    alvoLanterna.position.copy(camara.position.clone().add(direcao.multiplyScalar(20)));

    raycaster.setFromCamera(mouse, camara);
    const intersects = raycaster.intersectObjects(botoesClicaveis, true);

    if (hoveredBtn) {
        if (hoveredBtn.userData.luz) hoveredBtn.userData.luz.intensity = hoveredBtn.userData.intensidadeBase;
        hoveredBtn = null;
        document.body.style.cursor = 'default';
    }

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData.clicavel) {
            hoveredBtn = obj;
            if (obj.userData.luz) obj.userData.luz.intensity = obj.userData.intensidadeBase * 2.5;
            document.body.style.cursor = 'pointer';
            obj.material.opacity = 0.85 + Math.random() * 0.15;
        }
    }
}

function onClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camara);
    const intersects = raycaster.intersectObjects(botoesClicaveis, true);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj === btnStart)   console.log("COMEÇAR JOGO");
        if (obj === btnOptions) console.log("OPÇÕES");
        if (obj === btnExit)    console.log("SAIR");
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (lanterna) lanterna.position.copy(camara.position);

    const tempo = Date.now() * 0.001;

    botoesClicaveis.forEach(btn => {
        if (!btn.userData.luz) return;

        if (btn === hoveredBtn) {
            // hover — pulsar rápido e intenso
            const pulso = 0.7 + Math.sin(tempo * 10) * 0.3;
            btn.material.opacity = pulso;
            btn.userData.luz.intensity = btn.userData.intensidadeBase * 3 * pulso;
        } else {
            // idle — flickering aleatório ocasional
            if (Math.random() > 0.985) {
                // flash súbito — apaga e acende
                btn.material.opacity = 0.1 + Math.random() * 0.3;
                btn.userData.luz.intensity = 0;
            } else if (Math.random() > 0.992) {
                // flicker duplo rápido
                btn.material.opacity = 0.9;
                btn.userData.luz.intensity = btn.userData.intensidadeBase * 1.5;
            } else {
                // estado normal — leve respiração
                const respiracao = 0.75 + Math.sin(tempo * 1.2 + btn.position.z) * 0.1;
                btn.material.opacity = respiracao;
                btn.userData.luz.intensity += (btn.userData.intensidadeBase - btn.userData.luz.intensity) * 0.05;
            }
        }
    });

    // escurecer quando lanterna não aponta
    const direcaoLanterna = new THREE.Vector3();
    direcaoLanterna.subVectors(alvoLanterna.position, camara.position).normalize();

    botoesClicaveis.forEach(btn => {
        if (btn === hoveredBtn) return;
        const dirBtn = new THREE.Vector3();
        dirBtn.subVectors(btn.position, camara.position).normalize();
        const dot = direcaoLanterna.dot(dirBtn);
        const base = 0.3 + Math.max(0, dot) * 0.65;
        btn.material.opacity = Math.min(btn.material.opacity, base + 0.15);
    });

    // flickering + fade com lanterna para título PACMAN
    spritesPacman.forEach(sp => {
        if (Math.random() > 0.988) {
            sp.material.opacity = 0.05 + Math.random() * 0.2;
            if (sp.userData.luz) sp.userData.luz.intensity = 0;
        } else if (Math.random() > 0.993) {
            sp.material.opacity = 1.0;
            if (sp.userData.luz) sp.userData.luz.intensity = sp.userData.intensidadeBase * 2;
        } else {
            const respiracao = 0.85 + Math.sin(tempo * 0.8 + sp.position.z) * 0.1;
            sp.material.opacity = respiracao;
            if (sp.userData.luz) {
                sp.userData.luz.intensity += (sp.userData.intensidadeBase - sp.userData.luz.intensity) * 0.05;
            }
        }

        // cap pela lanterna
        const dirSp = new THREE.Vector3();
        dirSp.subVectors(sp.position, camara.position).normalize();
        const dot = direcaoLanterna.dot(dirSp);
        const fadeLanterna = 0.2 + Math.max(0, dot) * 0.8;
        sp.material.opacity = Math.min(sp.material.opacity, fadeLanterna + 0.1);
    });

    // balanço idle na posição da câmara (respiração)
    camara.position.set(
        CAM_BASE.x + Math.sin(tempo * 0.31) * 0.02,
        CAM_BASE.y + Math.sin(tempo * 0.47) * 0.025,
        CAM_BASE.z + Math.sin(tempo * 0.23) * 0.015
    );

    // tilt suave da câmara com o rato
    alvoCameraAlvo.set(0, 5 + mouse.y * 0.6, mouse.x * 1.2);
    alvoCameraSmooth.lerp(alvoCameraAlvo, 0.03);
    camara.lookAt(alvoCameraSmooth);

    renderer.render(cena, camara);
}

function onWindowResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}