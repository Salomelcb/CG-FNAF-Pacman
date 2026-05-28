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
_add('6am',        './sounds/musica/6am_alert.mp3',     'musica', false, 1.0  );
_add('coracao',    './sounds/ambiente/coracao.wav',       'geral',  true,  1.0  );
_add('luzFlicker', './sounds/ambiente/luz_flicker.mp3',  'geral',  true,  0.12 ); // fundo, muito ligeiro
_add('hoverBotao', './sounds/sfx/hover_botao.mp3',       'sfx',    false, 0.3  );
_add('clickBotao',       './sounds/sfx/click_botao.mp3',            'sfx',    false);
_add('clickDificuldade', './sounds/sfx/click_botaodificuldade.mp3', 'sfx',    false);
_add('phoneguy',         './sounds/sfx/phoneguy.mp3',               'sfx',    false, 1.0  );
_add('passosAnim',       './sounds/sfx/passos_anim.mp3',            'sfx',    false);
_add('passosDuto',       './sounds/sfx/passos_duto.mp3',            'sfx',    false);
_add('passosJogo',       './sounds/sfx/passos_jogo.mp3',            'sfx',    true,  12.0 );
_add('passosHeavy',      './sounds/sfx/passos_heavy.mp3',           'sfx',    true,  8.0  );
_add('token',              './sounds/sfx/token.wav',                'sfx',    false);
_add('jumpscare_freddy', './sounds/jumpscare/freddy.mp3',           'sfx',    false, 1.0  );
_add('jumpscare_bonnie', './sounds/jumpscare/bonnie.mp3',           'sfx',    false, 1.0  );
_add('jumpscare_chica',  './sounds/jumpscare/chica.mp3',            'sfx',    false, 1.0  );
_add('jumpscare_foxy',   './sounds/jumpscare/foxy.mp3',             'sfx',    false, 1.4  );
_add('jumpscare_golden', './sounds/jumpscare/golden.mp3',           'sfx',    false, 1.0  );

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

// factor de volume do coracao baseado na proximidade dos inimigos (1.0 = base, >1 = mais perto)
let _coracaoFactor = 1.0;
export function setCoracaoFactor(f) {
    _coracaoFactor = Math.max(1.0, f);
    const s = _reg['coracao'];
    if (!s) return;
    s.a.volume       = Math.min(1, _vol(s) * _coracaoFactor);
    // acelera com a proximidade: 1.4 base → até 3.2x mais rápido ao máximo factor
    s.a.playbackRate = Math.min(3.2, 1.4 + (_coracaoFactor - 1.0) * 0.6);
}

export function pausarAmbientais() {
    ['coracao', 'luzFlicker', 'menuTema', 'passosHeavy', 'phoneguy'].forEach(id => {
        const s = _reg[id];
        if (s && !s.a.paused) { s.a.pause(); s.a._pausado = true; }
    });
}

// passosHeavy NÃO é retomado aqui — é gerido pelo movimento do jogador
export function retomarAmbientais() {
    ['coracao', 'luzFlicker', 'menuTema', 'phoneguy'].forEach(id => {
        const s = _reg[id];
        if (s && s.a._pausado) { delete s.a._pausado; s.a.play().catch(() => {}); }
    });
    const ph = _reg['passosHeavy'];
    if (ph && ph.a._pausado) delete ph.a._pausado;
}

export function atualizarPhoneguyDistancia(distXZ) {
    const s = _reg['phoneguy'];
    if (!s || s.a.paused) return;
    const vol = Math.max(0, 1 - distXZ / 18); // inaudivel a partir de 18 unidades
    s.a.volume = Math.min(1, _vol(s) * vol);
}

export function atualizarVolumes() {
    Object.values(_reg).forEach(s => {
        s.a.volume = Math.min(1, _vol(s));
    });
}

export function aoPhoneguyTerminar(cb) {
    const s = _reg['phoneguy'];
    if (s) s.a.addEventListener('ended', cb, { once: true });
}

export function aoTerminar(id, cb) {
    const s = _reg[id];
    if (s) s.a.addEventListener('ended', cb, { once: true });
}
