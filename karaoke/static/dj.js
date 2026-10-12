const $ = (id) => document.getElementById(id);
let pin = sessionStorage.getItem("karaoke-dj-pin");
let arrastrando = null;
let pendientes = [];
let mesaResaltada = null;

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

// Cada mesa tiene siempre el mismo color, para reconocerla de un vistazo
function colorMesa(mesa) {
  const texto = String(mesa).trim().toLowerCase();
  let n = parseInt(texto, 10);
  if (Number.isNaN(n)) n = [...texto].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${(n * 47) % 360} 85% 62%)`;
}

function insigniaMesa(mesa) {
  return `<span class="mesa-badge" style="--mesa:${colorMesa(mesa)}"><small>MESA</small>${escapar(mesa)}</span>`;
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
        🎤 ${escapar(s.nombre)} · <span class="chip">${escapar(s.genero)}</span>${yt}
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

  // Resumen: cuántas canciones en espera tiene cada mesa (toca una para resaltarla)
  const porMesa = new Map();
  for (const s of pendientes) porMesa.set(s.mesa, (porMesa.get(s.mesa) || 0) + 1);
  if (mesaResaltada && !porMesa.has(mesaResaltada)) mesaResaltada = null;
  $("resumen-mesas").innerHTML = [...porMesa]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "es", { numeric: true }))
    .map(([mesa, n]) => `
      <button class="mesa-filtro ${mesa === mesaResaltada ? "activa" : ""}" data-mesa="${escapar(mesa)}"
              style="--mesa:${colorMesa(mesa)}">Mesa ${escapar(mesa)} <b>${n}</b></button>`)
    .join("");

  $("sonando").innerHTML = sonando
    ? `<div class="sonando">
         <div class="etiqueta">♪ SONANDO AHORA</div>
         <div class="item" style="background:none;padding:0">
           ${insigniaMesa(sonando.mesa)}
           ${info(sonando)}
           <div class="acciones">
             <button class="chico ok" data-accion="cantada" data-id="${sonando.id}">✓ Terminó</button>
           </div>
         </div>
       </div>`
    : "";

  $("cola").innerHTML = pendientes.length
    ? pendientes.map((s, i) => `
        <li class="item mesa-borde ${mesaResaltada && s.mesa !== mesaResaltada ? "atenuado" : ""}"
            draggable="true" data-id="${s.id}" style="--mesa:${colorMesa(s.mesa)}">
          <input class="pos" type="number" min="1" max="${pendientes.length}" value="${i + 1}"
                 data-id="${s.id}" aria-label="Posición en la cola" title="Escribe la posición y presiona Enter">
          ${insigniaMesa(s.mesa)}
          ${info(s)}
          <div class="acciones">
            <button class="chico sec" data-accion="primero" data-id="${s.id}" title="Mandar al primer lugar" ${i === 0 ? "disabled" : ""}>⤒</button>
            <button class="chico sec" data-accion="subir" data-id="${s.id}" title="Subir" ${i === 0 ? "disabled" : ""}>▲</button>
            <button class="chico sec" data-accion="bajar" data-id="${s.id}" title="Bajar" ${i === pendientes.length - 1 ? "disabled" : ""}>▼</button>
            <button class="chico sec" data-accion="ultimo" data-id="${s.id}" title="Mandar al último lugar" ${i === pendientes.length - 1 ? "disabled" : ""}>⤓</button>
            <button class="chico ok" data-accion="sonando" data-id="${s.id}">▶ Poner</button>
            <button class="chico peligro" data-accion="rechazada" data-id="${s.id}" title="Rechazar">✕</button>
          </div>
        </li>`).join("")
    : `<li class="vacio">No hay canciones en espera</li>`;

  $("historial").innerHTML = historial.length
    ? historial.map((s) => `
        <li class="item">
          ${insigniaMesa(s.mesa)}
          ${info(s)}
          <span class="chip">${s.estado === "cantada" ? "Cantada" : "Rechazada"}</span>
          <div class="acciones">
            <button class="chico sec" data-accion="pendiente" data-id="${s.id}" title="Regresar a la cola">↩</button>
          </div>
        </li>`).join("")
    : `<li class="vacio">Aún no se ha cantado nada</li>`;
}

async function cargar() {
  // No redibujar mientras el DJ arrastra o escribe una posición
  if (arrastrando || document.activeElement?.classList.contains("pos")) return;
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

// Pone la canción `id` en la posición `destino` (0 = primera)
function moverA(id, destino) {
  const ids = pendientes.map((s) => s.id);
  const desde = ids.indexOf(id);
  destino = Math.max(0, Math.min(ids.length - 1, destino));
  if (desde === -1 || desde === destino) return cargar();
  ids.splice(destino, 0, ids.splice(desde, 1)[0]);
  guardarOrden(ids);
}

function mover(id, delta) {
  moverA(id, pendientes.findIndex((s) => s.id === id) + delta);
}

// Botones (delegación de eventos)
document.addEventListener("click", (e) => {
  const filtro = e.target.closest(".mesa-filtro");
  if (filtro) {
    mesaResaltada = mesaResaltada === filtro.dataset.mesa ? null : filtro.dataset.mesa;
    cargar();
    return;
  }
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const accion = btn.dataset.accion;
  if (accion === "subir") mover(id, -1);
  else if (accion === "bajar") mover(id, 1);
  else if (accion === "primero") moverA(id, 0);
  else if (accion === "ultimo") moverA(id, pendientes.length - 1);
  else cambiarEstado(id, accion);
});

$("siguiente").addEventListener("click", () => {
  if (pendientes.length) cambiarEstado(pendientes[0].id, "sonando");
});

// Escribir la posición exacta: se aplica al presionar Enter o al salir del campo
document.addEventListener("change", (e) => {
  if (!e.target.classList.contains("pos")) return;
  const valor = parseInt(e.target.value, 10);
  if (Number.isNaN(valor)) return cargar();
  e.target.blur();
  moverA(Number(e.target.dataset.id), valor - 1);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("pos")) e.target.blur();
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
