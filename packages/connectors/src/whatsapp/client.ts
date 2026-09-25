const GRAPH_API_VERSION = "v20.0";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
}

async function whatsappFetch<T>(config: WhatsAppConfig, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export interface WhatsAppSendResult {
  messages: Array<{ id: string }>;
}

/**
 * Free-form text only works inside the 24-hour customer service window (PRD §4);
 * outside it, `sendTemplateMessage` with a pre-approved template is required.
 */
export async function sendWhatsAppText(config: WhatsAppConfig, to: string, body: string): Promise<WhatsAppSendResult> {
  return whatsappFetch(config, { to, type: "text", text: { body } });
}

export async function sendWhatsAppTemplate(
  config: WhatsAppConfig,
  to: string,
  templateName: string,
  languageCode: string,
  parameters: string[] = [],
): Promise<WhatsAppSendResult> {
  return whatsappFetch(config, {
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(parameters.length > 0
        ? { components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  });
}
