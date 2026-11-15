/*
  CICLO · calcula la línea de tiempo de un cultivo.
  - Anuales: cosecha = mes de siembra + duración del ciclo (promedio del rango).
  - Perennes: cosecha anual en los meses indicados; no hay ciclo que calcular.
  Los meses van de 1 (enero) a 12 (diciembre).
*/
const Ciclo = (() => {
  const mod = (m) => ((m - 1) % 12 + 12) % 12 + 1;

  function duracionMedia(c) {
    if (!c.ciclo) return null;
    return Math.round((c.ciclo[0] + c.ciclo[1]) / 2);
  }

  // Devuelve { siembra: [...], crecimiento: [...], cosecha: [...], perenne, duracion }
  function linea(c) {
    if (c.perenne) {
      return { siembra: c.siembra, crecimiento: [], cosecha: c.cosecha, perenne: true, duracion: null };
    }
    const dur = duracionMedia(c) || 6;
    const siembra = c.siembra;
    const crecimiento = new Set();
    const cosecha = new Set();
    siembra.forEach(s => {
      for (let i = 1; i < dur; i++) crecimiento.add(mod(s + i));
      cosecha.add(mod(s + dur));
    });
    return {
      siembra,
      crecimiento: [...crecimiento].sort((a, b) => a - b),
      cosecha: [...cosecha].sort((a, b) => a - b),
      perenne: false,
      duracion: dur
    };
  }

  // Siembras que caen en los meses de cosecha pedidos (para el registro)
  function siembrasParaCosechar(c, mesesCosecha) {
    if (!mesesCosecha || !mesesCosecha.length) return c.siembra;
    if (c.perenne) return c.cosecha.some(m => mesesCosecha.includes(m)) ? c.siembra : [];
    const dur = duracionMedia(c) || 6;
    return c.siembra.filter(s => mesesCosecha.includes(mod(s + dur)));
  }

  function resumenTexto(c) {
    if (c.perenne) return 'Cosecha todos los años en los meses indicados. Se siembra una vez.';
    const dur = duracionMedia(c) || 6;
    return `Tarda unos ${dur} meses desde la siembra hasta la cosecha.`;
  }

  return { linea, siembrasParaCosechar, resumenTexto, duracionMedia };
})();