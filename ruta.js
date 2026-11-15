/*
  RUTA · decide a qué pantalla va la persona según lo que falta.
  Registro: ubicación → campaña pasada → riego → insumos → cosecha → perfil.
*/
const Ruta = (() => {
  function paso(){
    const p = Almacen.activa();
    if (!p) return 'ubicar-chacra.html';
    if (p.perfil) return null;
    const b = Almacen.borrador() || {};
    if (!b.cultivos) return 'conocerte.html';
    if (!b.riego) return 'riego.html';
    if (!b.insumos) return 'insumos.html';
    return 'cosecha.html';
  }

  // Compatibilidad: las páginas viejas esperan lat y lon en la parcela activa
  const leer = clave => {
    if (clave === 'parcela') {
      const p = Almacen.activa();
      if (!p) return null;
      return { ...p, lat: p.ubicacion ? p.ubicacion.lat : p.lat, lon: p.ubicacion ? p.ubicacion.lon : p.lon };
    }
    if (clave === 'perfil') return Almacen.perfilActivo();
    if (clave === 'borrador') return Almacen.borrador();
    return null;
  };

  const guardarBorrador = campos => Almacen.guardarBorrador(campos);
  return { paso, leer, guardarBorrador };
})();