// src/pantallas/LandingPreview.jsx
import React from "react";

/* --- imágenes de la galería (ponlas en /public/landing/) --- */
const gallery = [
  { id: 1,  src: "/landing/hero-dashboard.jpg",   title: "Panel de control" },
  { id: 2,  src: "/landing/live-tracking.jpg",     title: "Tracking en vivo" },
  { id: 3,  src: "/landing/courier-map.jpg",       title: "Mapa de mensajeros" },
  { id: 4,  src: "/landing/route-optimized.jpg",   title: "Rutas optimizadas" },
  { id: 5,  src: "/landing/eta-prediction.jpg",    title: "ETA y SLA" },
  { id: 6,  src: "/landing/scan-proof.jpg",        title: "Prueba de entrega" },
  { id: 7,  src: "/landing/analytics.jpg",         title: "Estadísticas" },
  { id: 8,  src: "/landing/orders-board.jpg",      title: "Órdenes en cola" },
  { id: 9,  src: "/landing/customer-sms.jpg",      title: "Notificaciones" },
  { id: 10, src: "/landing/fleet-overview.jpg",    title: "Flota y zonas" },
  { id: 11, src: "/landing/mobile-courier.jpg",    title: "App del mensajero" },
  { id: 12, src: "/landing/heatmap.jpg",           title: "Heatmap de entregas" },
];

export default function LandingPreview({
  onLogin = () => {},
  onRegister = () => {},
  onDemo = () => {},
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* ===== NAVBAR ===== */}
      <header className="sticky top-0 z-40 bg-black/70 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-white/10 grid place-items-center font-bold">EV</div>
            <span className="text-sm md:text-base font-semibold tracking-wide">Envíos · Logística en tiempo real</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            <a href="#features" className="hover:text-white">Características</a>
            <a href="#preview" className="hover:text-white">Vista previa</a>
            <a href="#planes" className="hover:text-white">Planes</a>
            <a href="#faq" className="hover:text-white">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={onDemo} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20">Probar demo</button>
            <button onClick={onLogin} className="px-3 py-2 rounded-xl bg-white text-black">Iniciar sesión</button>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_20%_0%,rgba(16,185,129,.15),rgba(0,0,0,0))] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-[1.05fr_.95fr] gap-10 items-center">
          {/* copy */}
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
              • En vivo — seguimiento, rutas y KPIs
            </span>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight">
              Gestiona tus <span className="text-emerald-300">entregas</span> con precisión,
              <br className="hidden md:block" /> en un solo lugar.
            </h1>
            <p className="mt-4 text-white/70 max-w-xl">
              Crea órdenes, asigna mensajeros, optimiza rutas, predice tiempos y comparte el tracking con tus clientes.
              Todo sincronizado en tiempo real.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button onClick={onRegister} className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-medium">
                Crear cuenta gratis
              </button>
              <button onClick={onDemo} className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20">
                Explorar demo (solo lectura)
              </button>
            </div>

            {/* quick KPIs */}
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              <MiniStat label="Órdenes/mes" value="50–∞" />
              <MiniStat label="Asignación" value="1 clic" />
              <MiniStat label="Actualización" value="Tiempo real" />
            </div>
          </div>

          {/* mock dashboard */}
          <div className="relative">
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-[0_20px_60px_-20px_rgba(16,185,129,.25)]">
              <div className="px-4 py-3 text-sm border-b border-white/10 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-white/70">Panel de envíos (vista previa)</span>
              </div>
              <div className="p-4 md:p-6 grid md:grid-cols-3 gap-4">
                <CardLite title="Órdenes de hoy" value="128" sub="+12% vs ayer" />
                <CardLite title="En ruta" value="42" sub="ETA promedio 19min" />
                <CardLite title="Entregadas" value="79" sub="SLA 94%" />
                <div className="md:col-span-2 rounded-xl border border-white/10 bg-black/30 p-3">
                  <FakeChart />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <FakeList />
                </div>
              </div>
            </div>
            {/* glow */}
            <div className="absolute -inset-6 rounded-[28px] pointer-events-none bg-[radial-gradient(40%_30%_at_50%_0%,rgba(16,185,129,.25),rgba(0,0,0,0))]" />
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-4">
          <Feature icon="📍" title="Tracking en vivo" desc="Ubicación de mensajeros y destinatarios con actualización en tiempo real." />
          <Feature icon="🧭" title="Rutas optimizadas" desc="Secuencias inteligentes por cercanía, tráfico y ventanas horarias." />
          <Feature icon="⏱️" title="ETA & SLA" desc="Compromisos de tiempo y alertas cuando algo se desvía del plan." />
          <Feature icon="📊" title="Analytics" desc="KPIs por franja, mensajero, zona y desempeño de la flota." />
        </div>
      </section>

      {/* ===== MASONRY PREVIEW ===== */}
      <section id="preview" className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-semibold">Vista previa</h2>
          <button onClick={onDemo} className="text-sm px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20">Abrir demo</button>
        </div>

        {/* masonry via CSS columns (sin libs) */}
        <div className="columns-1 sm:columns-2 lg:columns-4 gap-4 [&>*]:mb-4">
          {gallery.map((g) => (
            <figure key={g.id} className="break-inside-avoid rounded-2xl overflow-hidden border border-white/10 bg-white/5 group relative">
              <img
                src={g.src}
                alt={g.title}
                className="w-full h-auto block object-cover group-hover:opacity-90 transition"
                onError={(e) => {
                  // si no existe la imagen, muestro placeholder elegante
                  e.currentTarget.outerHTML = `
                    <div class="aspect-[4/5] grid place-items-center text-white/40 text-xs bg-neutral-900/40">
                      ${g.title}
                    </div>`;
                }}
              />
              <figcaption className="absolute bottom-0 left-0 right-0 p-3 text-xs bg-gradient-to-t from-black/70 to-transparent">
                <span className="text-white/90">{g.title}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ===== PLANES ===== */}
      <section id="planes" className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-4">
          <Plan
            name="Free"
            price="$0"
            bullets={[
              "1 admin • 1 operador • 1 mensajero",
              "Hasta 50 órdenes/mes",
              "Vista previa de mapas y stats",
            ]}
            cta="Comenzar"
            onClick={onRegister}
          />
          <Plan
            focus
            name="Básico"
            price="$8"
            bullets={[
              "1 admin • 2 operadores • 1 mensajero",
              "Hasta 300 órdenes/mes",
              "Estadísticas y auditoría",
            ]}
            cta="Elegir Básico"
            onClick={onRegister}
          />
          <Plan
            name="Ilimitado"
            price="$999"
            bullets={[
              "Usuarios y órdenes ilimitados",
              "SLAs avanzados y API",
              "Soporte priorizado",
            ]}
            cta="Contactar"
            onClick={onRegister}
          />
        </div>
      </section>

      {/* ===== CTA SEGURIDAD ===== */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="h-12 w-12 rounded-2xl bg-emerald-400/10 grid place-items-center text-2xl">🔒</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Seguridad y control</h3>
            <p className="text-sm text-white/70">
              Reglas de Firestore, auditoría de cambios y límites por plan. Tus datos viajan cifrados y se sincronizan en tiempo real.
            </p>
          </div>
          <button onClick={onRegister} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">Crear cuenta</button>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer id="faq" className="border-t border-white/10 py-6 text-center text-white/50 text-sm">
        <div className="max-w-7xl mx-auto px-4">
          © {new Date().getFullYear()} Envíos. Hecho para operar rápido.
        </div>
      </footer>
    </div>
  );
}

/* -------------- subcomponentes simples -------------- */

function CardLite({ title, value, sub }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="text-sm text-white/60">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-white/50 mt-1">{sub}</div>
    </div>
  );
}

