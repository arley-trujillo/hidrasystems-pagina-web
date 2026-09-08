export default function HidraTicketsLandingPage() {
  const features = [
    {
      title: "Ventas centralizadas",
      text: "Gestiona la venta de boletas desde una sola plataforma y evita desorden entre asesores.",
    },
    {
      title: "Control de pagos",
      text: "Registra comprobantes, valida pagos y conserva trazabilidad completa por cliente y por operación.",
    },
    {
      title: "WhatsApp organizado",
      text: "Centraliza conversaciones, automatiza respuestas y deja que el asesor intervenga solo cuando hace falta.",
    },
    {
      title: "Cero duplicidad",
      text: "Reduce errores operativos y evita ventas duplicadas o apartados inconsistentes.",
    },
    {
      title: "Seguimiento real",
      text: "Cada cliente, cada pago y cada interacción quedan visibles en tiempo real.",
    },
    {
      title: "Escalabilidad operativa",
      text: "Haz crecer tu operación sin perder control, orden ni capacidad de respuesta.",
    },
  ];

  const stats = [
    ["Boletas gestionadas", "12.840"],
    ["Pagos trazados", "11.972"],
    ["Conversaciones activas", "326"],
    ["Asesores coordinados", "18"],
  ];

  const flow = [
    "El cliente escribe por WhatsApp",
    "El sistema responde, organiza y filtra la solicitud",
    "Se registran apartados y pagos con trazabilidad",
    "El asesor entra solo donde realmente aporta valor",
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#1f6fb3_0%,#0f4f88_28%,#0c3761_55%,#092745_100%)] text-white">
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.25)_1px,transparent_1px)] [background-size:48px_48px] pointer-events-none" />
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-20 h-72 w-72 rounded-full bg-yellow-300/10 blur-3xl pointer-events-none" />

      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-8 md:px-10 lg:px-12 lg:pb-28 lg:pt-10">
        <header className="mb-14 flex items-center justify-between rounded-3xl border border-white/15 bg-white/8 px-5 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-yellow-300 via-yellow-500 to-green-400 text-xl font-black text-slate-900 shadow-lg shadow-yellow-500/25">
              777
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]">
                <span className="bg-gradient-to-b from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  HIDRA
                </span>{" "}
                <span className="bg-gradient-to-b from-yellow-200 via-yellow-400 to-green-400 bg-clip-text text-transparent">
                  TICKETS
                </span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-blue-100/80">
                Sistema de gestión y automatización de sorteos
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-blue-100/85 md:flex">
            <a href="#solucion" className="transition hover:text-white">Solución</a>
            <a href="#funciona" className="transition hover:text-white">Cómo funciona</a>
            <a href="#contacto" className="transition hover:text-white">Contacto</a>
          </nav>
        </header>

        <div className="grid items-center gap-14 lg:grid-cols-[1.03fr_0.97fr]">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-cyan-100 shadow-lg backdrop-blur-md">
              Plataforma central para ventas, pagos y conversaciones por WhatsApp
            </div>

            <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[0.98] tracking-tight md:text-7xl">
              Ordena tu operación de sorteos y conviértela en un sistema profesional.
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-blue-100/90 md:text-xl">
              HIDRA TICKETS centraliza la venta de boletas, el control de pagos y las conversaciones por WhatsApp en una sola plataforma. Automatiza respuestas, evita ventas duplicadas y mantiene trazabilidad completa de cada cliente y cada pago.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a
                href="https://wa.me/573000000000?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20HIDRA%20TICKETS"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 px-7 py-4 text-base font-bold text-slate-900 shadow-2xl shadow-yellow-500/25 transition hover:-translate-y-0.5"
              >
                Solicitar demostración
              </a>
              <a
                href="https://wa.me/573000000000?text=Hola%2C%20quiero%20ver%20la%20presentaci%C3%B3n%20de%20HIDRA%20TICKETS"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-base font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-white/15"
              >
                Ver presentación
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {[
                "Más ventas con menos errores operativos",
                "Control total en tiempo real",
                "Asesores apoyados por automatización",
                "Trazabilidad completa por cliente y por pago",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/12 bg-white/8 px-4 py-4 text-sm text-blue-50 shadow-lg backdrop-blur-md"
                >
                  <span className="mr-2 text-cyan-200">✦</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl" />
            <div className="absolute -left-4 bottom-8 h-20 w-20 rounded-full bg-cyan-300/20 blur-2xl" />

            <div className="relative rounded-[32px] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-2xl">
              <div className="rounded-[26px] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] p-5 shadow-inner">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100/70">Centro operativo</p>
                    <h2 className="text-2xl font-bold text-white">Resumen de la operación</h2>
                  </div>
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100">
                    En línea
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {stats.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/12 bg-white/10 p-4 shadow-lg backdrop-blur-md"
                    >
                      <div className="text-sm text-blue-100/70">{label}</div>
                      <div className="mt-2 text-3xl font-black text-white">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                  <div className="rounded-3xl border border-white/12 bg-slate-950/20 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold text-white">Rendimiento comercial</h3>
                      <span className="text-sm text-cyan-100">Tiempo real</span>
                    </div>
                    <div className="flex h-56 items-end gap-3">
                      {[28, 40, 52, 61, 74, 70, 92].map((h, i) => (
                        <div key={i} className="flex-1">
                          <div
                            className="rounded-t-2xl bg-gradient-to-t from-cyan-300 via-sky-300 to-white shadow-lg shadow-cyan-200/20"
                            style={{ height: `${h}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/12 bg-slate-950/20 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold text-white">WhatsApp</h3>
                      <span className="text-sm text-blue-100/70">Atención organizada</span>
                    </div>
                    <div className="space-y-3">
                      <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-cyan-300/20 px-4 py-3 text-sm text-white">
                        Hola, quiero apartar 4 boletas.
                      </div>
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-3 text-sm text-blue-50">
                        Claro. Ya validé disponibilidad y te comparto los métodos de pago.
                      </div>
                      <div className="ml-auto max-w-[74%] rounded-2xl rounded-br-md bg-cyan-300/20 px-4 py-3 text-sm text-white">
                        Listo, envío comprobante.
                      </div>
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-3 text-sm text-blue-50">
                        Pago registrado. Cliente trazado y venta confirmada sin duplicidad.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="solucion" className="relative mx-auto max-w-7xl px-6 py-20 md:px-10 lg:px-12">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-100/80">La solución</p>
          <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
            Diseñado para empresas que necesitan vender, controlar y crecer con orden.
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100/85">
            Esta plataforma no solo ayuda a vender boletas. Organiza toda la operación comercial y administrativa detrás de cada sorteo.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {features.map((item) => (
            <div
              key={item.title}
              className="rounded-[28px] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl transition hover:-translate-y-1"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-white via-cyan-100 to-sky-300 text-lg font-black text-slate-900 shadow-lg">
                ✓
              </div>
              <h3 className="text-xl font-bold text-white">{item.title}</h3>
              <p className="mt-3 text-base leading-7 text-blue-100/85">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="funciona" className="mx-auto max-w-7xl px-6 pb-20 md:px-10 lg:px-12">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[30px] border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-100/80">Cómo funciona</p>
            <h2 className="mt-4 text-3xl font-black md:text-4xl">Automatiza lo repetitivo y conserva el control humano donde importa.</h2>
            <p className="mt-4 text-lg leading-8 text-blue-100/85">
              El sistema organiza el flujo comercial desde el primer mensaje hasta la confirmación del pago, para que el asesor no pierda tiempo en tareas repetitivas.
            </p>

            <div className="mt-8 space-y-4">
              {flow.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-white/12 bg-slate-950/20 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-300 to-cyan-300 font-black text-slate-900">
                    {index + 1}
                  </div>
                  <div className="pt-1 text-base text-blue-50">{step}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/15 bg-[linear-gradient(160deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))] p-8 shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-100/80">Mensaje comercial</p>
            <h2 className="mt-4 text-4xl font-black md:text-5xl">
              Automatiza. Organiza. Crece.
            </h2>
            <p className="mt-5 text-lg leading-8 text-blue-100/85">
              HIDRA TICKETS centraliza la venta de boletas, el control de pagos y la atención por WhatsApp en una sola plataforma. El resultado es más ventas, menos errores y control total en tiempo real.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-slate-950/20 p-5">
                <div className="text-sm text-blue-100/70">Ideal para</div>
                <div className="mt-2 text-xl font-bold text-white">Empresas de sorteos que quieren operar con seriedad</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-slate-950/20 p-5">
                <div className="text-sm text-blue-100/70">Resultado</div>
                <div className="mt-2 text-xl font-bold text-white">Más control, menos errores y mejor conversión</div>
              </div>
            </div>

            <div id="contacto" className="mt-8 flex flex-wrap gap-4">
              <a
                href="https://wa.me/573000000000?text=Hola%2C%20quiero%20una%20demostraci%C3%B3n%20de%20HIDRA%20TICKETS"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl bg-white px-7 py-4 text-base font-bold text-slate-900 shadow-xl transition hover:-translate-y-0.5"
              >
                Hablar por WhatsApp
              </a>
              <a
                href="https://wa.me/573000000000?text=Hola%2C%20quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20HIDRA%20TICKETS"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-base font-semibold text-white backdrop-blur-md transition hover:bg-white/15"
              >
                Solicitar información
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
