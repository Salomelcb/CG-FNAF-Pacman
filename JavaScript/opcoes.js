import { CONFIG, salvarConfig, atualizarVolumes, pausarAmbientais, retomarAmbientais, tocar } from './audio.js';

let _divOpcoes      = null;
let _divPausa       = null;
let _divConfirm     = null;
let _pausado        = false;
let _cbRetomar      = null;
let _cbMenu         = null;
let _cbSair         = null;
let _abertoDePausa  = false; // opções abertas a partir do menu de pausa

export function estaPausado() { return _pausado; }

export function estaOverlayAberto() {
    const vis = el => el && getComputedStyle(el).display !== 'none';
    return vis(_divOpcoes) || vis(_divPausa) || vis(_divConfirm);
}

export function configurarCallbacks(onRetomar, onMenu, onSair) {
    _cbRetomar = onRetomar;
    _cbMenu    = onMenu;
    _cbSair    = onSair;
}

// dePausa=true quando abre a partir do menu de pausa (sons já pausados, não mexer neles)
export function mostrarOpcoes(dePausa = false) {
    if (!_divOpcoes) return;
    _abertoDePausa = dePausa;
    _sincronizarSliders();
    _divOpcoes.style.display = 'flex';
    requestAnimationFrame(() => { _divOpcoes.style.opacity = '1'; });
}

export function esconderOpcoes() {
    if (!_divOpcoes) return;
    _divOpcoes.style.opacity = '0';
    setTimeout(() => {
        _divOpcoes.style.display = 'none';
        if (_abertoDePausa) {
            // volta ao menu de pausa sem alterar sons (continuam parados)
            _divPausa.style.display = 'flex';
            requestAnimationFrame(() => { _divPausa.style.opacity = '1'; });
        }
        _abertoDePausa = false;
    }, 300);
}

export function mostrarPausa() {
    if (!_divPausa || _pausado) return;
    _pausado = true;
    pausarAmbientais();
    _divPausa.style.display = 'flex';
    requestAnimationFrame(() => { _divPausa.style.opacity = '1'; });
}

export function esconderPausa() {
    if (!_divPausa) return;
    _pausado = false;
    retomarAmbientais();
    _divPausa.style.opacity = '0';
    setTimeout(() => { _divPausa.style.display = 'none'; }, 300);
}

function _sincronizarSliders() {
    [
        ['fnaf-vol-geral',  'fnaf-pct-geral',  CONFIG.volumeGeral  ],
        ['fnaf-vol-musica', 'fnaf-pct-musica', CONFIG.volumeMusica ],
        ['fnaf-vol-sfx',    'fnaf-pct-sfx',    CONFIG.volumeSFX    ],
        ['fnaf-sens',       'fnaf-pct-sens',   CONFIG.sensibilidade],
    ].forEach(([id, pctId, val]) => {
        const el  = document.getElementById(id);
        const pct = document.getElementById(pctId);
        if (el)  el.value       = val * 100;
        if (pct) pct.textContent = Math.round(val * 100) + '%';
    });
}

export function criarPaineis() {
    _criarEstilos();
    _criarOverlayOpcoes();
    _criarOverlayPausa();
    _criarOverlayConfirm();
}

