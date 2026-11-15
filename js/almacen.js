(function (root) {
  const PREFIX = "campo-app:v1:";
  const PARCEL_KEY = `${PREFIX}parcela`;
  const LOCATION_KEY = `${PREFIX}ubicacion`;
  const SOWING_KEY = `${PREFIX}siembra`;
  const FARM_KEYS = { parcels: "parcelas", active: "parcelaActiva", draft: "borrador" };

  function readJson(key) {
    const value = root.localStorage.getItem(key);
    if (value === null) return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`No se pudieron leer los datos guardados (${key}): ${error.message}`);
    }
  }

  function writeJson(key, value) {
    root.localStorage.setItem(key, JSON.stringify(value));
  }

  function getParcela() {
    const parcela = readJson(PARCEL_KEY);
    if (parcela !== null && typeof parcela !== "string") {
      throw new Error("La parcela guardada no tiene un formato válido.");
    }
    return parcela;
  }

  function saveParcela(id) {
    if (typeof id !== "string" || !id) {
      throw new TypeError("El identificador del distrito no es válido.");
    }
    writeJson(PARCEL_KEY, id);
  }

  function getUbicacion() {
    const location = readJson(LOCATION_KEY);
    if (location === null) return null;
    if (
      !location
      || typeof location !== "object"
      || !Number.isFinite(location.lat)
      || location.lat < -90
      || location.lat > 90
      || !Number.isFinite(location.lon)
      || location.lon < -180
      || location.lon > 180
      || !Number.isFinite(location.precision)
      || location.precision < 0
      || !Number.isFinite(location.altitud)
      || typeof location.creada !== "string"
    ) {
      throw new Error("La ubicación guardada no tiene un formato válido.");
    }
    return location;
  }

  function saveUbicacion(location) {
    if (
      !location
      || typeof location !== "object"
      || !Number.isFinite(location.lat)
      || location.lat < -90
      || location.lat > 90
      || !Number.isFinite(location.lon)
      || location.lon < -180
      || location.lon > 180
      || !Number.isFinite(location.precision)
      || location.precision < 0
      || !Number.isFinite(location.altitud)
      || typeof location.creada !== "string"
    ) {
      throw new TypeError("La ubicación no tiene un formato válido.");
    }
    writeJson(LOCATION_KEY, location);
  }

  function getSowingProgress() {
    const progress = readJson(SOWING_KEY);
    if (progress === null) return null;
    if (
      typeof progress !== "object"
      || !Number.isInteger(progress.step)
      || progress.step < 0
      || progress.step > 4
      || !progress.answers
      || typeof progress.answers !== "object"
      || Array.isArray(progress.answers)
    ) {
      throw new Error("El avance de siembra guardado no tiene un formato válido.");
    }
    return progress;
  }

  function saveSowingProgress(progress) {
    if (
      !progress
      || !Number.isInteger(progress.step)
      || progress.step < 0
      || progress.step > 4
      || !progress.answers
      || typeof progress.answers !== "object"
      || Array.isArray(progress.answers)
    ) {
      throw new TypeError("El avance de siembra no tiene un formato válido.");
    }
    writeJson(SOWING_KEY, progress);
  }

  function clearSowingProgress() {
    root.localStorage.removeItem(SOWING_KEY);
  }

  function readFarm(key) {
    try {
      return JSON.parse(root.localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function writeFarm(key, value) {
    root.localStorage.setItem(key, JSON.stringify(value));
  }

  function migrateFarms() {
    if (readFarm(FARM_KEYS.parcels)) return;
    const oldParcel = readFarm("parcela");
    if (!oldParcel) {
      writeFarm(FARM_KEYS.parcels, []);
      return;
    }

    const profile = readFarm("perfil") || null;
    const id = "p" + Date.now();
    writeFarm(FARM_KEYS.parcels, [{
      id,
      nombre: oldParcel.zona || oldParcel.zonaCercana || "Mi parcela",
      ubicacion: { lat: oldParcel.lat, lon: oldParcel.lon },
      altitud: oldParcel.altitud,
      origenAltitud: oldParcel.origenAltitud,
      zona: oldParcel.zona || null,
      perfil: profile,
      creada: oldParcel.creada || new Date().toISOString()
    }]);
    writeFarm(FARM_KEYS.active, id);
    root.localStorage.removeItem("parcela");
    root.localStorage.removeItem("perfil");
  }

  migrateFarms();

  function todas() {
    return readFarm(FARM_KEYS.parcels) || [];
  }

  function activa() {
    const id = readFarm(FARM_KEYS.active);
    const lista = todas();
    return lista.find(parcela => parcela.id === id) || lista[0] || null;
  }

  function activar(id) {
    writeFarm(FARM_KEYS.active, id);
  }

  function guardar(parcela) {
    const lista = todas();
    const indice = lista.findIndex(item => item.id === parcela.id);
    if (indice >= 0) lista[indice] = parcela;
    else lista.push(parcela);
    writeFarm(FARM_KEYS.parcels, lista);
    return parcela;
  }

  function nueva(datos) {
    const parcela = {
      id: "p" + Date.now(),
      creada: new Date().toISOString(),
      perfil: null,
      ...datos
    };
    guardar(parcela);
    activar(parcela.id);
    return parcela;
  }

  function eliminar(id) {
    const lista = todas().filter(parcela => parcela.id !== id);
    writeFarm(FARM_KEYS.parcels, lista);
    if (readFarm(FARM_KEYS.active) === id) {
      if (lista[0]) writeFarm(FARM_KEYS.active, lista[0].id);
      else root.localStorage.removeItem(FARM_KEYS.active);
    }
  }

  function perfilActivo() {
    const parcela = activa();
    return parcela ? parcela.perfil : null;
  }

  function guardarPerfilActivo(perfil) {
    const parcela = activa();
    if (!parcela) return null;
    parcela.perfil = { ...perfil, actualizado: new Date().toISOString() };
    return guardar(parcela);
  }

  function borrador() {
    return readFarm(FARM_KEYS.draft);
  }

  function guardarBorrador(campos) {
    writeFarm(FARM_KEYS.draft, { ...(borrador() || {}), ...campos });
  }

  function borrarBorrador() {
    root.localStorage.removeItem(FARM_KEYS.draft);
  }

  root.Almacen = Object.freeze({
    getParcela,
    saveParcela,
    getUbicacion,
    saveUbicacion,
    getSowingProgress,
    saveSowingProgress,
    clearSowingProgress,
    todas,
    activa,
    activar,
    guardar,
    nueva,
    eliminar,
    perfilActivo,
    guardarPerfilActivo,
    borrador,
    guardarBorrador,
    borrarBorrador
  });
})(typeof window !== "undefined" ? window : globalThis);
