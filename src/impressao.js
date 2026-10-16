/* Simulado impresso: sorteia questões da matéria e monta uma prova em A4 no
   formato das avaliações institucionais (cabeçalho com aluno e nota,
   “Questão 01 – Valor 0,5”, duas colunas, discursivas com linhas, cartão-
   resposta e gabarito comentado em página separada). O HTML vai para o
   processo principal, que imprime ou salva em PDF. */
(function(){
  'use strict';
  var esc = U.esc;
  var CHAVE = 'impressaoCab';

  function lerCab(){ try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch(e){ return {}; } }
  function gravarCab(c){ try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch(e){} }
  function num(s){ var n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; }
  function br(n){ return (Math.round(n * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:2 }); }
  function dois(n){ return (n < 10 ? '0' : '') + n; }
  function embaralhar(a){ a = a.slice(); for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function nivelDe(q){ return q.nivel || (q.t === 'ar' ? 2 : 1); }
  function paragrafos(t){ return String(t || '').split(/\n\n+/).map(function(p){ return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }

  /* ── janela de opções ── */
  function abrir(ctx){
    var M = ctx.materia, qs = ctx.questoes;
    window.Impressao.ultimoCtx = ctx;   /* usado pelo teste visual */
    var cab = lerCab();
    var blocos = M.blocos.filter(function(b){ return qs.some(function(x){ return ctx.blocoDaAula(x.q.a) === b.id; }); });
    var nAR = qs.filter(function(x){ return x.q.t === 'ar'; }).length;
    var nDisc = M.discursivas.length;
    var inst = cab.instituicao || String(M.subtitulo || '').split('·')[0].trim() || 'Centro Universitário';
    var opQtd = [5, 8, 10, 15, 20, 30].filter(function(n){ return n < qs.length; });

    U.modal('<h2>Imprimir simulado</h2><p>Monta uma prova em folha A4 com questões sorteadas, no formato das avaliações institucionais. Cada vez que você gera, sai uma prova diferente.</p>' +
      '<div class="imp-grade">' +
        campo('Título da prova', '<input id="i-tit" value="'+esc(cab.titulo || '1ª Avaliação — Simulado N1')+'">') +
        campo('Instituição', '<input id="i-inst" value="'+esc(inst)+'">') +
        campo('Curso', '<input id="i-curso" value="'+esc(cab.curso || 'Sistemas de Informação')+'">') +
        campo('Período', '<input id="i-per" value="'+esc(cab.periodo || '7º')+'">') +
        campo('Turno', '<input id="i-turno" value="'+esc(cab.turno || 'Noturno')+'">') +
        campo('Semestre', '<input id="i-sem" value="'+esc(cab.semestre || '2026/2')+'">') +
      '</div>' +
      '<div class="imp-grade">' +
        campo('Questões objetivas', '<select id="i-qtd">' + opQtd.map(function(n){ return '<option'+(n===8?' selected':'')+'>'+n+'</option>'; }).join('') +
          '<option value="'+qs.length+'"'+(opQtd.indexOf(8) < 0 ? ' selected' : '')+'>Todas ('+qs.length+')</option></select>') +
        campo('Valor de cada objetiva', '<input id="i-vobj" value="0,5" inputmode="decimal">') +
        (nAR ? campo('Das objetivas, asserção-razão', '<input id="i-ar" value="'+Math.min(2, nAR)+'" inputmode="numeric">', 'Há '+nAR+' nesta matéria.') : '') +
        campo('Discursivas', '<select id="i-disc">' + [0,1,2,3].filter(function(n){ return n <= nDisc; }).map(function(n){ return '<option'+(n===Math.min(1,nDisc)?' selected':'')+'>'+n+'</option>'; }).join('') + '</select>') +
        campo('Valor de cada discursiva', '<input id="i-vdisc" inputmode="decimal">', '', 'i-total') +
        campo('Linhas por discursiva', '<select id="i-lin"><option>10</option><option selected>15</option><option>20</option><option>25</option></select>') +
      '</div>' +
      (blocos.length > 1 ? '<div class="campo"><span>Conteúdo</span><div class="checks">' + blocos.map(function(b){
        return '<label><input type="checkbox" class="i-bloco" value="'+b.id+'" checked> '+esc(b.nome)+' <small>('+esc(b.faixa)+')</small></label>';
      }).join('') + '</div></div>' : '') +
      '<div class="campo"><span>Níveis</span><div class="checks">' + [[1,'Conceitos'],[2,'Asserção-razão'],[3,'Na prática (cenários)']].map(function(n){
        var tem = qs.filter(function(x){ return nivelDe(x.q) === n[0]; }).length;
        return '<label><input type="checkbox" class="i-nivel" value="'+n[0]+'"'+(tem ? ' checked' : ' disabled')+'> Nível '+n[0]+' · '+n[1]+' <small>('+tem+')</small></label>';
      }).join('') + '</div></div>' +
      '<div class="campo"><span>Incluir</span><div class="checks">' +
        '<label><input type="checkbox" id="i-cartao" checked> Cartão-resposta</label>' +
        '<label><input type="checkbox" id="i-gab" checked> Gabarito comentado (em página separada, no fim)</label>' +
      '</div></div>' +
      '<div class="msg-erro" id="i-erro"></div>' +
      '<div class="modal-acts"><button class="ghost" id="i-cancelar">Cancelar</button><button class="ghost" id="i-pdf">Salvar em PDF</button><button class="btn" id="i-imp">🖨 Imprimir</button></div>',
      function(el, fechar){
        var q = function(s){ return el.querySelector(s); };
        /* a discursiva completa o que falta para 10,0 */
        function recalcular(auto){
          var nObj = +q('#i-qtd').value, vo = num(q('#i-vobj').value), nd = +q('#i-disc').value;
          if(auto && nd) q('#i-vdisc').value = br(Math.max(0.5, (10 - nObj * vo) / nd));
          q('#i-vdisc').disabled = !nd;
          if(!nd) q('#i-vdisc').value = '';
          q('#i-total').textContent = 'Total da prova: ' + br(nObj * vo + nd * num(q('#i-vdisc').value));
        }
        ['#i-qtd', '#i-vobj', '#i-disc'].forEach(function(s){ q(s).addEventListener('input', function(){ recalcular(true); }); q(s).addEventListener('change', function(){ recalcular(true); }); });
        q('#i-vdisc').addEventListener('input', function(){ recalcular(false); });
        recalcular(true);
        q('#i-cancelar').onclick = fechar;
        var gerar = function(modo){
          var cfg = {
            titulo: q('#i-tit').value.trim() || 'Simulado', instituicao: q('#i-inst').value.trim(), curso: q('#i-curso').value.trim(),
            periodo: q('#i-per').value.trim(), turno: q('#i-turno').value.trim(), semestre: q('#i-sem').value.trim(),
            nObj: +q('#i-qtd').value, vObj: num(q('#i-vobj').value), nAR: q('#i-ar') ? Math.max(0, parseInt(q('#i-ar').value, 10) || 0) : 0,
            nDisc: +q('#i-disc').value, vDisc: num(q('#i-vdisc').value), linhas: +q('#i-lin').value,
            cartao: q('#i-cartao').checked, gabarito: q('#i-gab').checked,
            blocos: Array.prototype.map.call(el.querySelectorAll('.i-bloco:checked'), function(c){ return c.value; }),
            niveis: Array.prototype.map.call(el.querySelectorAll('.i-nivel:checked'), function(c){ return +c.value; })
          };
          if(blocos.length > 1 && !cfg.blocos.length){ q('#i-erro').textContent = 'Escolha ao menos um bloco de conteúdo.'; return; }
          if(!cfg.niveis.length){ q('#i-erro').textContent = 'Escolha ao menos um nível.'; return; }
          gravarCab({ titulo:cfg.titulo, instituicao:cfg.instituicao, curso:cfg.curso, periodo:cfg.periodo, turno:cfg.turno, semestre:cfg.semestre });
          var prova = sortear(ctx, cfg, blocos.length > 1);
          if(!prova.objetivas.length && !prova.discursivas.length){ q('#i-erro').textContent = 'Nenhuma questão com essas opções.'; return; }
          var botao = q(modo === 'pdf' ? '#i-pdf' : '#i-imp'), rot = botao.textContent;
          botao.disabled = true; botao.textContent = 'Gerando…';
          window.api.imprimir(montarHtml(M, cfg, prova), modo, cfg.titulo + ' — ' + M.nome).then(function(r){
            if(!r) { botao.disabled = false; botao.textContent = rot; return; }   /* cancelou */
            fechar();
            U.aviso(modo === 'pdf' ? 'PDF salvo e aberto.' : 'Prova enviada para a impressora.', 3500);
          }).catch(function(e){
            botao.disabled = false; botao.textContent = rot;
            q('#i-erro').textContent = String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
          });
        };
        q('#i-pdf').onclick = function(){ gerar('pdf'); };
        q('#i-imp').onclick = function(){ gerar('imprimir'); };
      });
  }
  function campo(rotulo, controle, dica, idDica){
    return '<label class="campo"><span>'+rotulo+'</span>'+controle+(dica || idDica ? '<small'+(idDica ? ' id="'+idDica+'"' : '')+'>'+esc(dica || '')+'</small>' : '')+'</label>';
  }

  /* ── sorteio ── */
  function sortear(ctx, cfg, filtrarBloco){
    var M = ctx.materia;
    var pool = ctx.questoes.filter(function(x){
      return (!filtrarBloco || cfg.blocos.indexOf(ctx.blocoDaAula(x.q.a)) >= 0) && (!cfg.niveis || cfg.niveis.indexOf(nivelDe(x.q)) >= 0);
    });
    var ar = embaralhar(pool.filter(function(x){ return x.q.t === 'ar'; }));
    var mc = embaralhar(pool.filter(function(x){ return x.q.t !== 'ar'; }));
    var nAR = Math.min(cfg.nAR, ar.length, cfg.nObj);
    var escolhidas = mc.slice(0, cfg.nObj - nAR).concat(ar.slice(0, nAR));
    if(escolhidas.length < cfg.nObj) escolhidas = escolhidas.concat(ar.slice(nAR, nAR + cfg.nObj - escolhidas.length));
    escolhidas = embaralhar(escolhidas);
    /* Gabarito equilibrado: as letras certas das objetivas comuns saem de um
       baralho com A–E repetidos, descontando as que a asserção-razão já usa
       (ela mantém a ordem padrão). Assim nenhuma letra domina a prova. */
    var usadas = [0,0,0,0,0];
    escolhidas.forEach(function(x){ if(x.q.t === 'ar') usadas[x.q.c]++; });
    var nComuns = escolhidas.length - escolhidas.filter(function(x){ return x.q.t === 'ar'; }).length;
    var baralho = [], alvo = Math.ceil(escolhidas.length / 5);
    for(var l = 0; l < 5; l++) for(var k = usadas[l]; k < alvo; k++) baralho.push(l);
    while(baralho.length < nComuns) baralho = baralho.concat([0,1,2,3,4]);
    baralho = embaralhar(baralho).slice(0, nComuns);
    var objetivas = escolhidas.map(function(x){
      var q = x.q;
      if(q.t === 'ar') return { q:q, opcoes:q.o.slice(), certa:q.c };
      var pos = baralho.pop(), resto = embaralhar([0,1,2,3,4].filter(function(j){ return j !== q.c; }));
      var ordem = []; for(var s = 0; s < 5; s++) ordem.push(s === pos ? q.c : resto.shift());
      return { q:q, opcoes:ordem.map(function(j){ return q.o[j]; }), certa:pos };
    });
    return { objetivas:objetivas, discursivas:embaralhar(M.discursivas).slice(0, cfg.nDisc) };
  }

  /* ── documento A4 ── */
  var CSS =
    '@page{size:A4;margin:12mm 12mm 14mm}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font:10.2pt/1.38 Arial,"Segoe UI",sans-serif;color:#111}' +
    '.topo{display:flex;align-items:stretch;gap:10px;margin-bottom:6px}' +
    '.inst{background:#1a1a1a;color:#fff;font:800 13pt/1.1 "Arial Black",Arial,sans-serif;padding:8px 12px;border-radius:4px;display:flex;align-items:center;text-transform:uppercase;letter-spacing:.02em;max-width:62mm}' +
    '.tit{flex:1;display:flex;align-items:center;justify-content:center;font:700 13pt Georgia,"Times New Roman",serif;text-transform:uppercase;text-align:center}' +
    'table.cab{width:100%;border-collapse:collapse;font-size:10pt}' +
    'table.cab td{border:1px solid #333;padding:5px 7px;vertical-align:top}' +
    'table.cab b{font-weight:700}' +
    'td.nome{height:9mm}' +
    '.instr{font-size:7.8pt;font-weight:700;text-align:justify;margin:6px 0 10px;line-height:1.3}' +
    '.cols{column-count:2;column-gap:7mm;column-rule:1px solid #999}' +
    '.q{break-inside:avoid;margin:0 0 11px}' +
    '.qh{background:#c8c8c8;font-weight:700;padding:2px 6px;margin-bottom:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.en{text-align:justify;margin:0 0 5px}' +
    '.ar{margin:5px 0 6px;padding-left:4px}' +
    '.ar p{margin:0 0 3px;text-align:justify}' +
    '.porque{text-align:center;font-weight:700;letter-spacing:.12em;margin:3px 0 !important}' +
    '.ops{list-style:none;margin:0;padding:0}' +
    '.ops li{display:flex;gap:6px;margin:0 0 3px;text-align:justify}' +
    '.ops .l{flex:none;font-weight:700}' +
    '.disc{break-inside:avoid;margin:12px 0 0}' +
    '.disc .en{margin-bottom:6px}' +
    '.linha{border-bottom:1px solid #777;height:7.6mm}' +
    '.cartao{break-inside:avoid;margin-top:14px;border:1.5px solid #333;padding:8px 10px}' +
    '.cartao h3,.gab h2{margin:0 0 6px;font:700 11pt Arial,sans-serif;text-transform:uppercase}' +
    '.cartao table{border-collapse:collapse;font-size:9.5pt}' +
    '.cartao td{padding:2px 5px}' +
    '.bola{display:inline-block;width:14px;height:14px;border:1.2px solid #333;border-radius:50%;text-align:center;font-size:7.5pt;line-height:12px;margin-right:3px}' +
    '.cartao .grid{display:flex;flex-wrap:wrap;gap:0 18px}' +
    '.gab{break-before:page}' +
    '.gab .aviso{font-size:9pt;color:#444;margin:0 0 10px}' +
    '.gi{break-inside:avoid;margin:0 0 7px;font-size:9.4pt;text-align:justify}' +
    '.gi b.let{display:inline-block;min-width:22px}' +
    '.gd{break-inside:avoid;margin:10px 0 0;font-size:9.4pt}' +
    '.gd ul{margin:3px 0 4px 16px;padding:0}' +
    '.gd .modelo{border-left:3px solid #bbb;padding-left:8px;color:#222}' +
    '.gd .modelo p{margin:0 0 4px;text-align:justify}' +
    '.rod{margin-top:12px;font-size:7.5pt;color:#666;text-align:center}';

  function montarHtml(M, cfg, prova){
    var nObj = prova.objetivas.length, nd = prova.discursivas.length;
    var total = nObj * cfg.vObj + nd * cfg.vDisc;
    var minutos = Math.max(20, Math.round(nObj * 3 + nd * 15));
    var h = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>'+esc(cfg.titulo)+'</title><style>'+CSS+'</style><body>';

    h += '<div class="topo">' + (cfg.instituicao ? '<div class="inst">'+esc(cfg.instituicao)+'</div>' : '') + '<div class="tit">'+esc(cfg.titulo)+'</div></div>' +
      '<table class="cab">' +
        '<tr><td colspan="3"><b>Curso:</b> '+esc(cfg.curso)+'</td></tr>' +
        '<tr><td colspan="3"><b>Disciplina:</b> '+esc(M.nome)+'</td></tr>' +
        '<tr><td colspan="3" class="nome"><b>Nome do aluno:</b></td></tr>' +
        '<tr><td><b>Período:</b> '+esc(cfg.periodo)+'</td><td><b>Turno:</b> '+esc(cfg.turno)+'</td><td><b>Semestre:</b> '+esc(cfg.semestre)+'</td></tr>' +
        '<tr><td><b>Data:</b> ____/____/______</td><td><b>Valor total da prova:</b> '+br(total)+'</td><td><b>Nota do aluno:</b></td></tr>' +
      '</table>' +
      '<p class="instr">Simulado de estudo. Leia cada questão com atenção. Nas questões objetivas, marque somente uma alternativa' + (cfg.cartao ? ' e transcreva-a para o cartão-resposta' : '') +
        '; questões rasuradas serão anuladas. Nas questões de asserção-razão, julgue cada proposição e depois se a II justifica a I. ' +
        'As questões discursivas devem ser escritas com clareza e coerência. Tempo sugerido: '+minutos+' minutos.</p>';

    var n = 0;
    if(nObj){
      h += '<div class="cols">' + prova.objetivas.map(function(o){
        n++;
        var q = o.q;
        var corpo = q.t === 'ar'
          ? '<p class="en">'+esc(q.e)+'</p><div class="ar"><p><b>I.</b> '+esc(q.i1)+'</p><p class="porque">PORQUE</p><p><b>II.</b> '+esc(q.i2)+'</p></div><p class="en">A respeito dessas asserções, assinale a opção correta.</p>'
          : '<p class="en">'+esc(q.e)+'</p>';
        return '<section class="q"><div class="qh">Questão '+dois(n)+' – Valor '+br(cfg.vObj)+'</div>' + corpo +
          '<ol class="ops">' + o.opcoes.map(function(t, j){ return '<li><span class="l">'+'ABCDE'[j]+')</span><span>'+esc(t)+'</span></li>'; }).join('') + '</ol></section>';
      }).join('') + '</div>';
    }
    prova.discursivas.forEach(function(d){
      n++;
      var linhas = ''; for(var i = 0; i < cfg.linhas; i++) linhas += '<div class="linha"></div>';
      h += '<section class="disc"><div class="qh">Questão '+dois(n)+' – Valor '+br(cfg.vDisc)+' (discursiva)</div><p class="en">'+esc(d.enunciado)+'</p>'+linhas+'</section>';
    });

    if(cfg.cartao && nObj){
      h += '<div class="cartao"><h3>Cartão-resposta</h3><div class="grid">' + prova.objetivas.map(function(o, i){
        return '<div>' + dois(i + 1) + ' &nbsp;' + 'ABCDE'.split('').map(function(l){ return '<span class="bola">'+l+'</span>'; }).join('') + '</div>';
      }).join('') + '</div></div>';
    }

    if(cfg.gabarito){
      h += '<section class="gab"><h2>Gabarito comentado — '+esc(cfg.titulo)+'</h2><p class="aviso">Confira só depois de terminar a prova. Correção: '+br(cfg.vObj)+' por objetiva certa' +
        (nd ? '; discursiva até '+br(cfg.vDisc)+' pelos pontos-chave' : '') + '.</p>';
      h += prova.objetivas.map(function(o, i){
        return '<div class="gi"><b>'+dois(i + 1)+'</b> — <b class="let">'+'ABCDE'[o.certa]+'</b> <i>(Aula '+o.q.a+' · nível '+nivelDe(o.q)+(o.q.t === 'ar' ? ', asserção-razão' : '')+')</i> '+esc(o.q.x)+'</div>';
      }).join('');
      prova.discursivas.forEach(function(d, i){
        h += '<div class="gd"><b>'+dois(nObj + i + 1)+' — '+esc(d.tema || 'Discursiva')+'</b><br>Pontos-chave (o que o corretor procura):<ul>' +
          (d.chaves || []).map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('') + '</ul>' +
          (d.modelo ? 'Resposta modelo:<div class="modelo">'+paragrafos(d.modelo)+'</div>' : '') + '</div>';
      });
      h += '</section>';
    }
    h += '<p class="rod">Gerado pela Plataforma de Estudo · '+esc(M.nome)+' · '+new Date().toLocaleDateString('pt-BR')+'</p></body></html>';
    return h;
  }

  window.Impressao = { abrir:abrir, montarHtml:montarHtml, sortear:sortear };
})();
