# campo

Prototipo web estático para registrar parcelas y consultar recomendaciones de cultivo.
No requiere instalar paquetes ni compilar.

## Levantar localmente

1. Instala Python 3 si todavía no está disponible.
2. Abre una terminal en la carpeta del repositorio (donde está `index.html`).
3. Ejecuta:

   ```sh
   python -m http.server 8000
   ```

   En Windows también puedes usar `py -m http.server 8000`.

4. Abre <http://localhost:8000> en el navegador.
5. Detén el servidor con `Ctrl+C`.

Usa `localhost` para probar el GPS: los navegadores requieren un contexto seguro
(HTTPS o localhost). Si entras desde otro dispositivo mediante una IP de la red,
el GPS puede no estar disponible sin HTTPS.

Los mapas, la búsqueda de localidades y las consultas de altitud, suelo y clima
necesitan conexión a internet. Los datos de las parcelas se guardan en el
`localStorage` del navegador.

## Estructura

- Páginas HTML y `sw.js` en la raíz.
- `js/`: scripts de las páginas.
- `css/`: estilos compartidos.
- `data/`: catálogos JSON.
- `tests/`: pruebas del motor de recomendaciones.

El repositorio original no incluía el catálogo de zonas de referencia.
`data/zonas.json` contiene una lista vacía para permitir las consultas sin errores
404 y sin inventar datos geográficos. El registro puede continuar con la altitud
consultada por internet. Cuando se recupere el catálogo original, cada zona debe
incluir `nombre`, `lat`, `lon` y `altitud`.

## Verificación

Con Node.js instalado:

```sh
node tests/motor.test.js
```

Si probaste una versión anterior y el navegador sigue mostrando archivos viejos,
abre las herramientas de desarrollo, ve a **Application → Service Workers**,
pulsa **Unregister** y recarga. Evita borrar `localStorage` si quieres conservar
tus parcelas.
