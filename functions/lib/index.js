"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInventoryEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const app_1 = require("firebase-admin/app");
const storage_1 = require("firebase-admin/storage");
const firestore_1 = require("firebase-admin/firestore");
const nodemailer = __importStar(require("nodemailer"));
(0, app_1.initializeApp)();
const ionosPassword = (0, params_1.defineSecret)('IONOS_PASSWORD');
const FROM_ADDRESS = '"Bergason Property Services" <cjeavons@bergason.co.uk>';
const OFFICE_EMAIL = 'cjeavons@bergason.co.uk';
const IONOS_USER = 'cjeavons@bergason.co.uk';
const IONOS_HOST = 'smtp.ionos.co.uk';
const IONOS_PORT = 587;
/** Generates a reference e.g. BGS-20260316-0042 */
const generateReference = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    return `BGS-${date}-${rand}`;
};
/** Formats a Date as "16 March 2026 at 14:32 UTC" */
const formatTimestamp = (d) => {
    return d.toLocaleString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/London', timeZoneName: 'short',
    });
};
exports.sendInventoryEmail = (0, https_1.onCall)({ secrets: [ionosPassword], region: 'europe-west2' }, async (request) => {
    const data = request.data;
    if (!data.tenantEmail || !data.tenantName || !data.address || !data.pdfStoragePath || !data.firestoreToken) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields.');
    }
    const isOriginal = data.type === 'original';
    const reference = generateReference();
    const sentAt = new Date();
    const sentAtStr = formatTimestamp(sentAt);
    const pdfFilename = isOriginal ? 'Bergason-Inventory.pdf' : 'Bergason-TenantReview.pdf';
    const docType = isOriginal ? 'Original Signed Inventory' : 'Tenant Review Report';
    // ── 1. Download PDF from Firebase Storage ─────────────────────────────
    const bucket = (0, storage_1.getStorage)().bucket();
    const [pdfBuffer] = await bucket.file(data.pdfStoragePath).download().catch(() => {
        throw new https_1.HttpsError('not-found', `PDF not found: ${data.pdfStoragePath}`);
    });
    // ── 2. Build transporter ───────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
        host: IONOS_HOST,
        port: IONOS_PORT,
        secure: false,
        auth: { user: IONOS_USER, pass: ionosPassword.value() },
    });
    // ── 3. Email to tenant ─────────────────────────────────────────────────
    const tenantSubject = isOriginal
        ? `Your Inventory Report — ${data.address} [Ref: ${reference}]`
        : `Your Completed Inventory Review — ${data.address} [Ref: ${reference}]`;
    const tenantHtml = isOriginal ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0f172a;padding:24px;text-align:center;">
          <div style="color:#d4af37;font-size:22px;font-weight:bold;letter-spacing:2px;">BERGASON</div>
          <div style="color:#fff;font-size:10px;letter-spacing:4px;">PROPERTY SERVICES</div>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e2e8f0;">
          <p style="color:#1e293b;font-size:15px;">Dear ${data.tenantName},</p>
          <p style="color:#475569;">Please find attached your inventory report for <strong>${data.address}</strong>.</p>
          <p style="color:#475569;">You have <strong>5 days</strong> to review the full inventory online and agree or raise any disputes. Please click below to begin:</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${data.reviewLink}" style="background:#0f172a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              Review Your Inventory →
            </a>
          </div>
          <p style="color:#94a3b8;font-size:12px;">If the button doesn't work, paste this link into your browser:<br/>${data.reviewLink}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
          <p style="color:#94a3b8;font-size:12px;">Reference: <strong>${reference}</strong> · Sent: ${sentAtStr}</p>
          <p style="color:#94a3b8;font-size:12px;">The original signed inventory is attached to this email as a PDF. Please keep a copy for your records.</p>
        </div>
        <div style="background:#f8fafc;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Bergason Property Services · inventory@bergason.co.uk</p>
        </div>
      </div>
    ` : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0f172a;padding:24px;text-align:center;">
          <div style="color:#d4af37;font-size:22px;font-weight:bold;letter-spacing:2px;">BERGASON</div>
          <div style="color:#fff;font-size:10px;letter-spacing:4px;">PROPERTY SERVICES</div>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e2e8f0;">
          <p style="color:#1e293b;font-size:15px;">Dear ${data.tenantName},</p>
          <p style="color:#475569;">Thank you for completing your inventory review for <strong>${data.address}</strong>.</p>
          <p style="color:#475569;">Your signed review report is attached. Please keep it for your records — it forms part of your tenancy agreement.</p>
          <p style="color:#475569;">If you raised any disputes, these have been recorded and Bergason Property Services will be in touch if further action is required.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
          <p style="color:#94a3b8;font-size:12px;">Reference: <strong>${reference}</strong> · Sent: ${sentAtStr}</p>
        </div>
        <div style="background:#f8fafc;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Bergason Property Services · inventory@bergason.co.uk</p>
        </div>
      </div>
    `;
    await transporter.sendMail({
        from: FROM_ADDRESS,
        to: data.tenantEmail,
        subject: tenantSubject,
        html: tenantHtml,
        attachments: [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    // ── 4. Dispatch confirmation email to office ───────────────────────────
    const confirmationHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0f172a;padding:20px;text-align:center;">
          <div style="color:#d4af37;font-size:18px;font-weight:bold;letter-spacing:2px;">BERGASON</div>
          <div style="color:#fff;font-size:9px;letter-spacing:4px;">DISPATCH CONFIRMATION</div>
        </div>
        <div style="padding:24px;background:#f0fdf4;border:2px solid #86efac;">
          <h2 style="color:#166534;margin:0 0 16px;">✅ Email Dispatched Successfully</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;width:40%;">Dispatch Reference</td>
              <td style="padding:8px;color:#0f172a;font-weight:bold;font-size:16px;">${reference}</td>
            </tr>
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Document Type</td>
              <td style="padding:8px;color:#0f172a;">${docType}</td>
            </tr>
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Property</td>
              <td style="padding:8px;color:#0f172a;">${data.address}</td>
            </tr>
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Tenant Name</td>
              <td style="padding:8px;color:#0f172a;">${data.tenantName}</td>
            </tr>
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Sent To</td>
              <td style="padding:8px;color:#0f172a;">${data.tenantEmail}</td>
            </tr>
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Date &amp; Time</td>
              <td style="padding:8px;color:#0f172a;">${sentAtStr}</td>
            </tr>
            ${isOriginal ? `
            <tr style="border-bottom:1px solid #bbf7d0;">
              <td style="padding:8px;color:#64748b;font-weight:bold;">Review Link</td>
              <td style="padding:8px;"><a href="${data.reviewLink}" style="color:#0f172a;">${data.reviewLink}</a></td>
            </tr>` : ''}
            <tr>
              <td style="padding:8px;color:#64748b;font-weight:bold;">PDF Attached</td>
              <td style="padding:8px;color:#0f172a;">${pdfFilename}</td>
            </tr>
          </table>
        </div>
        <div style="padding:16px;background:#fef9c3;border:1px solid #fde047;font-size:12px;color:#854d0e;">
          <strong>Legal note:</strong> This email confirms that the above document was successfully dispatched to the tenant's email address at the date and time shown. This record should be retained as evidence of dispatch for deposit scheme adjudication purposes.
        </div>
        <div style="background:#f8fafc;padding:12px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Bergason Property Services · Auto-generated dispatch record</p>
        </div>
      </div>
    `;
    await transporter.sendMail({
        from: FROM_ADDRESS,
        to: OFFICE_EMAIL,
        subject: `[DISPATCH RECORD] ${reference} — ${docType} sent to ${data.tenantName} — ${data.address}`,
        html: confirmationHtml,
        attachments: [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    // ── 5. Store dispatch record in Firestore ──────────────────────────────
    const db = (0, firestore_1.getFirestore)();
    const dispatchRecord = {
        reference,
        type: data.type,
        docType,
        tenantName: data.tenantName,
        tenantEmail: data.tenantEmail,
        address: data.address,
        sentAt: firestore_1.FieldValue.serverTimestamp(),
        sentAtISO: sentAt.toISOString(),
        pdfStoragePath: data.pdfStoragePath,
        reviewLink: data.reviewLink || null,
        firestoreToken: data.firestoreToken,
    };
    // Save under the inventory document and also as a top-level dispatch record
    await db.collection('inventories').doc(data.firestoreToken)
        .collection('dispatches').add(dispatchRecord);
    await db.collection('dispatches').doc(reference).set(dispatchRecord);
    // Update the main inventory record with the reference
    const updateField = isOriginal ? 'dispatchReference' : 'reviewDispatchReference';
    await db.collection('inventories').doc(data.firestoreToken)
        .update({ [updateField]: reference });
    return { success: true, reference };
});
//# sourceMappingURL=index.js.map