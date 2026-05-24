import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tocar, parar, estaATocando, setCoracaoFactor, atualizarPhoneguyDistancia } from './audio.js';
import { mostrarPausa, esconderPausa, estaPausado, configurarCallbacks } from './opcoes.js';

const loader = new GLTFLoader();
const clock  = new THREE.Clock();
const keys   = {};

const MOVE_SPEED = 4.5;
const EYE_HEIGHT = 3.9;

let cenaJogo, camaraJogo;
let luzAmbiente = null;
let lanterna     = null;

let playerPos   = new THREE.Vector3(0, 0, 0);
let playerAngle = 0;
let targetAngle = 0;

// colisao — zonas caminhaveis carregadas do chaopaandar.glb
let mapaBBs = [];
const _pBox = new THREE.Box3();
let zonasCaminhaveis = [];

// efeito acordar
let acordarProgresso = 0;
let acordando        = true;

let tokens          = [];
let tokensApanhados = 0;
let totalTokens     = 0;
let elapsedTime     = 0;

let canvasMapa = null, ctxMapa = null;
let luzesFlicker = [];

// ─── INIMIGOS ──────────────────────────────────────────────────────
let inimigos = [];
// { nome, modelo, mixer, clipIdle, clipAndar, clipJumpscare,
//   acaoAtual, spawnPos, velocidade, ativo, emMovimento }

// posicoes de spawn (Y preenchido depois de saber o floor)
const SPAWN_FREDDY = new THREE.Vector3( 0.0, 0, -36);
const SPAWN_BONNIE = new THREE.Vector3(-4.0, 0, -36);
const SPAWN_CHICA  = new THREE.Vector3( 4.0, 0, -36);
const SPAWN_FOXY   = new THREE.Vector3(-9.0, 0, -26);

// ─── ESTADO DO JOGO ────────────────────────────────────────────────
const TOKENS_FOXY   = 10;
let mensagemInicioAtiva = false;
const OFFICE_XZ = new THREE.Vector2(0, 2); // posicao XZ do escritorio (spawn do jogador) // tokens para o Foxy sair da cove
let tempoJogo       = 0;
let jogoIniciado    = false;
const alertas       = { freddy: false, bonnie: false, chica: false, foxy: false };

// intro camera (sair do duto para o escritorio)
let introCamera             = false;
let introReady              = false; // so avanca quando o loading acabar
let introProgress           = 0;
let _introPassosIniciados   = false;
const introStart  = new THREE.Vector3();
const introEnd    = new THREE.Vector3();

// mouse para a lanterna
let mouseOffX = 0, mouseOffY = 0; // offset suave do pescoco
let smoothX   = 0, smoothY   = 0;
let rawMX     = 0, rawMY     = 0; // coordenadas -1..1 para unproject
let luzAlvo   = null;

