import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tocar, parar, estaATocando, setCoracaoFactor, atualizarPhoneguyDistancia, aoPhoneguyTerminar, aoTerminar } from './audio.js';
import { mostrarPausa, esconderPausa, estaPausado, configurarCallbacks } from './opcoes.js';

const loader = new GLTFLoader();
const clock  = new THREE.Clock();
const keys   = {};

const MOVE_SPEED = 4.5;
const EYE_HEIGHT = 3.9;

let cenaJogo, camaraJogo;
let camaraOrtho         = null;
let _mapaTopAtivo       = false;
let _spriteJogadorTop   = null;   // seta amarela (igual ao minimapa)
let _modeloPolicia      = null;   // police.glb
let _policiaMixer       = null;   // AnimationMixer do policia
let _luzOrthoAmb        = null;
let _luzOrthoDir        = null;
let _luzFlashlightTop       = null;
let _luzFlashlightTarget    = null;
let _luzesAnimTop       = {};
let _mapaJogo1Scene     = null;
let _mapaAmpliadoScene  = null;
let _mapaAmpliadoCamY   = 7;
let luzAmbiente = null;
let lanterna    = null;
let luzDirecional = null;

// toggles de luz
let _luzAmbienteOn  = true;
let _luzPointOn     = true;
let _luzSpotOn      = true;
let _luzDirOn       = true;

let playerPos   = new THREE.Vector3(0, 0, 0);
let playerAngle = 0;
let targetAngle = 0;

// colisao — zonas caminhaveis carregadas do chaopaandar.glb
let mapaBBs    = [];
const _pBox = new THREE.Box3();
let zonasCaminhaveis   = [];
let zonasSemExpansao   = []; // cópias sem expandByScalar — usadas em _caminhoClear para evitar pontes sobre paredes

// waypoints — centros das zones caminhaveis (mesmas posições que os tokens)
let waypoints      = [];  // [{ x, y, z }]
let waypointAdj    = [];  // lista de adjacência: waypointAdj[i] = [j, k, ...]
let _waypointFloorY = 0;  // Y único para todos os waypoints (superficie real do chão)

// efeito acordar
let acordarProgresso = 0;
let acordando        = true;

let tokens          = [];
let tokensApanhados = 0;
let totalTokens     = 0;
let elapsedTime     = 0;

let canvasMapa = null, ctxMapa = null;
let luzesFlicker = [];
let _chaopaandarMeshes  = [];

// ─── INIMIGOS ──────────────────────────────────────────────────────
let inimigos = [];
// { nome, modelo, mixer, clipIdle, clipAndar, clipJumpscare,
//   acaoAtual, spawnPos, velocidade, ativo, emMovimento }

// posicoes de spawn (Y preenchido depois de saber o floor)
const SPAWN_FREDDY  = new THREE.Vector3( 0.0, 0, -36);
const SPAWN_BONNIE  = new THREE.Vector3(-4.0, 0, -36);
const SPAWN_CHICA   = new THREE.Vector3( 4.0, 0, -36);
const SPAWN_FOXY    = new THREE.Vector3(-9.0, 0, -26);
const SPAWN_GOLDEN  = new THREE.Vector3( 0.0, 0, -36);

// ─── ESTADO DO JOGO ────────────────────────────────────────────────
let mensagemInicioAtiva = false;
let jogoTerminado  = false;
let jogoGanho      = false;
const OFFICE_XZ = new THREE.Vector2(0, 2);
let tempoJogo       = 0;
let jogoIniciado    = false;
const alertas       = { freddy: false, bonnie: false, chica: false, foxy: false };

// dificuldade e sistema de ativação
let dificuldadeAtual    = 'facil';
let phoneguyTerminou    = false;
let tempoAposPhoneguy   = 0;
let _pendingActivations = [];   // [{ nome, check: () => bool, fired }]
let _ativacoesPreparadas = false;
let _tempoUltimaAtivacao = -Infinity; // cooldown entre ativações
const COOLDOWN_ATIVACAO  = 15;        // segundos mínimos entre ativações

// Golden Freddy (modo difícil)
let _goldenIniciado     = false;
let _goldenCapturou     = false;   // apanhou o jogador — desaparece após isso
let _goldenFase         = 0;       // 0=à espera, 1=1ª posição (aleatória), 2=2ª posição (perto do escritório)
let _goldenTempoVisivel = 0;       // conta-abaixo enquanto visível (fase 1)
let _goldenCooldown     = Infinity; // conta-abaixo até próxima teleporte — só avança quando jogo ativo
let _goldenLuz          = null;    // PointLight dentro do modelo
let _goldenFeetAdj      = 0;       // offset pré-calculado: origin → pés (evita calcMinY por teleporte)
let _debuffAtivo        = false;
let _debuffOverlay      = null;

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

