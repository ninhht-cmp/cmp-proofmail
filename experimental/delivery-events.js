// Tier B — normalize post-send ESP events to one provider-agnostic shape and act
// on them. SMTP "accepted" (Tier A) ≠ delivered; bounces/complaints are only known
// here, later (via webhook or feedback export).
//   { email, type: 'delivered'|'bounce'|'complaint'|'deferred', subtype?, messageId?, at?, provider? }
// Permanent bounce + complaint → suppression list; any event → stamp the campaign record.

// Permanent unless the provider flags it transient (SES 'Transient'; SendGrid
// soft bounces arrive as their own 'deferred' event, never here).
function isPermanentBounce(ev) {
  if (ev.type !== 'bounce') return false;
  const t = String(ev.subtype || '').toLowerCase();
  return t !== 'transient' && t !== 'soft';
}

// events: array of normalized events. opts: { suppression, campaignStore? }
// Returns a summary of what was applied.
export function applyDeliveryEvents(events, { suppression, campaignStore } = {}) {
  const summary = {
    delivered: 0,
    bounce: 0,
    complaint: 0,
    deferred: 0,
    suppressed: 0,
    recorded: 0,
    ignored: 0,
  };

  for (const ev of events || []) {
    const email = String(ev?.email || '').toLowerCase();
    if (!email || !ev?.type) {
      summary.ignored++;
      continue;
    }
    if (ev.type in summary) summary[ev.type]++;
    else {
      summary.ignored++;
      continue;
    }

    if (suppression && (ev.type === 'complaint' || isPermanentBounce(ev))) {
      const reason = ev.type === 'complaint' ? 'complaint' : 'hard-bounce';
      if (suppression.suppress(email, { reason, source: ev.provider || 'esp-event' }))
        summary.suppressed++;
    }

    if (campaignStore?.markDelivery?.(email, { type: ev.type, at: ev.at })) summary.recorded++;
  }

  return summary;
}

// ---- Provider normalizers: raw ESP payload → normalized events --------------
// Add a provider by writing one mapper here; the rest of the system is unchanged.

// Amazon SES (delivered via SNS). Pass the parsed SES notification object — i.e.
// the JSON in the SNS "Message" field, NOT the SNS envelope.
export function normalizeSes(payload) {
  const out = [];
  const messageId = payload?.mail?.messageId;
  const push = (list, type, subtype) =>
    (list || []).forEach((r) =>
      out.push({ email: r.emailAddress, type, subtype, messageId, provider: 'ses' }),
    );

  if (payload?.notificationType === 'Bounce') {
    push(payload.bounce?.bouncedRecipients, 'bounce', payload.bounce?.bounceType); // 'Permanent' | 'Transient'
  } else if (payload?.notificationType === 'Complaint') {
    push(payload.complaint?.complainedRecipients, 'complaint');
  } else if (payload?.notificationType === 'Delivery') {
    push(
      payload.delivery?.recipients?.map((e) => ({ emailAddress: e })),
      'delivered',
    );
  }
  return out;
}

// SendGrid Event Webhook posts an array of events.
const SENDGRID_TYPE = {
  delivered: 'delivered',
  bounce: 'bounce',
  dropped: 'bounce', // SendGrid drops known-bad addresses → treat as hard bounce
  blocked: 'bounce',
  spamreport: 'complaint',
  deferred: 'deferred',
};
export function normalizeSendgrid(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((e) => {
      const type = SENDGRID_TYPE[e.event];
      if (!type) return null;
      const subtype = e.event === 'dropped' || e.event === 'blocked' ? 'Permanent' : undefined;
      return {
        email: e.email,
        type,
        subtype,
        messageId: e.sg_message_id,
        at: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : undefined,
        provider: 'sendgrid',
      };
    })
    .filter(Boolean);
}

// Dispatch raw payload by provider. 'normalized' = already in our shape (pass an
// array through untouched) — handy for tests and manual imports.
export function normalizeEvents(provider, payload) {
  switch (String(provider || 'normalized').toLowerCase()) {
    case 'ses':
      return normalizeSes(payload);
    case 'sendgrid':
      return normalizeSendgrid(payload);
    case 'normalized':
      return Array.isArray(payload) ? payload : [];
    default:
      throw new Error(`Provider không hỗ trợ: ${provider} (dùng: ses | sendgrid | normalized)`);
  }
}
