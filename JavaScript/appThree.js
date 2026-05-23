import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { criarMenuNeon } from './menu.js';
import { criarTelaDificuldade } from './dificuldade.js';
import { criarObjetosComplexos } from './objetos.js';
import { iniciarJogo } from './jogo.js';
import { tocar, parar } from './audio.js';
import { criarPaineis, mostrarOpcoes, estaOverlayAberto } from './opcoes.js';

let cena, camara, renderer, lanterna, alvoLanterna;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let hoveredBtn = null;
let alvoCameraSmooth = new THREE.Vector3(0, 5, 0);
let alvoCameraAlvo   = new THREE.Vector3(0, 5, 0);
const CAM_BASE       = new THREE.Vector3(-18.36, 7.75, 0.13);
const CAM_DUTO_ALVO  = new THREE.Vector3(-3, 5.8, 0.1);
const CAM_SAIDA_ALVO = new THREE.Vector3(4, 4.5, 0.1); // destino da animacao de saida

let estadoAtual = 'menu'; // 'menu' | 'entrar_duto' | 'dificuldade' | 'sair_duto' | 'jogo'
let loopAtivo = true;
let progressoEntrada = 0;
let progressoSaida   = 0;
let tempoAnterior = null;
let fadeOverlay = null;

// áudio
let _audioIniciado       = false;
let _passosJogoIniciados = false;
let _passosDutoIniciados = false;
let _prevHoveredBtn      = null;

let btnStart, btnOptions, btnExit;
let botoesClicaveis = [];
let spritesPacman   = [];
let telaDificuldade, iniciarRuidoDuto;
let objetosCena = {};

// inspecao de objetos
let emInspecao = false;
let objetoEmInspecao = null; // 'cupcake' | 'golden'
let emAberturaInsp = false;
let progressoAbertura = 0;
let emFechandoInsp = false;
let progressoFechamento = 0;
const cupcakePosOriginal  = new THREE.Vector3();
const CUPCAKE_SCALE_SHELF = 0.65;
const CUPCAKE_SCALE_INSP  = 0.30;
const goldenPosOriginal   = new THREE.Vector3();
const GOLDEN_SCALE_SHELF  = 0.35;
const GOLDEN_SCALE_INSP   = 0.18;

let rendererInsp = null;
let cenaInsp     = null;
let camaraInsp   = null;
let inspecaoOverlay = null;
let inspecaoTitulo  = null;

document.addEventListener('DOMContentLoaded', Start);

