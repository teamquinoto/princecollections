/* v129: el catálogo público se mudó de catalogo.html a catalog.html.
   Los links viejos (ya compartidos con clientes, QR impresos, etc.) caen en
   catalogo.html y este script los manda a la página nueva conservando
   ?lang=... y el #hash. Va en archivo aparte porque la CSP no permite
   scripts inline. Usa replace() para que "atrás" no vuelva a la redirección. */
(function(){
  var destino = "catalog.html" + location.search + location.hash;
  location.replace(destino);
})();
