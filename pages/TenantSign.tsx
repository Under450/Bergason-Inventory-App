import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getInventoryByToken, updateTenantProgress, FirestoreInventory } from '../services/inventory';
import { sendInventoryEmail } from '../services/email';
import { uploadPDFToStorage } from '../services/storage';
import { captureElementAsPDF } from '../services/pdf';
import { SignaturePad } from '../components/SignaturePad';
import { formatDate } from '../utils';

const BergasonLogo = () => (
  <div className="flex flex-col items-center justify-center bg-black p-3 border-2 border-amber-500 w-32">
    <div className="text-xl font-serif text-white tracking-wide">Bergason</div>
    <div className="text-[8px] uppercase tracking-widest text-white border-t border-amber-500 pt-1 w-full text-center mt-1">
      Property Services
    </div>
  </div>
);

const TenantSign: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<'loading' | 'ready' | 'signing' | 'complete' | 'already_signed' | 'error'>('loading');
  const [data, setData] = useState<FirestoreInventory | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const signatureDocRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) { setStage('error'); return; }
    getInventoryByToken(token).then(inv => {
      if (!inv) { setStage('error'); return; }
      if (inv.signatureStatus === 'signed') { setData(inv); setStage('already_signed'); return; }
      setData(inv);
      setStage('ready');
    }).catch(() => setStage('error'));
  }, [token]);

  const handleSign = async (signatureData: string) => {
    if (!token || !data) return;
    setSaving(true);

    try {
      setSaveStatus('Saving signature...');
      await updateTenantProgress(token, {
        signatureStatus: 'signed',
        tenantSignatureData: signatureData,
        status: 'signed',
      });

      setSaveStatus('Generating signed document...');
      let pdfUrl: string | undefined;
      if (signatureDocRef.current) {
        try {
          const pdfBlob = await captureElementAsPDF(signatureDocRef.current);
          setSaveStatus('Uploading document...');
          pdfUrl = await uploadPDFToStorage(pdfBlob, `pdfs/${token}/signed-confirmation.pdf`);
          await updateTenantProgress(token, { signaturePdfUrl: pdfUrl });
        } catch (e) {
          console.warn('Signature PDF generation failed:', e);
        }
      }

      setSaveStatus('Sending confirmation email...');
      try {
        await sendInventoryEmail({
          type: 'signature_confirmation',
          tenantEmail: data.tenantEmail,
          tenantName: data.tenantName,
          address: data.inventory.address,
          pdfStoragePath: pdfUrl ? `pdfs/${token}/signed-confirmation.pdf` : (data.originalPdfUrl ? `pdfs/${token}/original.pdf` : ''),
          firestoreToken: token,
        });
      } catch (e) {
        console.warn('Confirmation email failed:', e);
      }

      setStage('complete');
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <i className="fas fa-circle-notch fa-spin text-3xl text-slate-400"></i>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <i className="fas fa-exclamation-triangle text-red-400 text-4xl mb-4 block"></i>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Link</h1>
          <p className="text-slate-500">This link is not valid. Please check your email or contact Bergason Property Services.</p>
        </div>
      </div>
    );
  }

  if (stage === 'already_signed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-circle text-green-500 text-4xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Already Signed</h1>
          <p className="text-slate-600">You have already signed this inventory for <strong>{data?.inventory.address}</strong>. A copy was emailed to you at the time of signing.</p>
        </div>
      </div>
    );
  }

  if (stage === 'complete') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-circle text-green-500 text-4xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Inventory Signed</h1>
          <p className="text-slate-600 mb-2">Thank you, {data?.tenantName}. You have signed the inventory for <strong>{data?.inventory.address}</strong>.</p>
          <p className="text-slate-400 text-sm">A signed confirmation has been emailed to {data?.tenantEmail}. Please keep this for your records.</p>
        </div>
      </div>
    );
  }

  const inv = data!.inventory;

  return (
    <>
      {/* Hidden signature document for PDF capture */}
      <div
        ref={signatureDocRef}
        style={{ position: 'fixed', top: 0, left: '-10000px', width: '794px', backgroundColor: '#fff', padding: '40px', fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#1e293b' }}
      >
        <div style={{ textAlign: 'center', borderBottom: '3px double #d4af37', paddingBottom: '20px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#0f172a', display: 'inline-block', padding: '10px 24px', marginBottom: '12px' }}>
            <div style={{ color: '#d4af37', fontSize: '20px', fontWeight: 'bold', letterSpacing: '2px' }}>BERGASON</div>
            <div style={{ color: '#fff', fontSize: '9px', letterSpacing: '4px' }}>PROPERTY SERVICES</div>
          </div>
          <h1 style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', margin: '8px 0 4px' }}>Inventory Signature Confirmation</h1>
          <p style={{ color: '#64748b', margin: 0 }}>{inv.address}</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
          {[
            ['Tenant Name', data?.tenantName],
            ['Tenant Email', data?.tenantEmail],
            ['Property Address', inv.address],
            ['Inventory Date', formatDate(inv.dateCreated)],
            ['Signature Date', formatDate(Date.now())],
            ['Property Type', inv.propertyType || '—'],
          ].map(([label, value]) => (
            <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px', color: '#64748b', fontWeight: 'bold', width: '40%' }}>{label}</td>
              <td style={{ padding: '8px', color: '#0f172a' }}>{value}</td>
            </tr>
          ))}
        </table>
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '4px', marginBottom: '24px', fontSize: '12px', color: '#475569' }}>
          I confirm that I have received and reviewed the Inventory &amp; Schedule of Condition for the above property. I acknowledge that this document forms part of my tenancy agreement and agree that it represents an accurate record of the property at the date of inspection, subject to any disputes I may raise during the 5-day review period following my move-in.
        </div>
        <div style={{ marginTop: '32px' }}>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Tenant Signature — {data?.tenantName} — {formatDate(Date.now())}</p>
          {/* Signature will be injected here on capture — shown as placeholder in PDF */}
          <div style={{ border: '1px solid #e2e8f0', height: '80px', borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '12px', color: '#94a3b8', fontSize: '12px' }}>
            Signed digitally via Bergason Inventory App
          </div>
        </div>
      </div>

      {/* Visible page */}
      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="bg-bergason-navy text-white px-6 pt-8 pb-14 rounded-b-3xl shadow-xl">
          <div className="flex justify-center mb-5"><BergasonLogo /></div>
          <h1 className="text-center text-xl font-bold">Inventory Signature</h1>
          <p className="text-center text-blue-200 text-sm mt-1">{inv.address}</p>
          <p className="text-center text-blue-200 text-sm mt-1">Inventory date: {formatDate(inv.dateCreated)}</p>
        </div>

        <div className="px-4 -mt-8 max-w-xl mx-auto space-y-4">
          {/* Property summary */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h2 className="font-bold text-slate-800 mb-3">Property Details</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between"><span className="font-medium text-slate-400">Tenant</span><span>{data?.tenantName}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Property</span><span className="text-right max-w-[60%]">{inv.address}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Type</span><span>{inv.propertyType || '—'}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Rooms</span><span>{inv.activeRoomIds ? inv.activeRoomIds.length : inv.rooms.length}</span></div>
            </div>
          </div>

          {/* Declaration */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
            <p className="font-bold mb-2">Declaration</p>
            <p>I confirm that I have received and reviewed the Inventory &amp; Schedule of Condition for the above property. I acknowledge that this document forms part of my tenancy agreement.</p>
            <p className="mt-2">I understand I will have <strong>5 days from my move-in date</strong> to review the inventory in full online and raise any disputes.</p>
          </div>

          {/* Signature */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h3 className="font-bold text-slate-800 mb-1">Sign Below</h3>
            <p className="text-xs text-slate-400 mb-4">{data?.tenantName} — {formatDate(Date.now())}</p>
            {saving ? (
              <div className="py-8 text-center">
                <i className="fas fa-circle-notch fa-spin text-3xl text-slate-400 mb-3 block"></i>
                <p className="text-sm font-bold text-slate-600">{saveStatus}</p>
              </div>
            ) : (
              <SignaturePad onSave={handleSign} onClear={() => {}} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TenantSign;
