export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** The Twilio number (or messaging service SID) messages are sent from. */
  fromNumber: string;
}

export interface TwilioSendResult {
  sid: string;
  status: string;
}

export async function sendSms(config: TwilioConfig, to: string, body: string): Promise<TwilioSendResult> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: config.fromNumber, Body: body }),
  });
  if (!res.ok) {
    throw new Error(`Twilio send failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { sid: string; status: string };
  return { sid: data.sid, status: data.status };
}
