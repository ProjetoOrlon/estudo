/* Desenha um mapa mental radial em SVG, no estilo "concept map":
   círculo central, ramos coloridos numerados e folhas em cor clara.
   Portado do protótipo sem mudar a geometria. */
(function(){
  "use strict";
  var esc = U.esc, PAL = U.PAL;
  var W = 1300, CX = 650, R = 100;
  var LEAF_X_L = 14, LEAF_X_R = 1054, LEAF_W = 232;
  var BR_X_L = 290,  BR_X_R = 800,    BR_W = 210;

  function wrap(txt, max){
    var words = String(txt).split(' '), lines = [], cur = '';
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(!cur) cur = w;
      else if((cur+' '+w).length <= max) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if(cur) lines.push(cur);
    return lines;
  }
  function box(x, y, w, h, fill){
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="26" ry="26" fill="'+fill+'" filter="url(#sh)"/>';
  }
  function lines(cx, cy, ls, cls, size, lh){
    var y0 = cy - (ls.length - 1) * lh / 2;
    return '<text x="'+cx+'" y="'+y0+'" class="'+cls+'" font-size="'+size+'" text-anchor="middle" dominant-baseline="central">' +
      ls.map(function(t,i){ return '<tspan x="'+cx+'" dy="'+(i?lh:0)+'">'+esc(t)+'</tspan>'; }).join('') + '</text>';
  }
  function seta(x1,y1,x2,y2,curva){
    var dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy) || 1;
    var px = -dy/len, py = dx/len;
    var mx = (x1+x2)/2 + px*curva, my = (y1+y2)/2 + py*curva;
    return '<path d="M'+x1.toFixed(1)+','+y1.toFixed(1)+' Q'+mx.toFixed(1)+','+my.toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1)+'" ' +
      'fill="none" stroke="var(--map-ink)" stroke-width="2.6" stroke-linecap="round" marker-end="url(#ponta)"/>';
  }

  function montaMapa(m, detalhe){
    var blocos = (m.ramos || []).map(function(r, i){
      var bl = wrap(r.t, 18);
      var bh = Math.max(64, bl.length*22 + 32);
      var folhas = (r.f || []).map(function(f){
        var rot = (typeof f === 'string') ? f : f.t;
        var det = (typeof f === 'string') ? '' : (f.d || '');
        var fl = wrap(rot, 23);
        var dl = (det && detalhe) ? wrap(det, 27) : [];
        var alto = fl.length*21 + (dl.length ? dl.length*17 + 6 : 0);
        return { ls:fl, ds:dl, alto:alto, h:Math.max(52, alto + 26) };
      });
      var fh = folhas.reduce(function(s,f){ return s+f.h; }, 0) + Math.max(0, folhas.length-1)*11;
      return { t:bl, bh:bh, folhas:folhas, fh:fh, alt:Math.max(bh, fh), cor:PAL[i % PAL.length], num:i+1 };
    });

    var corte = Math.ceil(blocos.length/2);
    var lados = [ { nome:'esq', itens:blocos.slice(0, corte) }, { nome:'dir', itens:blocos.slice(corte) } ];
    var GAP = 30;
    lados.forEach(function(s){
      s.alt = s.itens.reduce(function(a,b){ return a + b.alt; }, 0) + Math.max(0, s.itens.length-1)*GAP;
    });

    var H = Math.max(lados[0].alt, lados[1].alt, 2*R + 130) + 110;
    var CY = H/2;
    var uid = 'm' + Math.random().toString(36).slice(2, 7);

    var svg = '<svg viewBox="0 0 '+W+' '+Math.round(H)+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa mental: '+esc(m.nome)+'">';
    svg += '<defs>' +
      '<filter id="sh" x="-30%" y="-30%" width="170%" height="170%">' +
        '<feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0B2318" flood-opacity="0.16"/></filter>' +
      '<marker id="ponta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
        '<path d="M0,0.6 L9.4,5 L0,9.4 Z" fill="var(--map-ink)"/></marker>' +
      '<path id="'+uid+'" d="M'+(CX-152)+','+(CY-26)+' A168,168 0 0 1 '+(CX+152)+','+(CY-26)+'" fill="none"/>' +
      '</defs>';

    lados.forEach(function(s){
      var esq = s.nome === 'esq';
      var brX  = esq ? BR_X_L   : BR_X_R;
      var lfX  = esq ? LEAF_X_L : LEAF_X_R;
      var y = CY - s.alt/2;

      s.itens.forEach(function(bl){
        var topo = y, altura = bl.alt;
        var bY = topo + (altura - bl.bh)/2;
        var bMidY = bY + bl.bh/2;

        var ancX = esq ? (brX + BR_W) : brX;
        var vx = ancX - CX, vy = bMidY - CY, vl = Math.sqrt(vx*vx+vy*vy) || 1;
        var sx = CX + vx/vl*(R+10), sy = CY + vy/vl*(R+10);
        var ex = ancX + (esq ? 12 : -12);
        var curva = 30 * (bMidY < CY ? -1 : 1) * (esq ? -1 : 1);
        svg += seta(sx, sy, ex, bMidY, curva);

        var fy = topo + (altura - bl.fh)/2;
        bl.folhas.forEach(function(f){
          var fMidY = fy + f.h/2;
          var fromX = esq ? brX : (brX + BR_W);
          var toX   = esq ? (lfX + LEAF_W + 10) : (lfX - 10);
          svg += seta(fromX + (esq?-6:6), bMidY, toX, fMidY, 13 * (fMidY < bMidY ? -1 : 1) * (esq ? -1 : 1));
          svg += box(lfX, fy, LEAF_W, f.h, bl.cor.l);
          var topoTxt = fMidY - f.alto/2;
          var altoRot = f.ls.length*21;
          svg += lines(lfX + LEAF_W/2, topoTxt + altoRot/2, f.ls, 'leaf-t', 17, 21);
          if(f.ds.length){
            svg += lines(lfX + LEAF_W/2, topoTxt + altoRot + 6 + f.ds.length*17/2, f.ds, 'leaf-d', 14, 17);
          }
          fy += f.h + 11;
        });

        svg += box(brX, bY, BR_W, bl.bh, bl.cor.b);
        svg += lines(brX + BR_W/2, bMidY, bl.t, 'node-t', 18, 22);
        var nx = esq ? (brX + BR_W - 6) : (brX + 6);
        /* fundo claro fixo: o número fica legível também no tema escuro */
        svg += '<circle cx="'+nx+'" cy="'+(bY+4)+'" r="15" fill="#F7FBF6" stroke="'+bl.cor.b+'" stroke-width="2.5"/>';
        svg += '<text x="'+nx+'" y="'+(bY+4)+'" class="badge-t" font-size="14" text-anchor="middle" dominant-baseline="central">'+bl.num+'</text>';

        y += altura + GAP;
      });
    });

    svg += '<circle cx="'+CX+'" cy="'+CY+'" r="'+R+'" fill="#A5D8EE" filter="url(#sh)"/>';
    var nomeLs = wrap(m.nome, 14);
    svg += '<text x="'+CX+'" y="'+(CY - nomeLs.length*12 - 6)+'" class="badge-t" font-size="14" text-anchor="middle" dominant-baseline="central" opacity="0.72">'+esc(m.k || '')+'</text>';
    svg += lines(CX, CY + 13, nomeLs, 'node-t', 19, 22);
    svg += '<text class="arco-t" font-size="21"><textPath href="#'+uid+'" startOffset="50%" text-anchor="middle">'+esc(m.arco || '')+'</textPath></text>';

    return svg + '</svg>';
  }

  window.montaMapa = montaMapa;
})();
