/* Bloco de notas flutuante: folha de fichário que fica por cima de qualquer
   tela, pode ser arrastada, redimensionada e ocultada. As notas salvam
   sozinhas enquanto você escreve (no computador e numa cópia no OneDrive). */
(function(){
  "use strict";
  var esc = U.esc, api = window.api.notas;
  var CHAVE_UI = 'blocoNotas';
  var LARG = 300, ALT = 430, MIN_L = 240, MIN_A = 260;

  var ctx = { id:null, nome:'Geral' };   /* matéria aberta */
  var notas = [];                        /* todas as notas, mais recentes primeiro */
  var atual = null;                      /* nota no editor */
  var vista = 'editor';                  /* editor | lista */
  var filtro = 'materia';                /* materia | todas */
  var marcadas = {};
  var timer = null, salvando = false, pendente = false, ultimoSalvo = null, temNuvem = false;

  /* ── posição e tamanho lembrados ─────────────────── */
  var ui = (function(){ try{ return JSON.parse(localStorage.getItem(CHAVE_UI)) || {}; }catch(e){ return {}; } })();
  function guardarUi(){ try{ localStorage.setItem(CHAVE_UI, JSON.stringify(ui)); }catch(e){} }

  /* ── montagem ────────────────────────────────────── */
  var el = document.createElement('section');
  el.className = 'bloco';
  el.setAttribute('aria-label', 'Bloco de notas');
  el.innerHTML =
    '<div class="bl-alca" title="Arraste para mover">' +
      '<span class="bl-grip" aria-hidden="true">⠿</span>' +
      '<span class="bl-nome"><b>Bloco de notas</b><small class="bl-ctx"></small></span>' +
      '<button class="bl-bt" data-a="lado" title="Trocar de lado" aria-label="Trocar o bloco de lado">⇄</button>' +
      '<button class="bl-bt" data-a="dividir" title="Dividir a tela (Ctrl+Shift+D)" aria-label="Dividir a tela">◧</button>' +
      '<button class="bl-bt" data-a="lista" title="Minhas notas" aria-label="Minhas notas">☰</button>' +
      '<button class="bl-bt" data-a="nova" title="Nova nota" aria-label="Nova nota">+</button>' +
      '<button class="bl-bt" data-a="ocultar" title="Ocultar (Ctrl+Shift+N)" aria-label="Ocultar bloco de notas">–</button>' +
    '</div>' +
    '<div class="bl-ferr" role="toolbar" aria-label="Formatação">' +
      '<button class="bl-f" data-lista="bala" title="Lista com marcadores (Ctrl+Shift+8)">•&nbsp;≡</button>' +
      '<button class="bl-f" data-lista="num" title="Lista numerada (Ctrl+Shift+7)">1.≡</button>' +
      '<button class="bl-f" data-lista="tarefa" title="Lista de tarefas (Ctrl+Shift+9)">☐</button>' +
      '<button class="bl-f" data-feito title="Marcar/desmarcar tarefa feita (Ctrl+Enter)">☑</button>' +
      '<span class="bl-sep"></span>' +
      '<div class="bl-pop"><button class="bl-f bl-cor-a" data-pop="tinta" title="Cor das letras">A<i></i></button>' +
        '<div class="bl-cores" data-cores="tinta" hidden></div></div>' +
      '<div class="bl-pop"><button class="bl-f bl-cor-p" data-pop="papel" title="Cor da folha">▣<i></i></button>' +
        '<div class="bl-cores" data-cores="papel" hidden></div></div>' +
    '</div>' +
    '<div class="bl-folha"><span class="bl-furo" style="top:14%"></span><span class="bl-furo" style="top:50%"></span><span class="bl-furo" style="top:86%"></span>' +
      '<div class="bl-corpo"></div></div>' +
    '<div class="bl-rodape"><span class="bl-status"><i class="bl-luz"></i><span class="bl-st-txt">—</span></span><button class="bl-salvar">Salvar</button></div>';
  document.body.appendChild(el);

  var icone = document.createElement('button');
  icone.className = 'bloco-icone';
  icone.title = 'Abrir bloco de notas (Ctrl+Shift+N)';
  icone.setAttribute('aria-label', 'Abrir bloco de notas');
  icone.textContent = '📝';
  document.body.appendChild(icone);

  /* barra entre as duas metades no modo "dividir tela" */
  var divisor = document.createElement('div');
  divisor.className = 'divisor';
  divisor.title = 'Arraste para ajustar · dois cliques: metade/metade';
  divisor.setAttribute('role', 'separator');
  divisor.setAttribute('aria-orientation', 'vertical');
  document.body.appendChild(divisor);

  var corpo = el.querySelector('.bl-corpo');
  var MIN_CONTEUDO = 380;

  function topoPadrao(){ var t = document.querySelector('.top'); return (t ? t.offsetHeight : 64) + 8; }
  function lateral(){ return ui.aberto !== false && !!ui.dividido; }
  function limitar(){
    var ladoEsq = ui.lado === 'esq';
    document.body.classList.toggle('dividido', lateral());
    document.body.classList.toggle('notas-esq', lateral() && ladoEsq);
    el.classList.toggle('lateral', lateral());
    el.querySelector('[data-a="dividir"]').setAttribute('aria-pressed', lateral() ? 'true' : 'false');
    el.querySelector('[data-a="lado"]').hidden = !lateral();
    if(lateral()){
      var W = window.innerWidth;
      var lw = Math.round(W * (ui.frac || 0.5));
      lw = Math.max(Math.min(MIN_L + 40, W - MIN_CONTEUDO), Math.min(lw, W - MIN_CONTEUDO));
      document.body.style.setProperty('--notas-w', lw + 'px');
      el.style.top = '0px'; el.style.height = window.innerHeight + 'px'; el.style.width = lw + 'px';
      el.style.left = (ladoEsq ? 0 : W - lw) + 'px';
      divisor.style.left = (ladoEsq ? lw : W - lw) + 'px';
      return { x:0, y:0, w:lw, h:window.innerHeight };
    }
    var w = Math.max(MIN_L, Math.min(ui.w || LARG, window.innerWidth - 16));
    var h = Math.max(MIN_A, Math.min(ui.h || ALT, window.innerHeight - 16));
    var x = ui.x == null ? window.innerWidth - w - 24 : ui.x;
    var y = ui.y == null ? topoPadrao() : ui.y;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - 60));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = w + 'px'; el.style.height = h + 'px';
    return { x:x, y:y, w:w, h:h };
  }
  /* avisa o resto da tela que a largura útil mudou (cabeçalho, mapa, etc.) */
  function larguraMudou(){ window.dispatchEvent(new Event('resize')); }
  function mostrar(aberto){
    var antes = lateral();
    ui.aberto = aberto; guardarUi();
    el.hidden = !aberto; icone.hidden = aberto;
    limitar();
    if(antes !== lateral()) larguraMudou();
    if(aberto && vista === 'editor'){ var t = corpo.querySelector('.bl-texto'); if(t) t.focus(); }
  }
  function dividir(v){
    clearTimeout(obsTimer);
    ui.dividido = v; if(v && !ui.aberto) ui.aberto = true;
    guardarUi(); el.hidden = !ui.aberto; icone.hidden = !!ui.aberto;
    limitar(); larguraMudou();
  }
  window.addEventListener('resize', function(){ limitar(); });

  /* arrastar a barra do meio */
  (function(){
    var ativo = false;
    divisor.addEventListener('pointerdown', function(ev){
      if(ev.button !== 0) return;
      ativo = true; divisor.setPointerCapture(ev.pointerId); document.body.classList.add('ajustando');
    });
    divisor.addEventListener('pointermove', function(ev){
      if(!ativo) return;
      var W = window.innerWidth;
      var f = ui.lado === 'esq' ? ev.clientX / W : (W - ev.clientX) / W;
      ui.frac = Math.max(0.25, Math.min(0.75, f));
      limitar();
    });
    function soltar(){ if(!ativo) return; ativo = false; document.body.classList.remove('ajustando'); guardarUi(); larguraMudou(); }
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
    divisor.addEventListener('dblclick', function(){ ui.frac = 0.5; guardarUi(); limitar(); larguraMudou(); });
  })();

  /* arrastar pela alça */
  (function(){
    var alca = el.querySelector('.bl-alca'), ini = null;
    alca.addEventListener('pointerdown', function(ev){
      if(ev.button !== 0 || ev.target.closest('button') || lateral()) return;
      var r = el.getBoundingClientRect();
      ini = { dx:ev.clientX - r.left, dy:ev.clientY - r.top };
      alca.setPointerCapture(ev.pointerId);
      el.classList.add('movendo');
    });
    alca.addEventListener('pointermove', function(ev){
      if(!ini) return;
      ui.x = ev.clientX - ini.dx; ui.y = ev.clientY - ini.dy;
      limitar();
    });
    function soltar(){ if(!ini) return; ini = null; el.classList.remove('movendo'); var p = limitar(); ui.x = p.x; ui.y = p.y; guardarUi(); }
    alca.addEventListener('pointerup', soltar);
    alca.addEventListener('pointercancel', soltar);
    alca.addEventListener('dblclick', function(ev){ if(!ev.target.closest('button') && !lateral()){ delete ui.x; delete ui.y; limitar(); guardarUi(); } });
  })();

  /* redimensionar pelo canto (resize nativo do CSS) */
  var obsTimer = null;
  new ResizeObserver(function(){
    if(el.hidden || el.classList.contains('movendo') || lateral()) return;
    clearTimeout(obsTimer);
    /* confere de novo na hora de gravar: a tela pode ter sido dividida nesse meio-tempo */
    obsTimer = setTimeout(function(){ if(lateral() || el.hidden) return; ui.w = el.offsetWidth; ui.h = el.offsetHeight; guardarUi(); }, 250);
  }).observe(el);

  /* ── status: salvo / online / OneDrive ───────────── */
  function status(txt, estado){
    el.querySelector('.bl-st-txt').textContent = txt;
    el.querySelector('.bl-luz').dataset.e = estado || (navigator.onLine ? 'on' : 'off');
  }
  function statusSalvo(){
    if(!ultimoSalvo){ status(navigator.onLine ? 'Online' : 'Offline — tudo fica salvo no computador'); return; }
    var hora = new Date(ultimoSalvo).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    if(!temNuvem) status('Salvo às ' + hora + ' no computador');
    else if(navigator.onLine) status('Salvo às ' + hora + ' · cópia no OneDrive');
    else status('Salvo às ' + hora + ' · offline: o OneDrive envia quando a internet voltar');
  }
  window.addEventListener('online', statusSalvo);
  window.addEventListener('offline', statusSalvo);

  /* ── dados ───────────────────────────────────────── */
  function novoId(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function daVez(){ return notas.filter(function(n){ return filtro === 'todas' || (n.materiaId || null) === ctx.id; }); }
  function recarregar(){
    return api.listar().then(function(l){ notas = l; }).catch(function(){});
  }

  function salvarAgora(){
    if(!atual) return Promise.resolve();
    clearTimeout(timer);
    if(!atual.titulo && !atual.texto && !atual.existe) return Promise.resolve();   /* nota vazia nunca criada */
    if(salvando){ pendente = true; return Promise.resolve(); }
    salvando = true; status('Salvando…', 'sv');
    var n = atual;
    return api.salvar({ id:n.id, materiaId:n.materiaId, titulo:n.titulo, texto:n.texto, tinta:n.tinta, papel:n.papel }).then(function(r){
      n.existe = true; ultimoSalvo = r.atualizadoEm; temNuvem = r.nuvem;
      var i = notas.findIndex(function(x){ return x.id === n.id; });
      var c = { id:n.id, materiaId:n.materiaId, materiaNome:n.materiaNome, titulo:n.titulo, texto:n.texto, tinta:n.tinta, papel:n.papel, atualizadoEm:r.atualizadoEm };
      if(i >= 0) notas.splice(i, 1);
      notas.unshift(c);
      statusSalvo();
    }).catch(function(e){ status('Não salvou: ' + e.message, 'err'); })
      .then(function(){ salvando = false; if(pendente){ pendente = false; salvarAgora(); } });
  }
  function agendar(){ status('Escrevendo…', 'sv'); clearTimeout(timer); timer = setTimeout(salvarAgora, 700); }

  function abrirNota(n){
    atual = { id:n.id, materiaId:n.materiaId || null, materiaNome:n.materiaNome, titulo:n.titulo || '', texto:n.texto || '', tinta:n.tinta || null, papel:n.papel || null, existe:true };
    ultimoSalvo = n.atualizadoEm; vista = 'editor'; desenhar(); statusSalvo();
  }
  function novaNota(){
    salvarAgora();
    atual = { id:novoId(), materiaId:ctx.id, materiaNome:ctx.nome, titulo:'', texto:'', existe:false };
    ultimoSalvo = null; vista = 'editor'; desenhar(); statusSalvo();
    var t = corpo.querySelector('.bl-titulo'); if(t) t.focus();
  }

  /* ── desenho ─────────────────────────────────────── */
  function desenhar(){
    el.querySelector('.bl-ctx').textContent = ctx.nome;
    el.querySelector('[data-a="lista"]').setAttribute('aria-pressed', vista === 'lista' ? 'true' : 'false');
    el.querySelector('.bl-salvar').hidden = vista !== 'editor';
    if(vista === 'editor') desenharEditor(); else desenharLista();
  }
  function desenharEditor(){
    if(!atual){ atual = { id:novoId(), materiaId:ctx.id, materiaNome:ctx.nome, titulo:'', texto:'', existe:false }; ultimoSalvo = null; }
    corpo.className = 'bl-corpo editor';
    corpo.innerHTML =
      (atual.materiaId !== ctx.id ? '<div class="bl-aviso">Nota de: '+esc(atual.materiaNome || 'Geral')+'</div>' : '') +
      '<input class="bl-titulo" type="text" placeholder="Título da nota" maxlength="200" value="'+esc(atual.titulo)+'">' +
      '<textarea class="bl-texto" placeholder="Anote aqui… (salva sozinho)" spellcheck="true">'+esc(atual.texto)+'</textarea>';
    aplicarCores();
  }

  /* ── marcadores e cores ──────────────────────────── */
  var TINTAS = [['#1B2430','Grafite'],['#1F4FB5','Azul'],['#B3261E','Vermelho'],['#1E7A45','Verde'],['#6B3FA0','Roxo'],['#9A5B00','Marrom']];
  var PAPEIS = [['#FFFFFF','Branco'],['#FBF6E9','Creme'],['#FFF6B8','Amarelo'],['#E7F6E9','Verde-claro'],['#E6F1FB','Azul-claro'],['#FCE8EF','Rosa']];
  var PREFIXO = /^(\s*)(• |\d+\. |☐ |☑ )/;
  function aplicarCores(){
    var papel = (vista === 'editor' && atual && atual.papel) || '#FFFFFF';
    var tinta = (vista === 'editor' && atual && atual.tinta) || '#1B2430';
    el.querySelector('.bl-folha').style.backgroundColor = papel;
    el.style.setProperty('--bl-tinta', tinta);
    el.querySelector('.bl-ferr').hidden = vista !== 'editor';
    Array.prototype.forEach.call(el.querySelectorAll('[data-tinta]'), function(b){ b.setAttribute('aria-pressed', b.dataset.tinta === tinta ? 'true' : 'false'); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-papel]'), function(b){ b.setAttribute('aria-pressed', b.dataset.papel === papel ? 'true' : 'false'); });
    el.querySelector('.bl-cor-a i').style.background = tinta;
    el.querySelector('.bl-cor-p i').style.background = papel;
  }
  function tipoLinha(l){ return /^\s*• /.test(l) ? 'bala' : /^\s*\d+\. /.test(l) ? 'num' : /^\s*[☐☑] /.test(l) ? 'tarefa' : null; }
  function selecaoDeLinhas(ta){
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var ini = v.lastIndexOf('\n', s - 1) + 1, fim = v.indexOf('\n', e);
    if(fim < 0) fim = v.length;
    return { ini:ini, fim:fim, linhas:v.slice(ini, fim).split('\n') };
  }
  function trocarLinhas(ta, r, novas){
    var txt = novas.join('\n');
    ta.setRangeText(txt, r.ini, r.fim, 'end');
    ta.setSelectionRange(r.ini + txt.length, r.ini + txt.length);
    atual.texto = ta.value; agendar(); ta.focus();
  }
  /* liga/desliga o marcador nas linhas selecionadas (ou na linha do cursor) */
  function aplicarLista(tipo){
    var ta = corpo.querySelector('.bl-texto'); if(!ta) return;
    var r = selecaoDeLinhas(ta);
    var tirar = r.linhas.every(function(l){ return tipoLinha(l) === tipo; });
    var k = 0;
    trocarLinhas(ta, r, r.linhas.map(function(l){
      var sem = l.replace(PREFIXO, '$1');
      if(tirar) return sem;
      if(!sem.trim() && r.linhas.length > 1) return sem;
      var ind = sem.match(/^\s*/)[0];
      var pre = tipo === 'bala' ? '• ' : tipo === 'num' ? (++k) + '. ' : '☐ ';
      return ind + pre + sem.slice(ind.length);
    }));
  }
  function marcarFeito(){
    var ta = corpo.querySelector('.bl-texto'); if(!ta) return;
    var r = selecaoDeLinhas(ta);
    trocarLinhas(ta, r, r.linhas.map(function(l){
      if(/^\s*☐ /.test(l)) return l.replace('☐ ', '☑ ');
      if(/^\s*☑ /.test(l)) return l.replace('☑ ', '☐ ');
      var ind = l.match(/^\s*/)[0];
      return ind + '☑ ' + l.slice(ind.length);
    }));
  }
  /* Enter dentro de uma lista continua a lista; Enter num item vazio encerra */
  function continuarLista(ev, ta){
    var v = ta.value, s = ta.selectionStart;
    if(s !== ta.selectionEnd) return false;
    var ini = v.lastIndexOf('\n', s - 1) + 1, linha = v.slice(ini, s);
    var m = linha.match(/^(\s*)(• |(\d+)\. |☐ |☑ )(.*)$/);
    if(!m) return false;
    ev.preventDefault();
    if(!m[4].trim()){ ta.setRangeText(m[1], ini, s, 'end'); }
    else {
      var prox = m[3] ? (+m[3] + 1) + '. ' : m[2] === '☑ ' ? '☐ ' : m[2];
      ta.setRangeText('\n' + m[1] + prox, s, s, 'end');
    }
    atual.texto = ta.value; agendar();
    return true;
  }
  function desenharLista(){
    aplicarCores();
    var l = daVez();
    var nSel = l.filter(function(n){ return marcadas[n.id]; }).length;
    corpo.className = 'bl-corpo lista';
    corpo.innerHTML =
      '<div class="bl-filtro"><button data-f="materia" aria-pressed="'+(filtro==='materia')+'">'+esc(ctx.id ? 'Esta matéria' : 'Geral')+'</button>' +
        '<button data-f="todas" aria-pressed="'+(filtro==='todas')+'">Todas</button>' +
        (l.length ? '<label class="bl-todas"><input type="checkbox" data-todas'+(nSel && nSel === l.length ? ' checked' : '')+'> todas</label>' : '') + '</div>' +
      (l.length ? '<ul class="bl-itens">' + l.map(function(n){
        var quando = new Date(n.atualizadoEm).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
        return '<li><input type="checkbox" data-sel="'+esc(n.id)+'"'+(marcadas[n.id]?' checked':'')+' aria-label="Selecionar">' +
          '<button data-abrir="'+esc(n.id)+'"><b>'+esc(n.titulo || (n.texto || '').split('\n')[0].slice(0, 40) || 'Sem título')+'</b>' +
          '<small>'+(filtro === 'todas' ? esc(n.materiaNome) + ' · ' : '')+quando+'</small></button></li>';
      }).join('') + '</ul>' : '<p class="bl-vazio">Nenhuma nota aqui ainda.<br><button data-a="nova">+ Nova nota</button></p>') +
      (nSel ? '<div class="bl-acoes"><span>'+nSel+' selecionada(s)</span>' +
        '<button data-x="txt" title="Salvar como arquivo de texto">Salvar .txt</button><button data-x="pdf" title="Salvar como PDF">Salvar .pdf</button>' +
        '<button data-x="email" title="Enviar por e-mail">E-mail</button><button data-x="excluir" class="perigo" title="Excluir">Excluir</button></div>' : '') +
      (temNuvem || notas.length ? '<button class="bl-nuvem" data-x="nuvem">Abrir pasta no OneDrive</button>' : '');
  }

  /* ── eventos ─────────────────────────────────────── */
  el.addEventListener('input', function(ev){
    if(!atual) return;
    if(ev.target.classList.contains('bl-titulo')){ atual.titulo = ev.target.value; agendar(); }
    else if(ev.target.classList.contains('bl-texto')){ atual.texto = ev.target.value; agendar(); }
  });
  el.addEventListener('keydown', function(ev){
    if(ev.target.classList.contains('bl-titulo') && ev.key === 'Enter'){ ev.preventDefault(); corpo.querySelector('.bl-texto').focus(); }
    if(ev.target.classList.contains('bl-texto')){
      if(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); marcarFeito(); ev.stopPropagation(); return; }
      if(ev.key === 'Enter' && !ev.shiftKey && continuarLista(ev, ev.target)){ ev.stopPropagation(); return; }
      if(ev.ctrlKey && ev.shiftKey && (ev.code === 'Digit8' || ev.code === 'Digit7' || ev.code === 'Digit9')){
        ev.preventDefault(); ev.stopPropagation();
        aplicarLista(ev.code === 'Digit8' ? 'bala' : ev.code === 'Digit7' ? 'num' : 'tarefa');
        return;
      }
    }
    if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's'){ ev.preventDefault(); salvarAgora(); }
    /* as teclas do simulado/mapa não disparam enquanto se escreve (Ctrl+Shift+N passa) */
    if(!(ev.ctrlKey && ev.shiftKey)) ev.stopPropagation();
  });
  el.addEventListener('change', function(ev){
    var s = ev.target.closest('[data-sel]');
    if(s){ if(s.checked) marcadas[s.dataset.sel] = true; else delete marcadas[s.dataset.sel]; desenharLista(); return; }
    if(ev.target.hasAttribute('data-todas')){
      var v = ev.target.checked; daVez().forEach(function(n){ if(v) marcadas[n.id] = true; else delete marcadas[n.id]; }); desenharLista();
    }
  });
  /* paletas de cor: montadas uma vez */
  el.querySelector('[data-cores="tinta"]').innerHTML = TINTAS.map(function(c){ return '<button data-tinta="'+c[0]+'" title="'+c[1]+'" style="background:'+c[0]+'"></button>'; }).join('');
  el.querySelector('[data-cores="papel"]').innerHTML = PAPEIS.map(function(c){ return '<button data-papel="'+c[0]+'" title="'+c[1]+'" style="background:'+c[0]+'"></button>'; }).join('');
  function fecharPaletas(){ Array.prototype.forEach.call(el.querySelectorAll('.bl-cores'), function(p){ p.hidden = true; }); }
  document.addEventListener('mousedown', function(ev){ if(!ev.target.closest('.bl-pop')) fecharPaletas(); });

  el.addEventListener('mousedown', function(ev){
    /* os botões de formatação não tiram o foco do texto (mantém a seleção) */
    if(ev.target.closest('.bl-ferr button')) ev.preventDefault();
  });
  el.addEventListener('click', function(ev){
    var t = ev.target;
    var li = t.closest('[data-lista]'); if(li){ aplicarLista(li.dataset.lista); return; }
    if(t.closest('[data-feito]')){ marcarFeito(); return; }
    var pop = t.closest('[data-pop]');
    if(pop){ var p = el.querySelector('[data-cores="'+pop.dataset.pop+'"]'), aberto = !p.hidden; fecharPaletas(); p.hidden = aberto; return; }
    var ti = t.closest('[data-tinta]'), pa = t.closest('[data-papel]');
    if((ti || pa) && atual){
      if(ti) atual.tinta = ti.dataset.tinta === TINTAS[0][0] ? null : ti.dataset.tinta;
      if(pa) atual.papel = pa.dataset.papel === PAPEIS[0][0] ? null : pa.dataset.papel;
      aplicarCores(); fecharPaletas(); agendar();
      return;
    }
    var a = t.closest('[data-a]');
    if(a){
      if(a.dataset.a === 'ocultar'){ salvarAgora(); mostrar(false); }
      else if(a.dataset.a === 'dividir') dividir(!lateral());
      else if(a.dataset.a === 'lado'){ ui.lado = ui.lado === 'esq' ? 'dir' : 'esq'; guardarUi(); limitar(); larguraMudou(); }
      else if(a.dataset.a === 'nova') novaNota();
      else if(a.dataset.a === 'lista'){
        if(vista === 'lista'){ vista = 'editor'; desenhar(); statusSalvo(); }
        else salvarAgora().then(function(){ vista = 'lista'; desenhar(); });
      }
      return;
    }
    if(t.closest('.bl-salvar')){ salvarAgora().then(function(){ if(atual && atual.existe) U.aviso('Nota salva'); }); return; }
    var f = t.closest('[data-f]'); if(f){ filtro = f.dataset.f; marcadas = {}; desenharLista(); return; }
    var ab = t.closest('[data-abrir]');
    if(ab){ var n = notas.find(function(x){ return x.id === ab.dataset.abrir; }); if(n) abrirNota(n); return; }
    var x = t.closest('[data-x]');
    if(x) acao(x.dataset.x);
  });
  icone.addEventListener('click', function(){ mostrar(true); });

  function ids(){ return daVez().filter(function(n){ return marcadas[n.id]; }).map(function(n){ return n.id; }); }
  function acao(qual){
    if(qual === 'nuvem'){ api.abrirNuvem().catch(function(e){ U.aviso(e.message, 4000); }); return; }
    var sel = ids();
    if(qual === 'txt' || qual === 'pdf'){
      api.exportar(sel, qual).then(function(c){ if(c) U.aviso('Salvo em ' + c, 4500); }).catch(function(e){ U.aviso(e.message, 4000); });
    } else if(qual === 'email'){
      api.email(sel).then(function(r){ U.aviso(r.cortado ? 'Texto longo: o e-mail foi aberto com parte das notas. Use “Salvar” e anexe o arquivo.' : 'Abrindo o seu programa de e-mail…', 5000); })
        .catch(function(e){ U.aviso(e.message, 4000); });
    } else if(qual === 'excluir'){
      U.confirmar('Excluir ' + sel.length + ' nota(s)?', 'Elas somem do programa e da pasta do OneDrive.', 'Excluir', true).then(function(ok){
        if(!ok) return;
        api.excluir(sel).then(function(){
          notas = notas.filter(function(n){ return sel.indexOf(n.id) < 0; });
          if(atual && sel.indexOf(atual.id) >= 0) atual = null;
          marcadas = {}; desenharLista(); U.aviso('Nota(s) excluída(s)');
        });
      });
    }
  }

  /* Ctrl+Shift+N abre/oculta de qualquer lugar */
  document.addEventListener('keydown', function(ev){
    if(ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'n'){ ev.preventDefault(); if(!el.hidden) salvarAgora(); mostrar(el.hidden); }
    if(ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'd'){ ev.preventDefault(); dividir(!lateral()); }
  });
  window.addEventListener('beforeunload', function(){ salvarAgora(); });

  /* ── interface pública ───────────────────────────── */
  window.Notas = {
    /* acrescenta um trecho (ex.: selecionado num slide) à nota aberta */
    anexar: function(texto){
      if(el.hidden) mostrar(true);
      if(vista !== 'editor'){ vista = 'editor'; }
      if(!atual) atual = { id:novoId(), materiaId:ctx.id, materiaNome:ctx.nome, titulo:'', texto:'', existe:false };
      if(!atual.titulo && !atual.texto) atual.titulo = 'Trechos dos slides';
      atual.texto = (atual.texto ? atual.texto.replace(/\s+$/, '') + '\n\n' : '') + texto + '\n';
      desenhar(); agendar();
      var ta = corpo.querySelector('.bl-texto');
      if(ta){ ta.scrollTop = ta.scrollHeight; }
    },
    /* abre uma nota pelo id (usado pela busca) */
    abrirNota: function(id){
      var achar = function(){ return notas.find(function(x){ return x.id === id; }); };
      var n = achar();
      (n ? Promise.resolve() : recarregar()).then(function(){
        n = achar(); if(!n) return;
        salvarAgora(); mostrar(true); abrirNota(n);
      });
    },
    /* chamada pela casca ao abrir uma matéria ou voltar à tela inicial */
    definirMateria: function(id, nome){
      if(ctx.id === (id || null)) { desenhar(); limitar(); return; }
      salvarAgora();
      ctx = { id:id || null, nome:nome || 'Geral' };
      marcadas = {};
      var dela = notas.filter(function(n){ return (n.materiaId || null) === ctx.id; });
      if(dela.length) abrirNota(dela[0]); else { atual = null; vista = 'editor'; desenhar(); statusSalvo(); }
      limitar();
    }
  };

  api.status().then(function(s){ temNuvem = !!s.nuvem; }).catch(function(){});
  recarregar().then(function(){ desenhar(); statusSalvo(); mostrar(ui.aberto !== false); });
})();
