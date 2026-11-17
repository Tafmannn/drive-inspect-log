/**
 * Pre-filled emails to the operator, so a client never has to remember a
 * reference or retype vehicle details to get help or book another move.
 */
import type { PortalContext, PortalJobSummary } from "../api";

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** null when the operator has no contact email on file. */
export function requestMoveMailto(ctx: PortalContext): string | null {
  const to = ctx.operator.contact_email;
  if (!to) return null;
  return mailto(
    to,
    `Vehicle move request: ${ctx.client.name}`,
    [
      `Hello ${ctx.operator.name},`,
      "",
      "Please arrange the following vehicle move:",
      "",
      "Vehicle registration: ",
      "Make / model: ",
      "Collection address and postcode: ",
      "Collection contact and phone: ",
      "Delivery address and postcode: ",
      "Delivery contact and phone: ",
      "Preferred date: ",
      "Anything else we should know: ",
      "",
      `Thanks,`,
      ctx.client.name,
    ].join("\n"),
  );
}

export function askAboutMoveMailto(
  ctx: PortalContext,
  job: Pick<PortalJobSummary, "job_ref" | "vehicle_reg">,
  pageUrl?: string,
): string | null {
  const to = ctx.operator.contact_email;
  if (!to) return null;
  return mailto(
    to,
    `Question about ${job.vehicle_reg} (ref ${job.job_ref})`,
    [
      `Hello ${ctx.operator.name},`,
      "",
      `I have a question about the move of ${job.vehicle_reg}, reference ${job.job_ref}:`,
      "",
      "",
      ...(pageUrl ? [`Move details: ${pageUrl}`, ""] : []),
      "Thanks,",
      ctx.client.name,
    ].join("\n"),
  );
}

export function askAboutInvoiceMailto(ctx: PortalContext, invoiceNumber: string): string | null {
  const to = ctx.operator.contact_email;
  if (!to) return null;
  return mailto(
    to,
    `Question about invoice ${invoiceNumber}`,
    [`Hello ${ctx.operator.name},`, "", `I have a question about invoice ${invoiceNumber}:`, "", "", "Thanks,", ctx.client.name].join("\n"),
  );
}