function _criarEstilos() {
    const s = document.createElement('style');
    s.textContent = `
        .fnaf-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.84);
            z-index: 200; opacity: 0;
            transition: opacity 0.3s ease;
            align-items: center; justify-content: center;
        }
        .fnaf-painel {
            background: linear-gradient(160deg, #0a0303 0%, #060606 60%, #0a0202 100%);
            border: 1px solid #7a0000;
            box-shadow: 0 0 50px rgba(160,0,0,0.2), inset 0 0 80px rgba(60,0,0,0.15);
            padding: 38px 48px 34px;
            min-width: 460px; max-width: 580px; width: 90%;
            font-family: 'Courier New', monospace;
            position: relative; overflow: hidden;
        }
        .fnaf-painel::before {
            content: '';
            position: absolute; inset: 0;
            background: repeating-linear-gradient(
                0deg, transparent, transparent 3px,
                rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px);
            pointer-events: none; z-index: 0;
        }
        .fnaf-painel > * { position: relative; z-index: 1; }
        .fnaf-titulo {
            font-size: clamp(1.1em, 2.2vw, 1.45em);
            color: #bb2000; letter-spacing: 10px;
            text-transform: uppercase;
            text-shadow: 0 0 14px rgba(190,30,0,0.55), 0 0 35px rgba(100,0,0,0.25);
            margin-bottom: 28px; text-align: center;
            animation: fnafPisca 9s infinite;
        }
        .fnaf-secao {
            color: #5a1800; letter-spacing: 6px; font-size: 0.68em;
            text-transform: uppercase; margin: 22px 0 10px;
            border-bottom: 1px solid #2e0800; padding-bottom: 5px;
        }
        .fnaf-linha {
            display: flex; align-items: center;
            justify-content: space-between;
            margin: 9px 0; gap: 12px;
        }
        .fnaf-label {
            color: #994422; letter-spacing: 2px; font-size: 0.76em;
            min-width: 110px; text-transform: uppercase;
        }
        .fnaf-pct {
            color: #bb5533; font-size: 0.78em;
            min-width: 36px; text-align: right;
        }
        .fnaf-slider {
            -webkit-appearance: none; appearance: none;
            flex: 1; height: 3px;
            background: #280404; outline: none; border: none;
            cursor: pointer;
        }
        .fnaf-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 13px; height: 13px;
            background: #bb1010; border-radius: 50%;
            box-shadow: 0 0 7px #ff2222, 0 0 16px rgba(180,0,0,0.35);
            cursor: pointer;
        }
        .fnaf-slider::-moz-range-thumb {
            width: 13px; height: 13px;
            background: #bb1010; border-radius: 50%;
            border: none; cursor: pointer;
        }
        .fnaf-ctrl-grid {
            display: grid; grid-template-columns: auto 1fr;
            gap: 7px 16px; margin-top: 6px;
        }
        .fnaf-ctrl-tecla {
            color: #bb5533; font-size: 0.72em; letter-spacing: 2px;
            background: rgba(70,8,0,0.4); border: 1px solid #3a0a00;
            padding: 2px 8px; text-align: center;
        }
        .fnaf-ctrl-desc {
            color: #7a5040; font-size: 0.7em; letter-spacing: 2px;
            display: flex; align-items: center;
        }
        .fnaf-btn {
            background: transparent; border: 1px solid #5a1000;
            color: #992200; letter-spacing: 5px;
            font-family: 'Courier New', monospace; font-size: 0.82em;
            text-transform: uppercase; padding: 10px 24px;
            cursor: pointer;
            transition: color 0.2s, border-color 0.2s,
                        box-shadow 0.2s, letter-spacing 0.2s;
        }
        .fnaf-btn:hover {
            color: #ff3300; border-color: #991a00;
            box-shadow: 0 0 16px rgba(180,30,0,0.28);
            letter-spacing: 7px;
        }
        .fnaf-btn-fechar { display: block; margin: 26px auto 0; }
        .fnaf-btn-pausa  { display: block; width: 100%; margin: 8px 0; text-align: center; padding: 12px 24px; }
        @keyframes fnafPisca {
            0%,91%,100%{ opacity:1; }
            92%{ opacity:0.05; } 93%{ opacity:0.85; }
            94%{ opacity:0.07; } 95%{ opacity:1; }
        }
    `;
    document.head.appendChild(s);
}

