import * as functionsV1 from 'firebase-functions/v1';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as nodemailer from 'nodemailer';

initializeApp();

const ionosPassword = defineSecret('IONOS_PASSWORD');

const FROM_ADDRESS = '"Bergason Property Services" <cjeavons@bergason.co.uk>';
const OFFICE_EMAIL = 'cjeavons@bergason.co.uk';
const IONOS_USER = 'cjeavons@bergason.co.uk';
const IONOS_HOST = 'smtp.ionos.co.uk';
const IONOS_PORT = 587;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const generateReference = (propertyId?: string): string => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const suffix = propertyId ? propertyId.toUpperCase() : String(Math.floor(Math.random() * 9000) + 1000);
  return `BPS-${dd}${mm}${yyyy}-${suffix}`;
};

const formatTimestamp = (d: Date): string =>
  d.toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London', timeZoneName: 'short',
  });

const headerHtml = `
  <div style="background:#0f172a;padding:20px;text-align:center;">
    <div style="color:#d4af37;font-size:20px;font-weight:bold;letter-spacing:2px;">BERGASON</div>
    <div style="color:#fff;font-size:9px;letter-spacing:4px;">PROPERTY SERVICES</div>
  </div>`;

const footerHtml = `
  <div style="background:#f8fafc;padding:12px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;">Bergason Property Services · inventory@bergason.co.uk</p>
  </div>`;

const createTransporter = (password: string) =>
  nodemailer.createTransport({
    host: IONOS_HOST, port: IONOS_PORT, secure: false,
    auth: { user: IONOS_USER, pass: password },
  });

const downloadPDF = async (path: string): Promise<Buffer | null> => {
  if (!path) return null;
  try {
    const [buf] = await getStorage().bucket().file(path).download();
    return buf;
  } catch {
    return null;
  }
};

