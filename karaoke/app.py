"""
Karaoke App API

Las mesas piden canciones desde su celular (sin ver la fila, para que sea
sorpresa) y el DJ, desde su propia vista protegida con PIN, decide el orden, marca la canción que está sonando y
la que ya se cantó.
"""

import os
from datetime import datetime, timezone
from itertools import count
from pathlib import Path
from threading import Lock
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

DJ_PIN = os.environ.get("KARAOKE_DJ_PIN", "1234")
MAX_PENDIENTES_POR_MESA = int(os.environ.get("KARAOKE_MAX_POR_MESA", "3"))

GENEROS = [
    "Pop", "Rock", "Balada", "Ranchera", "Cumbia", "Salsa", "Bachata",
    "Reggaetón", "Banda", "Bolero", "Rock en español", "Inglés", "Otro",
]

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com",
                 "music.youtube.com", "youtu.be"}

app = FastAPI(title="Karaoke API",
              description="Cola de canciones para karaoke con vista de DJ")

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"),
          name="static")

Estado = Literal["pendiente", "sonando", "cantada", "rechazada"]


class NuevaSolicitud(BaseModel):
    mesa: str = Field(min_length=1, max_length=10)
    nombre: str = Field(min_length=1, max_length=40)
    cancion: str = Field(min_length=1, max_length=100)
    artista: str = Field(default="", max_length=60)
    genero: str
    youtube: Optional[str] = Field(default=None, max_length=300)

    @field_validator("mesa", "nombre", "cancion", "artista")
    @classmethod
    def limpiar_texto(cls, v: str) -> str:
        return v.strip()

    @field_validator("genero")
    @classmethod
    def validar_genero(cls, v: str) -> str:
        if v not in GENEROS:
            raise ValueError("Género no válido")
        return v

    @field_validator("youtube")
    @classmethod
    def validar_youtube(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        v = v.strip()
        url = urlparse(v)
        if url.scheme not in ("http", "https") or url.hostname not in YOUTUBE_HOSTS:
            raise ValueError("El link debe ser de YouTube")
        return v


class CambioEstado(BaseModel):
    estado: Estado


class NuevoOrden(BaseModel):
    ids: list[int]


# Base de datos en memoria (se borra al reiniciar el servidor)
solicitudes: list[dict] = []
_ids = count(1)
_lock = Lock()


def verificar_dj(pin: Optional[str]):
    if pin != DJ_PIN:
        raise HTTPException(status_code=401, detail="PIN de DJ incorrecto")


def buscar(solicitud_id: int) -> dict:
    for s in solicitudes:
        if s["id"] == solicitud_id:
            return s
    raise HTTPException(status_code=404, detail="Solicitud no encontrada")


def cola() -> list[dict]:
    """Canciones en espera, en el orden elegido por el DJ."""
    return [s for s in solicitudes if s["estado"] == "pendiente"]


def vista_publica(s: dict) -> dict:
    # Respuesta al pedir: solo los datos de la propia solicitud
    return {k: s[k] for k in ("id", "mesa", "nombre", "cancion", "artista", "genero")}


@app.get("/")
def root(request: Request):
    # Conserva ?mesa=N para que funcionen los QR por mesa
    query = f"?{request.url.query}" if request.url.query else ""
    return RedirectResponse(url=f"/static/index.html{query}")


@app.get("/dj")
def dj():
    return RedirectResponse(url="/static/dj.html")


@app.get("/api/generos")
def get_generos():
    return GENEROS


# ---------- Vista de las mesas ----------
# Las mesas solo pueden pedir: no hay ningún endpoint público que muestre la fila.

@app.post("/api/solicitudes", status_code=201)
def crear_solicitud(datos: NuevaSolicitud):
    with _lock:
        pendientes_mesa = sum(1 for s in cola() if s["mesa"].lower() == datos.mesa.lower())
        if pendientes_mesa >= MAX_PENDIENTES_POR_MESA:
            raise HTTPException(
                status_code=429,
                detail=f"La mesa {datos.mesa} ya tiene {MAX_PENDIENTES_POR_MESA} canciones en espera",
            )
        solicitud = {
            "id": next(_ids),
            **datos.model_dump(),
            "estado": "pendiente",
            "creada": datetime.now(timezone.utc).isoformat(),
        }
        solicitudes.append(solicitud)
    return vista_publica(solicitud)


# ---------- Vista del DJ (requiere PIN) ----------

@app.get("/api/dj/solicitudes")
def get_solicitudes_dj(x_dj_pin: Optional[str] = Header(default=None)):
    verificar_dj(x_dj_pin)
    return solicitudes


@app.put("/api/dj/orden")
def cambiar_orden(orden: NuevoOrden, x_dj_pin: Optional[str] = Header(default=None)):
    """Reordena la cola. `ids` debe contener exactamente las solicitudes pendientes."""
    verificar_dj(x_dj_pin)
    with _lock:
        pendientes = {s["id"]: s for s in cola()}
        if sorted(orden.ids) != sorted(pendientes):
            raise HTTPException(status_code=409,
                                detail="La cola cambió, recarga e intenta de nuevo")
        resto = [s for s in solicitudes if s["estado"] != "pendiente"]
        solicitudes[:] = resto + [pendientes[i] for i in orden.ids]
    return cola()


@app.post("/api/dj/solicitudes/{solicitud_id}/estado")
def cambiar_estado(solicitud_id: int, cambio: CambioEstado,
                   x_dj_pin: Optional[str] = Header(default=None)):
    verificar_dj(x_dj_pin)
    with _lock:
        s = buscar(solicitud_id)
        if cambio.estado == "sonando":
            # Solo una canción puede sonar a la vez
            for otra in solicitudes:
                if otra["estado"] == "sonando":
                    otra["estado"] = "cantada"
        s["estado"] = cambio.estado
    return s


@app.delete("/api/dj/solicitudes/{solicitud_id}")
def borrar_solicitud(solicitud_id: int, x_dj_pin: Optional[str] = Header(default=None)):
    verificar_dj(x_dj_pin)
    with _lock:
        solicitudes.remove(buscar(solicitud_id))
    return {"ok": True}
