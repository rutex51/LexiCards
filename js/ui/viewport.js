// Klawiatura ekranowa (od 1.63.1): ile pikseli zasłania – różnica między wysokością strony (na iPhonie stała, klawiatura jej
// nie zmienia) a widoczną częścią ekranu (visualViewport). Przy powiększeniu dwoma palcami – 0 (to nie klawiatura).

/** Wysokość klawiatury ekranowej w pikselach CSS albo 0. */
export function keyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale > 1.01) return 0;
  const inset = document.documentElement.clientHeight - viewport.height;
  // Paski przeglądarki zmieniają wysokość o kilkadziesiąt pikseli – klawiatura to co najmniej ok. 120 px.
  return inset > 120 ? inset : 0;
}
