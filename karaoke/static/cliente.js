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
    mostrarMensaje("¡Listo! Tu canción fue enviada al DJ. Estate atento: te llamarán cuando sea tu turno.", "ok");
    // Se conservan mesa y nombre para pedir otra más rápido
    ["cancion", "artista", "youtube"].forEach((id) => ($(id).value = ""));
    $("genero").value = "";
    localStorage.setItem("karaoke-mesa", datos.mesa);
    localStorage.setItem("karaoke-nombre", datos.nombre);
  } else {
    const detalle = Array.isArray(json.detail)
      ? json.detail.map((d) => d.msg.replace("Value error, ", "")).join(". ")
      : json.detail;
    mostrarMensaje(detalle || "No se pudo enviar la canción", "error");
  }
});

// Las mesas las crea el DJ; la Barra siempre está al final.
// La mesa puede venir en la URL (QR por mesa): /static/index.html?mesa=7
async function cargarMesas() {
  const mesas = await (await fetch("/api/mesas")).json();
  for (const m of mesas) {
    const op = document.createElement("option");
    op.value = m;
    op.textContent = m === "Barra" ? "🍸 Barra (no estoy en mesa)" : `Mesa ${m}`;
    $("mesa").append(op);
  }
  const deseada = new URLSearchParams(location.search).get("mesa") || localStorage.getItem("karaoke-mesa") || "";
  const encontrada = mesas.find((m) => m.toLowerCase() === deseada.toLowerCase());
  if (encontrada) $("mesa").value = encontrada;
}

$("nombre").value = localStorage.getItem("karaoke-nombre") || "";

function mostrarCreditos() {
  if (typeof CREDITOS === "undefined") return;
  $("creditos-nombre").textContent = CREDITOS.nombre || "MoonDev";
  const enlaces = [];
  const agregar = (href, icono, texto) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = `${icono} ${texto}`;
    if (href.startsWith("http")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    enlaces.push(a);
  };
  const wa = (CREDITOS.whatsapp || "").replace(/\D/g, "");
  if (wa) agregar(`https://wa.me/${wa}`, "💬", "WhatsApp");
  if (CREDITOS.telefono) agregar(`tel:${CREDITOS.telefono.replace(/[^\d+]/g, "")}`, "📞", CREDITOS.telefono);
  if (CREDITOS.email) agregar(`mailto:${CREDITOS.email}`, "✉️", CREDITOS.email);
  if (CREDITOS.instagram) agregar(`https://instagram.com/${CREDITOS.instagram.replace(/^@/, "")}`, "📸", `@${CREDITOS.instagram.replace(/^@/, "")}`);
  if (CREDITOS.web) agregar(CREDITOS.web, "🌐", CREDITOS.web.replace(/^https?:\/\//, ""));
  $("creditos-contacto").replaceChildren(...enlaces);
}

mostrarCreditos();
cargarGeneros();
cargarMesas();
