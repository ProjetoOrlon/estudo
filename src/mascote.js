/* A mascote e tutora da plataforma: estudante ruiva de marias-chiquinhas,
   óculos, laço, casaquinho lilás, livro e marca-texto — desenhada em SVG aqui
   mesmo (fica nítida em qualquer tamanho e não pesa).
   Mascote.avatar(px)       rosto num círculo (botões, cabeçalho, mensagens)
   Mascote.ilustracao(px)   corpo inteiro (boas-vindas, telas vazias)
   Mascote.nome             o nome em todos os textos do programa.
   Para mudar o visual: troque CFG lá embaixo (penteado, roupa, cores, item…).
   ⚠ Antes de vender, trocar o NOME (Poppy é personagem da Riot Games). */
/* O desenho (SVG feito por código, sem imagens): PV.ilustracao(px, cfg) e PV.avatar(px, cfg).
   cfg = { pele:[claro, escuro, orelha, traço], olhos:[íris, brilho], cabelo:[claro, escuro, traço],
           penteado:'bolas'|'longas'|'rabo'|'trancas'|'curto'|'coques',
           cabeca:'capelo'|'laco'|'tiara'|'fones'|'nada', oculos:bool,
           roupa:'armadura'|'moletom'|'casaco'|'jardineira', cores:[principal, escura, detalhe, calça, sapato],
           item:'lapis'|'marcatexto'|'regua'|'lupa', livro:cor } */
