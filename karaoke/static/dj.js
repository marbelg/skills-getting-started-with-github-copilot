const $ = (id) => document.getElementById(id);
let pin = sessionStorage.getItem("karaoke-dj-pin");
let arrastrando = null;
let solicitudes = [];
let pendientes = [];
let mesas = [];
let mesaResaltada = null;
let pestana = "cola";
let vista = "orden";        // "orden" o "mesa"
let editandoId = null;      // solicitud cuyo identificador se está editando
let statsCantantes = new Map();

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

// ---------- Mesas: color y nombre ----------

const esBarra = (mesa) => mesa === "Barra";

// Cada mesa tiene siempre el mismo color; la Barra siempre es dorada
function colorMesa(mesa) {
  if (esBarra(mesa)) return "hsl(45 95% 58%)";
  const texto = String(mesa).trim().toLowerCase();
  let n = parseInt(texto, 10);
  if (Number.isNaN(n)) n = [...texto].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${(n * 47) % 360} 85% 62%)`;
}

const nombreMesa = (mesa) => (esBarra(mesa) ? "🍸 Barra" : `Mesa ${mesa}`);

function insigniaMesa(mesa) {
  const contenido = esBarra(mesa) ? "<small>BARRA</small>🍸" : `<small>MESA</small>${escapar(mesa)}`;
  return `<span class="mesa-badge" style="--mesa:${colorMesa(mesa)}">${contenido}</span>`;
}

// ---------- Calificaciones ----------

function estrellas(s) {
  const actual = s.calificacion || 0;
  const botones = [1, 2, 3, 4, 5].map((n) => `
    <button class="estrella ${n <= actual ? "llena" : ""}" data-accion="calificar" data-valor="${n}"
            data-id="${s.id}" aria-label="${n} estrella${n > 1 ? "s" : ""}">★</button>`).join("");
  return `<div class="estrellas" role="group" aria-label="Calificación">${botones}</div>`;
}

const promedio = (lista) => {
  const notas = lista.map((s) => s.calificacion).filter(Boolean);
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
};

const fmt = (n) => (n == null ? "–" : n.toFixed(1));

// ---------- Cantantes: identificador y frecuencia ----------

// Un cantante es su identificador (si el DJ le puso uno) o su mesa + nombre
const grupoCantante = (s) =>
  s.identificador ? `id:${s.identificador.trim().toLowerCase()}` : `k:${s.mesa}|${s.nombre.trim().toLowerCase()}`;

function calcularCantantes() {
  const mapa = new Map();
  for (const s of solicitudes) {
    const g = grupoCantante(s);
    if (!mapa.has(g)) mapa.set(g, { grupo: g, identificador: s.identificador, nombres: new Set(), mesas: new Set(),
                                    veces: 0, ultima: null, enCola: 0, notas: [], ejemplo: s });
    const c = mapa.get(g);
    c.nombres.add(s.nombre.trim());
    c.mesas.add(s.mesa);
    if (s.estado === "pendiente") c.enCola++;
    if (s.estado === "cantada" || s.estado === "sonando") {
      c.veces++;
      if (s.cantada_en && (!c.ultima || s.cantada_en > c.ultima)) c.ultima = s.cantada_en;
    }
    if (s.calificacion) c.notas.push(s.calificacion);
  }
  return mapa;
}

function hace(iso) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60} min`;
}

function frecuencia(c) {
  if (!c || !c.veces) return `<span class="chip nuevo">🆕 primera vez</span>`;
  const veces = c.veces === 1 ? "1 vez" : `${c.veces} veces`;
  return `<span class="chip frec">🔁 ${veces}${c.ultima ? ` · ${hace(c.ultima)}` : ""}</span>`;
}

function chipIdentificador(s) {
  if (editandoId === s.id) {
    return `<input id="id-edit" class="id-input" maxlength="30" value="${escapar(s.identificador || "")}"
                   data-id="${s.id}" placeholder="Ej. Gorra roja" aria-label="Identificador del cantante">`;
  }
  return s.identificador
    ? `<button class="chip-id" data-editar-id="${s.id}" title="Cambiar identificador">🏷️ ${escapar(s.identificador)}</button>`
    : `<button class="chip-id vacio-id" data-editar-id="${s.id}">🏷️ Agregar ID</button>`;
}

// ---------- Render ----------

