const assert = require("assert");
const Motor = require("../shared/domain/motor.js");
const cultivos = require("../data/cultivos.json");

const casos = [
  {
    nombre: "Huamancaca (3200 m, secano)",
    entrada: {
      altitud: 3200,
      clima: { tmed: 11, lluviaMax: 4 },
      respuestas: { riego: "secano", insumos: "bajo" }
    },
    principalValido: principal => ["Papa nativa", "Cebada"].includes(principal)
  },
  {
    nombre: "Puno (3825 m, secano)",
    entrada: {
      altitud: 3825,
      clima: { tmed: 8, lluviaMax: 3 },
      respuestas: { riego: "secano", insumos: "bajo" }
    },
    principalValido: principal => ["Cebada", "Papa nativa"].includes(principal)
  },
  {
    nombre: "Chancay (costa, riego)",
    entrada: {
      altitud: 40,
      clima: { tmed: 20, lluviaMax: 0 },
      respuestas: { riego: "riego", insumos: "medio" }
    },
    principalValido: principal => [
      "Maíz amarillo", "Arroz", "Mango", "Espárrago", "Palta Hass", "Tomate"
    ].includes(principal)
  }
];

let fallos = 0;
for (const caso of casos) {
  const resultado = Motor.recomendar(caso.entrada, cultivos);
  try {
    assert.ok(caso.principalValido(resultado.principal), `principal inesperado: ${resultado.principal}`);
    console.log(`✔ ${caso.nombre} → principal: ${resultado.principal} | segunda: ${resultado.segunda}`);
  } catch (error) {
    fallos++;
    console.log(`✖ ${caso.nombre} → ${error.message}`);
  }
  resultado.advertencias.forEach(advertencia => console.log(`    ⚠ ${advertencia}`));
}

console.log(fallos ? `\n${fallos} caso(s) fallaron.` : "\nTodos los casos pasaron.");
process.exit(fallos ? 1 : 0);