export function iniciarJogo(renderer) {
    window.addEventListener('mousemove', e => {
        // -1 a 1 normalizado, Y invertido (topo do ecra = olhar para cima)
        rawMX     =  (e.clientX / window.innerWidth)  * 2 - 1;
        rawMY     = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseOffX = rawMX * 0.34;
        mouseOffY = rawMY * 0.26;
    });

    configurarCallbacks(
        () => { /* retomar — esconderPausa já foi chamado pelo botão */ },
        () => { window.location.reload(); },
        () => { _mostrarTelaSair(); }
    );

    document.addEventListener('keydown', e => {
        if (e.code === 'Escape') {
            if (!estaPausado() && jogoIniciado) {
                tocar('clickBotao');
                mostrarPausa();
            }
            return;
        }
        keys[e.code] = true;
        if (e.code === 'KeyA') targetAngle += Math.PI / 2;
        if (e.code === 'KeyD') targetAngle -= Math.PI / 2;
        if (e.code === 'ArrowLeft')  targetAngle += Math.PI / 2;
        if (e.code === 'ArrowRight') targetAngle -= Math.PI / 2;
        e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    cenaJogo = new THREE.Scene();
    cenaJogo.background = new THREE.Color(0x111111);

    camaraJogo = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 60);

    renderer.toneMapping         = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled   = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    luzAmbiente = new THREE.AmbientLight(0xffeedd, 0);
    cenaJogo.add(luzAmbiente);

    // lanterna presa à camara — segue o mouse
    lanterna = new THREE.SpotLight(0xfff5dd, 60);
    lanterna.angle    = 0.44;
    lanterna.penumbra = 0.75;
    lanterna.decay    = 1.8;
    lanterna.distance = 24;
    luzAlvo = new THREE.Object3D();
    camaraJogo.add(lanterna);
    cenaJogo.add(luzAlvo);
    lanterna.target = luzAlvo;
    cenaJogo.add(camaraJogo);

    // loading screen
    const loadDiv = criarLoadingScreen();

    loader.load('./Models/mapa1.glb',
    gltf => {
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
                m.emissive          = new THREE.Color(0x060404);
                m.emissiveIntensity = 0.30;
                m.needsUpdate       = true;
            });
            const bb   = new THREE.Box3().setFromObject(o);
            const bbSz = bb.getSize(new THREE.Vector3());
            if (bbSz.y > 1.2 && bbSz.x < 25 && bbSz.z < 25) {
                mapaBBs.push(bb);
            }
        });

        cenaJogo.add(gltf.scene);

        const box    = new THREE.Box3().setFromObject(gltf.scene);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // escritorio: X:0, Z:2 — virado para o computador (sul, angulo PI)
        playerPos.set(0.0, box.min.y, 2.0);
        playerAngle = Math.PI;
        targetAngle = Math.PI;

        mapaMin.copy(box.min);
        mapaMax.copy(box.max);

        // carrega spawn zones antes dos personagens
        carregarSpawnZones(box.min.y);

        // luzes do teto — mais estragadas, mais dramaticas
        const ceilY = box.max.y - 0.3;
        [
            [0,   2.0, false], [0,  -8.0, true ],  [5,  -10.0, true ],
            [-3, -12.0, true],  [2, -18.0, false],  [0,  -25.0, true ],
            [-5, -20.0, true],  [4,   -6.0, false], [0,  -15.0, true ],
            [6,  -18.0, false], [-4,  -8.0, true ],
        ].forEach(([lx, lz, estragada]) => {
            const luz = new THREE.PointLight(0xffeedd, 0, 16);
            luz.position.set(lx, ceilY, lz);
            cenaJogo.add(luz);
            luzesFlicker.push({ luz, fase: Math.random() * Math.PI * 2, estragada });
        });

        // pre-posicionar camara logo ao carregar — nao ha flash antes do intro
        introStart.set(playerPos.x, playerPos.y + EYE_HEIGHT * 0.6, playerPos.z + 0.8);
        introEnd.set(  playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
        camaraJogo.position.copy(introStart);
        introCamera   = true;
        introReady    = false; // animacao bloqueada ate o loading acabar
        introProgress = 0;

        loadDiv.style.transition = 'opacity 1.2s ease';
        loadDiv.style.opacity = '0';
        setTimeout(() => {
            loadDiv.remove();
            const ov = document.getElementById('fnaf-overlay');
            if (ov) { ov.style.transition = 'none'; ov.style.opacity = '0'; }
            // agora arranca o intro e o acordar
            introReady              = true;
            _introPassosIniciados   = false;
            acordando               = true;
            acordarProgresso        = 0;
            tocar('passosDuto');
            setTimeout(() => parar('passosDuto'), 1600);
        }, 1400);
    },
    xhr => {
        if (xhr.total) {
            const b = document.getElementById('ldBar');
            if (b) b.style.width = (xhr.loaded / xhr.total * 100).toFixed(0) + '%';
        }
    },
    err => console.error(err)
    );

    // carregar zonas caminhaveis — tokens criados após as zonas estarem prontas
    loader.load('./Models/chaopaandar.glb', gltf => {
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            o.visible = false;
            const bb = new THREE.Box3().setFromObject(o);
            bb.expandByScalar(0.08); // cobre micro-gaps entre planes adjacentes
            zonasCaminhaveis.push(bb);
        });
        criarTokens();
    });
    criarMinimapa();
    criarHUD();

    window.addEventListener('resize', () => {
        camaraJogo.aspect = window.innerWidth / window.innerHeight;
        camaraJogo.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function loop() {
        requestAnimationFrame(loop);
        const delta = Math.min(clock.getDelta(), 0.05);
        elapsedTime += delta;

        if (acordando) {
            acordarProgresso = Math.min(1, acordarProgresso + delta * 0.65);
            const t = acordarProgresso;
            luzAmbiente.intensity = 0.03;
            if (t < 0.82) {
                // produto de senos — quando negativo a lanterna apaga (flash escuro)
                const flick = Math.sin(t * 20) * Math.sin(t * 11.3 + 1.1);
                lanterna.intensity = flick > 0 ? 55 + flick * 5 : 0;
            } else {
                const fade = (t - 0.82) / 0.18;
                lanterna.intensity = fade * 60;
            }
            if (acordarProgresso >= 1) {
                lanterna.intensity    = 60;
                luzAmbiente.intensity = 0.03;
                acordando = false;
            }
        }
        // luzes de cena sempre a actualizar
        atualizarLuzesFlicker(elapsedTime);

        // animacao de entrada — curta e suave (1.5s)
        if (introCamera) {
            if (introReady) introProgress = Math.min(1, introProgress + delta / 1.5);
            const ease = 1 - Math.pow(1 - introProgress, 2);
            camaraJogo.position.lerpVectors(introStart, introEnd, ease);
            camaraJogo.lookAt(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z - 6);
            // aponta lanterna para a frente durante o intro
            if (luzAlvo) {
                const _d = new THREE.Vector3();
                camaraJogo.getWorldDirection(_d);
                luzAlvo.position.copy(camaraJogo.position).addScaledVector(_d, 8);
            }
            if (introProgress > 0.45 && !_introPassosIniciados) {
                _introPassosIniciados = true;
                tocar('passosHeavy');
            }
            if (introProgress >= 1) {
                introCamera = false;
                parar('passosHeavy');
            }
        }

        // gestao do jogo — so depois do accordar e intro
        if (!acordando && !introCamera) {
            if (!jogoIniciado) {
                jogoIniciado = true;
                mostrarMensagemInicio();
            }
            tempoJogo += delta;
            // timers desativados enquanto ajustamos posicoes — mudar depois
            //if (tempoJogo > 30  && !alertas.freddy) ativarInimigo('freddy');
            //if (tempoJogo > 70  && !alertas.bonnie) ativarInimigo('bonnie');
            //if (tempoJogo > 110 && !alertas.chica)  ativarInimigo('chica');
            //if (tokensApanhados >= TOKENS_FOXY && !alertas.foxy) ativarInimigo('foxy');
        }

        if (!estaPausado()) {
            // mixers das animacoes — cancela root motion a todos os niveis
            inimigos.forEach(ini => {
                if (!ini.mixer) return;
                const { x, z } = ini.modelo.position;
                ini.mixer.update(delta);
                // cancela deslocamento horizontal do modelo
                ini.modelo.position.x = x;
                ini.modelo.position.z = z;
                // força Y ao spawnY (nunca afunda no chão)
                if (ini.spawnY !== undefined) ini.modelo.position.y = ini.spawnY;
                // cancela X/Z nos grupos de armature (causa principal de teletransporte)
                ini.armatureGrupos?.forEach(({ obj, initPos }) => {
                    obj.position.x = initPos.x;
                    obj.position.z = initPos.z;
                });
                // cancela X/Z nos root bones
                ini.rootBones?.forEach((b, i) => {
                    const ip = ini.rootBonesInitPos?.[i];
                    if (ip) { b.position.x = ip.x; b.position.z = ip.z; }
                });
            });
            atualizarMovimento(delta);
            atualizarInimigos(delta);
            atualizarCoracaoProximidade();
            atualizarPhoneguyDistancia(Math.hypot(playerPos.x - OFFICE_XZ.x, playerPos.z - OFFICE_XZ.y));
        }
        atualizarCamera();
        atualizarTokens();
        atualizarMinimapa();

        renderer.render(cenaJogo, camaraJogo);
    }
    loop();
}

// limites do mapa carregados apos o load
let mapaMin = new THREE.Vector3(-999,-999,-999);
let mapaMax = new THREE.Vector3( 999, 999, 999);

function colide(pos) {
    if (zonasCaminhaveis.length === 0) {
        // fallback enquanto o GLB ainda nao carregou
        const m = 0.5;
        return pos.x < mapaMin.x + m || pos.x > mapaMax.x - m ||
               pos.z < mapaMin.z + m || pos.z > mapaMax.z - m;
    }
    // verifica so X e Z — colide se nao estiver dentro de nenhuma zona
    const M = 0.15; // margem do corpo do jogador
    return !zonasCaminhaveis.some(bb =>
        pos.x >= bb.min.x + M && pos.x <= bb.max.x - M &&
        pos.z >= bb.min.z + M && pos.z <= bb.max.z - M
    );
}

function tentarMover(dir, step) {
    const futuro = playerPos.clone().addScaledVector(dir, step);
    if (!colide(futuro)) { playerPos.copy(futuro); return; }
    // wall slide: tenta so X depois so Z
    const fX = new THREE.Vector3(futuro.x, playerPos.y, playerPos.z);
    if (!colide(fX)) { playerPos.copy(fX); return; }
    const fZ = new THREE.Vector3(playerPos.x, playerPos.y, futuro.z);
    if (!colide(fZ)) { playerPos.copy(fZ); return; }
}

function atualizarMovimento(delta) {
    if (introCamera || acordando || mensagemInicioAtiva) return;
    let da = targetAngle - playerAngle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    playerAngle += da * Math.min(1, delta * 6);

    const dir    = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
    const aAndar = keys['KeyW'] || keys['ArrowUp'];
    if (aAndar) tentarMover(dir, MOVE_SPEED * delta);

    // passos só quando se anda
    if (aAndar && !estaATocando('passosHeavy')) tocar('passosHeavy');
    if (!aAndar && estaATocando('passosHeavy')) parar('passosHeavy');

    tokens = tokens.filter(t => {
        const wp = t.userData.worldPos;
        if (Math.hypot(playerPos.x - wp.x, playerPos.z - wp.z) < 1.4) {
            cenaJogo.remove(t);
            tokensApanhados++;
            tocar('token');
            return false;
        }
        return true;
    });
}

function atualizarCamera() {
    if (introCamera || acordando || mensagemInicioAtiva) return;
    camaraJogo.position.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);

    smoothX += (mouseOffX - smoothX) * 0.10;
    smoothY += (mouseOffY - smoothY) * 0.10;

    const fwdX = Math.sin(playerAngle), fwdZ = Math.cos(playerAngle);
    const rgtX = -Math.cos(playerAngle), rgtZ = Math.sin(playerAngle);

    // camara: pescoco suave com pequeno offset
    const dx = fwdX + rgtX * smoothX, dy = smoothY, dz = fwdZ + rgtZ * smoothX;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    camaraJogo.lookAt(
        camaraJogo.position.x + (dx/len) * 10,
        camaraJogo.position.y + (dy/len) * 10,
        camaraJogo.position.z + (dz/len) * 10
    );

    // lanterna: unproject exacto do mouse — igual ao menu
    const vec = new THREE.Vector3(rawMX, rawMY, 0.5).unproject(camaraJogo);
    const dir = vec.sub(camaraJogo.position).normalize();
    if (luzAlvo) luzAlvo.position.copy(camaraJogo.position).addScaledVector(dir, 20);
}

