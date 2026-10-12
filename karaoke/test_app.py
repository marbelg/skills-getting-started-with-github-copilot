import pytest
from fastapi.testclient import TestClient

from karaoke import app as karaoke

client = TestClient(karaoke.app)
DJ = {"X-DJ-PIN": karaoke.DJ_PIN}


@pytest.fixture(autouse=True)
def limpiar():
    karaoke.solicitudes.clear()


def pedir(**extra):
    datos = {"mesa": "5", "nombre": "Ana", "cancion": "Amor eterno",
             "artista": "Rocío Dúrcal", "genero": "Balada", **extra}
    return client.post("/api/solicitudes", json=datos)


def dj_cola():
    todas = client.get("/api/dj/solicitudes", headers=DJ).json()
    return [s for s in todas if s["estado"] == "pendiente"]


def test_mesa_pide_cancion_y_le_llega_al_dj():
    resp = pedir()
    assert resp.status_code == 201
    assert "youtube" not in resp.json()
    assert dj_cola()[0]["cancion"] == "Amor eterno"


def test_mesas_no_pueden_ver_la_fila():
    pedir()
    assert client.get("/api/cola").status_code == 404
    assert client.get("/api/dj/solicitudes").status_code == 401


def test_youtube_opcional_y_validado():
    assert pedir(youtube="https://youtu.be/abc").status_code == 201
    assert pedir(youtube="").status_code == 201
    assert pedir(youtube="https://evil.com/x").status_code == 422


def test_genero_invalido():
    assert pedir(genero="Inventado").status_code == 422


def test_limite_por_mesa():
    for _ in range(karaoke.MAX_PENDIENTES_POR_MESA):
        assert pedir().status_code == 201
    assert pedir().status_code == 429
    assert pedir(mesa="6").status_code == 201


def test_dj_requiere_pin():
    assert client.get("/api/dj/solicitudes").status_code == 401
    assert client.get("/api/dj/solicitudes", headers={"X-DJ-PIN": "mal"}).status_code == 401
    assert client.get("/api/dj/solicitudes", headers=DJ).status_code == 200


def test_dj_reordena_cola():
    a = pedir(mesa="1").json()["id"]
    b = pedir(mesa="2").json()["id"]
    c = pedir(mesa="3").json()["id"]
    resp = client.put("/api/dj/orden", json={"ids": [c, a, b]}, headers=DJ)
    assert resp.status_code == 200
    assert [s["id"] for s in dj_cola()] == [c, a, b]
    # Orden incompleto se rechaza
    assert client.put("/api/dj/orden", json={"ids": [a, b]}, headers=DJ).status_code == 409


def test_solo_una_cancion_sonando():
    a = pedir(mesa="1").json()["id"]
    b = pedir(mesa="2").json()["id"]
    client.post(f"/api/dj/solicitudes/{a}/estado", json={"estado": "sonando"}, headers=DJ)
    client.post(f"/api/dj/solicitudes/{b}/estado", json={"estado": "sonando"}, headers=DJ)
    todas = {s["id"]: s["estado"] for s in client.get("/api/dj/solicitudes", headers=DJ).json()}
    assert todas == {a: "cantada", b: "sonando"}


def test_qr_por_mesa_conserva_numero():
    resp = client.get("/?mesa=7", follow_redirects=False)
    assert resp.headers["location"] == "/static/index.html?mesa=7"
