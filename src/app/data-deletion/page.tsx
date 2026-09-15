import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de datos | ARC",
  description:
    "Cómo solicitar la eliminación de datos del asistente WhatsApp de ARC.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      <article className="mx-auto max-w-2xl px-5 py-12 leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight">
          Eliminación de datos
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Última actualización: 3 de agosto de 2026
        </p>

        <section className="mt-8 space-y-4 text-[15px]">
          <p>
            Si usaste el asistente de WhatsApp o el panel de{" "}
            <strong>ARC</strong> y quieres que eliminemos tus
            datos personales asociados, sigue estos pasos.
          </p>

          <h2 className="pt-2 text-lg font-semibold">1. Cómo solicitarlo</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Envía un correo a{" "}
              <a
                className="text-sky-700 underline"
                href="mailto:avaloslpz92@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos%20ARC"
              >
                avaloslpz92@gmail.com
              </a>{" "}
              con el asunto “Solicitud de eliminación de datos ARC”.
            </li>
            <li>
              Incluye el número de WhatsApp usado (con código de país) y, si
              aplica, el nombre o unidad con la que te identificaste.
            </li>
            <li>
              Confirma que solicitas la eliminación del historial de
              conversación y datos de contacto asociados a ese número.
            </li>
          </ol>

          <h2 className="pt-2 text-lg font-semibold">2. Qué eliminamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Mensajes del chat vinculados a tu número.</li>
            <li>Datos de contacto y verificación asociados a esa conversación.</li>
            <li>Encuestas de satisfacción ligadas a esos chats, cuando existan.</li>
          </ul>
          <p>
            Podemos conservar registros mínimos si la ley lo exige (por ejemplo
            auditoría o disputas), o datos agregados que ya no te identifican.
          </p>

          <h2 className="pt-2 text-lg font-semibold">3. Plazo</h2>
          <p>
            Atenderemos la solicitud en un plazo razonable, normalmente dentro
            de 30 días, y te confirmaremos por correo cuando esté hecha.
          </p>

          <h2 className="pt-2 text-lg font-semibold">4. WhatsApp / Meta</h2>
          <p>
            Eliminar tus datos en nuestro sistema no borra automáticamente la
            copia que puedas tener en tu dispositivo ni el historial que Meta
            conserve bajo sus propias políticas. Para ello revisa también los
            ajustes de WhatsApp y las opciones de Meta.
          </p>

          <p className="pt-4">
            Política de privacidad:{" "}
            <a
              className="text-sky-700 underline"
              href="https://arc.axsolutions.tech/privacy"
            >
              arc.axsolutions.tech/privacy
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