function atualizarLuzesFlicker(tempo) {
    luzesFlicker.forEach(item => {
        if (item.estragada) {
            // luz estragada: pisca irregularmente
            const n = Math.sin(tempo * 11.3 + item.fase) * Math.sin(tempo * 17.7 + item.fase * 1.3);
            item.luz.intensity = n > 0.2 ? 1.6 + n * 0.4 : (n > -0.1 ? 0.2 : 0);
        } else {
            // luz estavel com raros glitches
            const base = 1.1 + Math.sin(tempo * 1.2 + item.fase) * 0.08;
            const glitch = Math.random() > 0.996 ? -0.8 : 0;
            item.luz.intensity = Math.max(0, base + glitch);
        }
    });
}

function criarTokens() {
    // gera tokens automaticamente a partir das zonas caminhaveis
    // grelha centrada em cada zona, espaçamento minimo entre tokens
    const Y = 0.4;
    const SPACING  = 5.5;  // menos tokens por zona
    const MIN_DIST = 5.0;  // distancia minima entre tokens
    const posicoes = [];

    zonasCaminhaveis.forEach(bb => {
        const w  = bb.max.x - bb.min.x;
        const d  = bb.max.z - bb.min.z;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        if (w < 1.0 || d < 1.0) return;

        const cols = Math.max(1, Math.round(w / SPACING));
        const rows = Math.max(1, Math.round(d / SPACING));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols === 1 ? cx : cx + (c - (cols-1)/2) * SPACING;
                const z = rows === 1 ? cz : cz + (r - (rows-1)/2) * SPACING;
                if (x < bb.min.x + 0.4 || x > bb.max.x - 0.4) continue;
                if (z < bb.min.z + 0.4 || z > bb.max.z - 0.4) continue;
                const perto = posicoes.some(p => Math.hypot(x-p[0], z-p[2]) < MIN_DIST);
                if (!perto) posicoes.push([x, Y, z]);
            }
        }
    });

    totalTokens = posicoes.length;
    posicoes.forEach(([x, y, z]) => {
        const t = criarPizzaToken();
        t.position.set(x, y, z);
        t.userData.worldPos = new THREE.Vector3(x, y, z);
        cenaJogo.add(t);
        tokens.push(t);
    });
}

function criarPizzaToken() {
    // wrapper: roda em torno do eixo Y (efeito moeda a girar)
    const wrapper = new THREE.Group();

    // inner: a pizza em si, de pé e ligeiramente na diagonal
    const g = new THREE.Group();
    g.rotation.x = Math.PI / 2; // de pé
    g.rotation.y = 0.45;        // diagonal

    const matBase   = new THREE.MeshStandardMaterial({ color: 0xd4882a, roughness: 0.85 });
    const matCrosta = new THREE.MeshStandardMaterial({ color: 0xb8621a, roughness: 0.9  });
    const matMolho  = new THREE.MeshStandardMaterial({ color: 0xc41a0f, roughness: 0.7  });
    const matQueijo = new THREE.MeshStandardMaterial({ color: 0xf2c840, roughness: 0.4,
        emissive: 0x663300, emissiveIntensity: 0.9 });
    const matPepper = new THREE.MeshStandardMaterial({ color: 0x7a1208, roughness: 0.75 });

    const base   = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 20), matBase);
    const crosta = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 7, 20), matCrosta);
    const molho  = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 20), matMolho);
    const queijo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), matQueijo);
    crosta.rotation.x = Math.PI / 2; crosta.position.y = 0.02;
    molho.position.y = 0.04; queijo.position.y = 0.07;
    g.add(base); g.add(crosta); g.add(molho); g.add(queijo);
    const pepGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8);
    [[0.07, 0.03], [-0.06, 0.08], [0.02, -0.09]].forEach(([px, pz]) => {
        const pep = new THREE.Mesh(pepGeo, matPepper);
        pep.position.set(px, 0.09, pz); g.add(pep);
    });

    wrapper.add(g);
    return wrapper;
}

function atualizarTokens() {
    tokens.forEach((t, i) => {
        // wrapper gira em Y — pizza de pé a girar como moeda
        t.rotation.y += 0.028;
        // leve flutuacao vertical
        t.position.y = t.userData.worldPos.y + Math.sin(elapsedTime * 2.0 + i * 1.1) * 0.08;
    });
}

