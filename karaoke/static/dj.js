const $ = (id) => document.getElementById(id);
let pin = sessionStorage.getItem("karaoke-dj-pin");
let arrastrando = null;
let pendientes = [];

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

async function api(metodo, ruta, cuerpo) {
  const resp = await fetch(ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", "X-DJ-PIN": pin },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (resp.status === 401) {
    salir();
    throw new Error("PIN incorrecto");
  }
  return resp;
}

function info(s) {
  const artista = s.artista ? ` – ${escapar(s.artista)}` : "";
  const yt = s.youtube
    ? ` · <a class="yt" href="${escapar(s.youtube)}" target="_blank" rel="noopener noreferrer">▶ YouTube</a>`
    : "";
  return `
    <div class="info">
      <div class="titulo">${escapar(s.cancion)}${artista}</div>
      <div class="detalle">
        ${escapar(s.nombre)} · <span class="chip mesa-chip">Mesa ${escapar(s.mesa)}</span>
        <span class="chip">${escapar(s.genero)}</span>${yt}
      </div>
    </div>`;
}

function render(solicitudes) {
  pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const sonando = solicitudes.find((s) => s.estado === "sonando");
  const historial = solicitudes
    .filter((s) => s.estado === "cantada" || s.estado === "rechazada")
    .reverse();

  $("total").textContent = pendientes.length;

  $("sonando").innerHTML = sonando
    ? `<div class="sonando">
         <div class="etiqueta">♪ SONANDO AHORA</div>
         <div class="item" style="background:none;padding:0">
           ${info(sonando)}
           <div class="acciones">
             <button class="chico ok" data-accion="cantada" data-id="${sonando.id}">✓ Terminó</button>
           </div>
         </div>
       </div>`
    : "";

  $("cola").innerHTML = pendientes.length
    ? pendientes.map((s, i) => `
        <li class="item" draggable="true" data-id="${s.id}">
          <span class="num">${i + 1}</span>
          ${info(s)}
          <div class="acciones">
            <button class="chico sec" data-accion="subir" data-id="${s.id}" title="Subir">▲</button>
            <button class="chico sec" data-accion="bajar" data-id="${s.id}" title="Bajar">▼</button>
            <button class="chico ok" data-accion="sonando" data-id="${s.id}">▶ Poner</button>
            <button class="chico peligro" data-accion="rechazada" data-id="${s.id}" title="Rechazar">✕</button>
          </div>
        </li>`).join("")
    : `<li class="vacio">No hay canciones en espera</li>`;

  $("historial").innerHTML = historial.length
    ? historial.map((s) => `
        <li class="item">
          ${info(s)}
          <span class="chip">${s.estado === "cantada" ? "Cantada" : "Rechazada"}</span>
          <div class="acciones">
            <button class="chico sec" data-accion="pendiente" data-id="${s.id}" title="Regresar a la cola">↩</button>
          </div>
        </li>`).join("")
    : `<li class="vacio">Aún no se ha cantado nada</li>`;
}

async function cargar() {
  if (arrastrando) return; // No redibujar mientras el DJ arrastra
  try {
    const resp = await api("GET", "/api/dj/solicitudes");
    render(await resp.json());
  } catch {
    // Se reintenta en el siguiente ciclo
  }
}

async function guardarOrden(ids) {
  const resp = await api("PUT", "/api/dj/orden", { ids });
  if (!resp.ok) alert((await resp.json()).detail);
  await cargar();
}

async function cambiarEstado(id, estado) {
  await api("POST", `/api/dj/solicitudes/${id}/estado`, { estado });
  await cargar();
}

function mover(id, delta) {
  const ids = pendientes.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  guardarOrden(ids);
}

// Botones (delegación de eventos)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const accion = btn.dataset.accion;
  if (accion === "subir") mover(id, -1);
  else if (accion === "bajar") mover(id, 1);
  else cambiarEstado(id, accion);
});

$("siguiente").addEventListener("click", () => {
  if (pendientes.length) cambiarEstado(pendientes[0].id, "sonando");
});

// Arrastrar y soltar para reordenar
const lista = $("cola");
lista.addEventListener("dragstart", (e) => {
  arrastrando = e.target.closest(".item");
  arrastrando.classList.add("arrastrando");
});
lista.addEventListener("dragover", (e) => {
  e.preventDefault();
  const destino = e.target.closest(".item");
  lista.querySelectorAll(".destino").forEach((el) => el.classList.remove("destino"));
  if (destino && destino !== arrastrando) destino.classList.add("destino");
});
lista.addEventListener("drop", (e) => {
  e.preventDefault();
  const destino = e.target.closest(".item");
  if (destino && arrastrando && destino !== arrastrando) {
    const ids = pendientes.map((s) => s.id);
    const desde = ids.indexOf(Number(arrastrando.dataset.id));
    const hacia = ids.indexOf(Number(destino.dataset.id));
    ids.splice(hacia, 0, ids.splice(desde, 1)[0]);
    arrastrando = null;
    guardarOrden(ids);
  }
});
lista.addEventListener("dragend", () => {
  arrastrando = null;
  cargar();
});

// Login
function mostrarPanel(visible) {
  $("login").classList.toggle("oculto", visible);
  $("panel").classList.toggle("oculto", !visible);
}

function salir() {
  pin = null;
  sessionStorage.removeItem("karaoke-dj-pin");
  mostrarPanel(false);
}

$("salir").addEventListener("click", salir);

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  pin = $("pin").value;
  const resp = await fetch("/api/dj/solicitudes", { headers: { "X-DJ-PIN": pin } });
  if (resp.ok) {
    sessionStorage.setItem("karaoke-dj-pin", pin);
    $("pin").value = "";
    $("error-login").classList.add("oculto");
    mostrarPanel(true);
    render(await resp.json());
  } else {
    $("error-login").textContent = "PIN incorrecto";
    $("error-login").classList.remove("oculto");
  }
});

if (pin) {
  mostrarPanel(true);
  cargar();
}
setInterval(() => pin && cargar(), 3000);
