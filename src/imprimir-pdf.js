/* Desenha todas as páginas do PDF (?pdf=endereço) em canvas de alta resolução,
   no tamanho real da página, e avisa pelo título: “pronto|largura|altura”
   (em pontos, da 1ª página) ou “erro|mensagem”. */
(function(){
  'use strict';
  var url = new URLSearchParams(location.search).get('pdf');
  var ESCALA = 2.5;   /* 72 pt × 2,5 = 180 pontos por polegada */
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';
  var primeira = null;
  pdfjsLib.getDocument({ url:url, isEvalSupported:false }).promise.then(function(doc){
    var seq = Promise.resolve();
    for(var i = 1; i <= doc.numPages; i++){
      (function(n){
        seq = seq.then(function(){
          return doc.getPage(n).then(function(p){
            var real = p.getViewport({ scale:1 }), vp = p.getViewport({ scale:ESCALA });
            if(!primeira) primeira = real;
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            /* um tiquinho menor que a folha, para não sobrar uma página em branco */
            c.style.width = (real.width - 0.5) + 'pt'; c.style.height = (real.height - 0.8) + 'pt';
            document.body.appendChild(c);
            return p.render({ canvasContext:c.getContext('2d'), viewport:vp }).promise;
          });
        });
      })(i);
    }
    return seq;
  }).then(function(){
    document.title = 'pronto|' + primeira.width + '|' + primeira.height;
  }, function(e){
    document.title = 'erro|' + (e && e.message || e);
  });
})();
