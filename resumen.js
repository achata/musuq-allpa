/*
  RESUMEN · convierte datos del clima en frases para el agricultor.
  Sin siglas ni unidades técnicas en la pantalla principal.
*/
const Resumen = (() => {

  function tierra(suelo){
    if (suelo == null) return { ico:'🌱', titulo:'Tu tierra', frase:'Sin datos de hoy', color:'neutro' };
    if (suelo < 15)  return { ico:'🏜️', titulo:'Tu tierra', frase:'Está muy seca. Riega hoy.', color:'rojo' };
    if (suelo < 25)  return { ico:'🌱', titulo:'Tu tierra', frase:'Está algo seca. Revisa el riego.', color:'naranja' };
    if (suelo > 60)  return { ico:'💧', titulo:'Tu tierra', frase:'Está muy mojada. No riegues hoy.', color:'naranja' };
    return { ico:'🌱', titulo:'Tu tierra', frase:'Tiene agua suficiente.', color:'verde' };
  }

  function lluvia(mm){
    if (mm == null) return { ico:'🌧️', titulo:'Lluvia', frase:'Sin datos de hoy', color:'neutro' };
    if (mm >= 10)   return { ico:'🌧️', titulo:'Lluvia', frase:'Llovió mucho. Revisa que no se junte agua.', color:'naranja' };
    if (mm > 0.5)   return { ico:'🌦️', titulo:'Lluvia', frase:'Llovió un poco. No necesitas regar.', color:'verde' };
    return { ico:'☀️', titulo:'Lluvia', frase:'No llovió. Si dependes de la lluvia, toca regar.', color:'naranja' };
  }

  function viento(kmh){
    if (kmh == null) return { ico:'🍃', titulo:'Viento', frase:'Sin datos de hoy', color:'neutro' };
    if (kmh >= 20)   return { ico:'💨', titulo:'Viento', frase:'Hay mucho viento. No fumigues hoy.', color:'rojo' };
    if (kmh >= 10)   return { ico:'🍃', titulo:'Viento', frase:'Hay viento moderado. Fumiga con cuidado.', color:'naranja' };
    return { ico:'🍃', titulo:'Viento', frase:'Viento suave. Buen día para trabajar.', color:'verde' };
  }

  function frasePrincipal(t, l, v){
    if (t.color === 'rojo' || v.color === 'rojo') return 'Hoy conviene tener cuidado en el campo';
    if (t.color === 'naranja' && t.frase.includes('seca')) return 'Hoy conviene regar';
    if (t.color === 'verde' && l.color !== 'naranja') return 'Hoy es buen día para trabajar tu campo';
    return 'Revisa tu campo hoy';
  }

  // Recibe el resumen de clima y devuelve todo lo que la pantalla necesita
  function armar(clima){
    const t = tierra(clima.suelo);
    const l = lluvia(clima.lluviaHoy ?? clima.lluviaMax);
    const v = viento(clima.viento);
    return {
      principal: frasePrincipal(t, l, v),
      tarjetas: [t, l, v],
      texto: `${frasePrincipal(t, l, v)}. ${t.frase} ${l.frase} ${v.frase}`
    };
  }

  return { armar };
})();
