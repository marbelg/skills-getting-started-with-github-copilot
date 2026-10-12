# 🎤 Karaoke – Cola de canciones con panel de DJ

Web app para bares/karaoke: las mesas piden canciones desde su celular y el DJ
decide el orden desde una vista privada.

## Vistas

| Vista | URL | Quién la usa |
|-------|-----|--------------|
| Pedir canción | `/` (o `/?mesa=7` desde un QR en la mesa) | Clientes |
| Panel del DJ (protegido con PIN) | `/dj` | Solo el DJ |

**Cliente:** mesa, nombre, canción, artista (opcional), género y link de
YouTube (opcional). Las mesas **no ven la fila** ni qué canción sigue: el orden
es sorpresa. Ningún endpoint público expone la fila; solo el DJ (con PIN) la ve.

**DJ:** ordena la cola como quiera: arrastrando, con ▲▼, con ⤒/⤓ (primer o
último lugar) o escribiendo la posición exacta en el número de cada canción.
Cada mesa tiene su propio color y arriba se ve cuántas canciones tiene en espera
cada mesa (toca una para resaltar sus canciones). Además: ▶ para poner
una canción, ✓ cuando terminó, ✕ para rechazar, y ↩ para regresar una canción
del historial a la cola. La pantalla se actualiza sola cada 3 segundos.

## Banner del desarrollador

La pantalla de las mesas muestra "Aplicación desarrollada por MoonDev" con los
datos de contacto. Se editan en `karaoke/static/creditos.js` (lo que quede
vacío no se muestra).

## Reglas

- Solo una canción suena a la vez (al poner otra, la anterior pasa a "cantada").
- Máximo de canciones en espera por mesa (por defecto 3) para que nadie acapare.
- El link debe ser de YouTube (`youtube.com` o `youtu.be`).

## Correr

```bash
pip install -r requirements.txt
KARAOKE_DJ_PIN=4321 uvicorn karaoke.app:app --host 0.0.0.0 --port 8000
```

Variables de entorno:

- `KARAOKE_DJ_PIN` – PIN del DJ (por defecto `1234`, **cámbialo**).
- `KARAOKE_MAX_POR_MESA` – canciones en espera por mesa (por defecto `3`).

Pruebas: `pytest karaoke`

> Los datos se guardan en memoria: al reiniciar el servidor se vacía la cola.
