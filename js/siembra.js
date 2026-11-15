(function () {
  const questions = [
    {
      key: "distrito",
      prompt: "¿En qué distrito está tu parcela?",
      type: "district"
    },
    {
      key: "riego",
      prompt: "¿Con qué disponibilidad de agua cuentas?",
      options: [
        { label: "Solo lluvia (secano)", value: "secano" },
        { label: "Tengo riego disponible", value: "riego" }
      ]
    },
    {
      key: "insumos",
      prompt: "¿Qué nivel de insumos puedes usar?",
      options: [
        { label: "Bajo", value: "bajo" },
        { label: "Medio", value: "medio" },
        { label: "Alto", value: "alto" }
      ]
    },
    {
      key: "mes",
      prompt: "¿En qué mes piensas sembrar?",
      options: [
        { label: "Enero", value: 1 },
        { label: "Febrero", value: 2 },
        { label: "Marzo", value: 3 },
        { label: "Abril", value: 4 },
        { label: "Mayo", value: 5 },
        { label: "Junio", value: 6 },
        { label: "Julio", value: 7 },
        { label: "Agosto", value: 8 },
        { label: "Septiembre", value: 9 },
        { label: "Octubre", value: 10 },
        { label: "Noviembre", value: 11 },
        { label: "Diciembre", value: 12 }
      ]
    }
  ];

  document.addEventListener("DOMContentLoaded", initialize);

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo cargar ${url}: ${response.status}`);
    return response.json();
  }

  function initialize() {
    const panel = document.getElementById("siembra-panel");
    const status = document.getElementById("siembra-status");
    if (!panel || !status) return;

    const locationButton = document.getElementById("btnUbicacion");
    const locationStatus = document.getElementById("ubicacion-status");
    if (locationButton && locationStatus) {
      const locationMessages = {
        PERMISO_NEGADO: "Sin permiso no podemos saber dónde está tu campo. Permite la ubicación en la configuración de tu celular.",
        TIEMPO_AGOTADO: "No encontramos tu ubicación. Sal al aire libre y vuelve a tocar el botón.",
        PRECISION_BAJA: "La ubicación no es lo bastante exacta. Ponte en el centro de tu terreno y vuelve a intentar.",
        SIN_SOPORTE: "Tu celular no permite usar la ubicación en esta app.",
        NO_DISPONIBLE: "No pudimos obtener tu ubicación. Revisa que el GPS esté prendido.",
        ALTITUD_FALLA: "Sin internet no podemos calcular la altura de tu campo. Intenta de nuevo cuando tengas señal.",
        ALTITUD_VACIA: "No pudimos calcular la altura de tu campo. Intenta de nuevo más tarde."
      };

      locationButton.addEventListener("click", async () => {
        locationButton.disabled = true;
        locationButton.textContent = "Buscando tu ubicación…";
        locationStatus.hidden = true;
        try {
          const location = await Ubicacion.activar();
          window.Almacen.saveUbicacion(location);
          locationStatus.textContent = "Ubicación guardada en este teléfono. Ahora elige el distrito de tu parcela.";
          locationStatus.className = "notice";
          locationStatus.hidden = false;
          locationButton.textContent = "📍 Actualizar mi ubicación";
        } catch (error) {
          locationStatus.textContent = locationMessages[error.message]
            || "Algo salió mal al guardar la ubicación. Intenta de nuevo.";
          locationStatus.className = "notice notice-error";
          locationStatus.hidden = false;
          locationButton.textContent = "📍 Activar mi ubicación";
        } finally {
          locationButton.disabled = false;
        }
      });
    }

    let districts = [];
    let crops = [];
    let step = 0;
    let answers = {};

    function showStatus(message, isError) {
      status.textContent = message;
      status.className = isError ? "notice notice-error" : "notice";
      status.hidden = !message;
    }

    function saveProgress() {
      window.Almacen.saveSowingProgress({ step, answers });
    }

    function renderQuestion() {
      panel.textContent = "";
      const question = questions[step];
      const progress = document.createElement("p");
      progress.className = "eyebrow";
      progress.textContent = `Pregunta ${step + 1} de ${questions.length}`;
      const title = document.createElement("h2");
      title.textContent = question.prompt;
      const choices = document.createElement("div");
      choices.className = "choice-list";

      const options = question.type === "district"
        ? districts.map(district => ({
          label: `${district.nombre} · ${district.altitudMsnm} msnm`,
          value: district.id
        }))
        : question.options;

      options.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-button";
        button.dataset.choiceIndex = String(index);
        button.textContent = option.label;
        choices.appendChild(button);
      });
      panel.append(progress, title, choices);

      const navigation = document.createElement("div");
      navigation.className = "navigation-row";
      if (step > 0) {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "secondary-button";
        back.dataset.action = "back";
        back.textContent = "← Anterior";
        navigation.appendChild(back);
      }
      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "text-button";
      restart.dataset.action = "restart";
      restart.textContent = "Empezar de nuevo";
      navigation.appendChild(restart);
      panel.appendChild(navigation);
    }

    function renderResult(result, district, climateError) {
      panel.textContent = "";
      const title = document.createElement("h2");
      title.textContent = result.principal
        ? `Te recomendamos sembrar ${result.principal}`
        : "No encontramos un cultivo adecuado";
      panel.appendChild(title);

      const location = document.createElement("p");
      location.className = "muted";
      location.textContent = `${district.nombre}, ${district.departamento} · ${district.altitudMsnm} msnm`;
      panel.appendChild(location);

      if (result.principal) {
        const principal = result.aptitud.find(item => item.nombre === result.principal);
        if (principal) {
          const card = document.createElement("article");
          card.className = "result-card";
          const score = document.createElement("p");
          score.className = "result-score";
          score.textContent = `${principal.score}% de aptitud`;
          const sowing = document.createElement("p");
          const monthNames = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
          ];
          sowing.textContent = `Meses recomendados: ${principal.siembra.map(month => monthNames[month - 1]).join(", ")}.`;
          const rotation = document.createElement("p");
          rotation.textContent = principal.rot;
          card.append(score, sowing, rotation);
          panel.appendChild(card);
        }
      }

      const alternatives = result.aptitud
        .filter(item => item.nombre !== result.principal)
        .slice(0, 3);
      if (alternatives.length) {
        const heading = document.createElement("h3");
        heading.textContent = "Otras opciones";
        panel.appendChild(heading);
        const list = document.createElement("ul");
        list.className = "result-list";
        alternatives.forEach(item => {
          const entry = document.createElement("li");
          entry.textContent = `${item.nombre} · ${item.score}% de aptitud`;
          list.appendChild(entry);
        });
        panel.appendChild(list);
      }

      const warnings = result.advertencias.slice();
      if (climateError) {
        warnings.unshift(`No se pudo consultar el clima: ${climateError}. La aptitud climática se calculó con dato faltante.`);
      }
      if (warnings.length) {
        const heading = document.createElement("h3");
        heading.textContent = "Avisos";
        panel.appendChild(heading);
        const list = document.createElement("ul");
        list.className = "result-list";
        warnings.forEach(message => {
          const entry = document.createElement("li");
          entry.textContent = message;
          list.appendChild(entry);
        });
        panel.appendChild(list);
      }

      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "secondary-button";
      restart.dataset.action = "restart";
      restart.textContent = "Responder de nuevo";
      panel.appendChild(restart);
    }

    async function finish() {
      const district = districts.find(item => item.id === answers.distrito);
      if (!district) {
        showStatus("Selecciona un distrito válido para recibir la recomendación.", true);
        step = 0;
        saveProgress();
        renderQuestion();
        return;
      }

      showStatus("Calculando recomendación…", false);
      let climate = null;
      let climateError = null;
      try {
        const climateCache = await Clima.obtener({
          lat: district.latitud,
          lon: district.longitud
        });
        const climateSummary = Clima.resumen(climateCache);
        climate = {
          temp: climateSummary.tmed,
          rainfallMax: climateSummary.lluviaMax
        };
      } catch (error) {
        climateError = error.message;
      }

      const result = window.Motor.recomendar({
        altitud: district.altitudMsnm,
        clima: {
          tmed: climate ? climate.temp : null,
          lluviaMax: climate ? climate.rainfallMax : null
        },
        respuestas: {
          riego: answers.riego,
          insumos: answers.insumos,
          mes: answers.mes
        }
      }, crops);

      saveProgress();
      showStatus("", false);
      renderResult(result, district, climateError);
    }

    panel.addEventListener("click", event => {
      const target = event.target;
      const action = target.closest("[data-action]");
      if (action && action.dataset.action === "back") {
        step = Math.max(0, step - 1);
        saveProgress();
        showStatus("", false);
        renderQuestion();
        return;
      }
      if (action && action.dataset.action === "restart") {
        window.Almacen.clearSowingProgress();
        answers = {};
        step = 0;
        showStatus("", false);
        renderQuestion();
        return;
      }

      const choice = target.closest("[data-choice-index]");
      if (!choice) return;
      const question = questions[step];
      const options = question.type === "district"
        ? districts.map(district => ({ value: district.id }))
        : question.options;
      const selected = options[Number(choice.dataset.choiceIndex)];
      if (!selected) {
        showStatus("La opción seleccionada no es válida. Vuelve a intentarlo.", true);
        return;
      }

      answers[question.key] = selected.value;
      if (question.key === "distrito") window.Almacen.saveParcela(selected.value);
      step += 1;
      saveProgress();
      if (step === questions.length) {
        finish().catch(error => showStatus(error.message, true));
      } else {
        showStatus("", false);
        renderQuestion();
      }
    });

    Promise.all([
      fetchJson("data/distritos.json"),
      fetchJson("data/cultivos.json")
    ]).then(([districtData, cropData]) => {
      if (!Array.isArray(districtData) || !districtData.length) {
        throw new Error("No hay distritos disponibles para el cuestionario.");
      }
      if (!Array.isArray(cropData) || !cropData.length) {
        throw new Error("No hay reglas de cultivos disponibles.");
      }
      districts = districtData;
      crops = cropData;
      const saved = window.Almacen.getSowingProgress();
      if (saved) {
        step = saved.step;
        answers = saved.answers;
      } else {
        const savedDistrict = window.Almacen.getParcela();
        if (savedDistrict) answers.distrito = savedDistrict;
      }
      if (step >= questions.length) finish().catch(error => showStatus(error.message, true));
      else renderQuestion();
    }).catch(error => showStatus(error.message, true));
  }
})();