(function(){
  var n = 0;
  function g(id, k, a, b){ return '<linearGradient id="'+id+k+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient>'; }
  function defs(id, c){
    return '<defs>' + g(id, 'c', c.cabelo[0], c.cabelo[1]) + g(id, 'p', c.pele[0], c.pele[1]) +
      '<radialGradient id="'+id+'f" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#F6EEFF"/><stop offset="1" stop-color="#D7C4F4"/></radialGradient>' +
      '<clipPath id="'+id+'r"><circle cx="50" cy="50" r="50"/></clipPath></defs>';
  }
  /* cabelo de trás (antes das orelhas e do rosto) */
  function cabeloAtras(id, c){
    var f = 'url(#'+id+'c)', tr = c.cabelo[2];
    switch(c.penteado){
      case 'bolas': return '<ellipse cx="19" cy="50" rx="14" ry="17" fill="'+f+'"/><ellipse cx="81" cy="50" rx="14" ry="17" fill="'+f+'"/>';
      case 'longas': return [1, -1].map(function(l){ var x = function(d){ return 50 - l * (27 + d); };
          return '<path d="M'+x(-4)+' 44 Q'+x(10)+' 52 '+x(7)+' 66 Q'+x(13)+' 78 '+x(6)+' 90 Q'+x(3)+' 100 '+x(9)+' 108 Q'+x(-3)+' 104 '+x(-2)+' 92 Q'+x(-5)+' 80 '+x(0)+' 68 Q'+x(-4)+' 56 '+x(-4)+' 44 Z" fill="'+f+'" stroke="'+tr+'" stroke-width=".7"/>'; }).join('');
      case 'rabo': return '<path d="M66 30 Q96 26 94 52 Q93 76 84 96 Q80 78 82 62 Q82 44 66 40 Z" fill="'+f+'" stroke="'+tr+'" stroke-width=".7"/>' +
          '<path d="M86 50 Q88 70 84 88" stroke="'+tr+'" stroke-width=".9" fill="none" opacity=".6"/>';
      case 'trancas': return [1, -1].map(function(l){ var s = ''; for(var k = 0; k < 6; k++){ s += '<ellipse cx="'+(50 - l * (25 + k * .6))+'" cy="'+(58 + k * 8)+'" rx="5.4" ry="5" fill="'+f+'" stroke="'+tr+'" stroke-width=".7"/>'; }
          return s + '<path d="M'+(50 - l * 28.6)+' 104 l'+(-l * 2)+' 6 M'+(50 - l * 28.6)+' 104 l'+(l * 2)+' 6" stroke="'+tr+'" stroke-width="1.6" stroke-linecap="round"/>'; }).join('');
      case 'curto': return '<path d="M26 56 Q22 28 50 26 Q78 28 74 56 Q76 70 70 76 L30 76 Q24 70 26 56 Z" fill="'+f+'"/>';
      case 'coques': return '<circle cx="31" cy="30" r="10" fill="'+f+'" stroke="'+tr+'" stroke-width=".7"/><circle cx="69" cy="30" r="10" fill="'+f+'" stroke="'+tr+'" stroke-width=".7"/>' +
          '<path d="M25 27 Q31 22 37 27 M63 27 Q69 22 75 27" stroke="'+tr+'" stroke-width=".9" fill="none" opacity=".6"/>';
    }
    return '';
  }
  function elasticos(c){
    if(c.penteado === 'longas') return '<ellipse cx="25" cy="49" rx="4.4" ry="3.2" fill="'+c.cores[2]+'"/><ellipse cx="75" cy="49" rx="4.4" ry="3.2" fill="'+c.cores[2]+'"/>';
    if(c.penteado === 'trancas') return '<ellipse cx="28.6" cy="102" rx="3.6" ry="2.4" fill="'+c.cores[2]+'"/><ellipse cx="71.4" cy="102" rx="3.6" ry="2.4" fill="'+c.cores[2]+'"/>';
    if(c.penteado === 'rabo') return '<ellipse cx="72" cy="36" rx="3.4" ry="4.4" fill="'+c.cores[2]+'" transform="rotate(30 72 36)"/>';
    return '';
  }
  function olho(x, c){
    return '<ellipse cx="'+x+'" cy="59" rx="6" ry="7.2" fill="#fff"/>' +
      '<ellipse cx="'+(x + .4)+'" cy="60" rx="4.9" ry="6.1" fill="'+c.olhos[0]+'"/>' +
      '<ellipse cx="'+(x + .4)+'" cy="61.5" rx="4.2" ry="3.6" fill="'+c.olhos[1]+'" opacity=".55"/>' +
      '<circle cx="'+(x + .4)+'" cy="60.4" r="2.4" fill="#22183A"/>' +
      '<circle cx="'+(x - 1.6)+'" cy="57.6" r="1.7" fill="#fff"/><circle cx="'+(x + 2)+'" cy="62.6" r=".8" fill="#fff"/>' +
      '<path d="M'+(x - 6.6)+' 55 Q'+x+' 49.8 '+(x + 6.6)+' 55" stroke="#2B2350" stroke-width="1.7" fill="none" stroke-linecap="round"/>';
  }
  function chapeu(c){
    switch(c.cabeca){
      case 'capelo': return '<g transform="rotate(-9 50 27)"><path d="M37 28 L37 35 Q50 41 63 35 L63 28 L50 33 Z" fill="#3A3558"/><path d="M50 14 L79 24 L50 34 L21 24 Z" fill="#2E2A45"/><circle cx="50" cy="24" r="1.7" fill="#E8B84A"/><path d="M50 24 L73 27.5 L73 38" stroke="#E8B84A" stroke-width="1.4" fill="none"/><path d="M71.2 37.5 L74.8 37.5 L75.6 44 L70.4 44 Z" fill="#E8B84A"/></g>';
      case 'laco': return '<g transform="translate(62 31) rotate(14)"><path d="M0 0 L-9 -6 Q-11 0 -9 6 Z M0 0 L9 -6 Q11 0 9 6 Z" fill="'+c.cores[2]+'" stroke="rgba(0,0,0,.25)" stroke-width=".6"/><circle r="2.6" fill="'+c.cores[2]+'" stroke="rgba(0,0,0,.25)" stroke-width=".6"/></g>';
      case 'tiara': return '<path d="M29 42 Q50 22 71 42" stroke="'+c.cores[2]+'" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="50" cy="31.4" r="3" fill="#FFE27A" stroke="#C99A1E" stroke-width=".6"/>';
      case 'fones': return '<path d="M24 54 Q24 24 50 24 Q76 24 76 54" stroke="'+c.cores[1]+'" stroke-width="3.4" fill="none"/><rect x="19" y="50" width="9" height="14" rx="3.4" fill="'+c.cores[0]+'" stroke="'+c.cores[1]+'" stroke-width="1"/><rect x="72" y="50" width="9" height="14" rx="3.4" fill="'+c.cores[0]+'" stroke="'+c.cores[1]+'" stroke-width="1"/>';
    }
    return '';
  }
  function cabeca(id, c){
    var f = 'url(#'+id+'c)', p = 'url(#'+id+'p)';
    var orelhas = c.orelhas === 'humana'
      /* orelhas pequenas e redondas, de gente */
      ? '<ellipse cx="29.6" cy="61" rx="4" ry="5.4" fill="'+c.pele[1]+'" stroke="'+c.pele[3]+'" stroke-width=".8"/><path d="M29.4 58 Q27.6 61 29.6 64" stroke="'+c.pele[3]+'" stroke-width=".8" fill="none"/>' +
        '<ellipse cx="70.4" cy="61" rx="4" ry="5.4" fill="'+c.pele[1]+'" stroke="'+c.pele[3]+'" stroke-width=".8"/><path d="M70.6 58 Q72.4 61 70.4 64" stroke="'+c.pele[3]+'" stroke-width=".8" fill="none"/>'
      : '<path d="M31 52 Q15 42 3 31 Q13 52 31 62 Z" fill="'+c.pele[2]+'" stroke="'+c.pele[3]+'" stroke-width="1"/><path d="M29 54 Q17 46 9 37 Q17 51 29 58 Z" fill="#E9A6BC"/>' +
        '<path d="M69 52 Q85 42 97 31 Q87 52 69 62 Z" fill="'+c.pele[2]+'" stroke="'+c.pele[3]+'" stroke-width="1"/><path d="M71 54 Q83 46 91 37 Q83 51 71 58 Z" fill="#E9A6BC"/>';
    return cabeloAtras(id, c) + orelhas +
      elasticos(c) +
      '<ellipse cx="50" cy="57" rx="21" ry="22" fill="'+p+'" stroke="'+c.pele[3]+'" stroke-width=".8"/>' +
      (c.penteado === 'curto'
        ? '<path d="M28 58 Q26 30 50 30 Q74 30 72 58 Q70 44 58 42 Q52 46 44 42 Q30 44 28 58 Z" fill="'+f+'"/>'
        : '<path d="M28 54 Q27 31 50 30 Q73 31 72 54 Q67 44 61 46 Q57 37 50 43 Q43 37 39 46 Q33 44 28 54 Z" fill="'+f+'"/>') +
      olho(42, c) + olho(58, c) +
      (c.oculos ? '<g fill="#fff" fill-opacity=".12" stroke="#3A3A46" stroke-width="1.6"><circle cx="42" cy="59.5" r="8"/><circle cx="58" cy="59.5" r="8"/><path d="M50 58.4 Q50 57 50 58.4" /></g><path d="M49.6 58.6 h.8" stroke="#3A3A46" stroke-width="1.6"/>' : '') +
      '<ellipse cx="35.5" cy="67" rx="3.6" ry="2.1" fill="#F29BB5" opacity=".75"/><ellipse cx="64.5" cy="67" rx="3.6" ry="2.1" fill="#F29BB5" opacity=".75"/>' +
      '<path d="M46.2 70 Q50 73.4 53.8 70" stroke="#3B2A55" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      chapeu(c);
  }
  function item(c){
    switch(c.item){
      case 'lapis': return '<g transform="translate(181 32) rotate(28)"><rect x="-10" y="0" width="20" height="118" rx="2" fill="#F4C542" stroke="#C99A1E"/><rect x="-3.4" y="0" width="6.8" height="118" fill="#F9D766"/><path d="M-10 0 L10 0 L0 -28 Z" fill="#EBC99B" stroke="#C9A06A"/><path d="M-3.6 -17.6 L3.6 -17.6 L0 -28 Z" fill="#3A3A46"/><rect x="-10.5" y="118" width="21" height="12" fill="#C7CCD6"/><rect x="-10.5" y="130" width="21" height="15" rx="5" fill="#F29BB5"/></g>';
      case 'marcatexto': return '<g transform="translate(176 38) rotate(24)"><rect x="-13" y="20" width="26" height="110" rx="8" fill="'+(c.marca || c.cores[2])+'" stroke="rgba(0,0,0,.25)"/><rect x="-13" y="20" width="26" height="22" rx="6" fill="#fff" opacity=".5"/><path d="M-9 20 L-6 0 L6 0 L9 20 Z" fill="#E9E9EE" stroke="#9AA0AE"/><path d="M-6 0 L-2 -10 L6 -10 L6 0 Z" fill="'+(c.marca || c.cores[2])+'"/></g>';
      case 'regua': return '<g transform="translate(176 30) rotate(18)"><rect x="-11" y="0" width="22" height="150" rx="3" fill="#FFE27A" stroke="#C99A1E" stroke-width="1.2"/>' +
          [12,24,36,48,60,72,84,96,108,120,132].map(function(y, i){ return '<path d="M-11 '+y+' h'+(i % 2 ? 7 : 12)+'" stroke="#8A6A10" stroke-width="1.2"/>'; }).join('') + '</g>';
      case 'lupa': return '<g transform="translate(172 36) rotate(30)"><rect x="-5" y="34" width="10" height="70" rx="4" fill="#8C5A2B" stroke="#5A3A1C"/><circle cx="0" cy="12" r="26" fill="#DDF3FF" fill-opacity=".55" stroke="#C99A1E" stroke-width="6"/><path d="M-12 0 Q-6 -8 4 -8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
    }
    return '';
  }
  function roupa(id, c){
    var k = c.cores, p = 'url(#'+id+'p)';
    var pernas = '<rect x="80" y="178" width="16" height="26" rx="5" fill="'+k[3]+'"/><rect x="104" y="178" width="16" height="26" rx="5" fill="'+k[3]+'"/>' +
      '<path d="M76 198 h24 v10 q0 5 -5 5 h-19 q-5 0 -5 -5 z" fill="'+k[4]+'"/><path d="M100 198 h24 v10 q0 5 -5 5 h-19 q-5 0 -5 -5 z" fill="'+k[4]+'"/>';
    var bracoD = '<path d="M140 116 Q152 108 150 94" stroke="'+(c.roupa === 'jardineira' ? c.pele[2] : k[0])+'" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="150" cy="92" r="7" fill="'+c.pele[2]+'" stroke="'+c.pele[3]+'"/>';
    var bracoE = '<g transform="rotate(-12 64 150)"><rect x="46" y="130" width="34" height="42" rx="3" fill="'+c.livro+'" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/><rect x="48" y="132" width="3" height="38" fill="rgba(0,0,0,.25)"/><rect x="56" y="140" width="18" height="4" rx="1" fill="#F6E7C8"/><path d="M80 133 v36" stroke="#F6E7C8" stroke-width="2"/></g><circle cx="80" cy="150" r="7" fill="'+c.pele[2]+'" stroke="'+c.pele[3]+'"/>';
    switch(c.roupa){
      case 'armadura': return pernas +
        '<path d="M70 104 Q100 96 130 104 L136 176 Q100 186 64 176 Z" fill="'+k[1]+'"/><path d="M72 106 Q100 99 128 106 L131 140 Q100 147 69 140 Z" fill="'+k[0]+'" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/>' +
        '<rect x="66" y="160" width="68" height="8" rx="3" fill="#5A3A1C"/><rect x="95" y="159" width="10" height="10" rx="2" fill="#E8B84A"/>' +
        '<ellipse cx="66" cy="112" rx="15" ry="11" fill="'+k[0]+'" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/><ellipse cx="134" cy="112" rx="15" ry="11" fill="'+k[0]+'" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/>' +
        bracoD + bracoE + '<path d="M76 96 Q100 108 124 96 L126 106 Q100 118 74 106 Z" fill="'+k[2]+'"/>';
      case 'moletom': return pernas +
        '<path d="M68 104 Q100 94 132 104 L138 180 Q100 190 62 180 Z" fill="'+k[0]+'"/><path d="M80 146 h40 v18 q-20 7 -40 0 z" fill="'+k[1]+'"/><path d="M100 106 v40" stroke="'+k[1]+'" stroke-width="1.4"/>' +
        '<path d="M92 104 q-3 12 -2 20 M108 104 q3 12 2 20" stroke="'+k[2]+'" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
        '<path d="M72 102 Q100 118 128 102 Q120 96 100 96 Q80 96 72 102 Z" fill="'+k[1]+'"/>' + bracoD + bracoE;
      case 'casaco': return pernas +
        '<path d="M72 140 L128 140 L142 178 Q100 186 58 178 Z" fill="'+k[3]+'"/><path d="M86 141 L80 180 M100 141 L100 182 M114 141 L120 180" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/>' +
        '<path d="M78 102 Q100 96 122 102 L124 142 L76 142 Z" fill="#fff"/>' +
        '<path d="M70 104 Q82 98 92 100 L90 144 L66 144 Q64 122 70 104 Z" fill="'+k[0]+'" stroke="'+k[1]+'"/><path d="M130 104 Q118 98 108 100 L110 144 L134 144 Q136 122 130 104 Z" fill="'+k[0]+'" stroke="'+k[1]+'"/>' +
        '<path d="M100 102 L86 96 Q83 106 93 109 Z M100 102 L114 96 Q117 106 107 109 Z" fill="#fff" stroke="#D6D0E6"/>' +
        '<g transform="translate(100 104) scale(1.4)"><path d="M0 0 L-6 -3.4 Q-7.4 0 -6 3.4 Z M0 0 L6 -3.4 Q7.4 0 6 3.4 Z" fill="'+k[2]+'"/><circle r="1.6" fill="'+k[2]+'"/></g>' + bracoD + bracoE;
      case 'jardineira': return pernas +
        '<path d="M70 104 Q100 96 130 104 L132 140 L68 140 Z" fill="'+k[2]+'"/>' +
        '<path d="M66 140 L134 140 L138 182 Q100 190 62 182 Z" fill="'+k[0]+'"/><path d="M80 112 h40 v30 h-40 z" fill="'+k[0]+'"/><rect x="90" y="120" width="20" height="12" rx="2" fill="'+k[1]+'"/>' +
        '<path d="M82 112 L76 100 M118 112 L124 100" stroke="'+k[0]+'" stroke-width="5" stroke-linecap="round"/><circle cx="83" cy="114" r="2.4" fill="#E8B84A"/><circle cx="117" cy="114" r="2.4" fill="#E8B84A"/>' + bracoD + bracoE;
    }
    return '';
  }
  function ilustracao(px, c){
    var id = 'pv' + (++n);
    return '<svg class="mascote-il mascote-svg" viewBox="0 0 200 220" aria-hidden="true" width="'+px+'" height="'+Math.round(px * 1.1)+'">' + defs(id, c) + item(c) + roupa(id, c) +
      '<g transform="translate(32 -6) scale(1.36)">' + cabeca(id, c) + '</g></svg>';
  }
  function avatar(px, c){
    var id = 'pv' + (++n), z = px <= 44 ? 1.34 : 1.02, tx = 50 - 50 * z, ty = 53 - 56 * z + (px <= 44 ? 4 : 2);
    return '<svg class="mascote-av" viewBox="0 0 100 100" aria-hidden="true" width="'+px+'" height="'+px+'">' + defs(id, c) + '<g clip-path="url(#'+id+'r)"><circle cx="50" cy="50" r="50" fill="url(#'+id+'f)"/>' +
      '<g transform="translate('+tx+' '+ty+') scale('+z+')"><path d="M30 84 Q50 94 70 84 L73 100 L27 100 Z" fill="'+c.cores[0]+'"/>' + cabeca(id, c) + '</g></g></svg>';
  }
  window.PV = { ilustracao:ilustracao, avatar:avatar };
})();

(function(){
  'use strict';
  var NOME = 'Poppy';
  var CFG = { pele:['#FFE7D6','#F7CDB2','#F9D3BC','#D9A07E'], olhos:['#2E9E62','#7CCB97'], cabelo:['#FFB08A','#D9643A','#B5502C'],
    penteado:'longas', orelhas:'humana', cabeca:'laco', oculos:true, roupa:'casaco', cores:['#B7A3E6','#9580CC','#F07A9C','#3E5BA9','#8E3B5A'], item:'marcatexto', livro:'#3E5BA9' };
  window.Mascote = { avatar:function(px){ return window.PV.avatar(px || 32, CFG); }, ilustracao:function(px){ return window.PV.ilustracao(px || 150, CFG); }, nome:NOME };
})();
