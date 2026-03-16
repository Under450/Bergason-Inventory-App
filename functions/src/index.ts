import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import * as nodemailer from 'nodemailer';

initializeApp();

const ionosPassword = defineSecret('IONOS_PASSWORD');

const FROM_ADDRESS = '"Bergason Property Services" <cjeavons@bergason.co.uk>';
const BCC_ADDRESS = 'cjeavons@bergason.co.uk';
const IONOS_USER = 'cjeavons@bergason.co.uk';
const IONOS_HOST = 'smtp.ionos.co.uk';
const IONOS_PORT = 587;

interface SendEmailRequest {
  type: 'original' | 'review';
  tenantEmail: string;
  tenantName: string;
  address: string;
  pdfStoragePath: string;   // e.g. "pdfs/abc123/original.pdf"
  reviewLink?: string;      // only for type = 'original'
}

export const sendInventoryEmail = onCall(
  { secrets: [ionosPassword], region: 'europe-west2' },
  async (request) => {
    const data = request.data as SendEmailRequest;

    if (!data.tenantEmail || !data.tenantName || !data.address || !data.pdfStoragePath) {
      throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    // Download PDF from Firebase Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(data.pdfStoragePath);
    let pdfBuffer: Buffer;
    try {
      const [downloaded] = await file.download();
      pdfBuffer = downloaded;
    } catch (err) {
      throw new HttpsError('not-found', `PDF not found at path: ${data.pdfStoragePath}`);
    }

    // Build email content
    const isOriginal = data.type === 'original';
    const subject = isOriginal
      ? `Your Inventory Report — ${data.address}`
      : `Your Completed Inventory Review — ${data.address}`;

    const html = isOriginal ? `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <div style="color: #d4af37; font-size: 22px; font-weight: bold; letter-spacing: 2px;">BERGASON</div>
          <div style="color: #fff; font-size: 10px; letter-spacing: 4px;">PROPERTY SERVICES</div>
        </div>
        <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
          <p style="color: #1e293b; font-size: 15px;">Dear ${data.tenantName},</p>
          <p style="color: #475569;">Please find attached your inventory report for <strong>${data.address}</strong>.</p>
          <p style="color: #475569;">You have <strong>5 days</strong> to review the inventory online and agree or raise any disputes. Please use the link below:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.reviewLink}" style="background: #0f172a; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
              Review Your Inventory →
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">If the button doesn't work, copy this link into your browser:<br/>${data.reviewLink}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">The original signed inventory is attached to this email as a PDF. Please keep a copy for your records.</p>
        </div>
        <div style="background: #f8fafc; padding: 16px; text-align: center; border: 1px solid #e2e8f0; border-top: none;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">Bergason Property Services · inventory@bergason.co.uk</p>
        </div>
      </div>
    ` : `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0f172a; padding: 24px; text-align: center;">
          <div style="color: #d4af37; font-size: 22px; font-weight: bold; letter-spacing: 2px;">BERGASON</div>
          <div style="color: #fff; font-size: 10px; letter-spacing: 4px;">PROPERTY SERVICES</div>
        </div>
        <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
          <p style="color: #1e293b; font-size: 15px;">Dear ${data.tenantName},</p>
          <p style="color: #475569;">Thank you for completing your inventory review for <strong>${data.address}</strong>.</p>
          <p style="color: #475569;">Your signed review report is attached to this email. Please keep it for your records — it forms part of your tenancy agreement.</p>
          <p style="color: #475569;">If you raised any disputes, these have been recorded and Bergason Property Services will be in touch if further action is required.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">If you have any questions please contact us at inventory@bergason.co.uk</p>
        </div>
        <div style="background: #f8fafc; padding: 16px; text-align: center; border: 1px solid #e2e8f0; border-top: none;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">Bergason Property Services · inventory@bergason.co.uk</p>
        </div>
      </div>
    `;

    const filename = isOriginal ? 'Bergason-Inventory.pdf' : 'Bergason-TenantReview.pdf';

    // Send via Ionos SMTP
    const transporter = nodemailer.createTransport({
      host: IONOS_HOST,
      port: IONOS_PORT,
      secure: false,
      auth: {
        user: IONOS_USER,
        pass: ionosPassword.value(),
      },
    });

    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: data.tenantEmail,
      bcc: BCC_ADDRESS,
      subject,
      html,
      attachments: [{
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    return { success: true };
  }
);