function FakeChart() {
  return (
    <div className="h-40 w-full relative overflow-hidden rounded-lg bg-[linear-gradient(180deg,rgba(255,255,255,.04),transparent)]">
      <div className="absolute inset-0 opacity-70">
        <svg viewBox="0 0 400 160" className="w-full h-full">
          <polyline
            fill="none"
            stroke="rgba(52,211,153,.8)"
            strokeWidth="3"
            points="0,120 40,100 80,110 120,80 160,95 200,70 240,75 280,60 320,72 360,50 400,62"
          />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 text-[10px] text-white/40 px-2 py-1">Hoy</div>
    </div>
  );
}

function FakeList() {
  const items = [
    { id: "A-1023", name: "Pedido Zonas Norte", eta: "12:35" },
    { id: "A-1024", name: "Farmacia Central", eta: "12:41" },
    { id: "A-1025", name: "Pedido Express", eta: "12:55" },
    { id: "A-1026", name: "Repuesto Carrera 5", eta: "13:08" },
  ];
  return (
    <div>
      <div className="text-sm text-white/70 mb-2">Órdenes recientes</div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <span className="text-white/80">{it.name}</span>
            <span className="text-white/50">ETA {it.eta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniStat({ value, label }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}

function Feature({ icon, title, desc }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex gap-4">
      <div className="h-10 w-10 rounded-2xl bg-white/10 grid place-items-center text-lg">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-white/70">{desc}</div>
      </div>
    </div>
  );
}

function Plan({ name, price, bullets = [], cta = "Elegir", onClick, focus = false }) {
  return (
    <div className={`rounded-3xl border ${focus ? "border-emerald-400/60 shadow-[0_0_0_2px_rgba(52,211,153,.2)]" : "border-white/10"} bg-white/5`}>
      <div className="p-5 flex items-baseline justify-between">
        <span className="font-semibold">{name}</span>
        <span className={`text-2xl font-bold ${focus ? "text-emerald-300" : "text-white"}`}>
          {price}<span className="text-xs font-normal text-white/60">/mes</span>
        </span>
      </div>
      <div className="px-5 pb-5 space-y-3">
        <ul className="space-y-2 text-sm text-white/80 list-disc list-inside">
          {bullets.map((b, i) => (<li key={i}>{b}</li>))}
        </ul>
        <button
          onClick={onClick}
          className={`w-full px-4 py-2 rounded-xl ${focus ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-white/10 hover:bg-white/20"}`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