// renderer separado para a inspecao
function initInspRenderer() {
    rendererInsp = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererInsp.setSize(window.innerWidth, window.innerHeight);
    rendererInsp.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererInsp.toneMapping = THREE.ReinhardToneMapping;
    rendererInsp.toneMappingExposure = 1.5;
    rendererInsp.outputColorSpace = THREE.SRGBColorSpace;
    rendererInsp.setClearColor(0x000000, 0);

    Object.assign(rendererInsp.domElement.style, {
        position: 'fixed', top: '0', left: '0',
        zIndex: '5', display: 'none', opacity: '0',
        transition: 'opacity 0.55s ease',
        pointerEvents: 'auto',
        border: 'none', outline: 'none',
        background: 'transparent'
    });
    document.body.appendChild(rendererInsp.domElement);

    cenaInsp = new THREE.Scene();
    cenaInsp.add(new THREE.AmbientLight(0x1a1008, 1.2));

    // luz principal
    const spot = new THREE.SpotLight(0xfff4e0, 70);
    spot.angle    = 0.55;
    spot.penumbra = 0.5;
    spot.decay    = 1.4;
    spot.distance = 18;
    spot.position.set(0.6, 4.5, 2.8);
    spot.target.position.set(0, 0.3, 0);
    cenaInsp.add(spot);
    cenaInsp.add(spot.target);

    // luz lateral
    const fill = new THREE.PointLight(0x3b1020, 14, 5);
    fill.position.set(-2.5, 1, 1.5);
    cenaInsp.add(fill);

    camaraInsp = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 100);
    camaraInsp.position.set(0, 0.55, 3.4);
    camaraInsp.lookAt(0, 0.15, 0);

    // fechar ao clicar fora
    rendererInsp.domElement.addEventListener('click', (e) => {
        if (!emInspecao) return;
        const mx = (e.clientX / window.innerWidth)  * 2 - 1;
        const my = -(e.clientY / window.innerHeight) * 2 + 1;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(mx, my), camaraInsp);
        const alvo = objetoEmInspecao === 'golden'
            ? objetosCena.golden?.grupo
            : objetosCena.cupcake?.grupo;
        if (!alvo || ray.intersectObjects([alvo], true).length === 0)
            fecharInspecao();
        e.stopPropagation();
    });
}

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.transition = 'filter 0.6s ease';
    document.body.appendChild(renderer.domElement);

    cena.add(new THREE.AmbientLight(0x111111, 1.8));

    lanterna = new THREE.SpotLight(0xffffff, 250);
    lanterna.angle = 0.6; lanterna.penumbra = 0.8;
    lanterna.decay = 2;   lanterna.distance  = 150;
    alvoLanterna = new THREE.Object3D();
    cena.add(alvoLanterna);
    lanterna.target = alvoLanterna;
    cena.add(lanterna);

    const loader = new GLTFLoader();
    loader.load('./Models/scene.glb', (gltf) => {
        cena.add(gltf.scene);

        const geoPupila = new THREE.SphereGeometry(0.12, 16, 16);
        const matPupila = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
        [[17.30, 12.70, 12.20], [16.45, 12.60, 12.90]].forEach(([x, y, z]) => {
            const p = new THREE.Mesh(geoPupila, matPupila);
            p.renderOrder = 999;
            p.position.set(x, y, z);
            cena.add(p);
        });

        const menu = criarMenuNeon(cena);
        btnStart        = menu.btnStart;
        btnOptions      = menu.btnOptions;
        btnExit         = menu.btnExit;
        botoesClicaveis = menu.botoesClicaveis;
        spritesPacman   = menu.spritesPacman;

        objetosCena = criarObjetosComplexos(cena);
    });

    fadeOverlay = document.createElement('div');
    fadeOverlay.id = 'fnaf-overlay';
    Object.assign(fadeOverlay.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100%', height: '100%',
        background: 'black', opacity: '0',
        pointerEvents: 'none', zIndex: '10'
    });
    document.body.appendChild(fadeOverlay);

    inspecaoOverlay = document.getElementById('inspecao-overlay');
    inspecaoTitulo  = document.getElementById('inspecao-titulo');

    criarPaineis();
    initInspRenderer();

    const dif        = criarTelaDificuldade((_nivel) => {
        // direto para o loading — sem animacao intermédia
        loopAtivo = false;
        fadeOverlay.style.transition = 'none';
        fadeOverlay.style.opacity    = '0';
        parar('menuTema');
        iniciarJogo(renderer);
    });
    telaDificuldade  = dif.telaDificuldade;
    iniciarRuidoDuto = dif.iniciarRuidoDuto;

    window.addEventListener('resize',    onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click',     onClick);

    // inicia áudio quando o utilizador fecha o splash (garante autoplay desbloqueado)
    window.addEventListener('splash-dismissed', _onPrimeiraInteracao, { once: true });
    // fallback: qualquer outra interação também desbloqueia
    ['mousedown', 'keydown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, _onPrimeiraInteracao));

    loop();
}

function onMouseMove(event) {
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    if (emInspecao) return;

    const vetor = new THREE.Vector3(mouse.x, mouse.y, 0.5).unproject(camara);
    const dir   = vetor.sub(camara.position).normalize();
    alvoLanterna.position.copy(camara.position.clone().add(dir.multiplyScalar(20)));

    raycaster.setFromCamera(mouse, camara);

    if (hoveredBtn) {
        if (hoveredBtn.userData.luz) hoveredBtn.userData.luz.intensity = hoveredBtn.userData.intensidadeBase;
        hoveredBtn = null;
        document.body.style.cursor = 'default';
    }

    const intersects = raycaster.intersectObjects(botoesClicaveis, true);
    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData.clicavel) {
            hoveredBtn = obj;
            if (obj.userData.luz) obj.userData.luz.intensity = obj.userData.intensidadeBase * 2.5;
            document.body.style.cursor = 'pointer';
            obj.material.opacity = 0.85 + Math.random() * 0.15;
        }
    }

    _prevHoveredBtn = hoveredBtn;

    if (estadoAtual === 'menu') {
        const alvos = [];
        if (objetosCena.cupcake) alvos.push(objetosCena.cupcake.grupo);
        if (objetosCena.golden)  alvos.push(objetosCena.golden.grupo);
        if (alvos.length > 0 && raycaster.intersectObjects(alvos, true).length > 0)
            document.body.style.cursor = 'pointer';
    }
}