function criarLoadingScreen() {
    const s = document.createElement('style');
    s.textContent = `
        @keyframes ldFlicker{
            0%,100%{opacity:1} 5%{opacity:.06} 6%{opacity:.88} 20%{opacity:1}
            46%{opacity:.04} 47%{opacity:.82} 70%{opacity:1}
            89%{opacity:.05} 90%{opacity:.8} 95%{opacity:1}
        }
        @keyframes ldPulse{
            0%,100%{text-shadow:0 0 10px #8b0000}
            50%{text-shadow:0 0 28px #cc0000,0 0 50px #660000}
        }
        @keyframes ldScan{0%{background-position:0 0}100%{background-position:0 120px}}
        @keyframes ldMsg{0%,12%{opacity:0}18%,82%{opacity:1}88%,100%{opacity:0}}
    `;
    document.head.appendChild(s);

    const div = document.createElement('div');
    Object.assign(div.style, {
        position: 'fixed', inset: '0', background: '#000',
        zIndex: '50', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '22px', transition: 'opacity 0.9s ease', overflow: 'hidden'
    });

    // scanlines
    const scan = document.createElement('div');
    Object.assign(scan.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.15) 3px,rgba(0,0,0,0.15) 4px)',
        animation: 'ldScan 3s linear infinite', opacity: '0.55'
    });
    div.appendChild(scan);

    // noise canvas
    const noise = document.createElement('canvas');
    noise.width = 320; noise.height = 240;
    Object.assign(noise.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        opacity: '0.05', pointerEvents: 'none', imageRendering: 'pixelated'
    });
    div.appendChild(noise);
    const nCtx = noise.getContext('2d');
    (function animNoise() {
        if (!document.body.contains(div)) return;
        const img = nCtx.createImageData(320, 240);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
        }
        nCtx.putImageData(img, 0, 0);
        requestAnimationFrame(animNoise);
    })();

    // "IT'S ME" — pisca em posicoes aleatorias como o Golden Freddy
    const itsMe = document.createElement('div');
    Object.assign(itsMe.style, {
        position: 'absolute', zIndex: '3', pointerEvents: 'none',
        fontFamily: "'Courier New',monospace",
        fontSize: 'clamp(2em,5vw,3.5em)',
        color: '#ffffff', letterSpacing: '14px', fontWeight: 'bold',
        opacity: '0', transform: 'translate(-50%,-50%)'
    });
    itsMe.textContent = "IT'S ME";
    div.appendChild(itsMe);

    function flashItsMe() {
        if (!document.body.contains(div)) return;
        itsMe.style.left  = (15 + Math.random() * 70) + '%';
        itsMe.style.top   = (20 + Math.random() * 60) + '%';
        itsMe.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);
        const dur = 60 + Math.random() * 100;
        setTimeout(() => {
            itsMe.style.opacity = '0';
            // segunda aparicao rapida noutro lugar
            if (Math.random() > 0.45) setTimeout(flashItsMe, 120 + Math.random() * 180);
        }, dur);
    }
    const itsMeTimer = setInterval(() => {
        if (!document.body.contains(div)) { clearInterval(itsMeTimer); return; }
        if (Math.random() > 0.55) flashItsMe();
    }, 800);

    // conteudo central
    const inner = document.createElement('div');
    Object.assign(inner.style, {
        position: 'relative', zIndex: '2',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '18px', textAlign: 'center'
    });

    const msgs = ['CHECKING DOORS...', 'SYSTEMS ONLINE', 'WATCH THE CAMERAS.', "DON'T LET THEM IN.", 'NIGHT SHIFT STARTING...'];
    let msgIdx = 0;
    const msgEl = document.createElement('div');
    Object.assign(msgEl.style, {
        fontFamily: "'Courier New',monospace",
        fontSize: 'clamp(0.9em,1.5vw,1.1em)',
        color: '#bb5555', letterSpacing: '5px',
        textShadow: '0 0 6px rgba(180,40,40,0.5)',
        animation: 'ldMsg 3.2s ease infinite', minHeight: '1.4em'
    });
    msgEl.textContent = msgs[0];
    setInterval(() => {
        if (!document.body.contains(div)) return;
        msgIdx = (msgIdx + 1) % msgs.length;
        msgEl.textContent = msgs[msgIdx];
        msgEl.style.animation = 'none';
        void msgEl.offsetWidth;
        msgEl.style.animation = 'ldMsg 3.2s ease infinite';
    }, 3200);

    inner.innerHTML = `
        <div style="font-family:'Courier New',monospace;font-size:clamp(0.9em,1.5vw,1.15em);
             color:#cc6060;letter-spacing:7px;margin-bottom:4px;
             text-shadow:0 0 8px rgba(180,40,40,0.6)">FREDDY FAZBEAR'S PIZZA</div>
        <div style="font-family:'Courier New',monospace;font-size:clamp(1.8em,3.5vw,2.8em);
             color:#ff4444;letter-spacing:12px;
             animation:ldFlicker 2.5s infinite,ldPulse 3s ease infinite">LOADING</div>
        <div style="width:280px;height:7px;background:#2a0505;border:1px solid #660a0a;overflow:hidden">
            <div id="ldBar" style="height:100%;width:0%;background:#cc1010;
                 box-shadow:0 0 12px #ff2222;transition:width 0.3s ease"></div>
        </div>`;
    inner.appendChild(msgEl);
    div.appendChild(inner);
    document.body.appendChild(div);
    return div;
}

function criarMinimapa() {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'fixed', bottom: '14px', left: '14px', zIndex: '30' });
    canvasMapa = document.createElement('canvas');
    canvasMapa.width = canvasMapa.height = 180;
    Object.assign(canvasMapa.style, {
        border: '1.5px solid #cc00cc', borderRadius: '4px',
        background: 'rgba(0,0,0,0.82)', display: 'block'
    });
    ctxMapa = canvasMapa.getContext('2d');
    wrap.appendChild(canvasMapa);
    document.body.appendChild(wrap);
}