const sendConfirmationToOffice = async (
  transporter: nodemailer.Transporter,
  opts: {
    reference: string; action: string; tenantName: string;
    tenantEmail: string; address: string; sentAt: Date;
    extras?: string; pdfBuffer?: Buffer | null; pdfFilename?: string;
  }
) => {
  const { reference, action, tenantName, tenantEmail, address, sentAt, extras = '', pdfBuffer, pdfFilename } = opts;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      ${headerHtml}
      <div style="padding:24px;background:#f0fdf4;border:2px solid #86efac;">
        <h2 style="color:#166534;margin:0 0 16px;">✅ Dispatch Confirmation — ${action}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${[
            ['Reference', `<strong style="font-size:16px;">${reference}</strong>`],
            ['Action', action],
            ['Property', address],
            ['Tenant', tenantName],
            ['Sent To', tenantEmail],
            ['Date &amp; Time', formatTimestamp(sentAt)],
          ].map(([k, v]) => `<tr style="border-bottom:1px solid #bbf7d0;">
            <td style="padding:8px;color:#64748b;font-weight:bold;width:35%;">${k}</td>
            <td style="padding:8px;color:#0f172a;">${v}</td>
          </tr>`).join('')}
          ${extras}
        </table>
      </div>
      <div style="padding:12px 16px;background:#fef9c3;border:1px solid #fde047;font-size:12px;color:#854d0e;">
        <strong>Legal note:</strong> This email confirms that the above action was successfully completed at the date and time shown. Retain this record as evidence for deposit scheme adjudication.
      </div>
      ${footerHtml}
    </div>`;

  const attachments = pdfBuffer && pdfFilename
    ? [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }]
    : [];

  await transporter.sendMail({
    from: FROM_ADDRESS, to: OFFICE_EMAIL,
    subject: `[DISPATCH ${reference}] ${action} — ${tenantName} — ${address}`,
    html, attachments,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Callable: sendInventoryEmail
// ─────────────────────────────────────────────────────────────────────────────

interface SendEmailRequest {
  type: 'signature_request' | 'signature_confirmation' | 'review_link' | 'review_complete';
  tenantEmail: string;
  tenantName: string;
  address: string;
  pdfStoragePath: string;
  firestoreToken: string;
  propertyId?: string;
  signLink?: string;
  reviewLink?: string;
}

export const sendInventoryEmail = functionsV1
  .region('europe-west2')
  .runWith({ secrets: ['IONOS_PASSWORD'], timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const d = req.body as SendEmailRequest;
    const missing = ['tenantEmail', 'tenantName', 'address', 'firestoreToken'].filter(k => !d[k as keyof SendEmailRequest]);
    if (missing.length) {
      console.error('Missing required fields:', missing, 'body:', JSON.stringify(d));
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` }); return;
    }

    const reference = generateReference(d.propertyId);
    const sentAt = new Date();
    const transporter = createTransporter(process.env.IONOS_PASSWORD!);
    const pdfBuffer = await downloadPDF(d.pdfStoragePath);
    const db = getFirestore();

    // ── Tenant email content by type ─────────────────────────────────────────
    let subject = '';
    let html = '';
    let pdfFilename = 'Bergason-Document.pdf';
    let confirmationAction = '';
    let confirmationExtras = '';
    let firestoreUpdate: Record<string, unknown> = {};

    if (d.type === 'signature_request') {
      pdfFilename = 'Bergason-Inventory.pdf';
      confirmationAction = 'Inventory sent for signature';
      subject = `Please Sign Your Inventory — ${d.address} [Ref: ${reference}]`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          ${headerHtml}
          <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;">
            <p style="font-size:15px;color:#1e293b;">Dear ${d.tenantName},</p>
            <p style="color:#475569;">The inventory report for <strong>${d.address}</strong> is attached. Please review it and sign using the link below.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${d.signLink}" style="background:#0f172a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                Sign Inventory →
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;">Or paste into your browser: ${d.signLink}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="color:#94a3b8;font-size:12px;">Ref: <strong>${reference}</strong> · ${formatTimestamp(sentAt)}</p>
          </div>
          ${footerHtml}
        </div>`;
      confirmationExtras = `<tr style="border-bottom:1px solid #bbf7d0;">
        <td style="padding:8px;color:#64748b;font-weight:bold;">Sign Link</td>
        <td style="padding:8px;"><a href="${d.signLink}">${d.signLink}</a></td>
      </tr>`;
      firestoreUpdate = { signatureDispatchRef: reference };

    } else if (d.type === 'signature_confirmation') {
      pdfFilename = 'Bergason-SignedConfirmation.pdf';
      confirmationAction = 'Tenant signed inventory';
      subject = `Inventory Signed — ${d.address} [Ref: ${reference}]`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          ${headerHtml}
          <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;">
            <p style="font-size:15px;color:#1e293b;">Dear ${d.tenantName},</p>
            <p style="color:#475569;">Thank you for signing the inventory for <strong>${d.address}</strong>. Your signed confirmation is attached.</p>
            <p style="color:#475569;">You will receive a separate email when your 5-day review period begins after your move-in date.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="color:#94a3b8;font-size:12px;">Ref: <strong>${reference}</strong> · ${formatTimestamp(sentAt)}</p>
          </div>
          ${footerHtml}
        </div>`;
      confirmationAction = 'Tenant signed the inventory';
      firestoreUpdate = { signatureDispatchRef: reference };

    } else if (d.type === 'review_link') {
      pdfFilename = 'Bergason-Inventory.pdf';
      confirmationAction = 'Review link sent (5-day window started)';
      subject = `Review Your Inventory — ${d.address} [Ref: ${reference}]`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          ${headerHtml}
          <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;">
            <p style="font-size:15px;color:#1e293b;">Dear ${d.tenantName},</p>
            <p style="color:#475569;">Now that you have moved into <strong>${d.address}</strong>, please review your inventory report online.</p>
            <p style="color:#475569;">You have <strong>5 days</strong> to go through each room and agree or dispute the inspector's findings. You can save your progress and return at any time.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${d.reviewLink}" style="background:#0f172a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                Begin Review →
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;">Or paste into your browser: ${d.reviewLink}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="color:#94a3b8;font-size:12px;">Ref: <strong>${reference}</strong> · ${formatTimestamp(sentAt)}</p>
          </div>
          ${footerHtml}
        </div>`;
      confirmationExtras = `<tr style="border-bottom:1px solid #bbf7d0;">
        <td style="padding:8px;color:#64748b;font-weight:bold;">Review Link</td>
        <td style="padding:8px;"><a href="${d.reviewLink}">${d.reviewLink}</a></td>
      </tr>`;
      firestoreUpdate = { reviewDispatchRef: reference };

    } else if (d.type === 'review_complete') {
      pdfFilename = 'Bergason-TenantReview.pdf';
      confirmationAction = 'Tenant completed review';
      subject = `Your Completed Inventory Review — ${d.address} [Ref: ${reference}]`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          ${headerHtml}
          <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;">
            <p style="font-size:15px;color:#1e293b;">Dear ${d.tenantName},</p>
            <p style="color:#475569;">Thank you for completing your inventory review for <strong>${d.address}</strong>. Your signed review report is attached.</p>
            <p style="color:#475569;">If you raised any disputes, these have been recorded and Bergason Property Services will be in touch if further action is required.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="color:#94a3b8;font-size:12px;">Ref: <strong>${reference}</strong> · ${formatTimestamp(sentAt)}</p>
          </div>
          ${footerHtml}
        </div>`;
      firestoreUpdate = { reviewPdfDispatchRef: reference };
    }

    // Send tenant email
    const attachments = pdfBuffer
      ? [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }]
      : [];
    await transporter.sendMail({ from: FROM_ADDRESS, to: d.tenantEmail, subject, html, attachments });

    // Send office confirmation
    await sendConfirmationToOffice(transporter, {
      reference, action: confirmationAction,
      tenantName: d.tenantName, tenantEmail: d.tenantEmail,
      address: d.address, sentAt,
      extras: confirmationExtras,
      pdfBuffer, pdfFilename,
    });

    // Store dispatch record
    const dispatchRecord = {
      reference, type: d.type, action: confirmationAction,
      tenantName: d.tenantName, tenantEmail: d.tenantEmail,
      address: d.address, firestoreToken: d.firestoreToken,
      sentAt: FieldValue.serverTimestamp(), sentAtISO: sentAt.toISOString(),
      pdfStoragePath: d.pdfStoragePath,
      reviewLink: d.reviewLink || null, signLink: d.signLink || null,
    };
    await db.collection('dispatches').doc(reference).set(dispatchRecord);
    await db.collection('inventories').doc(d.firestoreToken)
      .collection('dispatches').add(dispatchRecord);
    await db.collection('inventories').doc(d.firestoreToken)
      .update({ ...firestoreUpdate });

    res.json({ success: true, reference });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled: daily reminder + expiry check (runs every day at 09:00 London)