function _criarOverlayOpcoes() {
    _divOpcoes = document.createElement('div');
    _divOpcoes.className = 'fnaf-overlay';
    _divOpcoes.innerHTML = `
        <div class="fnaf-painel">
            <div class="fnaf-titulo">— OPÇÕES —</div>

            <div class="fnaf-secao">Áudio</div>
            <div class="fnaf-linha">
                <span class="fnaf-label">Vol. Geral</span>
                <input class="fnaf-slider" type="range" id="fnaf-vol-geral" min="0" max="100">
                <span class="fnaf-pct" id="fnaf-pct-geral"></span>
            </div>
            <div class="fnaf-linha">
                <span class="fnaf-label">Música</span>
                <input class="fnaf-slider" type="range" id="fnaf-vol-musica" min="0" max="100">
                <span class="fnaf-pct" id="fnaf-pct-musica"></span>
            </div>
            <div class="fnaf-linha">
                <span class="fnaf-label">SFX</span>
                <input class="fnaf-slider" type="range" id="fnaf-vol-sfx" min="0" max="100">
                <span class="fnaf-pct" id="fnaf-pct-sfx"></span>
            </div>

            <div class="fnaf-secao">Jogo</div>
            <div class="fnaf-linha">
                <span class="fnaf-label">Sensibilidade</span>
                <input class="fnaf-slider" type="range" id="fnaf-sens" min="0" max="100">
                <span class="fnaf-pct" id="fnaf-pct-sens"></span>
            </div>

            <div class="fnaf-secao">Controlos</div>
            <div class="fnaf-ctrl-grid">
                <span class="fnaf-ctrl-tecla">W / ↑</span>   <span class="fnaf-ctrl-desc">Andar em frente</span>
                <span class="fnaf-ctrl-tecla">A / ←</span>   <span class="fnaf-ctrl-desc">Virar à esquerda</span>
                <span class="fnaf-ctrl-tecla">D / →</span>   <span class="fnaf-ctrl-desc">Virar à direita</span>
                <span class="fnaf-ctrl-tecla">RATO</span>     <span class="fnaf-ctrl-desc">Apontar lanterna</span>
                <span class="fnaf-ctrl-tecla">ESC</span>      <span class="fnaf-ctrl-desc">Pausar jogo</span>
                <span class="fnaf-ctrl-tecla">1 – 4</span>   <span class="fnaf-ctrl-desc">Ligar / desligar tipos de luz</span>
            </div>

            <button class="fnaf-btn fnaf-btn-fechar" id="fnaf-btn-fechar-opc">FECHAR</button>
        </div>
    `;
    document.body.appendChild(_divOpcoes);

    [
        ['fnaf-vol-geral',  'fnaf-pct-geral',  v => { CONFIG.volumeGeral   = v; }],
        ['fnaf-vol-musica', 'fnaf-pct-musica', v => { CONFIG.volumeMusica  = v; }],
        ['fnaf-vol-sfx',    'fnaf-pct-sfx',    v => { CONFIG.volumeSFX     = v; }],
        ['fnaf-sens',       'fnaf-pct-sens',   v => { CONFIG.sensibilidade = v; }],
    ].forEach(([id, pctId, fn]) => {
        document.getElementById(id)?.addEventListener('input', e => {
            const v = e.target.value / 100;
            fn(v);
            document.getElementById(pctId).textContent = Math.round(v * 100) + '%';
            atualizarVolumes();
            salvarConfig();
        });
    });

    document.getElementById('fnaf-btn-fechar-opc')
        ?.addEventListener('click', () => { tocar('clickBotao'); esconderOpcoes(); });
}