function atualizarMinimapa() {
    if (!ctxMapa) return;
    const W = 180, H = 180, S = 4.5;
    ctxMapa.clearRect(0, 0, W, H);

    // mapa roda com o jogador — seta sempre aponta para cima (frente)
    ctxMapa.save();
    ctxMapa.translate(W/2, H/2);
    ctxMapa.rotate(playerAngle - Math.PI); // mapa roda oposto ao player

    // zonas caminhaveis centradas no jogador
    // ry usa min.z (borda mais a sul/frente) sem negaçao — zona à frente fica acima
    zonasCaminhaveis.forEach(bb => {
        const rx = (bb.min.x - playerPos.x) * S;
        const ry = (bb.min.z - playerPos.z) * S;
        const rw = (bb.max.x - bb.min.x) * S;
        const rh = (bb.max.z - bb.min.z) * S;
        ctxMapa.fillStyle = 'rgba(50,50,80,0.92)';
        ctxMapa.fillRect(rx, ry, rw, rh);
        ctxMapa.strokeStyle = 'rgba(120,80,160,0.55)';
        ctxMapa.lineWidth = 0.8;
        ctxMapa.strokeRect(rx, ry, rw, rh);
    });

    // tokens por coletar
    tokens.forEach(t => {
        const wp = t.userData.worldPos;
        const tx = (wp.x - playerPos.x) * S;
        const ty = (wp.z - playerPos.z) * S;
        ctxMapa.fillStyle = '#dd00dd';
        ctxMapa.beginPath(); ctxMapa.arc(tx, ty, 3, 0, Math.PI*2); ctxMapa.fill();
    });

    // inimigos — ponto vermelho + letra inicial
    // chica: mesh tem offset geometrico em X e Z vs origem do modelo — compensar no minimap
    const _chicaOff = spawnPalco ? (spawnPalco.bb.max.x - spawnPalco.bb.min.x) * 0.20 : 1.7;
    inimigos.forEach(ini => {
        const ip = ini.modelo.position;
        const vizX = ini.nome === 'chica' ? ip.x - _chicaOff : ip.x;
        const vizZ = ini.nome === 'chica' ? ip.z + 5.0
                   : ini.nome === 'foxy'  ? ip.z - 2.0
                   : ip.z;
        const ex = (vizX - playerPos.x) * S;
        const ey = (vizZ - playerPos.z) * S;
        ctxMapa.fillStyle = '#ff2222';
        ctxMapa.beginPath(); ctxMapa.arc(ex, ey, 5, 0, Math.PI*2); ctxMapa.fill();
        ctxMapa.fillStyle = '#ffffff';
        ctxMapa.font = 'bold 7px monospace';
        ctxMapa.textAlign = 'center';
        const label = ini.nome === 'foxy' ? 'X' : ini.nome[0].toUpperCase();
        ctxMapa.fillText(label, ex, ey + 2.5);
    });

    ctxMapa.restore();

    // seta do jogador — sempre no centro a apontar para cima
    ctxMapa.fillStyle = '#ffff00';
    ctxMapa.beginPath();
    ctxMapa.moveTo(W/2, H/2-9);
    ctxMapa.lineTo(W/2+6, H/2+7);
    ctxMapa.lineTo(W/2-6, H/2+7);
    ctxMapa.closePath(); ctxMapa.fill();

    // contador
    ctxMapa.fillStyle = '#ff88ff';
    ctxMapa.font = 'bold 11px monospace';
    ctxMapa.fillText(`${tokensApanhados} / ${totalTokens}`, 6, H-6);
}

function _mostrarTelaSair() {
    const fade = document.createElement('div');
    Object.assign(fade.style, {
        position: 'fixed', inset: '0', zIndex: '900',
        background: '#000', opacity: '0',
        transition: 'opacity 1.4s ease', pointerEvents: 'auto'
    });
    document.body.appendChild(fade);
    requestAnimationFrame(() => { fade.style.opacity = '1'; });

    const msg = document.createElement('div');
    Object.assign(msg.style, {
        position: 'fixed', inset: '0', zIndex: '901',
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
        msg.innerHTML += `<div style="font-size:clamp(0.65em,1vw,0.78em);letter-spacing:4px;color:#441111;margin-top:20px">[ podes fechar esta janela ]</div>`;
    }, 3000);
}