function _iniciarAudio() {
    if (_audioIniciado) return;
    _audioIniciado = true;
    tocar('coracao');
    tocar('luzFlicker');
    tocar('menuTema');
}

function _onPrimeiraInteracao() {
    _iniciarAudio();
    ['mousedown', 'keydown', 'touchstart'].forEach(ev =>
        document.removeEventListener(ev, _onPrimeiraInteracao));
}

function onClick(event) {
    if (estaOverlayAberto()) return;
    if (emInspecao) return;
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camara);

    if (estadoAtual === 'menu') {
        if (objetosCena.golden) {
            const hits = raycaster.intersectObjects([objetosCena.golden.grupo], true);
            if (hits.length > 0) { abrirInspecao('golden'); return; }
        }
        if (objetosCena.cupcake) {
            const hits = raycaster.intersectObjects([objetosCena.cupcake.grupo], true);
            if (hits.length > 0) { abrirInspecao('cupcake'); return; }
        }
    }

    const intersects = raycaster.intersectObjects(botoesClicaveis, true);
    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj === btnStart)   { tocar('clickBotao'); iniciarEntradaDuto(); }
        if (obj === btnOptions) { tocar('clickBotao'); mostrarOpcoes(); }
        if (obj === btnExit)    { tocar('clickBotao'); sairJogo(); }
    }
}

function sairJogo() {
    if (estadoAtual !== 'menu') return;
    estadoAtual = 'saindo';

    // fade a preto
    fadeOverlay.style.transition = 'opacity 1.4s ease';
    fadeOverlay.style.opacity = '1';
    fadeOverlay.style.pointerEvents = 'auto';

    // mensagem de despedida estilo FNAF
    const msg = document.createElement('div');
    Object.assign(msg.style, {
        position: 'fixed', inset: '0', zIndex: '20',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Courier New', monospace",
        color: '#cc1010', opacity: '0',
        transition: 'opacity 0.9s ease',
        pointerEvents: 'none', textAlign: 'center', gap: '18px'
    });
    msg.innerHTML = `
        <div style="font-size:clamp(0.85em,1.4vw,1em);letter-spacing:8px;color:#661010">FREDDY FAZBEAR'S PIZZA</div>
        <div style="font-size:clamp(1.6em,3vw,2.4em);letter-spacing:10px;text-shadow:0 0 18px #cc0000,0 0 40px #660000">THANK YOU FOR PLAYING</div>
        <div style="font-size:clamp(0.75em,1.2vw,0.9em);letter-spacing:5px;color:#772222;margin-top:6px">HOPE TO SEE YOU AGAIN...</div>
    `;
    document.body.appendChild(msg);

    setTimeout(() => { msg.style.opacity = '1'; }, 700);

    setTimeout(() => {
        window.close();
        // fallback caso window.close() seja bloqueado pelo browser
        msg.innerHTML += `<div style="font-size:clamp(0.65em,1vw,0.78em);letter-spacing:4px;color:#441111;margin-top:20px">[ podes fechar esta janela ]</div>`;
    }, 3000);
}

