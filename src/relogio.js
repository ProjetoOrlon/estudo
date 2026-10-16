/* Relógio da geração: a mascote ao lado de um relógio (ponteiros girando,
   ampulheta no canto) que vai ENCHENDO de água conforme a matéria fica
   pronta, e o “faltam cerca de X min”, que conta para baixo a cada segundo.
   RelogioIA.html(estado)  → marcação do bloco
   RelogioIA.ligar(raiz)   → faz o “faltam” andar entre um aviso e outro */
(function(){
  'use strict';
  var esc = U.esc;

  function tempo(seg){
    if(seg == null) return 'calculando…';
    if(seg < 45) return 'menos de 1 min';
    var min = Math.round(seg / 60);
    if(min < 60) return 'cerca de ' + min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return 'cerca de ' + h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  /* relógio laranja, mostrador cinza-claro com água subindo, ampulheta azul */
  var nSvg = 0;
  function svg(pct){
    var nivel = 100 - pct * 0.8;   /* altura da água dentro do mostrador (20 a 100) */
    var face = 'rl-face' + (++nSvg);   /* id próprio: pode haver mais de um relógio na tela */
    return '<svg class="rl-svg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><clipPath id="' + face + '"><circle cx="56" cy="58" r="38"/></clipPath></defs>' +
      '<circle cx="56" cy="58" r="48" fill="#FFB431"/>' +
      '<circle cx="56" cy="58" r="38" fill="#E8EDF1"/>' +
      '<g clip-path="url(#' + face + ')">' +
        '<g class="rl-agua" style="transform:translateY(' + nivel + 'px)">' +
          '<path class="rl-onda" d="M-60 0 Q-45 -6 -30 0 T0 0 T30 0 T60 0 T90 0 T120 0 T150 0 T180 0 V120 H-60 Z" fill="#5FB6E8" opacity=".55"/>' +
          '<path class="rl-onda2" d="M-60 3 Q-45 -3 -30 3 T0 3 T30 3 T60 3 T90 3 T120 3 T150 3 T180 3 V120 H-60 Z" fill="#3D9BD6" opacity=".45"/>' +
        '</g>' +
      '</g>' +
      [0, 45, 90, 135, 180, 225, 270, 315].map(function(a){
        return '<line x1="56" y1="' + (a % 90 ? 25 : 23) + '" x2="56" y2="' + (a % 90 ? 29 : 30) + '" stroke="#9AA4AA" stroke-width="' + (a % 90 ? 3.5 : 4.5) + '" stroke-linecap="round" transform="rotate(' + a + ' 56 58)"/>';
      }).join('') +
      '<g class="rl-hora"><line x1="56" y1="58" x2="56" y2="36" stroke="#9AA4AA" stroke-width="5" stroke-linecap="round"/><path d="M49 42 L56 34 L63 42" fill="none" stroke="#9AA4AA" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g class="rl-min"><line x1="56" y1="58" x2="80" y2="58" stroke="#9AA4AA" stroke-width="5" stroke-linecap="round"/><path d="M74 51 L82 58 L74 65" fill="none" stroke="#9AA4AA" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<circle cx="56" cy="58" r="5.5" fill="#FFB431"/>' +
      /* ampulheta */
      '<g transform="translate(78 70)">' +
        '<rect x="0" y="0" width="38" height="6" rx="3" fill="#2F95DC"/><rect x="0" y="40" width="38" height="6" rx="3" fill="#2F95DC"/>' +
        '<path d="M5 6 H33 V12 Q33 20 22 23 Q33 26 33 34 V40 H5 V34 Q5 26 16 23 Q5 20 5 12 Z" fill="#D9DEE2"/>' +
        '<path class="rl-areia-cima" d="M9 11 H29 Q29 17 19 21 Q9 17 9 11 Z" fill="#8EC5E8"/>' +
        '<circle class="rl-grao" cx="19" cy="27" r="1.6" fill="#8EC5E8"/>' +
        '<path class="rl-areia-baixo" d="M9 39 Q9 32 19 30 Q29 32 29 39 Z" fill="#8EC5E8"/>' +
      '</g>' +
    '</svg>';
  }

  /* compacto: versão para o cartão da matéria na tela inicial */
  function html(g, compacto){
    var r = g.relogio || {};
    var pct = r.total ? Math.min(100, Math.round((r.feitos || 0) / r.total * 100)) : 0;
    var ate = r.restante != null ? Date.now() + r.restante * 1000 : null;
    return '<div class="rl' + (compacto ? ' rl-compacto' : '') + '" data-ate="' + (ate || '') + '">' +
      '<div class="rl-arte">' + svg(pct) + '<span class="rl-mascote">' + (window.Mascote ? Mascote.avatar(compacto ? 34 : 46) : '') + '</span></div>' +
      '<div class="rl-txt">' +
        '<span class="rl-rot">' + (g.fase === 'geral' ? 'Montando a visão geral' : 'Criando a matéria') + '</span>' +
        '<b class="rl-falta">Faltam <span class="rl-tempo">' + tempo(r.restante) + '</span></b>' +
        '<span class="rl-pct">' + pct + '% pronto' + (r.total ? ' · etapa ' + Math.min((r.feitos || 0) + 1, r.total) + ' de ' + r.total : '') + '</span>' +
        '<span class="rl-msg">' + esc(g.msg || '') + '</span>' +
      '</div>' +
    '</div>';
  }

  /* o “faltam” conta para baixo entre um aviso e outro */
  var timer = null;
  function ligar(raiz){
    clearInterval(timer);
    timer = setInterval(function(){
      var el = (raiz || document).querySelectorAll('.rl[data-ate]');
      if(!el.length){ clearInterval(timer); return; }
      Array.prototype.forEach.call(el, function(b){
        var ate = +b.dataset.ate; if(!ate) return;
        var t = b.querySelector('.rl-tempo'); if(t) t.textContent = tempo(Math.max(0, (ate - Date.now()) / 1000));
      });
    }, 1000);
  }

  window.RelogioIA = { html:html, ligar:ligar, tempo:tempo };
})();