function jogoOver(nomeInimigo) {
    // evitar multiplos triggers
    inimigos.forEach(i => { i.ativo = false; });
    jogoIniciado = false;

    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '60',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0)',
        fontFamily: "'Courier New', monospace",
        color: '#ff2222', textAlign: 'center',
        transition: 'background 1.2s ease', pointerEvents: 'none'
    });
    el.innerHTML = `
        <div style="font-size:clamp(2em,5vw,3.5em);letter-spacing:10px;
             text-shadow:0 0 30px #ff0000;opacity:0;transition:opacity 0.8s ease 1s">GAME OVER</div>
        <div style="font-size:clamp(0.8em,1.4vw,1em);letter-spacing:4px;
             color:#888;margin-top:18px;opacity:0;transition:opacity 0.8s ease 1.3s">apanhado pelo ${nomeInimigo.toUpperCase()}</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.background = 'rgba(0,0,0,1)';
        setTimeout(() => {
            el.querySelectorAll('div').forEach(d => { d.style.opacity = '1'; });
        }, 100);
    });
}

function criarHUD() {
    const hud = document.createElement('div');
    Object.assign(hud.style, {
        position: 'fixed', bottom: '14px', right: '14px', zIndex: '30',
        color: '#886688', fontFamily: 'monospace', fontSize: '11px',
        textAlign: 'right', pointerEvents: 'none', lineHeight: '1.8'
    });
    hud.innerHTML = 'W / ↑ — andar<br>A / ← — virar esq<br>D / → — virar dir';
    document.body.appendChild(hud);

    // display de coordenadas para debug de spawn
    const coords = document.createElement('div');
    coords.id = 'debugCoords';
    Object.assign(coords.style, {
        position: 'fixed', top: '14px', right: '14px', zIndex: '30',
        color: '#ffaa00', fontFamily: 'monospace', fontSize: '12px',
        textAlign: 'right', pointerEvents: 'none', background: 'rgba(0,0,0,0.55)',
        padding: '4px 8px', borderRadius: '3px'
    });
    document.body.appendChild(coords);

    // atualiza coords a cada frame (jogador + posição dos inimigos para debug)
    setInterval(() => {
        let txt = `Jogador  X:${playerPos.x.toFixed(1)}  Z:${playerPos.z.toFixed(1)}`;
        inimigos.forEach(ini => {
            const p = ini.modelo.position;
            txt += `\n${ini.nome.padEnd(7)}  X:${p.x.toFixed(1)}  Y:${p.y.toFixed(1)}  Z:${p.z.toFixed(1)}`;
        });
        coords.textContent = txt;
        coords.style.whiteSpace = 'pre';
    }, 200);
}

// ─── SPAWN ZONES ──────────────────────────────────────────────────
let spawnPalco = null; // bb do plano do palco (Freddy/Bonnie/Chica)
let spawnCova  = null; // bb do circulo do Foxy
let _floorY    = 0;   // Y do chão, guardado após carregar o mapa

function carregarSpawnZones(floorY) {
    loader.load('./Models/spawnAnimatronics.glb', gltf => {
        const zonas = [];
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            o.visible = false;
            const bb = new THREE.Box3().setFromObject(o);
            const sz = bb.getSize(new THREE.Vector3());
            zonas.push({ bb, centro: bb.getCenter(new THREE.Vector3()), area: sz.x * sz.z });
        });
        zonas.sort((a, b) => b.area - a.area); // maior = palco
        if (zonas.length >= 1) spawnPalco = zonas[0];
        if (zonas.length >= 2) spawnCova  = zonas[1];
        carregarPersonagens(floorY);
    }, undefined, () => {
        console.warn('spawnAnimatronics.glb nao encontrado, usando posicoes padrao');
        carregarPersonagens(floorY);
    });
}

// corrige TODAS as matrizes de bind apos escalar um modelo com SkinnedMesh:
// bindMatrix, bindMatrixInverse E boneInverses têm de estar alinhadas
function corrigirEscalaSkinnedMesh(model) {
    model.updateMatrixWorld(true);
    model.traverse(o => {
        if (!o.isSkinnedMesh) return;
        // atualiza bindMatrix para a posicao world atual (com escala)
        o.bindMatrix.copy(o.matrixWorld);
        o.bindMatrixInverse.copy(o.matrixWorld).invert();
        // atualiza boneInverses com as posicoes escaladas
        o.skeleton.boneInverses.forEach((inv, i) => {
            inv.copy(o.skeleton.bones[i].matrixWorld).invert();
        });
        o.skeleton.update();
    });
}

// calcula minY apenas de meshes VISIVEIS (ignora party-hat kids escondidos)
function calcMinY(model) {
    let minY = Infinity;
    model.updateMatrixWorld(true);
    model.traverse(o => {
        if ((!o.isMesh && !o.isSkinnedMesh) || !o.visible) return;
        const geo = o.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const wy = geo.boundingBox.min.clone().applyMatrix4(o.matrixWorld).y;
        if (wy < minY) minY = wy;
    });
    return isFinite(minY) ? minY : 0;
}

function carregarPersonagens(floorY) {
    _floorY = floorY;

    // posicionar no plane/circle do spawnAnimatronics.glb
    if (spawnPalco) {
        const cx   = spawnPalco.centro.x;
        const cz   = spawnPalco.centro.z;
        const topY = spawnPalco.bb.max.y;
        const off  = (spawnPalco.bb.max.x - spawnPalco.bb.min.x) * 0.20;
        SPAWN_FREDDY.set(cx,       topY + 1.95, cz + 4.5);
        // bonnie: idle tem root bone mais atras e mais em baixo vs walk — compensa aqui
        SPAWN_BONNIE.set(cx - off, topY + 2.0,  cz + 3.5);
        // chica: mesh tem offset geometrico X (~off) e Z (~+5.5) em world units — compensar no spawn
        SPAWN_CHICA.set( cx + off * 2.0, topY + 0.0, cz - 1.1);

        // foxy na Pirate Cove — cova abre para corredor (+Z), interior fica em -Z
        if (spawnCova) {
            // foxy dentro da cova (interior em +Z): spawn +2 do centro
            SPAWN_FOXY.set(spawnCova.centro.x, spawnCova.bb.max.y + 1.95, spawnCova.centro.z + 2.0);
        } else {
            SPAWN_FOXY.set(cx + off * 2, topY + 1.95, cz + 3.5);
        }

        // luz suave para iluminar BasicMaterial (Bonnie) sem lavar texturas
        const luzPalco = new THREE.PointLight(0xfff5ee, 2, 35);
        luzPalco.position.set(cx, topY + 8, cz);
        cenaJogo.add(luzPalco);
    } else {
        SPAWN_FREDDY.set( 0.0, floorY + 0.2, -39);
        SPAWN_BONNIE.set(-2.5, floorY + 0.2, -39);
        SPAWN_CHICA.set(  2.5, floorY + 0.0, -39);
        SPAWN_FOXY.set(   5.0, floorY + 0.2, -39);
    }

    const ESC = { freddy: 1.15, bonnie: 2.65, chica: 0.035, foxy: 1.15 };

    function loadChar(path, spawn, rotY, velocidade, escala, nome, clipNome, timeScale = 1.0, walkYOffset = 0) {
        loader.load(path, gltf => {
            const modelo = gltf.scene;
            modelo.scale.setScalar(escala);
            cenaJogo.add(modelo);

            // posiciona no spawn
            modelo.position.set(spawn.x, spawn.y, spawn.z);
            console.log(`[${nome}] posicao final:`, modelo.position.x.toFixed(1), modelo.position.y.toFixed(1), modelo.position.z.toFixed(1), '| bb height:', new THREE.Box3().setFromObject(modelo).getSize(new THREE.Vector3()).y.toFixed(2));
            modelo.rotation.y = rotY;

            // emissive + desativar frustum culling (evita que bones animados escondam o modelo)
            modelo.traverse(o => {
                if (!o.isMesh && !o.isSkinnedMesh) return;
                o.frustumCulled = false;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    if (m.emissive) { m.emissive.set(0x0f0c0c); m.emissiveIntensity = 0.5; }
                    m.needsUpdate = true;
                });
            });

            // remove scale tracks
            gltf.animations.forEach(clip => {
                clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.scale'));
            });

            console.log(`[${nome}] clips disponiveis:`, gltf.animations.map(c => c.name));

            // AnimationMixer — usa o clip indicado por nome (ou fallback para idle/walk)
            const mixer = new THREE.AnimationMixer(modelo);
            let clipIdle = null, clipAndar = null, clipJumpscare = null;

            // tenta encontrar o clip especifico pedido — match exato primeiro, depois substring
            let clipEspecifico = clipNome
                ? gltf.animations.find(c => c.name.toLowerCase() === clipNome.toLowerCase()) ||
                  gltf.animations.find(c => c.name.toLowerCase().includes(clipNome.toLowerCase()))
                : null;

            gltf.animations.forEach(c => {
                const n = c.name.toLowerCase();
                if (n.includes('walk') || n.includes('run'))                                 clipAndar     = c;
                else if (n.includes('jump') || n.includes('scare') || n.includes('attack'))  clipJumpscare = c;
                else clipIdle = clipIdle || c;
            });
            if (!clipIdle && gltf.animations.length > 0) clipIdle = gltf.animations[0];

            // usa clip especifico se existir, senao fallback
            const clipParaTocar = clipEspecifico || clipIdle;
            console.log(`[${nome}] clip escolhido: ${clipParaTocar?.name ?? 'NENHUM'}`);

            // encontrar root bones (filhos directos do scene, nao de outro bone)
            const rootBones = [];
            modelo.traverse(o => {
                if (o.isBone && o.parent && !o.parent.isBone) rootBones.push(o);
            });
            // guarda posicao bind-pose dos root bones ANTES de qualquer animacao
            const rootBonesInitPos = rootBones.map(b => b.position.clone());

            // guarda posicao inicial dos grupos de armature (filhos nao-bone do modelo)
            // estes grupos podem ter root motion e causar teletransporte se nao forem cancelados
            const armatureGrupos = [];
            modelo.children.forEach(child => {
                if (!child.isBone && !child.isMesh && !child.isSkinnedMesh) {
                    armatureGrupos.push({ obj: child, initPos: child.position.clone() });
                }
            });

            let acaoAtual = null;
            if (clipParaTocar) {
                acaoAtual = mixer.clipAction(clipParaTocar);
                acaoAtual.timeScale = timeScale;
                acaoAtual.play();
                mixer.update(0.1); // avanca mais para sair da bind pose
            }

            const angInicial = Math.random() * Math.PI * 2;
            inimigos.push({
                nome, modelo, mixer, rootBones, rootBonesInitPos,
                armatureGrupos,
                clipIdle, clipAndar, clipJumpscare, acaoAtual,
                spawnPos: spawn.clone(), spawnY: spawn.y, walkYOffset,
                velocidade,
                ativo: false, congelado: false, posicionado: false,
                dirAtual: new THREE.Vector3(Math.sin(angInicial), 0, Math.cos(angInicial)),
                tempoMudanca: Math.random() * 1.5,
            });
        }, undefined, err => console.error('Erro ao carregar', nome, err));
    }

    loadChar('./Models/Personagens/freddy_ar.glb', SPAWN_FREDDY,  0,    1.8, ESC.freddy, 'freddy', 'Freddy--Idle',                1.0, 0  );
    loadChar('./Models/Personagens/bonnie.glb',    SPAWN_BONNIE,  0.25, 2.0, ESC.bonnie, 'bonnie', 'Bonnie--Idle',                1.0, 0  );
    loadChar('./Models/Personagens/chica.glb',     SPAWN_CHICA,   0,    1.9, ESC.chica,  'chica',  'chica_rings_skeleton|idle',   1.0, 0  );
    loadChar('./Models/Personagens/foxy_ar.glb',   SPAWN_FOXY,    0,    3.0, ESC.foxy,   'foxy',   'Foxy--Idle',                  1.0, 0  );
}

// ─── AI DOS INIMIGOS ───────────────────────────────────────────────

function trocarClip(ini, clip) {
    if (!clip || ini.acaoAtual?.getClip() === clip) return;
    if (ini.acaoAtual) ini.acaoAtual.fadeOut(0.25);
    ini.acaoAtual = ini.mixer.clipAction(clip);
    ini.acaoAtual.reset().fadeIn(0.25).play();
}

// true se o jogador estiver a olhar para o inimigo (ângulo < 35°) e a < 12 unidades
function _jogadorOlha(ini) {
    const dir = new THREE.Vector3();
    camaraJogo.getWorldDirection(dir);
    const toIni = new THREE.Vector3()
        .subVectors(ini.modelo.position, camaraJogo.position)
        .normalize();
    toIni.y = 0; dir.y = 0;
    if (toIni.lengthSq() < 0.001) return false;
    toIni.normalize(); dir.normalize();
    const dot = dir.dot(toIni);
    const dist = camaraJogo.position.distanceTo(ini.modelo.position);
    return dot > 0.82 && dist < 12; // cos(35°) ≈ 0.82
}

function _posIniValida(pos, margem) {
    return zonasCaminhaveis.some(bb =>
        pos.x >= bb.min.x + margem && pos.x <= bb.max.x - margem &&
        pos.z >= bb.min.z + margem && pos.z <= bb.max.z - margem
    );
}

// puxa o inimigo para o centro do eixo ESTREITO da zone em que está (evita paredes)
function _centrarNaZona(pos) {
    let melhor = null, melhorDist = Infinity;
    zonasCaminhaveis.forEach(bb => {
        if (pos.x < bb.min.x || pos.x > bb.max.x ||
            pos.z < bb.min.z || pos.z > bb.max.z) return;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const d  = Math.hypot(pos.x - cx, pos.z - cz);
        if (d < melhorDist) { melhorDist = d; melhor = { bb, cx, cz }; }
    });
    if (!melhor) return;
    const { bb, cx, cz } = melhor;
    const szX = bb.max.x - bb.min.x;
    const szZ = bb.max.z - bb.min.z;
    const k = 0.07; // força de centragem por frame
    if (szX <= szZ) pos.x += (cx - pos.x) * k; // corredor em Z → centra em X
    if (szZ <= szX) pos.z += (cz - pos.z) * k; // corredor em X → centra em Z
}

// movimento aleatório estilo Pac-Man: escolhe direções possíveis,
// prefere continuar em frente, evita reversão mas não a proíbe
function moverInimigoRandom(ini, delta) {
    const MARGEM  = 0.5;
    const TESTE   = Math.max(ini.velocidade * delta * 5, 1.5); // lookahead para testar dir
    const passo   = ini.velocidade * delta;

    ini.tempoMudanca = Math.max(0, ini.tempoMudanca - delta);

    // garante que a direção é horizontal e normalizada
    ini.dirAtual.y = 0;
    if (ini.dirAtual.lengthSq() < 0.01) {
        const a = Math.random() * Math.PI * 2;
        ini.dirAtual.set(Math.sin(a), 0, Math.cos(a));
    }
    ini.dirAtual.normalize();

    const pos     = ini.modelo.position;
    const angAtual = Math.atan2(ini.dirAtual.x, ini.dirAtual.z);

    // tenta continuar na direção atual se ainda não é hora de mudar
    const novaFrente = pos.clone().addScaledVector(ini.dirAtual, passo);
    const livreFrente = _posIniValida(novaFrente, MARGEM);

    if (livreFrente && ini.tempoMudanca > 0) {
        pos.copy(novaFrente);
        pos.y = ini.spawnY;
        _centrarNaZona(pos);
        ini.modelo.rotation.y = angAtual;
        trocarClip(ini, ini.clipAndar || ini.clipIdle);
        return;
    }

    // bloqueado ou tempo de mudar — seleciona nova direção
    ini.tempoMudanca = 1.5 + Math.random() * 2.5;

    const candidatos = [
        { ang: angAtual,              peso: 3 }, // frente
        { ang: angAtual + Math.PI/2,  peso: 2 }, // esquerda 90°
        { ang: angAtual - Math.PI/2,  peso: 2 }, // direita 90°
        { ang: angAtual + Math.PI,    peso: 1 }, // inversão (menos provável)
    ];

    const validos = candidatos.filter(c => {
        const dir = new THREE.Vector3(Math.sin(c.ang), 0, Math.cos(c.ang));
        const test = pos.clone().addScaledVector(dir, TESTE);
        return _posIniValida(test, MARGEM);
    });

    if (validos.length > 0) {
        const totalPeso = validos.reduce((s, c) => s + c.peso, 0);
        let r = Math.random() * totalPeso;
        let escolhido = validos[validos.length - 1];
        for (const c of validos) { r -= c.peso; if (r <= 0) { escolhido = c; break; } }
        ini.dirAtual.set(Math.sin(escolhido.ang), 0, Math.cos(escolhido.ang));
    }

    // tenta mover com a nova direção
    const novaNova = pos.clone().addScaledVector(ini.dirAtual, passo);
    if (_posIniValida(novaNova, MARGEM)) {
        pos.copy(novaNova);
        pos.y = ini.spawnY;
        _centrarNaZona(pos);
        ini.modelo.rotation.y = Math.atan2(ini.dirAtual.x, ini.dirAtual.z);
        trocarClip(ini, ini.clipAndar || ini.clipIdle);
    } else {
        trocarClip(ini, ini.clipIdle);
    }
}

function snapParaChaopaandar(ini) {
    let melhor = null, melhorDist = Infinity;
    zonasCaminhaveis.forEach(bb => {
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const d = Math.hypot(ini.spawnPos.x - cx, ini.spawnPos.z - cz);
        if (d < melhorDist) { melhorDist = d; melhor = { cx, cz }; }
    });
    if (melhor) {
        ini.modelo.position.x = melhor.cx;
        ini.modelo.position.z = melhor.cz;
        ini.modelo.position.y = ini.spawnY;
    }
    ini.posicionado = true;
}

function atualizarCoracaoProximidade() {
    // distancia ao inimigo ativo mais proximo
    let minDist = Infinity;
    inimigos.forEach(ini => {
        if (!ini.ativo) return;
        const d = Math.hypot(ini.modelo.position.x - playerPos.x, ini.modelo.position.z - playerPos.z);
        if (d < minDist) minDist = d;
    });
    if (minDist === Infinity) { setCoracaoFactor(1.0); return; }
    // factor: 1.0 a distancia 20+, ate 2.5 a distancia 3 ou menos
    const t = 1 - Math.min(1, Math.max(0, (minDist - 3) / 17));
    setCoracaoFactor(1.0 + t * 1.5);
}

function atualizarInimigos(delta) {
    if (!jogoIniciado) return;

    // ativaçao desligada por enquanto — ajustar posições primeiro
    // if (tempoJogo >  5 && !alertas.freddy) ativarInimigo('freddy');
    // if (tempoJogo > 15 && !alertas.bonnie) ativarInimigo('bonnie');
    // if (tempoJogo > 25 && !alertas.chica)  ativarInimigo('chica');
    // if (tokensApanhados >= 5 && !alertas.foxy) ativarInimigo('foxy');

    inimigos.forEach(ini => {
        if (!ini.ativo) return; // snap só acontece em ativarInimigo()

        // weeping angel: Freddy e Foxy ficam parados quando o jogador olha para eles
        const temAngelMechanic = ini.nome === 'freddy' || ini.nome === 'foxy';
        if (temAngelMechanic && _jogadorOlha(ini)) {
            trocarClip(ini, ini.clipIdle);
            return;
        }

        moverInimigoRandom(ini, delta);

        // captura do jogador — desativado para teste de movimento
        // const d2 = Math.hypot(
        //     ini.modelo.position.x - playerPos.x,
        //     ini.modelo.position.z - playerPos.z
        // );
        // if (d2 < 1.5) jogoOver(ini.nome);
    });
}

// ─── MENSAGENS / ALERTAS ───────────────────────────────────────────

function mostrarMensagemInicio() {
    mensagemInicioAtiva = true;
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '40',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        fontFamily: "'Courier New', monospace",
        color: '#dddddd', textAlign: 'center',
        pointerEvents: 'none', opacity: '0',
        transition: 'opacity 1s ease'
    });
    el.innerHTML = `
        <div style="font-size:clamp(1.4em,2.8vw,2em);letter-spacing:6px;color:#ffcc00;margin-bottom:16px">
            FREDDY FAZBEAR'S PIZZA
        </div>
        <div style="font-size:clamp(0.85em,1.6vw,1.1em);letter-spacing:3px;line-height:2.2;color:#cccccc">
            APANHA TODOS OS TOKENS<br>
            <span style="color:#ff6666">mas tem muito cuidado com eles...</span>
        </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.transition = 'opacity 1.5s ease';
        el.style.opacity = '0';
        setTimeout(() => {
            el.remove();
            mensagemInicioAtiva = false;
            tocar('phoneguy'); // inicia o phone guy so quando o aviso desaparece
        }, 1600);
    }, 2500);
}