export function iniciarJogo(renderer, dificuldade = 'facil') {
    dificuldadeAtual = dificuldade;
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
            if (!estaPausado() && jogoIniciado && !mensagemInicioAtiva && !introCamera) {
                tocar('clickBotao');
                mostrarPausa();
            }
            return;
        }
        // teclas 1-4 e O só funcionam quando o jogo está a correr
        if (jogoIniciado && !estaPausado() && !introCamera && !acordando && !mensagemInicioAtiva) {
            if (e.code === 'Digit1') { _toggleLuz('ambiente');    e.preventDefault(); return; }
            if (e.code === 'Digit2') { _toggleLuz('point');       e.preventDefault(); return; }
            if (e.code === 'Digit3') { _toggleLuz('spot');        e.preventDefault(); return; }
            if (e.code === 'Digit4') { _toggleLuz('direcional');  e.preventDefault(); return; }
            if (e.code === 'KeyO')   { _mapaTopAtivo = !_mapaTopAtivo; _atualizarLabelMapaTop(); e.preventDefault(); return; }
        }
        keys[e.code] = true;
        if (e.code === 'KeyA') targetAngle += Math.PI / 2;
        if (e.code === 'KeyD') targetAngle -= Math.PI / 2;
        if (e.code === 'ArrowLeft')  targetAngle += Math.PI / 2;
        if (e.code === 'ArrowRight') targetAngle -= Math.PI / 2;
        e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    // cena, câmara e renderer
    cenaJogo = new THREE.Scene();
    cenaJogo.background = new THREE.Color(0x111111);

    camaraJogo = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 60);

    // câmara ortográfica para vista de cima (tecla O)
    camaraOrtho = new THREE.OrthographicCamera(-28, 28, 28, -28, 0.1, 200);
    camaraOrtho.up.set(0, 0, -1); // -Z aponta para cima no ecrã (frente do mapa fica em cima)

    renderer.toneMapping         = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled   = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // luzes
    luzAmbiente = new THREE.AmbientLight(0xffeedd, 0);
    cenaJogo.add(luzAmbiente);

    luzDirecional = new THREE.DirectionalLight(0xfff5e0, 0.0);
    luzDirecional.position.set(5, 20, 5);
    cenaJogo.add(luzDirecional);

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

    // carrega o mapa do jogo (mapa1.glb — editado no Three.js editor a partir do sketchfab)
    loader.load('./Models/mapa1.glb',
    gltf => {
        // ajusta emissive em todos os materiais e regista bounding boxes das paredes
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

        _mapaJogo1Scene = gltf.scene;
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

        // esconde o loading e arranca a animação de entrada
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
            _chaopaandarMeshes.push(o);
            const bb = new THREE.Box3().setFromObject(o);
            zonasSemExpansao.push(bb.clone()); // cópia exacta antes de expandir
            bb.expandByScalar(0.08); // cobre micro-gaps entre planes adjacentes
            zonasCaminhaveis.push(bb);
        });
        cenaJogo.add(gltf.scene);
        criarTokens();
        _construirWaypoints();
    });

    criarMinimapa();
    _iniciarMapaAmpliado();

    window.addEventListener('resize', () => {
        camaraJogo.aspect = window.innerWidth / window.innerHeight;
        camaraJogo.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // loop principal do jogo
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
            if (!jogoIniciado && !jogoTerminado) {
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
                // cancela X/Y/Z nos grupos de armature (evita teletransporte e flutuação)
                ini.armatureGrupos?.forEach(({ obj, initPos }) => {
                    obj.position.x = initPos.x;
                    obj.position.y = initPos.y;
                    obj.position.z = initPos.z;
                });
                // cancela X/Y/Z nos root bones (Y cancela root motion vertical do Freddy etc.)
                ini.rootBones?.forEach((b, i) => {
                    const ip = ini.rootBonesInitPos?.[i];
                    if (ip) { b.position.x = ip.x; b.position.y = ip.y; b.position.z = ip.z; }
                });
            });
            atualizarMovimento(delta);
            atualizarInimigos(delta);
            atualizarCoracaoProximidade();
            atualizarPhoneguyDistancia(Math.hypot(playerPos.x - OFFICE_XZ.x, playerPos.z - OFFICE_XZ.y));
            // verificar vitoria: todos os tokens + chegou ao escritorio
            if (!jogoGanho && tokensApanhados >= totalTokens && totalTokens > 0) {
                const distOffice = Math.hypot(playerPos.x - OFFICE_XZ.x, playerPos.z - OFFICE_XZ.y);
                if (distOffice < 3.0) _ganharJogo();
            }
            atualizarCamera(delta);
        }
        atualizarTokens();
        atualizarMinimapa();

        if (_mapaTopAtivo && camaraOrtho) {
            if (_mapaJogo1Scene)    _mapaJogo1Scene.visible   = false;
            if (_mapaAmpliadoScene) _mapaAmpliadoScene.visible = true;
            if (_modeloPolicia) {
                _modeloPolicia.visible    = true;
                _modeloPolicia.position.set(playerPos.x, _floorY || 0, playerPos.z);
                _modeloPolicia.rotation.y = playerAngle;
                if (_policiaMixer) _policiaMixer.update(delta);
                if (_spriteJogadorTop) _spriteJogadorTop.visible = false;
            } else if (_spriteJogadorTop) {
                _spriteJogadorTop.visible = true;
                _spriteJogadorTop.position.set(playerPos.x, 1, playerPos.z);
                _spriteJogadorTop.material.rotation = playerAngle + Math.PI;
            }
            if (_luzOrthoAmb) _luzOrthoAmb.intensity = 0.04;
            if (_luzOrthoDir) _luzOrthoDir.intensity = 0.01;
            if (_luzFlashlightTop && _luzFlashlightTarget) {
                _luzFlashlightTop.intensity = 25;
                _luzFlashlightTop.position.set(playerPos.x, _mapaAmpliadoCamY, playerPos.z);
                _luzFlashlightTarget.position.set(
                    playerPos.x + Math.sin(playerAngle) * 7,
                    0,
                    playerPos.z + Math.cos(playerAngle) * 7
                );
                _luzFlashlightTarget.updateMatrixWorld();
            }
            const _chicaOff = spawnPalco ? (spawnPalco.bb.max.x - spawnPalco.bb.min.x) * 0.20 : 1.7;
            inimigos.forEach(ini => {
                const luz = _luzesAnimTop[ini.nome];
                if (!luz) return;
                luz.intensity = 4;
                let vx = ini.modelo.position.x, vz = ini.modelo.position.z;
                if (!ini.ativo) {
                    if (ini.nome === 'chica') { vx -= _chicaOff; vz += 5.0; }
                    if (ini.nome === 'foxy')  { vz -= 3.0; }
                }
                luz.position.set(vx, _mapaAmpliadoCamY - 1, vz);
            });
            const asp  = window.innerWidth / window.innerHeight;
            const zoom = 6;
            camaraOrtho.left   = -zoom * asp; camaraOrtho.right  =  zoom * asp;
            camaraOrtho.top    =  zoom;        camaraOrtho.bottom = -zoom;
            camaraOrtho.near   = 0.1;
            camaraOrtho.far    = _mapaAmpliadoCamY + 5;
            camaraOrtho.updateProjectionMatrix();
            camaraOrtho.position.set(playerPos.x, _mapaAmpliadoCamY, playerPos.z);
            camaraOrtho.lookAt(playerPos.x, 0, playerPos.z);
            // pizzas viradas para cima só no modo O
            tokens.forEach(t => {
                if (t.children[0]) { t.children[0].rotation.x = 0; t.position.y = t.userData.worldPos.y; }
            });
            renderer.render(cenaJogo, camaraOrtho);
            // restaurar pizzas de pé
            tokens.forEach(t => { if (t.children[0]) t.children[0].rotation.x = Math.PI / 2; });
            if (_mapaJogo1Scene)    _mapaJogo1Scene.visible   = true;
            if (_mapaAmpliadoScene) _mapaAmpliadoScene.visible = false;
            if (_luzOrthoAmb) _luzOrthoAmb.intensity = 0;
            if (_luzOrthoDir) _luzOrthoDir.intensity = 0;
            if (_luzFlashlightTop) _luzFlashlightTop.intensity = 0;
            Object.values(_luzesAnimTop).forEach(l => { l.intensity = 0; });
            if (_modeloPolicia)    _modeloPolicia.visible     = false;
            if (_spriteJogadorTop) _spriteJogadorTop.visible  = false;
        } else {
            renderer.render(cenaJogo, camaraJogo);
        }
    }
    loop();
}

function _iniciarMapaAmpliado() {
    _luzOrthoAmb = new THREE.AmbientLight(0xffffff, 0);
    _luzOrthoDir = new THREE.DirectionalLight(0xffffff, 0);
    _luzOrthoDir.position.set(0, 1, 0);
    cenaJogo.add(_luzOrthoAmb);
    cenaJogo.add(_luzOrthoDir);

    loader.load('./Models/mapaampliado/mapaampliado.glb', gltf => {
        _mapaAmpliadoScene = gltf.scene;
        _mapaAmpliadoScene.visible = false;
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => { m.emissive = new THREE.Color(0x060404); m.emissiveIntensity = 0.30; m.needsUpdate = true; });
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        _mapaAmpliadoCamY = box.max.y - 0.4;
        cenaJogo.add(_mapaAmpliadoScene);
    });

    // police.glb
    loader.load('./Models/Personagens/police.glb', gltf => {
        _modeloPolicia = gltf.scene;
        const box = new THREE.Box3().setFromObject(_modeloPolicia);
        const h = box.max.y - box.min.y;
        if (h > 0) _modeloPolicia.scale.setScalar(6.0 / h);
        _modeloPolicia.updateMatrixWorld(true);
        corrigirEscalaSkinnedMesh(_modeloPolicia);
        _modeloPolicia.visible = false;
        _modeloPolicia.traverse(o => {
            if (!o.isMesh && !o.isSkinnedMesh) return;
            o.frustumCulled = false;
        });
        if (gltf.animations && gltf.animations.length > 0) {
            _policiaMixer = new THREE.AnimationMixer(_modeloPolicia);
            const clip = THREE.AnimationClip.findByName(gltf.animations, 'mixamo.com') || gltf.animations[0];
            _policiaMixer.clipAction(clip).play();
        }
        cenaJogo.add(_modeloPolicia);
    });

    // seta amarela de fallback
    {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.moveTo(32, 4); ctx.lineTo(56, 60); ctx.lineTo(32, 46); ctx.lineTo(8, 60);
        ctx.closePath(); ctx.fill();
        const sMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
        _spriteJogadorTop = new THREE.Sprite(sMat);
        _spriteJogadorTop.scale.set(1.0, 1.0, 1);
        _spriteJogadorTop.visible = false;
        cenaJogo.add(_spriteJogadorTop);
    }

    _luzFlashlightTop = new THREE.SpotLight(0xffeedd, 0, 22, 0.45, 0.35, 1.2);
    _luzFlashlightTarget = new THREE.Object3D();
    cenaJogo.add(_luzFlashlightTarget);
    _luzFlashlightTop.target = _luzFlashlightTarget;
    cenaJogo.add(_luzFlashlightTop);

    const CORES = { freddy: 0xcc7722, bonnie: 0x8822cc, chica: 0xddaa00, foxy: 0xdd2200, golden: 0xffcc00 };
    Object.entries(CORES).forEach(([nome, cor]) => {
        const luz = new THREE.PointLight(cor, 0, 7);
        cenaJogo.add(luz);
        _luzesAnimTop[nome] = luz;
    });
}