function info(s, conCantante = true) {
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
      ${conCantante ? `<div class="detalle cantante">
        ${chipIdentificador(s)} ${frecuencia(statsCantantes.get(grupoCantante(s)))}
      </div>` : ""}
    </div>`;
}

function itemCola(s, i, conPosicion) {
  const ultimo = pendientes.length - 1;
  const posicion = conPosicion
    ? `<input class="pos" type="number" min="1" max="${pendientes.length}" value="${i + 1}"
              data-id="${s.id}" aria-label="Posición en la cola" title="Escribe la posición y presiona Enter">`
    : `<span class="num" title="Lugar en la cola">${i + 1}</span>`;
  return `
    <li class="item mesa-borde ${mesaResaltada && s.mesa !== mesaResaltada ? "atenuado" : ""}"
        ${conPosicion ? 'draggable="true"' : ""} data-id="${s.id}" style="--mesa:${colorMesa(s.mesa)}">
      ${posicion}
      ${insigniaMesa(s.mesa)}
      ${info(s)}
      <div class="acciones">
        <button class="chico sec" data-accion="primero" data-id="${s.id}" title="Mandar al primer lugar" ${i === 0 ? "disabled" : ""}>⤒</button>
        <button class="chico sec" data-accion="subir" data-id="${s.id}" title="Subir" ${i === 0 ? "disabled" : ""}>▲</button>
        <button class="chico sec" data-accion="bajar" data-id="${s.id}" title="Bajar" ${i === ultimo ? "disabled" : ""}>▼</button>
        <button class="chico sec" data-accion="ultimo" data-id="${s.id}" title="Mandar al último lugar" ${i === ultimo ? "disabled" : ""}>⤓</button>
        <button class="chico ok" data-accion="sonando" data-id="${s.id}">▶ Poner</button>
        <button class="chico peligro" data-accion="rechazada" data-id="${s.id}" title="Rechazar">✕</button>
      </div>
    </li>`;
}

function render() {
  statsCantantes = calcularCantantes();
  pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const sonando = solicitudes.find((s) => s.estado === "sonando");
  const cantadas = solicitudes.filter((s) => s.estado === "cantada");
  const historial = solicitudes
    .filter((s) => s.estado === "cantada" || s.estado === "rechazada")
    .reverse();

  // Resumen de arriba
  const porMesa = new Map();
  for (const s of pendientes) porMesa.set(s.mesa, (porMesa.get(s.mesa) || 0) + 1);
  $("st-cola").textContent = pendientes.length;
  $("st-cantadas").textContent = cantadas.length;
  $("st-mesas").textContent = porMesa.size;
  $("st-promedio").textContent = fmt(promedio([...cantadas, ...(sonando ? [sonando] : [])]));
  $("total").textContent = pendientes.length;
  $("siguiente").disabled = !pendientes.length;

  // Mesas con canciones en espera (toca una para resaltarla)
  if (mesaResaltada && !porMesa.has(mesaResaltada)) mesaResaltada = null;
  $("resumen-mesas").innerHTML = [...porMesa]
    .sort((a, b) => mesas.indexOf(a[0]) - mesas.indexOf(b[0]))
    .map(([mesa, n]) => `
      <button class="mesa-filtro ${mesa === mesaResaltada ? "activa" : ""}" data-mesa="${escapar(mesa)}"
              style="--mesa:${colorMesa(mesa)}">${escapar(nombreMesa(mesa))} <b>${n}</b></button>`)
    .join("");

  $("sonando").innerHTML = sonando
    ? `<div class="sonando">
         <div class="etiqueta">♪ SONANDO AHORA</div>
         <div class="item" style="background:none;padding:0">
           ${insigniaMesa(sonando.mesa)}
           ${info(sonando)}
           <div class="acciones">
             ${estrellas(sonando)}
             <button class="chico ok" data-accion="cantada" data-id="${sonando.id}">✓ Terminó</button>
           </div>
         </div>
       </div>`
    : "";

  // Vista "En orden": la cola tal cual. Vista "Por mesa": agrupada, con su lugar en la cola.
  document.querySelectorAll(".vista").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === vista)));
  $("cola").classList.toggle("oculto", vista !== "orden");
  $("cola-por-mesa").classList.toggle("oculto", vista !== "mesa");
  const vacia = `<li class="vacio">No hay canciones en espera</li>`;
  if (vista === "orden") {
    $("cola").innerHTML = pendientes.length ? pendientes.map((s, i) => itemCola(s, i, true)).join("") : vacia;
    $("cola-por-mesa").innerHTML = "";
  } else {
    $("cola").innerHTML = "";
    const grupos = [...porMesa.keys()].sort((a, b) => mesas.indexOf(a) - mesas.indexOf(b));
    $("cola-por-mesa").innerHTML = grupos.length
      ? grupos.map((m) => `
          <div class="grupo-mesa ${mesaResaltada && m !== mesaResaltada ? "atenuado" : ""}" style="--mesa:${colorMesa(m)}">
            <div class="grupo-cab"><b>${escapar(nombreMesa(m))}</b>
              <span class="cuenta">${porMesa.get(m)} ${porMesa.get(m) === 1 ? "canción" : "canciones"}</span></div>
            <ol class="lista">${pendientes.map((s, i) => (s.mesa === m ? itemCola(s, i, false) : "")).join("")}</ol>
          </div>`).join("")
      : `<ul class="lista">${vacia}</ul>`;
  }

  $("historial").innerHTML = historial.length
    ? historial.map((s) => `
        <li class="item">
          ${insigniaMesa(s.mesa)}
          ${info(s)}
          <div class="acciones">
            ${s.estado === "cantada" ? estrellas(s) : `<span class="chip rechazada">Rechazada</span>`}
            <button class="chico sec" data-accion="pendiente" data-id="${s.id}" title="Regresar a la cola">↩</button>
          </div>
        </li>`).join("")
    : `<li class="vacio">Aún no se ha cantado nada</li>`;

  renderMesas();
  renderCantantes();
  renderCalificaciones();

  const edit = $("id-edit");
  if (edit && document.activeElement !== edit) { edit.focus(); edit.select(); }
}

function renderCantantes() {
  const lista = [...statsCantantes.values()].sort((a, b) => b.veces - a.veces || (b.ultima || "").localeCompare(a.ultima || ""));
  const max = Math.max(1, ...lista.map((c) => c.veces));
  $("lista-cantantes").innerHTML = lista.length
    ? lista.map((c) => {
        const mesa = [...c.mesas][0];
        const nombres = [...c.nombres].join(", ");
        const prom = c.notas.length ? c.notas.reduce((a, b) => a + b, 0) / c.notas.length : null;
        return `
          <li class="item">
            ${insigniaMesa(mesa)}
            <div class="info">
              <div class="titulo">${c.identificador ? `🏷️ ${escapar(c.identificador)}` : escapar(nombres)}</div>
              <div class="detalle">${c.identificador ? `🎤 ${escapar(nombres)} · ` : ""}${c.enCola ? `${c.enCola} en cola · ` : ""}${
                c.veces ? `última ${hace(c.ultima)}` : "aún no canta"}${prom ? ` · ${fmt(prom)} ⭐` : ""}</div>
              <div class="barra-prom"><span style="width:${(c.veces / max) * 100}%;background:${colorMesa(mesa)}"></span></div>
            </div>
            <span class="nota-grande veces">${c.veces}<small>${c.veces === 1 ? "vez" : "veces"}</small></span>
          </li>`;
      }).join("")
    : `<li class="vacio">Cuando las mesas pidan canciones, aquí verás a cada cantante y cuántas veces ha cantado.</li>`;
}

function renderMesas() {
  if (document.activeElement !== $("cantidad-mesas")) {
    $("cantidad-mesas").value = mesas.filter((m) => !esBarra(m)).length || "";
  }
  $("grid-mesas").innerHTML = mesas.map((m) => {
    const deMesa = solicitudes.filter((s) => s.mesa === m);
    const enCola = deMesa.filter((s) => s.estado === "pendiente").length;
    const cantadas = deMesa.filter((s) => s.estado === "cantada").length;
    const prom = promedio(deMesa);
    return `
      <div class="mesa-tile ${enCola ? "" : "sin-pedidos"}" style="--mesa:${colorMesa(m)}">
        <div class="mesa-tile-nombre">${escapar(nombreMesa(m))}</div>
        <div class="mesa-tile-datos">
          <span><b>${enCola}</b> en cola</span>
          <span><b>${cantadas}</b> cantadas</span>
          <span><b>${fmt(prom)}</b> ⭐</span>
        </div>
        <button class="chico sec" data-copiar="${escapar(m)}">Copiar link</button>
      </div>`;
  }).join("");
}

function renderCalificaciones() {
  const calificadas = solicitudes
    .filter((s) => s.calificacion)
    .sort((a, b) => b.calificacion - a.calificacion);
  $("ranking").innerHTML = calificadas.length
    ? calificadas.map((s, i) => `
        <li class="item">
          <span class="num ${i < 3 ? `podio-${i + 1}` : ""}">${i + 1}</span>
          ${insigniaMesa(s.mesa)}
          ${info(s, false)}
          <span class="nota-grande">${"★".repeat(s.calificacion)}<span class="apagada">${"★".repeat(5 - s.calificacion)}</span></span>
        </li>`).join("")
    : `<li class="vacio">Todavía no hay calificaciones. Califica desde la canción que suena o desde el historial.</li>`;

  const filas = mesas
    .map((m) => ({ m, prom: promedio(solicitudes.filter((s) => s.mesa === m)) }))
    .filter((x) => x.prom != null)
    .sort((a, b) => b.prom - a.prom);
  $("promedio-mesas").innerHTML = filas.length
    ? filas.map(({ m, prom }) => `
        <li class="item">
          ${insigniaMesa(m)}
          <div class="info">
            <div class="titulo">${escapar(nombreMesa(m))}</div>
            <div class="barra-prom"><span style="width:${(prom / 5) * 100}%;background:${colorMesa(m)}"></span></div>
          </div>
          <span class="nota-grande">${fmt(prom)} ⭐</span>
        </li>`).join("")
    : `<li class="vacio">Aquí aparecerá el promedio de cada mesa.</li>`;
}

// ---------- Datos ----------

async function cargar() {
  // No redibujar mientras el DJ arrastra o escribe una posición o un identificador
  const activo = document.activeElement?.classList;
  if (arrastrando || activo?.contains("pos") || activo?.contains("id-input")) return;
  try {
    const [rs, rm] = await Promise.all([api("GET", "/api/dj/solicitudes"), api("GET", "/api/dj/mesas")]);
    solicitudes = await rs.json();
    mesas = (await rm.json()).mesas;
    render();
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

async function calificar(id, valor) {
  const s = solicitudes.find((x) => x.id === id);
  const estrellasNuevas = s && s.calificacion === valor ? 0 : valor; // misma estrella = quitar
  await api("POST", `/api/dj/solicitudes/${id}/calificacion`, { estrellas: estrellasNuevas });
  await cargar();
}

async function guardarIdentificador(input) {
  const s = solicitudes.find((x) => x.id === Number(input.dataset.id));
  editandoId = null;
  if (s && input.value.trim() !== (s.identificador || "")) {
    await api("PUT", "/api/dj/cantantes", { mesa: s.mesa, nombre: s.nombre, identificador: input.value.trim() });
  }
  input.blur();
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

// ---------- Eventos ----------

document.addEventListener("click", async (e) => {
  const tab = e.target.closest(".tab");
  if (tab) return mostrarPestana(tab.dataset.tab);

  const v = e.target.closest(".vista");
  if (v) { vista = v.dataset.vista; return render(); }

  const editar = e.target.closest("[data-editar-id]");
  if (editar) { editandoId = Number(editar.dataset.editarId); return render(); }

  const filtro = e.target.closest(".mesa-filtro");
  if (filtro) {
    mesaResaltada = mesaResaltada === filtro.dataset.mesa ? null : filtro.dataset.mesa;
    return render();
  }

  const copiar = e.target.closest("[data-copiar]");
  if (copiar) {
    const link = `${location.origin}/?mesa=${encodeURIComponent(copiar.dataset.copiar)}`;
    try {
      await navigator.clipboard.writeText(link);
      copiar.textContent = "✓ Copiado";
    } catch {
      copiar.textContent = link;
    }
    setTimeout(() => (copiar.textContent = "Copiar link"), 2500);
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
  else if (accion === "calificar") calificar(id, Number(btn.dataset.valor));
  else cambiarEstado(id, accion);
});

$("siguiente").addEventListener("click", () => {
  if (pendientes.length) cambiarEstado(pendientes[0].id, "sonando");
});

$("form-mesas").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cantidad = parseInt($("cantidad-mesas").value, 10);
  const resp = await api("PUT", "/api/dj/mesas", { cantidad });
  const el = $("mensaje-mesas");
  if (resp.ok) {
    el.textContent = `Listo: hay ${cantidad} mesas y la Barra.`;
    el.className = "mensaje ok";
  } else {
    el.textContent = "Escribe un número de 1 a 200.";
    el.className = "mensaje error";
  }
  setTimeout(() => el.classList.add("oculto"), 4000);
  $("cantidad-mesas").blur();
  await cargar();
});

// Escribir la posición exacta: se aplica al presionar Enter o al salir del campo
document.addEventListener("change", (e) => {
  if (!e.target.classList.contains("pos")) return;
  const valor = parseInt(e.target.value, 10);
  e.target.blur();
  if (Number.isNaN(valor)) return cargar();
  moverA(Number(e.target.dataset.id), valor - 1);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("pos")) e.target.blur();
  if (e.target.classList.contains("id-input")) {
    if (e.key === "Enter") guardarIdentificador(e.target);
    if (e.key === "Escape") { editandoId = null; e.target.blur(); render(); }
  }
});
document.addEventListener("focusout", (e) => {
  if (e.target.classList.contains("id-input") && editandoId !== null) guardarIdentificador(e.target);
});

// Arrastrar y soltar para reordenar
const lista = $("cola");
lista.addEventListener("dragstart", (e) => {
  arrastrando = e.target.closest(".item");
  arrastrando?.classList.add("arrastrando");
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

// ---------- Pestañas y login ----------

function mostrarPestana(nombre) {
  pestana = nombre;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === nombre)));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("oculto", p.id !== `tab-${nombre}`));
}

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
    cargar();
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
