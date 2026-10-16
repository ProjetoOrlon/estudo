/* A mascote e tutora da plataforma. Personagem original, criada pelo Luiz
   com IA de imagem (Gemini): menina de marias-chiquinhas loiras, óculos,
   casaquinho preto e caderno. A imagem inteira está em
   build/mascote-original.jpg; aqui ficam os recortes:
     mascote/rosto.png   rosto, para o círculo (botões, cabeçalho, mensagens)
     mascote/meio.png    da cintura para cima (boas-vindas, telas vazias)
   Mascote.avatar(px)       rosto num círculo
   Mascote.ilustracao(px)   meia figura
   Mascote.nome             o nome em todos os textos do programa.
   Para trocar a mascote: troque as duas imagens e o nome abaixo. */
(function(){
  'use strict';
  var NOME = 'Poppy';

  function avatar(px){
    px = px || 32;
    return '<img class="mascote-av" src="mascote/rosto.png" width="'+px+'" height="'+px+'" alt="" draggable="false">';
  }
  function ilustracao(px){
    px = px || 150;
    return '<img class="mascote-il" src="mascote/meio.png" width="'+px+'" height="'+Math.round(px * 545 / 480)+'" alt="" draggable="false">';
  }

  window.Mascote = { avatar:avatar, ilustracao:ilustracao, nome:NOME };
})();
