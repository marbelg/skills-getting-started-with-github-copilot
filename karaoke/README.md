# 🎤 Karaoke – Cola de canciones con panel de DJ

Web app para bares/karaoke: las mesas piden canciones desde su celular y el DJ
decide el orden desde una vista privada.

## Vistas

| Vista | URL | Quién la usa |
|-------|-----|--------------|
| Pedir canción | `/` (o `/?mesa=7` desde un QR en la mesa) | Clientes |
| Panel del DJ (protegido con PIN) | `/dj` | Solo el DJ |

**Cliente:** elige su mesa de la lista (o la **Barra** si no está en mesa),
escribe su nombre, canción, artista (opcional), género y link de YouTube
(opcional). Las mesas **no ven la fila** ni qué canción sigue: el orden es
sorpresa. Ningún endpoint público expone la fila; solo el DJ (con PIN) la ve.

**DJ (administrador)** – panel con 4 pestañas y un resumen arriba (en cola,
cantadas, mesas pidiendo, promedio de estrellas):

- **🎵 Cola:** ordena como quiera (arrastrar, ▲▼, ⤒⤓ o escribiendo la
  posición). Botón **Ver: En orden / Por mesa** para agrupar la cola por mesa.
  Cada canción muestra el color de su mesa, el identificador del cantante (🏷️)
  y cuántas veces ha cantado y hace cuánto (🔁), para repartir los turnos.
  ▶ poner, ✓ terminó, ✕ rechazar, ↩ regresar a la cola, y ⭐ calificar.
- **🪑 Mesas:** el DJ escribe cuántas mesas hay y se generan; la Barra siempre
  existe. Cada mesa muestra canciones en cola, cantadas y su promedio, y un
  botón para copiar su link (para hacer el QR).
- **👥 Cantantes:** cada cantante con su identificador, cuántas veces ha
  cantado, hace cuánto y su promedio. El DJ pone el identificador tocando 🏷️ en
  cualquier canción; las siguientes canciones de esa persona lo heredan, y si
  dos nombres tienen el mismo identificador se cuentan como la misma persona.
- **⭐ Calificaciones:** ranking de cantantes (1 a 5 estrellas) y promedio por mesa.

## Banner del desarrollador

La pantalla de las mesas muestra "Aplicación desarrollada por MoonDev" con los
datos de contacto. Se editan en `karaoke/static/creditos.js` (lo que quede
vacío no se muestra).

## Reglas

- Solo una canción suena a la vez (al poner otra, la anterior pasa a "cantada").
- Máximo de canciones en espera por mesa (por defecto 3) para que nadie acapare.
  En la Barra el límite es por persona.
- El link debe ser de YouTube (`youtube.com` o `youtu.be`).

## Correr

```bash
pip install -r requirements.txt
KARAOKE_DJ_PIN=4321 uvicorn karaoke.app:app --host 0.0.0.0 --port 8000
```

Variables de entorno:

- `KARAOKE_DJ_PIN` – PIN del DJ (por defecto `1234`, **cámbialo**).
- `KARAOKE_MAX_POR_MESA` – canciones en espera por mesa (por defecto `3`).
- `KARAOKE_MESAS` – mesas al arrancar (por defecto `10`; el DJ las cambia desde su panel).

Pruebas: `pytest karaoke`

> Los datos se guardan en memoria: al reiniciar el servidor se vacía la cola.
