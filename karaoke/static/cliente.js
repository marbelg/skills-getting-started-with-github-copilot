const $ = (id) => document.getElementById(id);

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

function mostrarMensaje(texto, tipo) {
  const el = $("mensaje");
  el.textContent = texto;
  el.className = `mensaje ${tipo}`;
  setTimeout(() => el.classList.add("oculto"), 5000);
}

async function cargarGeneros() {
  const generos = await (await fetch("/api/generos")).json();
  for (const g of generos) {
    $("genero").insertAdjacentHTML("beforeend", `<option>${escapar(g)}</option>`);
  }
}

function lineaCancion(s) {
  const artista = s.artista ? ` – ${escapar(s.artista)}` : "";
  return `
    <div class="info">
      <div class="titulo">${escapar(s.cancion)}${artista}</div>
      <div class="detalle">
        ${escapar(s.nombre)} · <span class="chip mesa-chip">Mesa ${escapar(s.mesa)}</span>
        <span class="chip">${escapar(s.genero)}</span>
      </div>
    </div>`;
}

async function cargarCola() {
  try {
    const { sonando, siguientes } = await (await fetch("/api/cola")).json();
    $("sonando").innerHTML = sonando
      ? `<div class="sonando"><div class="etiqueta">♪ SONANDO AHORA</div>${lineaCancion(sonando)}</div>`
      : "";
    $("cola").innerHTML = siguientes.length
      ? siguientes.map((s, i) => `<li class="item"><span class="num">${i + 1}</span>${lineaCancion(s)}</li>`).join("")
      : `<li class="vacio">No hay canciones en espera. ¡Sé el primero!</li>`;
  } catch {
    // Se reintenta en el siguiente ciclo
  }
}

$("form-solicitud").addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = {
    mesa: $("mesa").value,
    nombre: $("nombre").value,
    cancion: $("cancion").value,
    artista: $("artista").value,
    genero: $("genero").value,
    youtube: $("youtube").value || null,
  };

  const resp = await fetch("/api/solicitudes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const json = await resp.json();

  if (resp.ok) {
    mostrarMensaje("¡Listo! Tu canción fue enviada al DJ.", "ok");
    // Se conservan mesa y nombre para pedir otra más rápido
    ["cancion", "artista", "youtube"].forEach((id) => ($(id).value = ""));
    $("genero").value = "";
    localStorage.setItem("karaoke-mesa", datos.mesa);
    localStorage.setItem("karaoke-nombre", datos.nombre);
    cargarCola();
  } else {
    const detalle = Array.isArray(json.detail)
      ? json.detail.map((d) => d.msg.replace("Value error, ", "")).join(". ")
      : json.detail;
    mostrarMensaje(detalle || "No se pudo enviar la canción", "error");
  }
});

// La mesa puede venir en la URL (QR por mesa): /static/index.html?mesa=7
const mesaUrl = new URLSearchParams(location.search).get("mesa");
$("mesa").value = mesaUrl || localStorage.getItem("karaoke-mesa") || "";
$("nombre").value = localStorage.getItem("karaoke-nombre") || "";

cargarGeneros();
cargarCola();
setInterval(cargarCola, 5000);