// label em baixo quando o mapa O está ativo
let _divMapaTop = null;
function _atualizarLabelMapaTop() {
    if (!_divMapaTop) {
        _divMapaTop = document.createElement('div');
        Object.assign(_divMapaTop.style, {
            position: 'fixed', bottom: '14px', left: '50%',
            transform: 'translateX(-50%)', zIndex: '25',
            color: '#886688', fontFamily: 'monospace',
            fontSize: '11px', letterSpacing: '3px', pointerEvents: 'none',
        });
        _divMapaTop.textContent = 'VISTA DE CIMA — prima O para sair';
        document.body.appendChild(_divMapaTop);
    }
    _divMapaTop.style.display = _mapaTopAtivo ? 'block' : 'none';
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

// movimento do jogador
function atualizarMovimento(delta) {
    if (introCamera || acordando || mensagemInicioAtiva) return;
    let da = targetAngle - playerAngle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    playerAngle += da * Math.min(1, delta * 6);

    const dir    = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
    const aAndar = keys['KeyW'] || keys['ArrowUp'];
    if (aAndar) tentarMover(dir, (_debuffAtivo ? MOVE_SPEED * 0.5 : MOVE_SPEED) * delta);

    // passos só quando se anda
    if (aAndar && !estaATocando('passosHeavy')) tocar('passosHeavy');
    if (!aAndar && estaATocando('passosHeavy')) parar('passosHeavy');

    tokens = tokens.filter(t => {
        const wp = t.userData.worldPos;
        if (Math.hypot(playerPos.x - wp.x, playerPos.z - wp.z) < 1.4) {
            cenaJogo.remove(t);
            tokensApanhados++;
            tocar('token');
            if (tokensApanhados >= totalTokens) _alertaCorrida();
            return false;
        }
        return true;
    });
}

// câmara e lanterna
function atualizarCamera(delta) {
    if (introCamera || acordando || mensagemInicioAtiva || _mapaTopAtivo) return;

    camaraJogo.position.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);

    smoothX += (mouseOffX - smoothX) * 0.10;
    smoothY += (mouseOffY - smoothY) * 0.10;

    const fwdX = Math.sin(playerAngle), fwdZ = Math.cos(playerAngle);
    const rgtX = -Math.cos(playerAngle), rgtZ = Math.sin(playerAngle);

    const dx = fwdX + rgtX * smoothX, dy = smoothY, dz = fwdZ + rgtZ * smoothX;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const lx = camaraJogo.position.x + (dx/len) * 10;
    const ly = camaraJogo.position.y + (dy/len) * 10;
    const lz = camaraJogo.position.z + (dz/len) * 10;
    camaraJogo.lookAt(lx, ly, lz);

    // lanterna: unproject exacto do mouse — igual ao menu
    const vec = new THREE.Vector3(rawMX, rawMY, 0.5).unproject(camaraJogo);
    const dir = vec.sub(camaraJogo.position).normalize();
    if (luzAlvo) luzAlvo.position.copy(camaraJogo.position).addScaledVector(dir, 20);
}

// ─── LUZES ────────────────────────────────────────────────────────────────────

function _toggleLuz(tipo) {
    if (tipo === 'ambiente') {
        _luzAmbienteOn = !_luzAmbienteOn;
        luzAmbiente.intensity = _luzAmbienteOn ? 0.03 : 0;
    } else if (tipo === 'point') {
        _luzPointOn = !_luzPointOn;
        luzesFlicker.forEach(item => {
            if (!_luzPointOn) item.luz.intensity = 0;
        });
    } else if (tipo === 'spot') {
        _luzSpotOn = !_luzSpotOn;
        if (lanterna) lanterna.intensity = _luzSpotOn ? 60 : 0;
        luzesFlicker.forEach(item => {
            if (item.luz.isSpotLight) item.luz.intensity = _luzSpotOn ? undefined : 0;
            if (!_luzSpotOn && item.luz.isSpotLight) item.luz.intensity = 0;
        });
    } else if (tipo === 'direcional') {
        _luzDirOn = !_luzDirOn;
        luzDirecional.intensity = _luzDirOn ? 0.6 : 0;
    }
}

