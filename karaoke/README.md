# 🎤 Karaoke – Cola de canciones con panel de DJ

Web app para bares/karaoke: las mesas piden canciones desde su celular y el DJ
decide el orden desde una vista privada.

## Vistas

| Vista | URL | Quién la usa |
|-------|-----|--------------|
| Pedir canción + ver la cola | `/` (o `/?mesa=7` desde un QR en la mesa) | Clientes |
| Panel del DJ (protegido con PIN) | `/dj` | Solo el DJ |

**Cliente:** mesa, nombre, canción, artista (opcional), género y link de
YouTube (opcional). Ve la canción que está sonando y la cola en orden. Los links
de YouTube solo los ve el DJ.

**DJ:** arrastra (o usa ▲▼ en el celular/tablet) para reordenar, ▶ para poner
una canción, ✓ cuando terminó, ✕ para rechazar, y ↩ para regresar una canción
del historial a la cola. La pantalla se actualiza sola cada 3 segundos.

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
