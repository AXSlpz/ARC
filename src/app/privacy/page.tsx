import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad | ARC",
  description:
    "Política de privacidad del asistente WhatsApp de ARC.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      <article className="mx-auto max-w-2xl px-5 py-12 leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight">
          Política de privacidad
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Última actualización: 3 de agosto de 2026
        </p>

        <section className="mt-8 space-y-4 text-[15px]">
          <p>
            Esta política describe cómo{" "}
            <strong>ARC</strong> (el “Responsable”) trata
            datos personales cuando usas nuestro asistente de atención por
            WhatsApp y el panel asociado en{" "}
            <a
              className="text-sky-700 underline"
              href="https://arc.axsolutions.tech"
            >
              arc.axsolutions.tech
            </a>
            .
          </p>

          <h2 className="pt-2 text-lg font-semibold">1. Datos que tratamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Número de teléfono de WhatsApp y nombre de perfil.</li>
            <li>Contenido de los mensajes que envías al asistente.</li>
            <li>
              Datos de identificación de residente o vivienda que nos
              proporciones para verificar tu solicitud (por ejemplo nombre,
              correo o unidad).
            </li>
            <li>
              Metadatos técnicos de la conversación (fecha, línea de atención,
              estado del chat).
            </li>
          </ul>

          <h2 className="pt-2 text-lg font-semibold">2. Finalidad</h2>
          <p>Usamos esos datos para:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Atender consultas sobre condominios y servicios.</li>
            <li>Verificar identidad cuando sea necesario.</li>
            <li>Transferir la conversación a personal humano.</li>
            <li>Mejorar el servicio (incluyendo encuestas de satisfacción).</li>
            <li>Cumplir obligaciones legales aplicables.</li>
          </ul>

          <h2 className="pt-2 text-lg font-semibold">3. Base y conservación</h2>
          <p>
            El tratamiento se basa en tu solicitud de atención y en el interés
            legítimo de operar el servicio de condominio. Conservamos los
            mensajes y registros el tiempo necesario para la atención, auditoría
            interna y requisitos legales; después se eliminan o anonimizan.
          </p>

          <h2 className="pt-2 text-lg font-semibold">4. Encargados y terceros</h2>
          <p>
            Para operar el canal usamos proveedores técnicos (por ejemplo
            infraestructura de alojamiento, WhatsApp Cloud API de Meta y
            servicios de IA para generar respuestas). Esos proveedores solo
            procesan datos para prestar el servicio conforme a sus términos y a
            esta política.
          </p>

          <h2 className="pt-2 text-lg font-semibold">5. Tus derechos</h2>
          <p>
            Puedes solicitar acceso, rectificación, cancelación u oposición al
            tratamiento de tus datos, así como la eliminación de tu historial de
            chat, escribiendo a{" "}
            <a
              className="text-sky-700 underline"
              href="mailto:avaloslpz92@gmail.com"
            >
              avaloslpz92@gmail.com
            </a>
            . Instrucciones de eliminación:{" "}
            <a
              className="text-sky-700 underline"
              href="https://arc.axsolutions.tech/data-deletion"
            >
              arc.axsolutions.tech/data-deletion
            </a>
            .
          </p>

          <h2 className="pt-2 text-lg font-semibold">6. Seguridad</h2>
          <p>
            Aplicamos medidas razonables de acceso, cifrado en tránsito (HTTPS)
            y controles de sesión en el panel administrativo. Ningún sistema es
            100&nbsp;% seguro; te pedimos no enviar contraseñas ni datos
            bancarios completos por el chat.
          </p>

          <h2 className="pt-2 text-lg font-semibold">7. Cambios</h2>
          <p>
            Podemos actualizar esta política. La versión vigente estará siempre
            en esta URL. El uso continuado del servicio tras un cambio implica
            conocimiento de la nueva versión.
          </p>

          <h2 className="pt-2 text-lg font-semibold">8. Contacto</h2>
          <p>
            ARC ·{" "}
            <a
              className="text-sky-700 underline"
              href="mailto:avaloslpz92@gmail.com"
            >
              avaloslpz92@gmail.com
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
