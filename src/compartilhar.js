/* Janelas de “falar com quem fez o programa”: sugestão/erro, pedir uma
   matéria pronta, abrir a matéria recebida (.estudo) e salvar uma para enviar.
   O envio é pelo WhatsApp ou e-mail da própria pessoa: o programa só monta a
   mensagem e os arquivos (lib/compartilhar.js). */
(function(){
  "use strict";
  var esc = U.esc, api = window.api;
  var TIPOS = [['erro','🐞 Algo deu errado'],['sugestao','💡 Tenho uma ideia'],['duvida','❓ Tenho uma dúvida']];
  var botoesEnvio = '<button class="btn" data-canal="whatsapp" type="button">Enviar pelo WhatsApp</button><button class="ghost" data-canal="email" type="button">Enviar por e-mail</button>';

  /* ── sugestão / erro ── */
  function sugestao(tipoInicial){
    /* a foto é tirada antes da janela abrir: mostra a tela como estava */
    api.suporte.preparar().catch(function(){ return { temFoto:false }; }).then(function(st){
      var tipo = tipoInicial || 'erro';
      U.modal('<h2>💬 Fale comigo</h2><p>Achou um erro, teve uma ideia ou ficou com dúvida? Escreva do seu jeito: eu leio tudo.</p>' +
        '<div class="campo"><span>É sobre</span><div class="bv-chips">' + TIPOS.map(function(t){ return '<button type="button" class="chip" data-tipo="'+t[0]+'" aria-pressed="'+(t[0]===tipo)+'">'+t[1]+'</button>'; }).join('') + '</div></div>' +
        '<label class="campo"><span id="s-rot">O que aconteceu?</span><textarea id="s-texto" rows="5" placeholder="Ex.: cliquei em Simulado e a tela ficou em branco."></textarea></label>' +
        (st.temFoto ? '<label class="chk-linha"><input type="checkbox" id="s-foto" checked> Anexar uma foto da tela (como ela estava antes desta janela)</label>' : '') +
        '<label class="chk-linha"><input type="checkbox" id="s-dados" checked> Incluir dados técnicos (versão, Windows, últimos erros — nada pessoal)</label>' +
        '<div class="msg-erro" id="s-erro"></div>' +
        '<div class="modal-acts"><button class="ghost" id="s-cancelar" type="button" style="margin-right:auto">Cancelar</button>' + botoesEnvio + '</div>',
        function(el, fechar){
          var q = function(s){ return el.querySelector(s); };
          var ROT = { erro:['O que aconteceu?','Ex.: cliquei em Simulado e a tela ficou em branco.'], sugestao:['Qual é a ideia?','Ex.: seria bom ter um modo noturno mais escuro.'], duvida:['Qual é a dúvida?','Ex.: como eu faço para revisar só o que errei?'] };
          el.addEventListener('click', function(ev){
            var b = ev.target.closest('[data-tipo]');
            if(b){
              tipo = b.dataset.tipo;
              Array.prototype.forEach.call(el.querySelectorAll('[data-tipo]'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true':'false'); });
              q('#s-rot').textContent = ROT[tipo][0]; q('#s-texto').placeholder = ROT[tipo][1];
              q('#s-dados').checked = tipo === 'erro';
              return;
            }
            var c = ev.target.closest('[data-canal]'); if(!c) return;
            var texto = q('#s-texto').value.trim();
            if(texto.length < 3){ q('#s-erro').textContent = 'Escreva pelo menos uma frase.'; q('#s-texto').focus(); return; }
            var comFoto = !!(q('#s-foto') && q('#s-foto').checked);
            api.suporte.enviar({ tipo:tipo, texto:texto, comFoto:comFoto, comDados:q('#s-dados').checked, canal:c.dataset.canal }).then(function(r){
              fechar();
              U.aviso(r.foto ? 'Abri o ' + (c.dataset.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail') + '. A foto está na pasta que abriu: arraste-a para a mensagem e envie. Obrigado! 💚'
                : 'Abri o ' + (c.dataset.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail') + ' com a mensagem pronta: é só enviar. Obrigado! 💚', 7000);
            }).catch(function(e){ q('#s-erro').textContent = e.message; });
          });
          q('#s-cancelar').onclick = fechar;
        });
    });
  }

  /* ── pedir uma matéria pronta: junta os slides num .zip para mandar ── */
  function pedido(){
    var arquivos = [];
    U.modal('<h2>📦 Pedir uma matéria pronta</h2><p>Seu computador não tem uma IA boa para montar a matéria? Junte os slides aqui. Eu crio um arquivo <b>.zip</b> para você mandar. Quando a matéria ficar pronta, você recebe de volta um arquivo <b>.estudo</b> e abre no botão <b>📥 Abrir matéria recebida</b>.</p>' +
      '<label class="campo"><span>Nome da matéria</span><input type="text" id="p-nome" placeholder="Ex.: Biologia — 2º ano"></label>' +
      '<label class="campo"><span>Professor ou escola <small>(opcional)</small></span><input type="text" id="p-sub" placeholder="Ex.: Escola Estadual X · Prof.ª Ana"></label>' +
      '<div class="campo"><span>Slides, PDFs ou fotos do caderno</span><div><button class="ghost" id="p-escolher" type="button">Escolher arquivos…</button></div><div class="lista-arq" id="p-lista"></div></div>' +
      '<label class="campo"><span>Algum recado? <small>(opcional)</small></span><input type="text" id="p-obs" placeholder="Ex.: a prova é dia 20, foca nas aulas 3 a 5"></label>' +
      '<div class="msg-erro" id="p-erro"></div>' +
      '<div class="modal-acts"><button class="ghost" id="p-cancelar" type="button">Cancelar</button><button class="btn" id="p-criar" type="button">Criar o pedido</button></div>',
      function(el, fechar){
        var q = function(s){ return el.querySelector(s); };
        q('#p-cancelar').onclick = fechar;
        q('#p-escolher').onclick = function(){
          api.escolherArquivos().then(function(c){
            c.forEach(function(x){ if(arquivos.indexOf(x) < 0) arquivos.push(x); });
            q('#p-lista').innerHTML = arquivos.map(function(a){ return '<div title="'+esc(a)+'">'+esc(a.split(/[\\/]/).pop())+'</div>'; }).join('');
          });
        };
        q('#p-criar').onclick = function(){
          var nome = q('#p-nome').value.trim();
          if(!nome){ q('#p-erro').textContent = 'Dê um nome para a matéria.'; q('#p-nome').focus(); return; }
          if(!arquivos.length){ q('#p-erro').textContent = 'Escolha os arquivos da matéria.'; return; }
          var b = this; b.disabled = true; b.textContent = 'Juntando os arquivos…'; q('#p-erro').textContent = '';
          api.pacote.pedido({ nome:nome, subtitulo:q('#p-sub').value, obs:q('#p-obs').value, arquivos:arquivos }).then(function(r){
            fechar();
            pedidoPronto(nome, r);
          }).catch(function(e){ b.disabled = false; b.textContent = 'Criar o pedido'; q('#p-erro').textContent = e.message; });
        };
      });
  }
  function pedidoPronto(nome, r){
    var grande = r.mb > 20;
    U.modal('<h2>✅ Pedido pronto</h2><p>Criei o arquivo <b>' + esc(r.arquivo.split(/[\\/]/).pop()) + '</b> (' + r.mb + ' MB) e abri a pasta onde ele está.</p>' +
      '<p><b>Agora:</b> clique num botão abaixo para abrir a conversa com a mensagem pronta, e <b>arraste o arquivo .zip</b> da pasta para dentro dela.</p>' +
      (grande ? '<p class="msg-erro" style="color:var(--warn)">O arquivo é grande para e-mail (passa de 20 MB). Prefira o WhatsApp, ou mande pelo Google Drive / OneDrive.</p>' : '') +
      '<div class="modal-acts"><button class="ghost" id="pp-fechar" type="button" style="margin-right:auto">Fechar</button>' + botoesEnvio + '</div>',
      function(el, fechar){
        el.querySelector('#pp-fechar').onclick = fechar;
        el.addEventListener('click', function(ev){
          var c = ev.target.closest('[data-canal]'); if(!c) return;
          api.pacote.avisarPedido({ nome:nome, canal:c.dataset.canal }).then(function(){ fechar(); U.aviso('Não esqueça de anexar o arquivo .zip 📎', 6000); }).catch(function(e){ U.aviso(e.message, 5000); });
        });
      });
  }

  /* ── abrir uma matéria recebida (.estudo) ── */
  function importar(aoFim){
    api.pacote.importar().then(function(r){
      if(!r) return;
      U.aviso((r.atualizou ? 'Atualizei "' : 'Pronto! "') + r.nome + (r.atualizou ? '" — seu progresso continua.' : '" está nas suas matérias.'), 5000);
      if(aoFim) aoFim(r.id);
    }).catch(function(e){ U.aviso(e.message, 7000); });
  }

  /* ── salvar uma matéria para mandar a alguém ── */
  function exportar(id){
    U.aviso('Preparando o arquivo…', 2000);
    api.pacote.exportar(id).then(function(r){
      if(!r) return;
      U.aviso('Salvei ' + r.mb + ' MB em "' + r.arquivo.split(/[\\/]/).pop() + '" e abri a pasta. Mande esse arquivo: a pessoa abre em 📥 Abrir matéria recebida. (O seu progresso não vai junto.)', 8000);
    }).catch(function(e){ U.aviso('Não consegui salvar: ' + e.message, 6000); });
  }

  window.Compartilhar = { sugestao:sugestao, pedido:pedido, importar:importar, exportar:exportar };
})();