// ─────────────────────────────────────────────────────────────────────────────

export const dailyReminderCheck = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Europe/London', secrets: [ionosPassword], region: 'europe-west2' },
  async () => {
    const db = getFirestore();
    const transporter = createTransporter(ionosPassword.value());
    const now = Date.now();

    const snapshot = await db.collection('inventories')
      .where('status', 'in', ['review_sent', 'reviewing'])
      .get();

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const token = docSnap.id;
      const reviewSentAt: number = data.reviewSentAt || 0;
      const expiresAt: number = data.expiresAt || 0;
      if (!reviewSentAt) continue;

      // Use move-in date as the clock start if available, else fall back to when the link was sent
      const baseDate: number = data.moveInDate || reviewSentAt;
      const elapsed = now - baseDate;

      // Day 3 reminder
      if (elapsed >= 3 * DAY_MS && !data.reminder3Sent) {
        await sendReminderEmail(transporter, data, token, 3, db);
      }

      // Day 5 final warning
      if (elapsed >= 5 * DAY_MS && !data.reminder5Sent) {
        await sendReminderEmail(transporter, data, token, 5, db);
      }

      // Day 6 expiry
      if (now >= expiresAt && !data.expiryEmailSent) {
        await sendExpiryProofEmail(transporter, data, token, db);
      }
    }
  }
);

async function sendReminderEmail(
  transporter: nodemailer.Transporter,
  data: FirebaseFirestore.DocumentData,
  token: string,
  day: number,
  db: FirebaseFirestore.Firestore
) {
  const reviewLink = `https://under450.github.io/Bergason-Inventory-App/#/review/${token}`;
  const isFinal = day === 5;
  const reference = generateReference();
  const sentAt = new Date();

  const subject = isFinal
    ? `⚠️ FINAL REMINDER — Review your inventory today — ${data.address}`
    : `Reminder — Please review your inventory — ${data.address}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      ${headerHtml}
      <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;">
        <p style="font-size:15px;color:#1e293b;">Dear ${data.tenantName},</p>
        <p style="color:#475569;">This is ${isFinal ? 'your <strong>final reminder</strong>' : 'a reminder'} to complete your inventory review for <strong>${data.address}</strong>.</p>
        ${isFinal ? '<p style="color:#dc2626;font-weight:bold;">⚠️ Your review window closes today. After today the link will expire and you will lose your opportunity to dispute any items.</p>' : ''}
        <div style="text-align:center;margin:28px 0;">
          <a href="${reviewLink}" style="background:#0f172a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
            Complete Review →
          </a>
        </div>
        <p style="color:#94a3b8;font-size:12px;">Ref: <strong>${reference}</strong> · Day ${day} reminder · ${formatTimestamp(sentAt)}</p>
      </div>
      ${footerHtml}
    </div>`;

  await transporter.sendMail({ from: FROM_ADDRESS, to: data.tenantEmail, subject, html });

  await sendConfirmationToOffice(transporter, {
    reference, action: `Day ${day} reminder sent to tenant`,
    tenantName: data.tenantName, tenantEmail: data.tenantEmail,
    address: data.address, sentAt,
  });

  const updateField = day === 3
    ? { reminder3Sent: true, reminder3SentAt: Date.now(), reminder3Ref: reference }
    : { reminder5Sent: true, reminder5SentAt: Date.now(), reminder5Ref: reference };

  await db.collection('inventories').doc(token).update(updateField);
}