const ALERTAS_CONFIG = {
    freddy: { titulo: '⚠  FREDDY FAZBEAR  saiu do palco',   cor: '#ff4444' },
    bonnie: { titulo: '⚠  BONNIE  saiu do palco',            cor: '#9955ff' },
    chica:  { titulo: '⚠  CHICA  saiu do palco',             cor: '#ffaa00' },
    foxy:   { titulo: '⚠  FOXY  saiu da Pirate Cove',        cor: '#ff3300' },
};

function mostrarAlerta(nome) {
    const cfg = ALERTAS_CONFIG[nome];
    if (!cfg) return;

    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', top: '0', left: '0', right: '0',
        zIndex: '45',
        background: 'rgba(0,0,0,0.85)',
        borderBottom: `1.5px solid ${cfg.cor}`,
        fontFamily: "'Courier New', monospace",
        color: cfg.cor, textAlign: 'center',
        padding: '8px 16px',
        fontSize: 'clamp(0.7em,1.4vw,0.9em)',
        letterSpacing: '4px',
        opacity: '0', transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
    });
    el.textContent = cfg.titulo;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
    }, 3000);
}

function ativarInimigo(nome) {
    alertas[nome] = true;
    mostrarAlerta(nome);
    const ini = inimigos.find(i => i.nome === nome);
    if (!ini) return;

    // snap para a zona caminhável mais próxima do spawn ANTES de ativar
    if (zonasCaminhaveis.length > 0) snapParaChaopaandar(ini);
    ini.ativo = true;

    // troca para clip de andar se existir
    if (ini.clipAndar && ini.acaoAtual) {
        ini.acaoAtual.stop();
        ini.acaoAtual = ini.mixer.clipAction(ini.clipAndar);
        ini.acaoAtual.play();
        // walkYOffset compensa a diferença de root bone Y entre idle e andar
        if (ini.walkYOffset) {
            ini.spawnY += ini.walkYOffset;
            ini.modelo.position.y = ini.spawnY;
        }
    }
}
