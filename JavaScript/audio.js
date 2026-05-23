// Gestor central de áudio

export const CONFIG = {
    volumeGeral:   1.0,
    volumeMusica:  0.9,
    volumeSFX:     0.9,
    sensibilidade: 0.5
};

try {
    const s = JSON.parse(localStorage.getItem('fnaf_cfg_v2') || '{}');
    Object.assign(CONFIG, s);
} catch (_) {}

export function salvarConfig() {
    try { localStorage.setItem('fnaf_cfg_v2', JSON.stringify(CONFIG)); } catch (_) {}
}

const _reg = {};

function _add(id, src, tipo, loop = false, boost = 1.0) {
    const a = new Audio(src);
    a.loop    = loop;
    a.preload = 'auto';
    _reg[id]  = { a, tipo, boost };
}

_add('menuTema',   './sounds/musica/menu_tema.mp3',      'musica', true,  0.62 );
_add('coracao',    './sounds/ambiente/coracao.wav',       'geral',  true,  1.5  );
_add('luzFlicker', './sounds/ambiente/luz_flicker.mp3',  'geral',  true,  0.12 ); // fundo, muito ligeiro
_add('hoverBotao', './sounds/sfx/hover_botao.mp3',       'sfx',    false, 0.3  );
_add('clickBotao',       './sounds/sfx/click_botao.mp3',            'sfx',    false);
_add('clickDificuldade', './sounds/sfx/click_botaodificuldade.mp3', 'sfx',    false);
_add('passosAnim',       './sounds/sfx/passos_anim.mp3',            'sfx',    false);
_add('passosDuto',       './sounds/sfx/passos_duto.mp3',            'sfx',    false);
_add('passosJogo',       './sounds/sfx/passos_jogo.mp3',            'sfx',    true,  6.0  );
_add('token',            './sounds/sfx/token.wav',                  'sfx',    false);

function _vol(s) {
    const g = CONFIG.volumeGeral;
    let base;
    if (s.tipo === 'musica') base = g * CONFIG.volumeMusica;
    else if (s.tipo === 'sfx') base = g * CONFIG.volumeSFX;
    else base = g;
    return base * (s.boost ?? 1.0);
}

export function tocar(id) {
    const s = _reg[id];
    if (!s) return;
    s.a.volume = Math.min(1, _vol(s));
    if (s.a.loop) {
        if (s.a.paused) s.a.play().catch(() => {});
    } else {
        s.a.currentTime = 0;
        s.a.play().catch(() => {});
    }
}

export function parar(id) {
    const s = _reg[id];
    if (!s) return;
    s.a.pause();
    if (!s.a.loop) s.a.currentTime = 0;
}

export function estaATocando(id) {
    const s = _reg[id];
    return s ? !s.a.paused : false;
}

// pausa sons ambientais/música quando abre opções ou pausa
export function pausarAmbientais() {
    ['coracao', 'luzFlicker', 'menuTema', 'passosJogo'].forEach(id => {
        const s = _reg[id];
        if (s && !s.a.paused) { s.a.pause(); s.a._pausado = true; }
    });
}

// retoma apenas os que foram pausados por pausarAmbientais
// passosJogo NÃO é retomado aqui — é gerido pelo movimento do jogador
export function retomarAmbientais() {
    ['coracao', 'luzFlicker', 'menuTema'].forEach(id => {
        const s = _reg[id];
        if (s && s.a._pausado) { delete s.a._pausado; s.a.play().catch(() => {}); }
    });
    const pj = _reg['passosJogo'];
    if (pj && pj.a._pausado) delete pj.a._pausado;
}

export function atualizarVolumes() {
    Object.values(_reg).forEach(s => {
        s.a.volume = Math.min(1, _vol(s));
    });
}