async function sendExpiryProofEmail(
  transporter: nodemailer.Transporter,
  data: FirebaseFirestore.DocumentData,
  token: string,
  db: FirebaseFirestore.Firestore
) {
  const reference = generateReference();

  // Build audit trail of all emails sent
  const dispatches = await db.collection('inventories').doc(token)
    .collection('dispatches').orderBy('sentAt', 'asc').get();

  const auditRows = dispatches.docs.map(d => {
    const dd = d.data();
    const ts = dd.sentAt instanceof Timestamp ? dd.sentAt.toDate() : new Date(dd.sentAtISO || 0);
    return `<tr style="border-bottom:1px solid #fecaca;">
      <td style="padding:8px;color:#64748b;">${dd.reference || '—'}</td>
      <td style="padding:8px;color:#0f172a;">${dd.action || dd.type}</td>
      <td style="padding:8px;color:#0f172a;">${formatTimestamp(ts)}</td>
    </tr>`;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      ${headerHtml}
      <div style="padding:24px;background:#fef2f2;border:2px solid #fca5a5;">
        <h2 style="color:#991b1b;margin:0 0 8px;">⏰ Review Period Expired — Tenant Did Not Complete</h2>
        <p style="color:#7f1d1d;margin:0 0 16px;">The 5-day review window for the following inventory has expired without completion by the tenant.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          ${[
            ['Property', data.address],
            ['Tenant', data.tenantName],
            ['Email Sent To', data.tenantEmail],
            ['Review Opened', data.reviewSentAt ? formatTimestamp(new Date(data.reviewSentAt)) : '—'],
            ['Expiry', data.expiresAt ? formatTimestamp(new Date(data.expiresAt)) : '—'],
          ].map(([k, v]) => `<tr style="border-bottom:1px solid #fecaca;">
            <td style="padding:8px;color:#64748b;font-weight:bold;width:35%;">${k}</td>
            <td style="padding:8px;color:#0f172a;">${v}</td>
          </tr>`).join('')}
        </table>
        <h3 style="color:#991b1b;font-size:14px;margin:16px 0 8px;">Full Dispatch Audit Trail</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#fee2e2;">
            <th style="padding:8px;text-align:left;color:#7f1d1d;">Reference</th>
            <th style="padding:8px;text-align:left;color:#7f1d1d;">Action</th>
            <th style="padding:8px;text-align:left;color:#7f1d1d;">Date &amp; Time</th>
          </tr>
          ${auditRows}
        </table>
      </div>
      <div style="padding:12px 16px;background:#fef9c3;border:1px solid #fde047;font-size:12px;color:#854d0e;">
        <strong>Legal note:</strong> This email serves as evidence that the tenant (${data.tenantEmail}) was sent the inventory review link and ${data.reminder3Sent ? 'two reminders' : data.reminder5Sent ? 'a reminder' : 'no reminders were recorded but the window has expired'}. The tenant did not complete the review within the 5-day window. This record and the audit trail above may be used as evidence in deposit scheme adjudication proceedings.
      </div>
      ${footerHtml}
    </div>`;

  await transporter.sendMail({
    from: FROM_ADDRESS, to: OFFICE_EMAIL,
    subject: `[EXPIRY PROOF ${reference}] Tenant did not complete review — ${data.tenantName} — ${data.address}`,
    html,
  });

  await db.collection('inventories').doc(token).update({
    status: 'expired',
    expiryEmailSent: true,
    expiryEmailSentAt: Date.now(),
    expiryRef: reference,
  });
}