function abrirInspecao(tipo = 'cupcake') {
    if (emInspecao || estadoAtual !== 'menu') return;
    if (tipo === 'cupcake' && !objetosCena.cupcake) return;
    if (tipo === 'golden'  && !objetosCena.golden)  return;

    emInspecao = true;
    objetoEmInspecao = tipo;

    let grupo, tituloHtml;
    if (tipo === 'cupcake') {
        grupo = objetosCena.cupcake.grupo;
        cupcakePosOriginal.copy(grupo.position);
        camaraInsp.position.set(0, 0.55, 3.4);
        camaraInsp.lookAt(0, 0.15, 0);
        tituloHtml = `<span style="font-size:0.6em;font-weight:400;color:#dddddd;letter-spacing:0.03em;">O companheiro inseparável de Chica</span><br><span style="font-size:0.45em;font-weight:300;color:#999999;letter-spacing:0.02em;">clica fora para fechar</span>`;
    } else {
        grupo = objetosCena.golden.grupo;
        goldenPosOriginal.copy(grupo.position);
        camaraInsp.position.set(0, 0.3, 5.0);
        camaraInsp.lookAt(0, 0.3, 0);
        tituloHtml = `<span style="font-size:0.6em;font-weight:400;color:#dddddd;letter-spacing:0.03em;">Golden Freddy</span><br><span style="font-size:0.45em;font-weight:300;color:#999999;letter-spacing:0.02em;">clica fora para fechar</span>`;
    }

    cena.remove(grupo);
    grupo.position.set(0, -0.4, 0);
    grupo.scale.setScalar(0.08);
    grupo.rotation.set(0, 0, 0);
    cenaInsp.add(grupo);
    emAberturaInsp = true;
    progressoAbertura = 0;

    renderer.domElement.style.filter = 'blur(9px) brightness(0.25)';
    rendererInsp.domElement.style.display = 'block';
    requestAnimationFrame(() => { rendererInsp.domElement.style.opacity = '1'; });

    inspecaoOverlay.style.display = 'flex';
    inspecaoTitulo.innerHTML = tituloHtml;
    inspecaoTitulo.style.transition = 'none';
    inspecaoTitulo.style.opacity    = '0';
    setTimeout(() => {
        inspecaoTitulo.style.transition = 'opacity 0.5s';
        inspecaoTitulo.style.opacity    = '1';
    }, 650);

    botoesClicaveis.forEach(b => { b.userData.clicavel = false; });
    document.body.style.cursor = 'default';
}

function fecharInspecao() {
    if (!emInspecao || emFechandoInsp) return;

    emFechandoInsp = true;
    progressoFechamento = 0;
    emAberturaInsp = false;

    renderer.domElement.style.filter = 'blur(0px) brightness(1)';
    inspecaoTitulo.style.transition  = 'opacity 0.25s';
    inspecaoTitulo.style.opacity     = '0';
}

