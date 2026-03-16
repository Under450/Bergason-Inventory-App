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
const nodemailer = __importStar(require("nodemailer"));
(0, app_1.initializeApp)();
const ionosPassword = (0, params_1.defineSecret)('IONOS_PASSWORD');
const FROM_ADDRESS = '"Bergason Property Services" <cjeavons@bergason.co.uk>';
const BCC_ADDRESS = 'cjeavons@bergason.co.uk';
const IONOS_USER = 'cjeavons@bergason.co.uk';
const IONOS_HOST = 'smtp.ionos.co.uk';
const IONOS_PORT = 587;
exports.sendInventoryEmail = (0, https_1.onCall)({ secrets: [ionosPassword], region: 'europe-west2' }, async (request) => {
    const data = request.data;
    if (!data.tenantEmail || !data.tenantName || !data.address || !data.pdfStoragePath) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields.');
    }
    // Download PDF from Firebase Storage
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(data.pdfStoragePath);
    let pdfBuffer;
    try {
        const [downloaded] = await file.download();
        pdfBuffer = downloaded;
    }
    catch (err) {
        throw new https_1.HttpsError('not-found', `PDF not found at path: ${data.pdfStoragePath}`);
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
});
//# sourceMappingURL=index.js.map