/*
  MOTOR · recomendación por criterios. Función pura: sin DOM ni red.
  - Un dato que falta NO penaliza: el criterio no se evalúa y se informa.
  - Estrellas = proporción de criterios cumplidos entre los evaluados.
  - Solo se recomienda con 4 o 5 estrellas.
  - Suelo y pendiente generan avisos, no restan puntos.
*/
(function (root) {
  const Ciclo = typeof module !== 'undefined' && module.exports ? require('./ciclo') : root.Ciclo;
  const NIVEL = { bajo: 0, medio: 1, alto: 2 };
  const FAMILIAS_HONGOS = ['Solanaceae', 'Lauraceae'];
  const MAX_RECOMENDACIONES = 3;

  // Devuelve null si el dato falta; 0 fuera de límites; 1 en el óptimo
  function trap(x, a, b, c, d) {
    if (x == null) return null;
    if (x <= a || x >= d) return 0;
    if (x < b) return (x - a) / (b - a);
    if (x <= c) return 1;
    return (d - x) / (d - c);
  }

  function estrellasDe(prop) {
    if (prop >= 0.95) return 5;
    if (prop >= 0.8) return 4;
    if (prop >= 0.6) return 3;
    return 2;
  }

  function estadoDe(x) {
    if (x.evaluados < 2) return 'No existen datos suficientes';
    if (x.faltan.length) return 'Evaluación incompleta';
    if (x.estrellas >= 4) return 'Compatible con los criterios evaluados';
    return 'Presenta restricciones identificadas';
  }

  function evaluar(c, e) {
    const r = e.respuestas || {};
    const base = { nombre: c.nombre, familia: c.familia, icono: c.icono,
                   prioridad: c.prioridad, siembra: c.siembra, cosecha: c.cosecha, rot: c.rot };

    // Exclusiones claras: no se muestran
    if (c.riego === 'riego' && r.riego === 'secano')
      return { ...base, excluida: 'Necesita riego, y tu parcela depende de la lluvia.', excluidaPor: 'agua' };
    if ((r.anteriores || []).includes(c.familia))
      return { ...base, excluida: 'Es de la misma familia que tu campaña pasada. Conviene dejar descansar la tierra.', excluidaPor: 'familia' };
    if (r.cosecha && r.cosecha.length) {
      const siembrasOk = Ciclo.siembrasParaCosechar(c, r.cosecha);
      if (!siembrasOk.length)
        return { ...base, excluida: 'Con su ciclo, no llega a cosecharse en los meses que quieres.', excluidaPor: 'cosecha' };
      base.siembraSugerida = siembrasOk;
    }

    const criterios = [];
    const faltan = [];
    const avisos = [];

    // Altura: si está fuera de límites, el cultivo no se da en esa parcela
    const fA = trap(e.altitud, ...c.A);
    if (fA === 0) return { ...base, excluida: 'Tu parcela está fuera de la altura en que este cultivo se da bien.', excluidaPor: 'altura' };
    if (fA == null) faltan.push('altitud');
    else criterios.push({ nombre: 'Altura', cumple: fA >= 0.7 });

    // Temperatura media
    const fT = trap(e.clima.tmed, ...c.T);
    if (fT == null) faltan.push('temperatura de hoy');
    else if (fT === 0) return { ...base, excluida: 'La temperatura de tu zona está fuera de lo que este cultivo tolera.', excluidaPor: 'temperatura' };
    else criterios.push({ nombre: 'Temperatura', cumple: fT >= 0.7 });

    // Temperatura de la noche (solo si el cultivo la define y hay dato)
    if (c.Tn) {
      const fTn = trap(e.clima.tmin, ...c.Tn);
      if (fTn != null) {
        criterios.push({ nombre: 'Noches frescas', cumple: fTn >= 0.7 });
        if (fTn < 0.7) avisos.push('De noche puede hacer frío para este cultivo. Protégelo en las noches frías.');
      }
    }

    // Insumos
    const insumosOk = (NIVEL[r.insumos] ?? 1) >= (NIVEL[c.insumos] ?? 0);
    criterios.push({ nombre: 'Insumos', cumple: insumosOk });
    if (!insumosOk) avisos.push('Necesita más abono o insumos que los que usas ahora.');

    // Exceso de lluvia reciente
    if (e.clima.lluviaMax == null) {
      faltan.push('lluvia reciente');
    } else {
      const lluviaOk = e.clima.lluviaMax < 20;
      criterios.push({ nombre: 'Exceso de lluvia', cumple: lluviaOk });
      if (!lluviaOk) avisos.push('Llovió muy fuerte: revisa que el agua no se junte en el terreno.');
    }

    // Riesgo de hongos: solo para familias sensibles y con dato de humedad y temperatura
    if (FAMILIAS_HONGOS.includes(c.familia) && e.clima.hr != null && e.clima.tmed != null) {
      const riesgo = e.clima.hr > 80 && e.clima.tmed >= 22 && e.clima.tmed <= 28;
      criterios.push({ nombre: 'Sanidad', cumple: !riesgo });
      if (riesgo) avisos.push('Con humedad alta y calor, este cultivo puede tener hongos. Revisa las hojas seguido.');
    }

    const evaluados = criterios.length;
    const cumplidos = criterios.filter(x => x.cumple).length;
    const prop = evaluados ? cumplidos / evaluados : 0;
    const estrellas = evaluados >= 2 ? estrellasDe(prop) : 0;

    const out = { ...base, evaluados, cumplidos, estrellas, faltan, avisos, criterios,
                  factores: { fT, fA } };
    out.estado = estadoDe(out);
    return out;
  }

  // Avisos de la parcela: suelo, pendiente y contexto. No restan puntos.
  function avisosParcela(entrada) {
    const out = [];
    const s = entrada.suelo;
    if (s && s.estado === 'ok') {
      if (s.ph != null && s.ph < 5) out.push(`El suelo es muy ácido (pH ${s.ph}). Conviene echar cal antes de sembrar.`);
      if (s.ph != null && s.ph > 8) out.push(`El suelo es alcalino (pH ${s.ph}). Revisa si le falta hierro o zinc.`);
      if (s.arena != null && s.arena > 65) out.push('Tu tierra es arenosa: el agua se va rápido. Riega con más frecuencia y en menos cantidad.');
      if (s.arcilla != null && s.arcilla > 40) out.push('Tu tierra es arcillosa: retiene el agua. No riegues de más para que no se encharque.');
    }
    if (s && s.estado === 'pendiente')
      out.push('La recomendación se basa en clima y altitud. El suelo de tu parcela se revisará cuando haya señal.');

    const p = entrada.pendientePct;
    if (p > 30) out.push(`El terreno es muy inclinado (${p} %). El agua y la tierra se escurren: siembra siguiendo las curvas.`);
    else if (p > 15) out.push(`El terreno tiene pendiente (${p} %). Cuida que la tierra no se erosione.`);

    if (entrada.altitud > 3800) out.push('Estás en zona alta: de noche puede helar. Revisa el pronóstico antes de sembrar.');
    if (entrada.respuestas.riego === 'secano') out.push('Dependes de la lluvia: siembra cuando empiecen las lluvias fuertes.');
    if (entrada.clima.tmed == null) out.push('Todavía no tenemos el clima de hoy, así que la temperatura no se tomó en cuenta.');
    return out;
  }

  function recomendar(entrada, cultivos) {
    const todos = cultivos.map(c => evaluar(c, entrada));
    const descartados = todos.filter(x => x.excluida).map(x => ({ nombre: x.nombre, motivo: x.excluida }));
    const evaluados = todos.filter(x => !x.excluida).sort((a, b) =>
      b.estrellas - a.estrellas
      || (b.cumplidos / (b.evaluados || 1)) - (a.cumplidos / (a.evaluados || 1))
      || a.prioridad - b.prioridad);

    const recomendaciones = [];
    const familias = new Set();
    for (const c of evaluados) {
      if (c.estrellas < 4) continue;
      if (recomendaciones.length >= MAX_RECOMENDACIONES) break;
      if (familias.has(c.familia)) continue;
      familias.add(c.familia);
      recomendaciones.push(c);
    }

    const cercanas = evaluados.filter(c => c.estrellas < 4 && c.evaluados >= 2).slice(0, 3);
    const principal = recomendaciones[0] || null;

    let motivoSinOpciones = null;
    if (!recomendaciones.length) {
      const todosPorCosecha = todos.length > 0 && todos.every(x => x.excluidaPor === 'cosecha');
      motivoSinOpciones = todosPorCosecha ? 'cosecha' : 'restricciones';
    }

    return {
      recomendaciones,
      principal: principal ? principal.nombre : null,
      segunda: recomendaciones[1] ? recomendaciones[1].nombre : null,
      sinOpciones: recomendaciones.length === 0,
      motivoSinOpciones,
      cercanas,
      advertencias: [...new Set([...avisosParcela(entrada), ...(principal ? principal.avisos : [])])],
      descartados,
      aptitud: evaluados,
      cobertura: { faltan: (evaluados[0] || {}).faltan || [] }
    };
  }

  const api = { trap, evaluar, recomendar, avisosParcela };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
