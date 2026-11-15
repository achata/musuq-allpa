const Motor = require('../../shared/domain/motor');
const { summarizeClimate } = require('../../shared/domain/climate');

function createRecommendFarm({ providers, crops }) {
  return async function recommendFarm(farm) {
    const warnings = [];
    const climate = await providers.climate(farm.ubicacion.lat, farm.ubicacion.lon).catch(() => {
      warnings.push('NASA_NO_DISPONIBLE'); return null;
    });
    const profile = farm.perfil;
    const anteriores = (profile.cultivos || []).map(c => crops.find(x => x.id === c.id)?.familia).filter(Boolean);
    const entrada = {
      altitud: farm.altitud ?? null,
      clima: climate ? summarizeClimate(climate) : { tmed: null, tmin: null, lluviaMax: null, hr: null },
      suelo: farm.suelo || null, pendientePct: farm.pendientePct ?? null,
      respuestas: { anteriores, cosecha: profile.cosecha || [],
        riego: profile.riego === 'lluvia' ? 'secano' : 'riego',
        insumos: (profile.insumos || []).some(i => ['abono', 'pesticida'].includes(i)) ? 'medio' : 'bajo' }
    };
    return { resultado: Motor.recomendar(entrada, crops), entrada, clima: climate, warnings };
  };
}
module.exports = { createRecommendFarm };
