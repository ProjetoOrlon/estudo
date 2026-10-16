/* Resumo de estudo (lib/gerador.js → resumir): a pessoa escolhe o material
   (arquivos da matéria e/ou outros: PDF, slides, Word, texto, fotos) e a IA
   devolve os pontos principais. Fica na aba Conteúdos, com impressão.
   Resumo.criar(M, aoFim)   escolher arquivos e gerar
   Resumo.ver(M, r, aoExcluir)   ler, imprimir, salvar em PDF, excluir */
(function(){
  'use strict';
  var esc = U.esc, api = window.api;

  function corpo(r){
    var c = r.conteudo || {};
    return '<div class="rs">' +
      (c.introducao ? '<p class="rs-intro">' + esc(c.introducao) + '</p>' : '') +
      (c.lembrar && c.lembrar.length ? '<div class="rs-lembrar"><b>⭐ Para lembrar na prova</b><ul>' + c.lembrar.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      (c.secoes || []).map(function(s, i){
        return '<section class="rs-sec"><h3><span>' + (i + 1) + '</span>' + esc(s.titulo) + '</h3><ul>' + (s.pontos || []).map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
          (s.destaque ? '<p class="rs-dest">💡 ' + esc(s.destaque) + '</p>' : '') + '</section>';
      }).join('') +
      (c.conceitos && c.conceitos.length ? '<div class="rs-conc"><h3>📖 Conceitos-chave</h3><dl>' + c.conceitos.map(function(k){ return '<dt>' + esc(k.termo) + '</dt><dd>' + esc(k.definicao) + '</dd>'; }).join('') + '</dl></div>' : '') +
      '</div>';
  }

  /* folha A4 para imprimir ou salvar em PDF (lib/impressao.js) */
  function documento(M, r){
    var css = '@page{size:A4;margin:16mm 15mm 18mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1b2430;font-size:11.5pt;line-height:1.45;margin:0}' +
      'header{border-bottom:2.5pt solid #0E6B60;padding-bottom:6pt;margin-bottom:10pt}header small{color:#55606b;font-size:9pt}h1{font-size:18pt;margin:2pt 0}' +
      '.rs-intro{font-style:italic;color:#333}.rs-lembrar{border:1.5pt solid #E0A100;background:#FFF7DD;border-radius:6pt;padding:6pt 10pt;margin:8pt 0 12pt;page-break-inside:avoid}' +
      '.rs-lembrar b{font-size:11pt}.rs-sec{page-break-inside:avoid;margin:0 0 9pt}.rs-sec h3{font-size:12.5pt;margin:0 0 3pt;color:#0E6B60}.rs-sec h3 span{display:inline-block;min-width:16pt;margin-right:5pt;text-align:center;background:#0E6B60;color:#fff;border-radius:3pt;font-size:10pt}' +
      'ul{margin:2pt 0 2pt 16pt;padding:0}li{margin:1.5pt 0}.rs-dest{margin:3pt 0 0;padding:3pt 8pt;border-left:3pt solid #0E6B60;background:#EEF6F4}' +
      '.rs-conc{page-break-inside:avoid;margin-top:10pt}.rs-conc h3{font-size:12.5pt;color:#0E6B60;margin:0 0 4pt}dl{margin:0;display:grid;grid-template-columns:30% 70%;gap:3pt 8pt}dt{font-weight:bold}dd{margin:0}';
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(r.titulo) + '</title><style>' + css + '</style></head><body>' +
      '<header><small>Resumo · ' + esc(M.nome) + (M.subtitulo ? ' · ' + esc(M.subtitulo) : '') + '</small><h1>' + esc(r.titulo) + '</h1>' +
      '<small>Feito a partir de: ' + esc((r.fontes || []).join(', ')) + '</small></header>' + corpo(r) + '</body></html>';
  }

  function ver(M, r, aoExcluir){
    U.modal('<div class="rs-topo"><div><p class="eyebrow">Resumo</p><h2>' + esc(r.titulo) + '</h2><small>Feito a partir de: ' + esc((r.fontes || []).join(', ')) + ' · ' + new Date(r.criadoEm).toLocaleDateString('pt-BR') + '</small></div></div>' +
      corpo(r) +
      '<div class="modal-acts"><button class="ghost" id="rs-excluir" type="button" style="margin-right:auto;color:var(--bad)">🗑 Excluir</button>' +
        '<button class="ghost" id="rs-fechar" type="button">Fechar</button><button class="ghost" id="rs-pdf" type="button">💾 Salvar em PDF</button><button class="btn" id="rs-imprimir" type="button">🖨 Imprimir</button></div>',
      function(el, fechar){
        el.classList.add('modal-largo');
        var nome = 'Resumo - ' + r.titulo;
        el.querySelector('#rs-fechar').onclick = fechar;
        el.querySelector('#rs-imprimir').onclick = function(){ api.imprimir(documento(M, r), 'imprimir', nome).catch(function(e){ U.aviso(e.message, 5000); }); };
        el.querySelector('#rs-pdf').onclick = function(){ api.imprimir(documento(M, r), 'pdf', nome).then(function(c){ if(c) U.aviso('PDF salvo', 3000); }).catch(function(e){ U.aviso(e.message, 5000); }); };
        el.querySelector('#rs-excluir').onclick = function(){
          U.confirmar('Excluir este resumo?', 'Os arquivos da matéria continuam; só o resumo é apagado.', 'Excluir', true).then(function(ok){
            if(ok) api.resumo.excluir(M.id, r.id).then(function(){ fechar(); if(aoExcluir) aoExcluir(); });
          });
        };
      });
  }

  function criar(M, aoFim){
    var externos = [];
    var doMat = M.arquivos.filter(function(a){ return a.caminho; });
    var item = function(a){ return '<label class="rs-arq"><input type="checkbox" data-rel="' + esc(a.caminho) + '"><span>' + (a.tipo === 'img' ? '🖼' : a.tipo === 'pptx' ? '📊' : '📄') + ' ' + esc(a.nome) + '</span></label>'; };
    U.modal('<h2>📝 Criar resumo</h2><p>Escolha o material e a IA faz um resumo com os <b>pontos principais</b>, os conceitos-chave e o que mais cai na prova. Vale PDF, slides, Word, texto, PDF escaneado e fotos do caderno.</p>' +
      (doMat.length ? '<div class="campo"><span>Arquivos desta matéria</span><div class="rs-arqs">' + doMat.map(item).join('') + '</div></div>' : '') +
      '<div class="campo"><span>' + (doMat.length ? 'Ou outros arquivos' : 'Arquivos') + '</span><div><button class="ghost" id="rs-escolher" type="button">Escolher arquivos…</button></div><div class="lista-arq" id="rs-ext"></div></div>' +
      '<label class="campo"><span>Título <small>(opcional: a IA sugere um)</small></span><input type="text" id="rs-titulo" maxlength="80" placeholder="Ex.: Resumo para a prova de sexta"></label>' +
      '<div class="rs-andamento" id="rs-and" hidden><span class="rs-gira"></span><span id="rs-msg">Começando…</span></div>' +
      '<div class="msg-erro" id="rs-erro"></div>' +
      '<div class="modal-acts"><button class="ghost" id="rs-cancelar" type="button">Cancelar</button><button class="btn" id="rs-criar" type="button">📝 Criar resumo</button></div>',
      function(el, fechar){
        var q = function(s){ return el.querySelector(s); }, rodando = false, solta = null;
        q('#rs-escolher').onclick = function(){
          api.escolherArquivos('resumo').then(function(c){
            c.forEach(function(x){ if(externos.indexOf(x) < 0) externos.push(x); });
            q('#rs-ext').innerHTML = externos.map(function(x){ return '<div title="' + esc(x) + '">' + esc(x.split(/[\\/]/).pop()) + '</div>'; }).join('');
          });
        };
        q('#rs-cancelar').onclick = function(){ if(rodando) api.resumo.cancelar(M.id); else fechar(); };
        q('#rs-criar').onclick = function(){
          var rels = Array.prototype.filter.call(el.querySelectorAll('[data-rel]'), function(c){ return c.checked; }).map(function(c){ return c.dataset.rel; });
          if(!rels.length && !externos.length){ q('#rs-erro').textContent = 'Marque ou escolha pelo menos um arquivo.'; return; }
          rodando = true; q('#rs-erro').textContent = ''; q('#rs-criar').disabled = true; q('#rs-cancelar').textContent = 'Parar';
          q('#rs-and').hidden = false;
          solta = api.resumo.aoAndar(function(d){ if(d.id === M.id) q('#rs-msg').textContent = d.msg; });
          api.resumo.criar(M.id, { arquivos:rels, externos:externos, titulo:q('#rs-titulo').value }).then(function(r){
            solta(); fechar(); U.aviso('Resumo pronto! Ele fica na aba Conteúdos.', 4000); if(aoFim) aoFim(r);
          }).catch(function(e){
            solta(); rodando = false; q('#rs-and').hidden = true; q('#rs-criar').disabled = false; q('#rs-cancelar').textContent = 'Cancelar';
            q('#rs-erro').textContent = e.message;
          });
        };
      });
  }

  window.Resumo = { criar:criar, ver:ver, documento:documento };
})();