function loop() {
    if (!loopAtivo) return;
    requestAnimationFrame(loop);
    if (lanterna) lanterna.position.copy(camara.position);

    const tempo = Date.now() * 0.001;
    if (tempoAnterior === null) tempoAnterior = tempo;
    const delta = Math.min(tempo - tempoAnterior, 0.1);
    tempoAnterior = tempo;

    // animacoes continuas
    if (objetosCena.ventoinha) objetosCena.ventoinha.pas.rotation.z += delta * 2.5;

    if (objetosCena.camSeg) {
        objetosCena.camSeg.forEach((cam, i) => {
            cam.grupo.rotation.y = cam.baseRotY + Math.sin(tempo * 0.25 + i * 1.6) * 0.35;
            cam.luzLed.intensity = Math.floor(tempo * 2 + i * 1.3) % 3 === 0 ? 0 : 0.3;
        });
    }

    if (objetosCena.cupcake) {
        const { chamaExt, chamaInt, flameLight } = objetosCena.cupcake;
        const flk = 0.92 + Math.sin(tempo * 19.3) * 0.08 + Math.sin(tempo * 37.1) * 0.04;
        chamaExt.scale.setScalar(flk);
        chamaInt.scale.set(flk, 0.94 + Math.sin(tempo * 24) * 0.06, flk);
        const baseInt = 1.2 + Math.sin(tempo * 16) * 0.3 + (Math.random() - 0.5) * 0.15;
        flameLight.intensity = objetoEmInspecao === 'cupcake' ? baseInt * 14 : baseInt;
        flameLight.distance  = objetoEmInspecao === 'cupcake' ? 18 : 3;
    }

    if (objetosCena.golden) {
        const { eyeGlowMeshes, eyeGlowLights } = objetosCena.golden;
        const pulse = 0.5 + 0.5 * Math.sin(tempo * 2.0);
        eyeGlowMeshes.forEach(m  => { m.material.emissiveIntensity = 0.5 + pulse * 1.2; });
        eyeGlowLights.forEach(pl => { pl.intensity = 0.4 + pulse * 1.0; });
    }

    if (emInspecao) {
        const isGolden  = objetoEmInspecao === 'golden';
        const grupo     = isGolden ? objetosCena.golden?.grupo  : objetosCena.cupcake?.grupo;
        const scaleInsp = isGolden ? GOLDEN_SCALE_INSP          : CUPCAKE_SCALE_INSP;

        if (grupo) {
            if (emFechandoInsp) {
                progressoFechamento = Math.min(1, progressoFechamento + delta * 2.0);
                const inv   = 1 - progressoFechamento;
                const eased = 1 - Math.pow(1 - inv, 3);
                grupo.position.y = -1.2 + eased * 1.1;
                grupo.scale.setScalar(eased * scaleInsp);
                if (progressoFechamento >= 1) {
                    rendererInsp.domElement.style.transition = 'opacity 0.3s ease';
                    rendererInsp.domElement.style.opacity = '0';
                    emFechandoInsp = false;
                    emInspecao = false;
                    if (!isGolden && objetosCena.cupcake?.flameLight)
                        objetosCena.cupcake.flameLight.distance = 3;
                    const posOrig    = isGolden ? goldenPosOriginal.clone() : cupcakePosOriginal.clone();
                    const scaleShelf = isGolden ? GOLDEN_SCALE_SHELF : CUPCAKE_SCALE_SHELF;
                    objetoEmInspecao = null;
                    setTimeout(() => {
                        cenaInsp.remove(grupo);
                        grupo.position.copy(posOrig);
                        grupo.scale.setScalar(scaleShelf);
                        grupo.rotation.set(0, 0, 0);
                        cena.add(grupo);
                        rendererInsp.domElement.style.display = 'none';
                        inspecaoOverlay.style.display = 'none';
                        botoesClicaveis.forEach(b => { b.userData.clicavel = true; });
                    }, 320);
                }
            } else if (emAberturaInsp) {
                progressoAbertura = Math.min(1, progressoAbertura + delta * 1.7);
                const t = 1 - Math.pow(1 - progressoAbertura, 3);
                grupo.position.y = -1.2 + t * 1.1;
                grupo.scale.setScalar(t * scaleInsp);
                if (progressoAbertura >= 1) emAberturaInsp = false;
            } else {
                grupo.rotation.y += delta * 1.4;
            }
        }
        rendererInsp.render(cenaInsp, camaraInsp);
    }

    // animacao reversa: saida do duto com luzes a piscar
    if (estadoAtual === 'sair_duto') {
        progressoSaida += delta / 2.4;
        progressoSaida = Math.min(progressoSaida, 1);

        const t = 1 - Math.pow(1 - progressoSaida, 2);
        camara.position.lerpVectors(CAM_DUTO_ALVO, CAM_SAIDA_ALVO, t);
        camara.lookAt(0, 4, 0);

        // luzes do duto a piscar durante toda a animacao
        const flick = Math.sin(progressoSaida * 45) * Math.sin(progressoSaida * 23 + 1.1);
        if (lanterna) lanterna.intensity = flick > 0 ? 180 + flick * 80 : 20;

        // fade a preto na ultima parte
        if (progressoSaida > 0.65) {
            fadeOverlay.style.opacity = ((progressoSaida - 0.65) / 0.35).toFixed(3);
        }

        if (progressoSaida >= 1) {
            loopAtivo = false;
            parar('menuTema');
            iniciarJogo(renderer);
        }

        renderer.render(cena, camara);
        return;
    }

    if (estadoAtual === 'entrar_duto') {
        progressoEntrada += delta / 2.6;
        progressoEntrada = Math.min(progressoEntrada, 1);
        const t = progressoEntrada * progressoEntrada;

        camara.position.lerpVectors(CAM_BASE, CAM_DUTO_ALVO, t);
        camara.lookAt(0, 5 - t * 1.5, 0);

        if (lanterna && Math.random() > 0.5 + (1 - progressoEntrada) * 0.4)
            lanterna.intensity = Math.random() > 0.5 ? 250 * (1 - t * 0.9) : 0;

        if (progressoEntrada > 0.55)
            fadeOverlay.style.opacity = ((progressoEntrada - 0.55) / 0.45).toFixed(3);

        // passos normais no início/meio da animação
        if (!_passosJogoIniciados && progressoEntrada > 0.02) {
            _passosJogoIniciados = true;
            tocar('passosJogo');
        }
        // passos de duto no final (quando já não se vê nada)
        if (!_passosDutoIniciados && progressoEntrada > 0.72) {
            _passosDutoIniciados = true;
            parar('passosJogo');
            tocar('passosDuto');
        }

        if (progressoEntrada >= 1) {
            estadoAtual = 'dificuldade';
            if (lanterna) lanterna.intensity = 0;
            telaDificuldade.style.display = 'flex';
            iniciarRuidoDuto();
            setTimeout(() => {
                fadeOverlay.style.transition = 'opacity 1.2s ease';
                fadeOverlay.style.opacity = '0';
            }, 120);
        }

        renderer.render(cena, camara);
        return;
    }

    botoesClicaveis.forEach(btn => {
        if (!btn.userData.luz) return;
        if (btn === hoveredBtn) {
            const pulso = 0.7 + Math.sin(tempo * 10) * 0.3;
            btn.material.opacity = pulso;
            btn.userData.luz.intensity = btn.userData.intensidadeBase * 3 * pulso;
        } else {
            if      (Math.random() > 0.985) { btn.material.opacity = 0.1 + Math.random() * 0.3; btn.userData.luz.intensity = 0; }
            else if (Math.random() > 0.992) { btn.material.opacity = 0.9; btn.userData.luz.intensity = btn.userData.intensidadeBase * 1.5; }
            else {
                const r = 0.75 + Math.sin(tempo * 1.2 + btn.position.z) * 0.1;
                btn.material.opacity = r;
                btn.userData.luz.intensity += (btn.userData.intensidadeBase - btn.userData.luz.intensity) * 0.05;
            }
        }
    });

    const dirLant = new THREE.Vector3().subVectors(alvoLanterna.position, camara.position).normalize();
    botoesClicaveis.forEach(btn => {
        if (btn === hoveredBtn) return;
        const d = dirLant.dot(new THREE.Vector3().subVectors(btn.position, camara.position).normalize());
        btn.material.opacity = Math.min(btn.material.opacity, 0.3 + Math.max(0, d) * 0.65 + 0.15);
    });

    spritesPacman.forEach(sp => {
        if      (Math.random() > 0.988) { sp.material.opacity = 0.05 + Math.random() * 0.2; if (sp.userData.luz) sp.userData.luz.intensity = 0; }
        else if (Math.random() > 0.993) { sp.material.opacity = 1.0; if (sp.userData.luz) sp.userData.luz.intensity = sp.userData.intensidadeBase * 2; }
        else {
            sp.material.opacity = 0.85 + Math.sin(tempo * 0.8 + sp.position.z) * 0.1;
            if (sp.userData.luz) sp.userData.luz.intensity += (sp.userData.intensidadeBase - sp.userData.luz.intensity) * 0.05;
        }
        const d = dirLant.dot(new THREE.Vector3().subVectors(sp.position, camara.position).normalize());
        sp.material.opacity = Math.min(sp.material.opacity, 0.2 + Math.max(0, d) * 0.8 + 0.1);
    });

    camara.position.set(
        CAM_BASE.x + Math.sin(tempo * 0.31) * 0.02,
        CAM_BASE.y + Math.sin(tempo * 0.47) * 0.025,
        CAM_BASE.z + Math.sin(tempo * 0.23) * 0.015
    );
    alvoCameraAlvo.set(0, 5 + mouse.y * 0.6, mouse.x * 1.2);
    alvoCameraSmooth.lerp(alvoCameraAlvo, 0.03);
    camara.lookAt(alvoCameraSmooth);

    renderer.render(cena, camara);
}

function onWindowResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (rendererInsp) {
        rendererInsp.setSize(window.innerWidth, window.innerHeight);
        camaraInsp.aspect = window.innerWidth / window.innerHeight;
        camaraInsp.updateProjectionMatrix();
    }
}

function iniciarEntradaDuto() {
    if (estadoAtual !== 'menu') return;
    estadoAtual = 'entrar_duto';
    progressoEntrada = 0;
    botoesClicaveis.forEach(b => { b.userData.clicavel = false; });
    _passosJogoIniciados = false;
    _passosDutoIniciados = false;
}