function atualizarLuzesFlicker(tempo) {
    luzesFlicker.forEach(item => {
        const isPoint = item.luz.isPointLight;
        const isSpot  = item.luz.isSpotLight;
        if (isPoint && !_luzPointOn) { item.luz.intensity = 0; return; }
        if (isSpot  && !_luzSpotOn)  { item.luz.intensity = 0; return; }

        const fator = item.fator ?? 1;
        if (item.estragada) {
            const n = Math.sin(tempo * 11.3 + item.fase) * Math.sin(tempo * 17.7 + item.fase * 1.3);
            item.luz.intensity = (n > 0.2 ? 1.6 + n * 0.4 : (n > -0.1 ? 0.2 : 0)) * fator;
        } else {
            const base = 1.1 + Math.sin(tempo * 1.2 + item.fase) * 0.08;
            const glitch = Math.random() > 0.996 ? -0.8 : 0;
            item.luz.intensity = Math.max(0, base + glitch) * fator;
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

    const g = new THREE.Group();
    g.rotation.x = Math.PI / 2; // de pé
    g.rotation.y = 0.45;

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

// minimapa
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

// redesenha o minimapa
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

    // inimigos — ponto vermelho + letra inicial (golden nunca aparece no minimapa)
    const _chicaOff = spawnPalco ? (spawnPalco.bb.max.x - spawnPalco.bb.min.x) * 0.20 : 1.7;
    inimigos.forEach(ini => {
        if (ini.nome === 'golden') return;
        const ip = ini.modelo.position;
        let vizX = ip.x, vizZ = ip.z;
        if (!ini.ativo) {
            // spawned — offsets de geometria como antes
            if (ini.nome === 'chica') { vizX = ip.x - _chicaOff; vizZ = ip.z + 5.0; }
            if (ini.nome === 'foxy')  { vizZ = ip.z - 3.0; } // spawn em +3, mostra no centro da cova
        }
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

const JUMPSCARE_GIFS = {
    freddy: './images/jumpscares/freddyimgif.gif',
    bonnie: './images/jumpscares/bonnieimg.webp',
    chica:  './images/jumpscares/chicaimg.png',
    foxy:   './images/jumpscares/foxyimggif.gif',
    golden: './images/jumpscares/goldenfreddyimg.jpeg',
};

let _jogoOverDisparado = false;
function jogoOver(nomeInimigo) {
    if (_jogoOverDisparado) return;
    _jogoOverDisparado = true;
    jogoTerminado = true;
    jogoIniciado  = false;


    inimigos.forEach(i => { i.ativo = false; });
    parar('coracao'); parar('luzFlicker'); parar('phoneguy'); parar('passosJogo'); parar('passosHeavy');
    tocar(`jumpscare_${nomeInimigo}`);

    const gifSrc = JUMPSCARE_GIFS[nomeInimigo];

    // fundo preto aparece imediatamente; gif por cima proporcional (contain)
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '60',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', pointerEvents: 'none'
    });
    if (gifSrc) {
        const img = document.createElement('img');
        img.src = gifSrc;
        Object.assign(img.style, {
            width: '100vw', height: '100vh',
            objectFit: 'contain', display: 'block'
        });
        overlay.appendChild(img);
    }
    document.body.appendChild(overlay);

    // duração: Foxy → espera o áudio acabar; outros → 5s fixos
    // o overlay (fundo preto) NUNCA é removido — evita flash do cenário
    function _mostrarGameOver() {
        // esconde o gif mas mantém o fundo preto
        const img = overlay.querySelector('img');
        if (img) {
            img.style.transition = 'opacity 0.3s ease';
            img.style.opacity = '0';
            setTimeout(() => img.remove(), 300);
        }
        setTimeout(() => _preencherGameOver(overlay, nomeInimigo), 350);
    }

    if (nomeInimigo === 'foxy') {
        aoTerminar(`jumpscare_${nomeInimigo}`, _mostrarGameOver);
    } else {
        setTimeout(_mostrarGameOver, 5000);
    }
}

function _ganharJogo() {
    jogoGanho     = true;
    jogoTerminado = true;
    jogoIniciado  = false;

    inimigos.forEach(i => { i.ativo = false; });
    parar('coracao'); parar('luzFlicker'); parar('phoneguy'); parar('passosJogo'); parar('passosHeavy');

    // apagar luzes gradualmente
    const duracaoFade = 1800; // ms
    const inicio = performance.now();
    const luzInicial = luzAmbiente ? luzAmbiente.intensity : 0;
    const fadeId = setInterval(() => {
        const t = Math.min(1, (performance.now() - inicio) / duracaoFade);
        if (luzAmbiente)  luzAmbiente.intensity  = luzInicial * (1 - t);
        if (lanterna)     lanterna.intensity      = 60 * (1 - t);
        if (t >= 1) clearInterval(fadeId);
    }, 16);

    // após fade das luzes → mostrar relógio
    setTimeout(() => {
        _mostrarRelogio();
    }, duracaoFade + 200);
}

function _mostrarRelogio() {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '70',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#000', fontFamily: "'Courier New', monospace",
        textAlign: 'center', pointerEvents: 'none',
        opacity: '0', transition: 'opacity 0.6s ease'
    });

    const hora = document.createElement('div');
    hora.textContent = '5:59 AM';
    Object.assign(hora.style, {
        fontSize: 'clamp(3em,10vw,7em)',
        letterSpacing: '12px', color: '#cccccc',
        textShadow: '0 0 40px #ffffff88'
    });

    const sub = document.createElement('div');
    sub.textContent = 'ALMOST THERE...';
    Object.assign(sub.style, {
        fontSize: 'clamp(0.7em,1.5vw,1em)',
        letterSpacing: '6px', color: '#555',
        marginTop: '16px'
    });

    overlay.appendChild(hora);
    overlay.appendChild(sub);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // ao fim de 1.5s → muda para 6:00 AM com o audio
    setTimeout(() => {
        tocar('6am');
        hora.style.transition = 'color 0.3s ease, text-shadow 0.3s ease';
        hora.style.color       = '#ffcc00';
        hora.style.textShadow  = '0 0 60px #ffcc0088';
        hora.textContent = '6:00 AM';
        sub.style.transition   = 'color 0.5s ease';
        sub.style.color        = '#ffcc00';
        sub.textContent        = '6 AM';

        // após 3s → ecrã de vitória
        setTimeout(() => {
            overlay.remove();
            _criarEcraVitoria();
        }, 3000);
    }, 1500);
}

function _criarEcraVitoria() {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '70',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#000', fontFamily: "'Courier New', monospace",
        textAlign: 'center', pointerEvents: 'auto'
    });
    el.innerHTML = `
        <div style="font-size:clamp(1.4em,2.8vw,2em);letter-spacing:6px;color:#ffcc00;
             margin-bottom:20px;opacity:0;transition:opacity 0.8s ease 0.1s">
            FREDDY FAZBEAR'S PIZZA
        </div>
        <div style="font-size:clamp(2em,5vw,3.2em);letter-spacing:10px;color:#ccffcc;
             text-shadow:0 0 30px #88ff88;opacity:0;transition:opacity 0.8s ease 0.3s">
            YOU SURVIVED
        </div>
        <div style="font-size:clamp(0.8em,1.4vw,1em);letter-spacing:4px;color:#888;
             margin-top:16px;opacity:0;transition:opacity 0.8s ease 0.5s">
            todos os tokens recolhidos
        </div>
        <button id="btn-menu-vitoria" style="
             margin-top:40px;padding:12px 36px;
             font-family:'Courier New',monospace;font-size:clamp(0.8em,1.3vw,1em);
             letter-spacing:5px;color:#cccccc;background:transparent;
             border:1px solid #555;cursor:pointer;
             opacity:0;transition:opacity 0.8s ease 0.8s, border-color 0.2s, color 0.2s">
            VOLTAR AO MENU
        </button>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.querySelectorAll('div, button').forEach(d => { d.style.opacity = '1'; });
    });
    const btn = el.querySelector('#btn-menu-vitoria');
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#ffcc00'; btn.style.color = '#ffcc00'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#555';    btn.style.color = '#cccccc'; });
    btn.addEventListener('click', () => { window.location.reload(); });
}

function _preencherGameOver(overlay, nomeInimigo) {
    // reutiliza o overlay (fundo preto já presente) — sem flash do cenário
    overlay.style.flexDirection = 'column';
    overlay.style.pointerEvents = 'auto';
    const el = document.createElement('div');
    Object.assign(el.style, {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: '100%'
    });
    el.innerHTML = `
        <div style="font-size:clamp(1.4em,2.8vw,2em);letter-spacing:6px;color:#ffcc00;
             margin-bottom:20px;opacity:0;transition:opacity 0.8s ease 0.1s">
            FREDDY FAZBEAR'S PIZZA
        </div>
        <div style="font-size:clamp(2em,5vw,3.2em);letter-spacing:10px;color:#ff2222;
             text-shadow:0 0 30px #ff0000;opacity:0;transition:opacity 0.8s ease 0.3s">
            GAME OVER
        </div>
        <div style="font-size:clamp(0.8em,1.4vw,1em);letter-spacing:4px;color:#cccccc;
             margin-top:16px;opacity:0;transition:opacity 0.8s ease 0.5s">
            apanhado pelo ${nomeInimigo.toUpperCase()}
        </div>
        <button id="btn-menu-gameover" style="
             margin-top:40px;padding:12px 36px;
             font-family:'Courier New',monospace;font-size:clamp(0.8em,1.3vw,1em);
             letter-spacing:5px;color:#cccccc;background:transparent;
             border:1px solid #555;cursor:pointer;
             opacity:0;transition:opacity 0.8s ease 0.8s, border-color 0.2s, color 0.2s">
            VOLTAR AO MENU
        </button>
    `;
    overlay.appendChild(el);
    requestAnimationFrame(() => {
        el.querySelectorAll('div, button').forEach(d => { d.style.opacity = '1'; });
    });
    const btn = el.querySelector('#btn-menu-gameover');
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#ffcc00'; btn.style.color = '#ffcc00'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#555';    btn.style.color = '#cccccc'; });
    btn.addEventListener('click', () => { window.location.reload(); });
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

// sem isto os bones ficam desalinhados após escalar modelos com SkinnedMesh
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

// carrega os modelos dos animatrónicos (Sketchfab + Mixamo)
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
            // foxy dentro da cova (interior em +Z): +3 para não sair com o braço pela cortina
            SPAWN_FOXY.set(spawnCova.centro.x, spawnCova.bb.max.y + 1.95, spawnCova.centro.z + 3.0);
        } else {
            SPAWN_FOXY.set(cx + off * 2, topY + 1.95, cz + 3.5);
        }

        SPAWN_GOLDEN.set(cx, topY + 1.95, cz);

        // holofote estragado do palco — inclinado de frente para trás a apanhar os 3
        const luzPalco = new THREE.SpotLight(0xffe8aa, 2.0, 50, 0.65, 0.45, 1.4);
        luzPalco.position.set(cx, topY + 10, cz + 6);
        const alvoLuzPalco = new THREE.Object3D();
        alvoLuzPalco.position.set(cx, topY + 1, cz + 1.5);
        cenaJogo.add(alvoLuzPalco);
        luzPalco.target = alvoLuzPalco;
        cenaJogo.add(luzPalco);
        luzesFlicker.push({ luz: luzPalco, fase: Math.random() * Math.PI * 2, estragada: true, fator: 2.8 });
    } else {
        SPAWN_FREDDY.set( 0.0, floorY + 0.2, -39);
        SPAWN_BONNIE.set(-2.5, floorY + 0.2, -39);
        SPAWN_CHICA.set(  2.5, floorY + 0.0, -39);
        SPAWN_FOXY.set(   5.0, floorY + 0.2, -39);
        SPAWN_GOLDEN.set( 0.0, floorY + 0.2, -39);
    }

    const ESC = { freddy: 1.15, bonnie: 2.65, chica: 0.035, foxy: 1.15, golden: 0.035 };

    function loadChar(path, spawn, rotY, velocidade, escala, nome, clipNome, timeScale = 1.0, walkYOffset = 0, clipAndarNome = null, walkTimeScale = 1.0, forcedFloorOffset = undefined) {
        loader.load(path, gltf => {
            const modelo = gltf.scene;
            modelo.scale.setScalar(escala);
            cenaJogo.add(modelo);

            // posiciona no spawn
            modelo.position.set(spawn.x, spawn.y, spawn.z);
            modelo.updateMatrixWorld(true);
            const _geomMinY = calcMinY(modelo);
            console.log(`[${nome}] spawn.y:`, spawn.y.toFixed(2), '| geomMinY:', _geomMinY.toFixed(2), '| diff:', (spawn.y - _geomMinY).toFixed(2));
            // golden: guarda offset pés→origin uma vez para não recalcular por teleporte
            if (nome === 'golden') _goldenFeetAdj = spawn.y - _geomMinY;
            modelo.rotation.y = rotY;

            // emissive + desativar frustum culling (evita que bones animados escondam o modelo)
            modelo.traverse(o => {
                if (!o.isMesh && !o.isSkinnedMesh) return;
                o.frustumCulled = false;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    if (nome === 'golden') {
                        // empurra cor para dourado — reduz verde e azul, aumenta vermelho
                        if (m.color) {
                            m.color.r = Math.min(1, m.color.r * 1.3);
                            m.color.g = m.color.g * 0.50;
                            m.color.b = m.color.b * 0.08;
                        }
                        if (m.emissive) { m.emissive.set(0x4a2800); m.emissiveIntensity = 0.9; }
                        // roughness alto evita reflexos verdes especulares
                        if ('roughness' in m) m.roughness = Math.min(1, (m.roughness ?? 0.8) + 0.3);
                        if ('metalness' in m) m.metalness = 0;
                    } else {
                        if (m.emissive) { m.emissive.set(0x0f0c0c); m.emissiveIntensity = 0.5; }
                    }
                    m.needsUpdate = true;
                });
            });

            // Golden Freddy: luz de brilho âmbar + começa invisível
            if (nome === 'golden') {
                _goldenLuz = new THREE.PointLight(0xffaa33, 0, 9);
                _goldenLuz.position.set(0, 2, 0);
                modelo.add(_goldenLuz);
                modelo.visible = false;
            }

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
                if (n.includes('walk') || n.includes('run') || n.includes('charge')) clipAndar     = c;
                else if (n.includes('jump') || n.includes('scare') || n.includes('attack'))         clipJumpscare = c;
                else clipIdle = clipIdle || c;
            });
            if (!clipIdle && gltf.animations.length > 0) clipIdle = gltf.animations[0];
            // sobrepõe clip de andar se nome explícito fornecido
            if (clipAndarNome) {
                clipAndar =
                    gltf.animations.find(c => c.name.toLowerCase() === clipAndarNome.toLowerCase()) ||
                    gltf.animations.find(c => c.name.toLowerCase().includes(clipAndarNome.toLowerCase())) ||
                    clipAndar;
            }

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

            // floorOffset: baixa o modelo para os pés ficarem no chão
            const computedFloorOffset = Math.min(0, spawn.y - _geomMinY);
            const floorOffset = forcedFloorOffset !== undefined ? forcedFloorOffset : computedFloorOffset;
            console.log(`[${nome}] floorOffset:`, floorOffset.toFixed(3), '(computed:', computedFloorOffset.toFixed(3), ')');

            inimigos.push({
                nome, modelo, mixer, rootBones, rootBonesInitPos,
                armatureGrupos,
                clipIdle, clipAndar, clipJumpscare, acaoAtual,
                spawnPos: spawn.clone(), spawnY: spawn.y, walkYOffset, walkTimeScale,
                velocidade, floorOffset,
                ativo: false, congelado: false, posicionado: false,
                waypointIdx: undefined, targetWaypointIdx: undefined, prevWaypointIdx: undefined,
            });
        }, undefined, err => console.error('Erro ao carregar', nome, err));
    }

    //                 path                          spawn         rotY  vel   esc         nome      clipIdle                       tS   wYOff  clipAndar                      walkTS  forcedFloorOffset
    if (dificuldadeAtual === 'dificil') {
        loadChar('./Models/Personagens/goldenfreddy.glb', SPAWN_GOLDEN, 0, 0,   ESC.golden, 'golden', null,                          1.0, 0, null,                          1.0       );
        loadChar('./Models/Personagens/freddy_ar.glb',    SPAWN_FREDDY, 0, 1.8, ESC.freddy, 'freddy', 'Freddy--Idle',                1.0, 0, 'Freddy--Charge',              0.35, -1.1);
        loadChar('./Models/Personagens/bonnie.glb',       SPAWN_BONNIE, 0.25, 2.0, ESC.bonnie, 'bonnie', 'Bonnie--Idle',             1.0, 0, 'Bonnie--walk',                1.0       );
        loadChar('./Models/Personagens/chica.glb',        SPAWN_CHICA,  0, 1.9, ESC.chica,  'chica',  'chica_rings_skeleton|idle',   1.0, 0, 'chica_rings_skeleton|walk',   1.0       );
        loadChar('./Models/Personagens/foxy_ar.glb',      SPAWN_FOXY,   0, 3.0, ESC.foxy,   'foxy',   'Foxy--Idle',                  1.0, 0, 'Foxy--Charge',                0.35      );
    } else {
        loadChar('./Models/Personagens/freddy_ar.glb', SPAWN_FREDDY,  0,    1.8, ESC.freddy, 'freddy', 'Freddy--Idle',                1.0, 0,    'Freddy--Charge',              0.35,   -1.1);
        loadChar('./Models/Personagens/bonnie.glb',    SPAWN_BONNIE,  0.25, 2.0, ESC.bonnie, 'bonnie', 'Bonnie--Idle',                1.0, 0,    'Bonnie--walk',                1.0 );
        loadChar('./Models/Personagens/chica.glb',     SPAWN_CHICA,   0,    1.9, ESC.chica,  'chica',  'chica_rings_skeleton|idle',   1.0, 0,    'chica_rings_skeleton|walk',   1.0 );
        loadChar('./Models/Personagens/foxy_ar.glb',   SPAWN_FOXY,    0,    3.0, ESC.foxy,   'foxy',   'Foxy--Idle',                  1.0, 0,    'Foxy--Charge',                0.35);
    }
}

// ─── WAYPOINTS ─────────────────────────────────────────────────────

// verifica se o segmento (ax,az)→(bx,bz) passa pelo interior das zones (não pelas bordas)
function _caminhoClear(ax, az, bx, bz) {
    const M     = 0.25; // margem interior — força caminhos pelo centro, não pelas arestas
    const dist  = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(4, Math.ceil(dist / 0.35));
    for (let s = 0; s <= steps; s++) {
        const t  = s / steps;
        const mx = ax + (bx - ax) * t;
        const mz = az + (bz - az) * t;
        const ok = zonasSemExpansao.some(bb =>
            mx >= bb.min.x + M && mx <= bb.max.x - M &&
            mz >= bb.min.z + M && mz <= bb.max.z - M
        );
        if (!ok) return false;
    }
    return true;
}

function _construirWaypoints() {
    const SPACING = 5.5; // igual ao criarTokens
    waypoints   = [];
    waypointAdj = [];

    // Y do chão = mínimo de todos os topo das zones (ignora zones elevadas do palco)
    _waypointFloorY = zonasCaminhaveis.reduce((mn, bb) => Math.min(mn, bb.max.y), Infinity);

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
                const x = cols === 1 ? cx : cx + (c - (cols - 1) / 2) * SPACING;
                const z = rows === 1 ? cz : cz + (r - (rows - 1) / 2) * SPACING;
                if (x < bb.min.x + 0.4 || x > bb.max.x - 0.4) continue;
                if (z < bb.min.z + 0.4 || z > bb.max.z - 0.4) continue;
                // todos os waypoints partilham o mesmo Y — chão sempre plano
                waypoints.push({ x, y: _waypointFloorY, z });
            }
        }
    });

    // Deduplica: zonas sobrepostas/adjacentes podem gerar waypoints muito próximos
    const MERGE_DIST = 2.0;
    const deduped = [];
    waypoints.forEach(wp => {
        if (!deduped.some(d => Math.hypot(d.x - wp.x, d.z - wp.z) < MERGE_DIST))
            deduped.push(wp);
    });
    waypoints = deduped;

    // adjacência: só ligações cardinais (X ou Z dominante, não diagonal) + caminho livre
    const ADJ_DIST = SPACING * 1.8; // ~9.9 u
    waypointAdj = waypoints.map(() => []);
    for (let i = 0; i < waypoints.length; i++) {
        for (let j = i + 1; j < waypoints.length; j++) {
            const adx  = Math.abs(waypoints[i].x - waypoints[j].x);
            const adz  = Math.abs(waypoints[i].z - waypoints[j].z);
            const dist = Math.hypot(adx, adz);
            if (dist > ADJ_DIST) continue;
            // rejeita diagonais: o eixo menor deve ser < 30% do maior
            const menor = Math.min(adx, adz);
            const maior = Math.max(adx, adz);
            if (maior > 0.01 && menor / maior > 0.3) continue;
            // caminho totalmente dentro das zones caminhaveis
            if (!_caminhoClear(waypoints[i].x, waypoints[i].z,
                               waypoints[j].x, waypoints[j].z)) continue;
            waypointAdj[i].push(j);
            waypointAdj[j].push(i);
        }
    }
    console.log(`[waypoints] ${waypoints.length} nós, ${waypointAdj.reduce((s, a) => s + a.length, 0) / 2} arestas, floorY=${_waypointFloorY.toFixed(3)}`);
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

// colisão para animatronicos — exactamente igual ao jogador (mesma margem)
function _colideAnim(x, z) {
    const M = 0.15;
    return !zonasCaminhaveis.some(bb =>
        x >= bb.min.x + M && x <= bb.max.x - M &&
        z >= bb.min.z + M && z <= bb.max.z - M
    );
}

// movimento por waypoints — animatronics movem-se entre os centros das zones caminhaveis
function moverInimigoWaypoint(ini, delta) {
    if (waypoints.length === 0 || ini.waypointIdx === undefined) return;

    // escolhe próximo waypoint se não tiver destino
    if (ini.targetWaypointIdx === undefined) {
        const adj = waypointAdj[ini.waypointIdx] ?? [];
        if (adj.length === 0) { trocarClip(ini, ini.clipIdle); return; }
        const nonBack = adj.filter(idx => idx !== ini.prevWaypointIdx);
        const choices = nonBack.length > 0 ? nonBack : adj;
        // evita waypoints ocupados e zona do Golden
        const golden = inimigos.find(o => o.nome === 'golden' && o.ativo);
        const livres = choices.filter(idx => {
            if (inimigos.some(o => o !== ini && o.ativo && o.nome !== 'golden' &&
                (o.waypointIdx === idx || o.targetWaypointIdx === idx))) return false;
            const wp = waypoints[idx];
            // exclui SEMPRE waypoints perto do spawn do Golden (ativo ou não)
            if (Math.hypot(wp.x - SPAWN_GOLDEN.x, wp.z - SPAWN_GOLDEN.z) < 3.5) return false;
            if (golden) {
                // se golden estiver ativo, exclui também waypoints perto da sua posição atual
                if (Math.hypot(wp.x - golden.modelo.position.x, wp.z - golden.modelo.position.z) < 2.0) return false;
                const cx = ini.modelo.position.x, cz = ini.modelo.position.z;
                for (let s = 1; s <= 6; s++) {
                    const t = s / 6;
                    if (Math.hypot(cx + (wp.x - cx) * t - golden.modelo.position.x,
                                   cz + (wp.z - cz) * t - golden.modelo.position.z) < 1.5) return false;
                }
            }
            return true;
        });
        // foge do Golden se ficou preso
        if (livres.length === 0) {
            const pxg = ini.modelo.position.x, pzg = ini.modelo.position.z;
            const pertoDGolden = Math.hypot(pxg - SPAWN_GOLDEN.x, pzg - SPAWN_GOLDEN.z) < 5;
            if (pertoDGolden) {
                const fuga = waypoints
                    .map((wp, i) => ({ i, d: Math.hypot(wp.x - SPAWN_GOLDEN.x, wp.z - SPAWN_GOLDEN.z) }))
                    .filter(o => o.d > 7)
                    .sort((a, b) => b.d - a.d)
                    .slice(0, 3);
                if (fuga.length > 0) {
                    const dest = fuga[Math.floor(Math.random() * fuga.length)];
                    ini.waypointIdx = dest.i;
                    ini.targetWaypointIdx = undefined;
                    ini.prevWaypointIdx   = undefined;
                    const wp = waypoints[dest.i];
                    const fy = wp.y + (ini.floorOffset ?? 0);
                    ini.modelo.position.set(wp.x, fy, wp.z);
                    ini.spawnY = fy;
                }
                return;
            }
        }
        const pool = livres.length > 0 ? livres : choices;
        ini.targetWaypointIdx = pool[Math.floor(Math.random() * pool.length)];
        ini._tempoParado = 0;
    }

    const tgt  = waypoints[ini.targetWaypointIdx];
    const dx   = tgt.x - ini.modelo.position.x;
    const dz   = tgt.z - ini.modelo.position.z;
    const dist = Math.hypot(dx, dz);

    trocarClip(ini, ini.clipAndar || ini.clipIdle);

    // chegou
    if (dist < 0.12) {
        const fy = tgt.y + (ini.floorOffset ?? 0);
        ini.modelo.position.x = tgt.x;
        ini.modelo.position.z = tgt.z;
        ini.modelo.position.y = fy;
        ini.spawnY            = fy;
        ini.prevWaypointIdx   = ini.waypointIdx;
        ini.waypointIdx       = ini.targetWaypointIdx;
        ini.targetWaypointIdx = undefined;
        ini._tempoParado      = 0;
        return;
    }

    // movimento suave: tenta diagonal, fallback por eixo (igual ao jogador)
    const step = ini.velocidade * delta;
    const s    = Math.min(dist, step);
    const nx   = ini.modelo.position.x + (dx / dist) * s;
    const nz   = ini.modelo.position.z + (dz / dist) * s;

    const _gCol = inimigos.find(o => o.nome === 'golden' && o.ativo);
    const _bloqGolden = (x, z) => _gCol
        ? Math.hypot(x - _gCol.modelo.position.x, z - _gCol.modelo.position.z) < 1.2
        : false;

    let moveu = false;
    if (!_colideAnim(nx, nz) && !_bloqGolden(nx, nz)) {
        ini.modelo.position.x = nx; ini.modelo.position.z = nz; moveu = true;
    } else if (!_colideAnim(nx, ini.modelo.position.z) && !_bloqGolden(nx, ini.modelo.position.z)) {
        ini.modelo.position.x = nx; moveu = true;
    } else if (!_colideAnim(ini.modelo.position.x, nz) && !_bloqGolden(ini.modelo.position.x, nz)) {
        ini.modelo.position.z = nz; moveu = true;
    }

    // rotação: cardinal dominante (visual limpo, sem rotação diagonal brusca)
    const absX = Math.abs(dx), absZ = Math.abs(dz);
    if (absX >= absZ) ini.modelo.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    else              ini.modelo.rotation.y = dz > 0 ? 0 : Math.PI;

    // stuck: se parado > 3 s, escolhe novo destino
    // se bloqueado pelo Golden — redireciona imediatamente sem esperar
    if (moveu) {
        ini._tempoParado = 0;
    } else {
        const bloqPorGolden = _gCol && (
            _bloqGolden(nx, nz) ||
            _bloqGolden(nx, ini.modelo.position.z) ||
            _bloqGolden(ini.modelo.position.x, nz)
        );
        if (bloqPorGolden) {
            // escolhe o waypoint adjacente mais longe do Golden — anda para o lado oposto
            const adj = waypointAdj[ini.waypointIdx] ?? [];
            const gx  = _gCol.modelo.position.x, gz = _gCol.modelo.position.z;
            const longe = [...adj].sort((a, b) =>
                Math.hypot(waypoints[b].x - gx, waypoints[b].z - gz) -
                Math.hypot(waypoints[a].x - gx, waypoints[a].z - gz)
            );
            ini.targetWaypointIdx = longe.length > 0 ? longe[0] : undefined;
            ini._tempoParado      = 0;
        } else {
            ini._tempoParado = (ini._tempoParado || 0) + delta;
            if (ini._tempoParado > 3.0) {
                ini.targetWaypointIdx = undefined;
                ini._tempoParado      = 0;
            }
        }
    }

    ini.modelo.position.y = ini.spawnY;
}

function snapParaChaopaandar(ini, minDistJogador = 0) {
    const off = ini.floorOffset ?? 0;

    if (waypoints.length > 0) {
        // candidatos ordenados por distância ao spawn
        const sorted = waypoints
            .map((wp, i) => ({ i, wp, dSpawn: Math.hypot(ini.spawnPos.x - wp.x, ini.spawnPos.z - wp.z) }))
            .sort((a, b) => a.dSpawn - b.dSpawn);

        // prefere o mais próximo do spawn que esteja longe o suficiente do jogador
        const seguros = sorted.filter(c =>
            Math.hypot(c.wp.x - playerPos.x, c.wp.z - playerPos.z) >= minDistJogador
        );
        const escolha = seguros.length > 0 ? seguros[0] : sorted[0]; // fallback: mais próximo do spawn

        const wp = escolha.wp;
        const fy = wp.y + off;
        ini.modelo.position.set(wp.x, fy, wp.z);
        ini.spawnY            = fy;
        ini.waypointIdx       = escolha.i;
        ini.prevWaypointIdx   = escolha.i;
        ini.targetWaypointIdx = undefined;
        ini.posicionado = true;
        return;
    }

    // fallback: centro da zone mais próxima, Y sempre ao nível do chão principal
    let melhor = null, melhorDist = Infinity;
    zonasCaminhaveis.forEach(bb => {
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const d = Math.hypot(ini.spawnPos.x - cx, ini.spawnPos.z - cz);
        if (d < melhorDist) { melhorDist = d; melhor = { cx, cz }; }
    });
    if (melhor) {
        const fy = _waypointFloorY + off; // força Y ao chão, não ao topo do palco
        ini.modelo.position.set(melhor.cx, fy, melhor.cz);
        ini.spawnY = fy;
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
    if (minDist === Infinity) { setCoracaoFactor(1.6); return; }
    // factor: 1.6 (base sem inimigos) → 4.0 (inimigo a 2 unidades)
    const t = 1 - Math.min(1, Math.max(0, (minDist - 2) / 13));
    setCoracaoFactor(1.6 + t * 2.4);
}

function _prepararAtivacoes() {
    // ordem aleatória dos 4 personagens
    const pool = ['freddy', 'bonnie', 'chica', 'foxy']
        .sort(() => Math.random() - 0.5);

    const atraso1 = 5 + Math.random() * 5; // 5–10 s após phoneguy

    if (dificuldadeAtual === 'facil') {
        _pendingActivations = [
            { nome: pool[0], fired: false,
              check: () => phoneguyTerminou && tempoAposPhoneguy >= atraso1 },
            { nome: pool[1], fired: false,
              check: () => totalTokens > 0 && tokensApanhados > totalTokens * 0.5 },
        ];
    } else if (dificuldadeAtual === 'normal') {
        _pendingActivations = [
            { nome: pool[0], fired: false,
              check: () => phoneguyTerminou && tempoAposPhoneguy >= atraso1 },
            { nome: pool[1], fired: false,
              check: () => totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.4) },
            { nome: pool[2], fired: false,
              check: () => totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.75) },
        ];
    } else if (dificuldadeAtual === 'dificil') {
        _pendingActivations = [
            { nome: '__golden__', fired: false,
              check: () => phoneguyTerminou && tempoAposPhoneguy >= 5 },
            { nome: pool[0], fired: false,
              check: () => phoneguyTerminou && tempoAposPhoneguy >= atraso1 },
            { nome: pool[1], fired: false,
              check: () => totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.30) },
            { nome: pool[2], fired: false,
              check: () => totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.55) },
            { nome: pool[3], fired: false,
              check: () => totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.80) },
        ];
    }
}

function atualizarInimigos(delta) {
    if (!jogoIniciado) return;

    if (phoneguyTerminou) tempoAposPhoneguy += delta;

    // prepara activações uma vez quando o jogo e tokens estão prontos
    if (!_ativacoesPreparadas && totalTokens > 0) {
        _prepararAtivacoes();
        _ativacoesPreparadas = true;
    }

    // dispara activações pendentes — no máximo 1 de cada vez, mínimo 15s de intervalo
    for (const pa of _pendingActivations) {
        if (pa.fired) continue;
        if (pa.nome !== '__golden__' && alertas[pa.nome]) continue;
        if (elapsedTime - _tempoUltimaAtivacao < COOLDOWN_ATIVACAO) break;
        if (pa.check()) {
            pa.fired = true;
            _tempoUltimaAtivacao = elapsedTime;
            if (pa.nome === '__golden__') {
                _iniciarGoldenFreddy();
            } else {
                ativarInimigo(pa.nome);
            }
            break;
        }
    }

    inimigos.forEach(ini => {
        if (!ini.ativo) return;
        if (ini.nome === 'golden') return;       // golden gerido por _tickGoldenFreddy
        if (ini._pausadoPorGolden) return;       // pausado durante jumpscare do Golden

        moverInimigoWaypoint(ini, delta);

        const d2 = Math.hypot(
            ini.modelo.position.x - playerPos.x,
            ini.modelo.position.z - playerPos.z
        );
        if (d2 < 1.2) jogoOver(ini.nome);
    });

    if (dificuldadeAtual === 'dificil') _tickGoldenFreddy(delta);
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
            tocar('phoneguy');
            tocar('coracao');
            tocar('luzFlicker');
            aoPhoneguyTerminar(() => { phoneguyTerminou = true; });
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

let _alertaCorridaMostrado = false;
function _alertaCorrida() {
    if (_alertaCorridaMostrado) return;
    _alertaCorridaMostrado = true;
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', top: '0', left: '0', right: '0',
        zIndex: '45',
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1.5px solid #ffcc00',
        fontFamily: "'Courier New', monospace",
        color: '#ffcc00', textAlign: 'center',
        padding: '10px 16px',
        fontSize: 'clamp(0.8em,1.6vw,1em)',
        letterSpacing: '5px',
        opacity: '0', transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
    });
    el.textContent = '⚠  CORRA PARA O ESCRITÓRIO  ⚠';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    // fica mais tempo no ecrã por ser importante
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
    }, 5000);
}

function _executarAtivacao(ini) {
    if (zonasCaminhaveis.length > 0) snapParaChaopaandar(ini, 5.0); // nunca spawna a < 5u do jogador
    ini.ativo = true;
    const clipMove = ini.clipAndar || ini.clipIdle;
    if (clipMove && ini.acaoAtual) {
        ini.acaoAtual.stop();
        ini.acaoAtual = ini.mixer.clipAction(clipMove);
        ini.acaoAtual.timeScale = ini.walkTimeScale ?? 1.0;
        ini.acaoAtual.play();
        if (ini.walkYOffset) {
            ini.spawnY += ini.walkYOffset;
            ini.modelo.position.y = ini.spawnY;
        }
    }
}

function _spawnWaypointDist(ini) {
    // distância do jogador ao waypoint mais próximo do spawn deste inimigo
    if (waypoints.length === 0) return Infinity;
    let best = Infinity;
    waypoints.forEach(wp => {
        const dSpawn = Math.hypot(ini.spawnPos.x - wp.x, ini.spawnPos.z - wp.z);
        if (dSpawn < best) best = dSpawn;
    });
    // o waypoint mais próximo do spawn — distância ao jogador
    let nearestWP = waypoints[0];
    let nearestD  = Infinity;
    waypoints.forEach(wp => {
        const d = Math.hypot(ini.spawnPos.x - wp.x, ini.spawnPos.z - wp.z);
        if (d < nearestD) { nearestD = d; nearestWP = wp; }
    });
    return Math.hypot(nearestWP.x - playerPos.x, nearestWP.z - playerPos.z);
}

function ativarInimigo(nome) {
    alertas[nome] = true;
    mostrarAlerta(nome);
    const ini = inimigos.find(i => i.nome === nome);
    if (!ini) return;
    _executarAtivacao(ini); // snapParaChaopaandar garante distância mínima ao jogador
}

// ─── GOLDEN FREDDY (MODO DIFÍCIL) ─────────────────────────────────

function _iniciarGoldenFreddy() {
    _goldenIniciado = true;
    _goldenFase     = 0;
    _goldenCooldown = 3 + Math.random() * 4; // 3–7s após ativação
    const g = inimigos.find(i => i.nome === 'golden');
    if (g) { g.modelo.visible = false; g.ativo = false; }
}

function _mostrarItsMeGolden(cb) {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '55',
        overflow: 'hidden', pointerEvents: 'none'
    });
    const txt = document.createElement('div');
    Object.assign(txt.style, {
        position: 'absolute',
        fontFamily: "'Courier New', monospace",
        fontSize:   'clamp(2em,5vw,3.5em)',
        color:      '#ffffff',
        letterSpacing: '14px',
        fontWeight:    'bold',
        opacity:       '0',
        transform:     'translate(-50%, -50%)',
        whiteSpace:    'nowrap'
    });
    txt.textContent = "IT'S ME";
    el.appendChild(txt);
    document.body.appendChild(el);

    function flash(onDone) {
        txt.style.left    = (10 + Math.random() * 80) + '%';
        txt.style.top     = (15 + Math.random() * 70) + '%';
        txt.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
        const dur = 55 + Math.random() * 95;
        setTimeout(() => { txt.style.opacity = '0'; setTimeout(onDone, 70 + Math.random() * 130); }, dur);
    }

    let count = 0;
    const total = 2;
    function nextFlash() {
        if (count >= total) { el.remove(); cb?.(); return; }
        count++;
        flash(nextFlash);
    }
    nextFlash();
}

function _executarTeleporte() {
    if (_goldenCapturou || jogoTerminado || jogoGanho) return;
    const g = inimigos.find(i => i.nome === 'golden');
    if (!g || waypoints.length === 0) return;

    let wp;
    if (_goldenFase === 2) {
        // 2ª posição: waypoint mais próximo do escritório (zona de spawn do jogador)
        const ox = OFFICE_XZ.x, oz = OFFICE_XZ.y;
        wp = waypoints.reduce((best, w) =>
            Math.hypot(w.x - ox, w.z - oz) < Math.hypot(best.x - ox, best.z - oz) ? w : best
        , waypoints[0]);
    } else {
        // 1ª posição: waypoint aleatório — não ao lado do jogador nem perto do escritório
        const pool = waypoints.filter(w =>
            Math.hypot(w.x - playerPos.x, w.z - playerPos.z) > 3 &&
            Math.hypot(w.x - OFFICE_XZ.x, w.z - OFFICE_XZ.y) > 6
        );
        const lista = pool.length > 0 ? pool : waypoints;
        wp = lista[Math.floor(Math.random() * lista.length)];
    }

    // usa offset pré-calculado no loadChar — sem traversal de geometria por teleporte
    const fy = wp.y + _goldenFeetAdj - 0.25;
    g.modelo.position.set(wp.x, fy, wp.z);
    g.spawnY         = fy;
    g.ativo          = true;
    g.modelo.visible = true;
    // fase 1: fica 2min ou até 70% tokens; fase 2: fica até ser apanhado
    _goldenTempoVisivel = _goldenFase === 1 ? 120 : 99999;
}

function _goldenCapturarJogador() {
    if (_goldenCapturou) return;
    _goldenCapturou = true;
    const g = inimigos.find(i => i.nome === 'golden');
    if (g) { g.ativo = false; g.modelo.visible = false; }

    // pausa os outros animatrónicos durante o jumpscare
    inimigos.forEach(i => { if (i.nome !== 'golden') i._pausadoPorGolden = true; });
    tocar('jumpscare_golden');

    const gifSrc = JUMPSCARE_GIFS['golden'];
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '60',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', pointerEvents: 'none',
        opacity: '0', transition: 'opacity 0.2s ease'
    });
    if (gifSrc) {
        const img = document.createElement('img');
        img.src = gifSrc;
        Object.assign(img.style, { width: '100vw', height: '100vh', objectFit: 'contain' });
        overlay.appendChild(img);
    }
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    setTimeout(() => {
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            inimigos.forEach(i => { if (i.nome !== 'golden') delete i._pausadoPorGolden; });
            _aplicarDebuff();
        }, 500);
    }, 3000);
}

function _aplicarDebuff() {
    _debuffAtivo = true;
    _debuffOverlay = document.createElement('div');
    Object.assign(_debuffOverlay.style, {
        position: 'fixed', inset: '0', zIndex: '35',
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
        transition: 'opacity 0.8s ease'
    });
    document.body.appendChild(_debuffOverlay);
    // debuff dura 20 s
    setTimeout(() => {
        if (_debuffOverlay) {
            _debuffOverlay.style.opacity = '0';
            setTimeout(() => { _debuffOverlay?.remove(); _debuffOverlay = null; }, 800);
        }
        _debuffAtivo = false;
    }, 20000);
}

function _atualizarGoldenEfeitos() {
    if (_goldenLuz) {
        const flicker = Math.random() > 0.93 ? 3 : 0;
        _goldenLuz.intensity = 1.5 + Math.sin(elapsedTime * 9.3) * 0.8 + flicker;
    }
    // emissive glitch ocasional
    if (Math.random() > 0.96) {
        const g = inimigos.find(i => i.nome === 'golden');
        if (g) g.modelo.traverse(o => {
            if (!o.isMesh && !o.isSkinnedMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => { if (m.emissive) m.emissiveIntensity = 0.3 + Math.random() * 2.5; });
        });
    }
}

function _tickGoldenFreddy(delta) {
    if (!_goldenIniciado || _goldenCapturou || jogoTerminado || jogoGanho) return;
    const g = inimigos.find(i => i.nome === 'golden');
    if (!g) return;

    if (g.ativo) {
        if (_goldenFase === 1) _goldenTempoVisivel -= delta;

        // captura se jogador se aproximar
        const d = Math.hypot(g.modelo.position.x - playerPos.x, g.modelo.position.z - playerPos.z);
        if (d < 1.5) { _goldenCapturarJogador(); return; }

        _atualizarGoldenEfeitos();

        // fase 1: muda para perto do escritório ao fim de 2min OU quando 70% tokens apanhados
        if (_goldenFase === 1) {
            const tokens70 = totalTokens > 0 && tokensApanhados >= Math.floor(totalTokens * 0.70);
            if (_goldenTempoVisivel <= 0 || tokens70) {
                g.ativo          = false;
                g.modelo.visible = false;
                _goldenFase     = 2;
                _goldenCooldown = 30 + Math.random() * 10; // pausa 30–40s (só conta quando jogo ativo)
            }
        }
        // fase 2: fica até ser apanhado — sem transição automática
    } else {
        _goldenCooldown -= delta; // só decrementa aqui — congela automaticamente em pausa
        if (_goldenCooldown <= 0) {
            _goldenCooldown = Infinity;
            if (_goldenFase === 0) _goldenFase = 1;
            _mostrarItsMeGolden(() => _executarTeleporte());
        }
    }
}
