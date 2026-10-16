/* Gerador do TABLET: criar matérias e resumos no navegador, com a IA online
   (Gemini…). Os passos da IA, os formatos e a limpeza vêm do MESMO núcleo do
   computador (lib/nucleo-geracao.js); aqui fica só o que é do navegador:
   ler os arquivos (pdf.js, JSZip, câmera), chamar a IA por fetch e guardar
   no IndexedDB (window.WebBase, de web/api-web.js). */
(function(){
  'use strict';
  var N = window.NucleoGeracao, B = window.WebBase;
  if(!N || !B) return;
  /* tamanho de cada parte da apostila (como LIMITE_ONLINE de lib/gerador.js) */
  var LIMITE_ONLINE = { gemini:80000, openai:60000, openrouter:40000, groq:14000, outra:20000 };
  var ativas = {}, resumosAtivos = {}, semFormato = false;

  function dois(n){ return (n < 10 ? '0' : '') + n; }
  function ordemNatural(a, b){ return a.localeCompare(b, 'pt-BR', { numeric:true, sensitivity:'base' }); }
  function nomeSeguro(n){ return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_'); }
  function titulo(n){ return n.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function ext(n){ return (String(n).toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0]; }
  function lerTexto(b){ return b.text ? b.text() : new Response(b).text(); }
  function semPausa(signal){ if(signal && signal.aborted) throw Object.assign(new Error('cancelado'), { name:'AbortError' }); }

  /* ── leitura dos arquivos ── */
  function decodificar(s){ return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function(_, n){ return String.fromCodePoint(+n); }).replace(/&amp;/g, '&'); }
  function paragrafos(xml, tag){ return xml.split(new RegExp('</' + tag + ':p>')).map(function(p){ return (p.match(new RegExp('<' + tag + ':t(?:\\s[^>]*)?>([^<]*)</' + tag + ':t>', 'g')) || []).map(function(x){ return decodificar(x.replace(/<[^>]+>/g, '')); }).join('').trim(); }).filter(Boolean); }
  /* o mesmo formato do computador (lib/importar.js → textoDoPptx) */
  function textoDoPptx(blob){
    return JSZip.loadAsync(blob).then(function(zip){
      var num = function(n){ return +n.match(/(\d+)\.xml$/)[1]; };
      var slides = Object.keys(zip.files).filter(function(n){ return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(function(a, b){ return num(a) - num(b); });
      return Promise.all(slides.map(function(nome){
        var n = num(nome), notas = zip.file('ppt/notesSlides/notesSlide' + n + '.xml');
        return Promise.all([zip.file(nome).async('string'), notas ? notas.async('string') : '']).then(function(x){
          var t = '### Slide ' + n + '\n\n' + paragrafos(x[0], 'a').map(function(l){ return '- ' + l; }).join('\n');
          var ls = x[1] ? paragrafos(x[1], 'a').filter(function(l){ return !/^\d+$/.test(l); }) : [];
          return t + (ls.length ? '\n\nNotas do professor:\n' + ls.map(function(l){ return '> ' + l; }).join('\n') : '');
        });
      })).then(function(p){ return { texto:p.join('\n\n'), slides:slides.length }; });
    });
  }
  function textoDoDocx(blob){
    return JSZip.loadAsync(blob).then(function(zip){ return zip.file('word/document.xml').async('string'); }).then(function(xml){ return paragrafos(xml, 'w').join('\n'); });
  }
  /* PDF: texto página a página (o mesmo de lib/textopdf.js) */
  function abrirPdf(blob){ pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js'; return blob.arrayBuffer().then(function(b){ return pdfjsLib.getDocument({ data:new Uint8Array(b), isEvalSupported:false }).promise; }); }
  function textoDoPdf(blob){
    return abrirPdf(blob).then(function(doc){
      var paginas = [], n = 0;
      function proxima(){
        if(++n > doc.numPages){ doc.destroy(); return { texto:paginas.join('\n\n'), total:doc.numPages }; }
        return doc.getPage(n).then(function(pg){ return pg.getTextContent(); }).then(function(tc){
          var t = ''; tc.items.forEach(function(it){ t += it.str + (it.hasEOL ? '\n' : ' '); });
          t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          if(t) paginas.push('### Página ' + n + '\n' + t);
          return proxima();
        });
      }
      return proxima();
    });
  }
  /* PDF escaneado: cada página vira uma imagem para a IA ler */
  function paginasComoImagens(blob, max){
    return abrirPdf(blob).then(function(doc){
      var out = [], n = 0;
      function proxima(){
        if(++n > Math.min(doc.numPages, max)){ var tot = doc.numPages; doc.destroy(); return { total:tot, paginas:out }; }
        return doc.getPage(n).then(function(pg){
          var v0 = pg.getViewport({ scale:1 }), vp = pg.getViewport({ scale:1400 / v0.width });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          return pg.render({ canvasContext:ctx, viewport:vp }).promise.then(function(){ out.push(c.toDataURL('image/jpeg', 0.82)); return proxima(); });
        });
      }
      return proxima();
    });
  }
  function dataUrl(blob){ return new Promise(function(ok){ var r = new FileReader(); r.onload = function(){ ok(r.result); }; r.readAsDataURL(blob); }); }

  /* ── a IA (formato OpenAI) ── */
  function postar(p, corpo, signal, aoAndar){
    return fetch(p.url + '/chat/completions', { method:'POST', signal:signal, headers:{ 'content-type':'application/json', authorization:'Bearer ' + p.chave }, body:JSON.stringify(Object.assign(corpo, { stream:true })) })
      .then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw Object.assign(new Error('A IA respondeu com erro (' + r.status + '): ' + t.slice(0, 200)), { status:r.status, corpo:t }); });
        var texto = '';
        return B.lerStream(r, function(parte){ texto += parte; if(aoAndar) aoAndar(texto); }).then(function(fim){ return { texto:texto, fim:fim }; });
      });
  }
  /* limite por minuto (429) ou IA ocupada (503): espera e tenta de novo — como comPausas no PC */
  function comPausas(fazer, signal, aoEsperar, tentativa){
    tentativa = tentativa || 1;
    return fazer().catch(function(e){
      if(!(e.status === 429 || e.status === 503) || tentativa >= 5 || (signal && signal.aborted)) throw e;
      var pedido = /retry in ([\d.]+)s/i.exec(e.corpo || '') || /"retryDelay":\s*"(\d+)s"/.exec(e.corpo || '');
      var seg = Math.min(90, Math.ceil(pedido ? +pedido[1] + 2 : 15 * tentativa));
      if(aoEsperar) aoEsperar(seg);
      return new Promise(function(ok){ setTimeout(ok, seg * 1000); }).then(function(){ semPausa(signal); return comPausas(fazer, signal, aoEsperar, tentativa + 1); });
    });
  }
  /* o “chamarCompat” do tablet (mesma assinatura que o núcleo espera) */
  function chamar(p, o){
    var corpo = function(comFormato){ return {
      model:p.modelo, temperature:0.3, max_tokens:Math.max(o.maxTokens * 4, 8000),
      messages:[{ role:'system', content:p.sistema || N.SISTEMA_LOCAL }, { role:'user', content:o.material + '\n\n=== TAREFA ===\n' + o.tarefa + (comFormato ? '' : '\n\nResponda só com um JSON que siga este JSON Schema:\n' + JSON.stringify(o.esquema)) }],
      response_format: comFormato ? { type:'json_schema', json_schema:{ name:o.nome, strict:true, schema:o.esquema } } : undefined
    }; };
    var enviar = function(comFormato){ return comPausas(function(){ return postar(p, corpo(comFormato), o.signal, o.aoAndar); }, o.signal, o.aoEsperar); };
    return enviar(!semFormato).catch(function(e){
      if(!semFormato && e.status === 400 && /response_format|json_schema|schema/i.test(e.corpo || '')){ semFormato = true; return enviar(false); }
      throw e;
    }).then(function(r){ if(r.fim === 'length') throw new Error('A resposta da IA foi cortada (ficou longa demais).'); return N.lerJson(r.texto); });
  }
  /* páginas como imagens → texto “### Página N” (3 por pedido) */
  function lerImagens(p, imagens, aviso, signal){
    var partes = [], i = 0;
    function proximo(){
      if(i >= imagens.length) return partes.join('\n\n');
      var lote = imagens.slice(i, i + 3);
      if(aviso) aviso('lendo as imagens das páginas ' + (i + 1) + '–' + (i + lote.length) + ' de ' + imagens.length + '…');
      var conteudo = [{ type:'text', text:N.LER_IMAGENS + ' As imagens a seguir são as páginas ' + (i + 1) + ' a ' + (i + lote.length) + '.' }].concat(lote.map(function(u){ return { type:'image_url', image_url:{ url:u } }; }));
      return comPausas(function(){ return postar(p, { model:p.modelo, temperature:0.1, max_tokens:16000, messages:[{ role:'user', content:conteudo }] }, signal); }, signal, function(s){ if(aviso) aviso('a IA grátis pediu uma pausa; continuo em ' + s + ' s…'); })
        .then(function(r){ partes.push(String(r.texto || '').trim()); i += 3; return proximo(); });
    }
    return Promise.resolve().then(proximo);
  }

  /* qual IA e com que instruções (o mesmo de provedorGeracao + sistemaLocal do PC) */
  function prepararIA(m){
    return B.lerConfig().then(function(cfg){
      var ia = B.iaOnline(cfg);
      if(!ia) throw new Error('Ative a IA com o código de ativação (⚙ Configurações).');
      var pub = B.publico(cfg, m);
      var abertura = 'Você prepara material de estudo para ' + pub.prova + ', em português do Brasil, para ' + pub.quem + (pub.foco ? ', que aprende melhor com texto curto, uma coisa de cada vez, e tem dificuldade de memorização' : '') + '. ' + (pub.linguagem || '');
      var sv = B.servicoDaUrl(ia.url);
      return { p:Object.assign({}, ia, { sistema:N.SISTEMA_LOCAL.replace(/^Você prepara[^.]*\./, abertura) }), cfg:cfg, limite:LIMITE_ONLINE[sv] || LIMITE_ONLINE.outra,
        io:{ chamar:chamar, publico:function(mat){ return B.publico(cfg, mat); }, questoesPorAula:function(){ return cfg.questoesPorAula || 6; } } };
    });
  }

  /* ── adicionar arquivos (o mesmo de lib/importar.js) ── */
  function adicionarArquivos(id, files){
    files = files.filter(Boolean);
    return B.lerMateria(id).then(function(m){
      var aulas = files.filter(function(f){ return ext(f.name) === '.pdf' || ext(f.name) === '.pptx'; }).sort(function(a, b){ return ordemNatural(a.name, b.name); });
      var imagens = files.filter(function(f){ return /^\.(png|jpe?g|webp|gif|heic)$/.test(ext(f.name)) || /^image\//.test(f.type); }).filter(function(f){ return aulas.indexOf(f) < 0; });
      var usados = {}; m.aulas.forEach(function(a){ usados[a.n] = 1; }); m.fontes.forEach(function(f){ usados[f.aula] = 1; });
      var maior = function(){ return Math.max.apply(null, [0].concat(Object.keys(usados).map(Number))); };
      var rel = { aulas:0, anexos:0, semPdf:[], ignorados:files.filter(function(f){ return aulas.indexOf(f) < 0 && imagens.indexOf(f) < 0; }).map(function(f){ return f.name; }) };
      var cadeia = Promise.resolve();
      aulas.forEach(function(f){
        cadeia = cadeia.then(function(){
          var doNome = (f.name.match(/aula[\s_-]*0*(\d{1,3})/i) || [])[1];
          var n = doNome && !usados[+doNome] ? +doNome : maior() + 1; usados[n] = 1;
          var fid = 'aula-' + dois(n) + '-' + Date.now().toString(36).slice(-4);
          var nome = nomeSeguro(f.name), caminho = 'arquivos/' + nome;
          var fonte = { id:fid, aula:n, nome:f.name, arquivo:caminho, texto:null, status:'pendente' };
          var arq = { id:fid, grupo:'aulas', aula:n, nome:'Aula ' + dois(n) + ' — ' + titulo(f.name), caminho:caminho, tipo:'pdf', nota:'PDF enviado' };
          return B.gravar('arquivos', id + '/' + caminho, new Blob([f], { type:B.mimeDe(nome) })).then(function(){
            if(ext(f.name) !== '.pptx') return;
            return textoDoPptx(f).then(function(t){
              fonte.texto = 'fontes/' + fid + '.md';
              arq.tipo = 'pptx'; arq.nota = t.slides + ' slides · para ver os slides aqui, envie também a versão em PDF deles';
              rel.semPdf.push(f.name);
              return B.gravar('arquivos', id + '/' + fonte.texto, new Blob([t.texto], { type:'text/markdown' }));
            });
          }).then(function(){ m.fontes.push(fonte); m.arquivos.push(arq); rel.aulas++; });
        });
      });
      return cadeia.then(function(){
        if(!imagens.length) return;
        var soFotos = !aulas.length, n = soFotos ? maior() + 1 : 0, fid = 'aula-' + dois(n) + '-' + Date.now().toString(36).slice(-4), rels = [];
        return Promise.all(imagens.map(function(f, i){
          var nome = nomeSeguro(f.name || ('foto-' + (i + 1) + '.jpg')), caminho = 'arquivos/' + Date.now().toString(36) + '-' + i + '-' + nome;
          rels.push(caminho);
          if(soFotos) m.arquivos.push({ id:fid + '-f' + (i + 1), grupo:'aulas', aula:n, tipo:'img', nome:'Aula ' + dois(n) + ' — foto ' + (i + 1), caminho:caminho, nota:'Foto enviada' });
          else { m.arquivos.push({ id:'extra-' + Date.now().toString(36) + i, grupo:'extras', tipo:'img', nome:titulo(nome), caminho:caminho, nota:'Imagem enviada' }); rel.anexos++; }
          return B.gravar('arquivos', id + '/' + caminho, new Blob([f], { type:f.type || B.mimeDe(nome) }));
        })).then(function(){
          if(soFotos){ m.fontes.push({ id:fid, aula:n, nome:imagens.length + ' foto(s)', arquivo:rels[0], imagens:rels, texto:null, status:'pendente' }); rel.aulas++; }
        });
      }).then(function(){ return B.gravarMateria(m); }).then(function(){ return rel; });
    });
  }

  /* ── texto de uma aula (o mesmo de textoDaAula do PC) ── */
  function blobDe(id, rel){ return B.ler('arquivos', id + '/' + rel); }
  function textoDaAula(m, fonte, p, aviso, signal){
    var guardar = function(t){ fonte.texto = 'fontes/' + fonte.id + '.md'; return B.gravar('arquivos', m.id + '/' + fonte.texto, new Blob([t], { type:'text/markdown' })).then(function(){ return t; }); };
    return (fonte.texto ? blobDe(m.id, fonte.texto) : Promise.resolve(null)).then(function(b){
      if(b) return lerTexto(b);
      if(fonte.imagens && fonte.imagens.length) return Promise.all(fonte.imagens.map(function(r){ return blobDe(m.id, r).then(dataUrl); })).then(function(us){ return lerImagens(p, us, aviso, signal); }).then(guardar);
      return blobDe(m.id, fonte.arquivo).then(function(pdf){
        if(!pdf) throw new Error('Não achei o arquivo desta aula neste aparelho.');
        return textoDoPdf(pdf).then(function(r){
          if(r.texto.replace(/### Página \d+/g, '').replace(/\s+/g, '').length >= r.total * 40) return r.texto;
          if(aviso) aviso('o PDF é escaneado (imagem): preparando as páginas…');
          return paginasComoImagens(pdf, 150).then(function(x){ return lerImagens(p, x.paginas, aviso, signal); });
        }).then(guardar);
      });
    }).then(function(t){ if(!String(t).trim()) throw new Error('Não consegui ler texto deste arquivo.'); return t; });
  }

  /* apostila grande: vira partes (o mesmo de dividirGrandes do PC, sem capítulos) */
  function dividirGrandes(m, limite, p, aviso, signal){
    var pend = m.fontes.filter(function(f){ return f.status !== 'gerada' && !f.parte && !f.imagens; }), novas = 0, cadeia = Promise.resolve();
    pend.forEach(function(f){
      cadeia = cadeia.then(function(){ return textoDaAula(m, f, p, aviso, signal); }).then(function(texto){
        if(texto.length <= limite * 1.15) return;
        var fin = N.cortarEmPartes(texto, limite); if(fin.length < 2) return;
        var maior = Math.max.apply(null, m.fontes.map(function(x){ return x.aula; })), base = f.nome, pags = N.paginasDoTrecho(fin[0], null);
        var gravacoes = [B.gravar('arquivos', m.id + '/fontes/' + f.id + '.md', new Blob([fin[0]]))];
        Object.assign(f, { texto:'fontes/' + f.id + '.md', parte:'1/' + fin.length, nome:base + ' (parte 1 de ' + fin.length + ')', paginas:pags, limite:limite });
        for(var i = 1; i < fin.length; i++){
          var fid = f.id + '-p' + (i + 1); pags = N.paginasDoTrecho(fin[i], pags);
          gravacoes.push(B.gravar('arquivos', m.id + '/fontes/' + fid + '.md', new Blob([fin[i]])));
          m.fontes.push({ id:fid, aula:++maior, nome:base + ' (parte ' + (i + 1) + ' de ' + fin.length + ')', arquivo:f.arquivo, texto:'fontes/' + fid + '.md', status:'pendente', parte:(i + 1) + '/' + fin.length, paginas:pags, limite:limite });
          novas++;
        }
        return Promise.all(gravacoes);
      }).catch(function(e){ if(signal.aborted) throw e; });
    });
    return cadeia.then(function(){ return B.gravarMateria(m); }).then(function(){ return novas; });
  }

  /* ── gerar a matéria (o mesmo fluxo de gerarCompat do PC) ── */
  function gerar(id, opcoes){
    if(ativas[id]) return Promise.reject(new Error('Esta matéria já está gerando.'));
    var controle = new AbortController(), signal = controle.signal;
    ativas[id] = controle;
    var estado = { fase:'aulas', feitas:0, total:0, msg:'Preparando…', erros:[] }, t0 = Date.now(), passos = 0, totalPassos = 1;
    var avisa = function(extra){
      Object.assign(estado, extra);
      var ativo = estado.fase === 'aulas' || estado.fase === 'geral', dec = (Date.now() - t0) / 1000;
      estado.relogio = ativo ? { feitos:passos, total:totalPassos, restante:Math.round(passos ? dec / passos * (totalPassos - passos) : totalPassos * 8), decorrido:Math.round(dec) } : null;
      B.emitirGeracao(id, Object.assign({}, estado));
    };
    var ctx, m;
    /* roda em segundo plano: a tela acompanha pelos avisos (como no PC) */
    (function(){
      return B.lerMateria(id).then(function(mm){ m = mm; return prepararIA(m); }).then(function(c){
        ctx = c;
        avisa({ msg:'Preparando a IA (' + ctx.p.nome + ' · ' + ctx.p.modelo + ')…' });
        return dividirGrandes(m, ctx.limite, ctx.p, function(msg){ avisa({ msg:'Preparando o material — ' + msg }); }, signal);
      }).then(function(partes){
        if(partes) avisa({ msg:'A apostila é grande: dividi em ' + (partes + 1) + ' partes, cada uma vira uma aula.' });
        return B.lerMateria(id);
      }).then(function(mm){
        m = mm;
        var pend = m.fontes.filter(function(f){ return f.status !== 'gerada'; }), novas = pend.map(function(f){ return f.aula; });
        var T = N.etapasDaAula(ctx.io.publico(m), true);
        totalPassos = pend.length * T + 3;
        avisa({ total:pend.length });
        var cadeia = Promise.resolve();
        pend.forEach(function(fonte){
          cadeia = cadeia.then(function(){
            semPausa(signal);
            var etapa = '';
            return textoDaAula(m, fonte, ctx.p, function(msg){ avisa({ msg:'Aula ' + fonte.aula + ' — ' + msg }); }, signal).then(function(texto){
              return N.gerarAula(ctx.io, ctx.p, m, fonte, texto, function(passo, total, rot, extra){
                if(fonte.id + ':' + passo !== etapa){ etapa = fonte.id + ':' + passo; passos++; }
                avisa({ msg:'Aula ' + fonte.aula + (fonte.parte ? ' (parte ' + fonte.parte + ')' : '') + ' — ' + rot + ' (' + passo + '/' + total + ')' + (extra || '') + ' · ' + ctx.p.nome });
              }, signal);
            }).then(function(r){
              return B.gravar('arquivos', id + '/gerado/' + fonte.id + '.json', new Blob([JSON.stringify(r)], { type:'application/json' })).then(function(){ return B.lerMateria(id); }).then(function(mm){
                m = mm;
                var f = m.fontes.filter(function(x){ return x.id === fonte.id; })[0]; if(!f) return;
                if(fonte.texto) f.texto = fonte.texto;
                N.integrarAula(m, f, r);
                estado.feitas++;
                return B.gravarMateria(m).then(function(){ avisa({ msg:'Aula ' + fonte.aula + ' pronta: ' + r.titulo + (r.descartadas ? ' (a conferência descartou ' + r.descartadas + ' questão(ões) duvidosa(s))' : ''), atualizou:true }); });
              });
            }).catch(function(e){
              if(signal.aborted) throw e;
              estado.erros.push('Aula ' + fonte.aula + ': ' + e.message);
              return B.lerMateria(id).then(function(mm){ m = mm; var f = m.fontes.filter(function(x){ return x.id === fonte.id; })[0]; if(f){ f.status = 'erro'; f.erro = e.message; if(fonte.texto) f.texto = fonte.texto; } return B.gravarMateria(m); })
                .then(function(){ avisa({ msg:'Falhou a Aula ' + fonte.aula + ': ' + mensagem(e) }); });
            });
          });
        });
        return cadeia.then(function(){ return B.lerMateria(id); }).then(function(mm){
          m = mm;
          if(!m.aulas.length || !(estado.feitas > 0 || !m.blocos.length || opcoes.refazerGeral)) return;
          /* fórmulas das aulas: a resposta bruta de cada uma, guardada em gerado/ */
          return Promise.all(m.aulas.map(function(a){ return blobDe(id, 'gerado/' + a.fonte + '.json').then(function(b){ return b ? lerTexto(b).then(function(t){ var j = JSON.parse(t); return j.formulas && j.formulas.length ? { g:'Aula ' + a.n + ' — ' + a.titulo, its:j.formulas } : null; }) : null; }).catch(function(){ return null; }); }))
            .then(function(fs){
              var formulas = fs.filter(Boolean);
              var io = Object.assign({}, ctx.io, { formulasDasAulas:function(){ return formulas; } });
              return N.gerarGeral(io, ctx.p, m, novas.filter(function(n){ return m.aulas.some(function(a){ return a.n === n; }); }), signal, function(rot){ passos++; avisa({ fase:'geral', msg:'Visão geral da matéria — ' + rot + ' · ' + ctx.p.nome }); });
            }).then(function(x){ return B.lerMateria(id).then(function(mm){ m = mm; N.integrarGeral(m, x.r, x.incremental && !opcoes.refazerGeral); return B.gravarMateria(m); }); });
        });
      }).then(function(){
        avisa({ fase:'fim', relogio:null, msg: estado.erros.length ? 'Terminou com ' + estado.erros.length + ' aula(s) com erro. Você pode tentar de novo.' : 'Pronto! Matéria gerada com ' + ctx.p.nome + ' em ' + Math.max(1, Math.round((Date.now() - t0) / 60000)) + ' min e salva neste aparelho.', atualizou:true });
      }).catch(function(e){
        avisa(signal.aborted ? { fase:'cancelada', relogio:null, msg:'Geração cancelada. O que já ficou pronto foi salvo.' } : { fase:'erro', relogio:null, msg:mensagem(e) });
      }).then(function(){ delete ativas[id]; });
    })();
    return B.lerConfig().then(function(cfg){ var ia = B.iaOnline(cfg); return { disponivel:!!ia, tipo:'online', nome:ia ? ia.nome : '', modelo:ia ? ia.modelo : '' }; });
  }
  function mensagem(e){
    if(e && e.status === 429) return 'A IA grátis chegou no limite de uso por agora. O que já ficou pronto foi salvo: tente de novo daqui a pouco (ou amanhã).';
    if(e && (e.status === 401 || e.status === 403 || (e.status === 400 && /api[_ ]?key/i.test(e.corpo || '')))) return 'A chave da IA não foi aceita. Peça um código de ativação novo.';
    if(e && /Failed to fetch|NetworkError/i.test(e.message || '')) return 'Sem conexão com a internet. Conecte e tente de novo.';
    if(e instanceof SyntaxError) return 'A resposta da IA veio incompleta. Tente de novo.';
    return e && e.message ? e.message : String(e);
  }

  /* ── resumo (o mesmo de resumir do PC) ── */
  function resumir(id, d){
    if(resumosAtivos[id]) return Promise.reject(new Error('Já estou fazendo um resumo desta matéria.'));
    var controle = new AbortController(), signal = controle.signal;
    resumosAtivos[id] = controle;
    var aviso = function(msg){ window.dispatchEvent(new CustomEvent('web-resumo', { detail:{ id:id, msg:msg } })); };
    var m, ctx, nomes = [];
    return B.lerMateria(id).then(function(mm){ m = mm; return prepararIA(m); }).then(function(c){
      ctx = c;
      /* arquivos de fora entram na matéria (ficam em “Outros arquivos”) */
      var rels = (d.arquivos || []).filter(function(r){ return m.arquivos.some(function(a){ return a.caminho === r; }); });
      return Promise.all((d.externos || []).map(function(f, i){
        var nome = nomeSeguro(f.name), caminho = 'arquivos/' + Date.now().toString(36) + i + '-' + nome, e = ext(nome);
        m.arquivos.push({ id:'extra-' + Date.now().toString(36) + i, grupo:'extras', tipo: e === '.pdf' ? 'pdf' : /\.(png|jpe?g|webp|gif)$/.test(e) || /^image\//.test(f.type) ? 'img' : e === '.pptx' ? 'pptx' : 'outro', nome:titulo(nome), caminho:caminho, nota:'enviado para resumo' });
        rels.push(caminho);
        return B.gravar('arquivos', id + '/' + caminho, new Blob([f], { type:f.type || B.mimeDe(nome) }));
      })).then(function(){ if((d.externos || []).length) return B.gravarMateria(m); }).then(function(){
        if(!rels.length) throw new Error('Escolha pelo menos um arquivo para resumir.');
        var textos = [], cadeia = Promise.resolve();
        rels.forEach(function(rel){
          cadeia = cadeia.then(function(){
            semPausa(signal);
            var arq = m.arquivos.filter(function(a){ return a.caminho === rel; })[0] || { nome:rel.split('/').pop() };
            nomes.push(arq.nome); aviso('lendo ' + arq.nome + '…');
            var fonte = m.fontes.filter(function(f){ return f.id === arq.id && f.texto; })[0];
            return (fonte ? blobDe(id, fonte.texto).then(function(b){ return b ? lerTexto(b) : null; }) : Promise.resolve(null)).then(function(t){
              if(t) return t;
              return blobDe(id, rel).then(function(b){
                var e = ext(rel), a2 = function(msg){ aviso(arq.nome + ': ' + msg); };
                if(e === '.txt' || e === '.md') return lerTexto(b);
                if(e === '.pptx') return textoDoPptx(b).then(function(x){ return x.texto; });
                if(e === '.docx') return textoDoDocx(b);
                if(e === '.pdf') return textoDoPdf(b).then(function(r){ return r.texto.replace(/### Página \d+/g, '').replace(/\s+/g, '').length >= r.total * 40 ? r.texto : paginasComoImagens(b, 150).then(function(x){ return lerImagens(ctx.p, x.paginas, a2, signal); }); });
                return dataUrl(b).then(function(u){ return lerImagens(ctx.p, [u], a2, signal); });
              });
            }).then(function(t){ textos.push('=== ' + arq.nome + ' ===\n' + t); });
          });
        });
        return cadeia.then(function(){ return textos.join('\n\n'); });
      });
    }).then(function(textoTodo){
      if(!textoTodo.replace(/\s+/g, '').length) throw new Error('Não encontrei texto nesses arquivos.');
      var pedir = function(material, tarefa, esquema, maxTokens){ return chamar(ctx.p, { material:material, tarefa:tarefa, esquema:esquema, nome:'resumo', maxTokens:maxTokens, signal:signal, aoEsperar:function(s){ aviso('a IA grátis pediu uma pausa; continuo em ' + s + ' s…'); } }); };
      return N.resumirTexto(pedir, m, textoTodo, ctx.limite, aviso);
    }).then(function(r){
      return B.lerMateria(id).then(function(mm){
        var resumo = { id:'resumo-' + Date.now().toString(36), titulo:String(d.titulo || '').trim() || r.titulo, criadoEm:new Date().toISOString(), fontes:nomes, ia:ctx.p.nome + ' · ' + ctx.p.modelo, conteudo:r };
        mm.resumos = (mm.resumos || []).concat([resumo]);
        return B.gravarMateria(mm).then(function(){ return resumo; });
      });
    }).catch(function(e){ throw new Error(signal.aborted ? 'Resumo cancelado.' : mensagem(e)); })
      .finally(function(){ delete resumosAtivos[id]; });
  }

  window.WebGerador = {
    adicionarArquivos:adicionarArquivos, gerar:gerar, resumir:resumir,
    cancelar:function(id){ if(ativas[id]) ativas[id].abort(); },
    cancelarResumo:function(id){ if(resumosAtivos[id]) resumosAtivos[id].abort(); }
  };
})();