function _criarOverlayPausa() {
    _divPausa = document.createElement('div');
    _divPausa.className = 'fnaf-overlay';
    _divPausa.innerHTML = `
        <div class="fnaf-painel" style="min-width:300px;max-width:390px;text-align:center;">
            <div class="fnaf-titulo">— PAUSADO —</div>
            <button class="fnaf-btn fnaf-btn-pausa" id="fnaf-btn-retomar">RETOMAR JOGO</button>
            <button class="fnaf-btn fnaf-btn-pausa" id="fnaf-btn-opc-pausa">OPÇÕES</button>
            <button class="fnaf-btn fnaf-btn-pausa" id="fnaf-btn-menu-principal">MENU PRINCIPAL</button>
            <button class="fnaf-btn fnaf-btn-pausa" id="fnaf-btn-sair-pausa"
                style="border-color:#224411;color:#336622;">SAIR</button>
        </div>
    `;
    document.body.appendChild(_divPausa);

    document.getElementById('fnaf-btn-retomar')?.addEventListener('click', () => {
        tocar('clickBotao');
        esconderPausa();
        if (_cbRetomar) _cbRetomar();
    });

    document.getElementById('fnaf-btn-opc-pausa')?.addEventListener('click', () => {
        tocar('clickBotao');
        _divPausa.style.opacity = '0';
        setTimeout(() => { _divPausa.style.display = 'none'; }, 300);
        mostrarOpcoes(true); // sons continuam parados, volta ao pause ao fechar
    });

    document.getElementById('fnaf-btn-menu-principal')?.addEventListener('click', () => {
        tocar('clickBotao');
        _divConfirm.style.display = 'flex';
        requestAnimationFrame(() => { _divConfirm.style.opacity = '1'; });
    });

    document.getElementById('fnaf-btn-sair-pausa')?.addEventListener('click', () => {
        tocar('clickBotao');
        // esconde o overlay de pausa antes de mostrar a tela de sair
        _divPausa.style.opacity = '0';
        setTimeout(() => {
            _divPausa.style.display = 'none';
            if (_cbSair) _cbSair();
        }, 300);
    });
}

function _loadingVoltarMenu() {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '500',
        background: '#000', opacity: '0',
        transition: 'opacity 0.6s ease',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Courier New', monospace", gap: '20px',
        pointerEvents: 'all'
    });

    // scanlines
    const scan = document.createElement('div');
    Object.assign(scan.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.12) 3px,rgba(0,0,0,0.12) 4px)'
    });
    el.appendChild(scan);

    const titulo = document.createElement('div');
    Object.assign(titulo.style, {
        position: 'relative', zIndex: '1',
        fontSize: 'clamp(1em,2vw,1.4em)', color: '#661010',
        letterSpacing: '8px', textTransform: 'uppercase',
        textShadow: '0 0 14px rgba(150,0,0,0.5)'
    });
    titulo.textContent = 'A VOLTAR AO MENU...';
    el.appendChild(titulo);

    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });

    // para todos os sons do jogo
    pausarAmbientais();

    setTimeout(() => {
        if (_cbMenu) _cbMenu();
    }, 1800);
}

function _criarOverlayConfirm() {
    _divConfirm = document.createElement('div');
    _divConfirm.className = 'fnaf-overlay';
    _divConfirm.style.zIndex = '250';
    _divConfirm.innerHTML = `
        <div class="fnaf-painel" style="min-width:280px;max-width:380px;text-align:center;">
            <div class="fnaf-titulo" style="font-size:1em;letter-spacing:6px;margin-bottom:16px;">
                TENS A CERTEZA?
            </div>
            <div style="color:#7a5040;font-family:'Courier New',monospace;
                font-size:0.76em;letter-spacing:3px;margin-bottom:24px;line-height:1.9;">
                O progresso da sessão<br>será perdido.
            </div>
            <div style="display:flex;gap:14px;justify-content:center;">
                <button class="fnaf-btn" id="fnaf-btn-confirm-sim">CONFIRMAR</button>
                <button class="fnaf-btn" id="fnaf-btn-confirm-nao"
                    style="border-color:#1e3a11;color:#2d5518;">CANCELAR</button>
            </div>
        </div>
    `;
    document.body.appendChild(_divConfirm);

    document.getElementById('fnaf-btn-confirm-nao')?.addEventListener('click', () => {
        tocar('clickBotao');
        _divConfirm.style.opacity = '0';
        setTimeout(() => { _divConfirm.style.display = 'none'; }, 300);
    });

    document.getElementById('fnaf-btn-confirm-sim')?.addEventListener('click', () => {
        tocar('clickBotao');
        _divConfirm.style.opacity = '0';
        setTimeout(() => {
            _divConfirm.style.display = 'none';
            _loadingVoltarMenu();
        }, 300);
    });
}
