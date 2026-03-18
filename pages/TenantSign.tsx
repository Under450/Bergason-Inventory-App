import React, { useState, useEffect } from 'react';
import bergasonLogo from '../bergasonlogo.png';
import { useParams } from 'react-router-dom';
import { getInventoryByToken, updateTenantProgress, FirestoreInventory } from '../services/inventory';
import { sendInventoryEmail } from '../services/email';
import { uploadPDFToStorage } from '../services/storage';
import { captureElementAsPDF } from '../services/pdf';
import { SignaturePad } from '../components/SignaturePad';
import { formatDate } from '../utils';
import { Photo } from '../types';

const CONDITION_BADGE: Record<string, { bg: string; color: string }> = {
  'Excellent':           { bg: '#16a34a', color: '#fff' },
  'Good':                { bg: '#dcfce7', color: '#166534' },
  'Fair':                { bg: '#fef9c3', color: '#854d0e' },
  'Consistent With Age': { bg: '#dbeafe', color: '#1e40af' },
  'Poor':                { bg: '#ffedd5', color: '#9a3412' },
  'Needs Attention':     { bg: '#dc2626', color: '#fff' },
};

const CLEANLINESS_BADGE: Record<string, { bg: string; color: string }> = {
  'Professional Clean': { bg: '#16a34a', color: '#fff' },
  'Domestic Clean':     { bg: '#dbeafe', color: '#1e40af' },
  'Good':               { bg: '#dcfce7', color: '#166534' },
  'Fair':               { bg: '#fef9c3', color: '#854d0e' },
  'Poor':               { bg: '#ffedd5', color: '#9a3412' },
  'Dirty':              { bg: '#dc2626', color: '#fff' },
};

const BergasonLogo = () => (
  <img src={bergasonLogo} alt="Bergason Property Services" className="w-24 h-auto" />
);

const TenantSign: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<'loading' | 'ready' | 'complete' | 'already_signed' | 'error'>('loading');
  const [data, setData] = useState<FirestoreInventory | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [sigForPdf, setSigForPdf] = useState<string | null>(null);
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

  const getActiveRooms = (inv: FirestoreInventory) => {
    const activeIds = inv.inventory.activeRoomIds;
    return activeIds && activeIds.length > 0
      ? inv.inventory.rooms.filter(r => activeIds.includes(r.id))
      : inv.inventory.rooms;
  };

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

      // Inject signature into hidden PDF div and wait for re-render
      setSigForPdf(signatureData);
      await new Promise(r => setTimeout(r, 400));

      setSaveStatus('Generating signed inventory...');
      let pdfUrl: string | undefined;
      let pdfBase64: string | undefined;
      if (signatureDocRef.current) {
        try {
          const pdfBlob = await captureElementAsPDF(signatureDocRef.current);
          // Convert to base64 to send directly — avoids Storage download roundtrip
          pdfBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
          });
          setSaveStatus('Uploading document...');
          pdfUrl = await uploadPDFToStorage(pdfBlob, `pdfs/${token}/signed-inventory.pdf`);
          await updateTenantProgress(token, { signaturePdfUrl: pdfUrl });
        } catch (e) {
          console.error('Signed inventory PDF failed:', e);
          setSaving(false);
          setSaveStatus('');
          alert(`PDF generation failed — please try again.\n\nError: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
      }

      setSaveStatus('Sending confirmation email...');
      try {
        await sendInventoryEmail({
          type: 'signature_confirmation',
          tenantEmail: data.tenantEmail,
          tenantName: data.tenantName,
          address: data.inventory.address,
          pdfStoragePath: pdfUrl ? `pdfs/${token}/signed-inventory.pdf` : '',
          pdfBuffer: pdfBase64,
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
          <p className="text-slate-600">You have already signed this inventory for <strong>{data?.inventory.address}</strong>. A signed copy was emailed to you at the time of signing.</p>
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
          <p className="text-slate-400 text-sm">A signed copy of the full inventory has been emailed to {data?.tenantEmail}. You will receive a separate link when your 5-day review period begins.</p>
        </div>
      </div>
    );
  }

  const inv = data!.inventory;
  const rooms = getActiveRooms(data!);

  return (
    <>
      {/* ── Hidden document for PDF capture ── */}
      <div
        ref={signatureDocRef}
        style={{ position: 'fixed', top: 0, left: '-10000px', width: '794px', backgroundColor: '#fff', padding: '40px', fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#1e293b', zIndex: -1 }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '3px double #d4af37', paddingBottom: '20px', marginBottom: '24px' }}>
          <img src={bergasonLogo} alt="Bergason Property Services" crossOrigin="anonymous" style={{ width: '100px', height: 'auto', margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', margin: '8px 0 4px' }}>
            Inventory &amp; Schedule of Condition
          </h1>
          <p style={{ color: '#64748b', margin: 0 }}>{inv.address}</p>
        </div>

        {/* Property details table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
          <tbody>
            {[
              ['Tenant', data?.tenantName],
              ['Email', data?.tenantEmail],
              ['Property', inv.address],
              ['Property Type', inv.propertyType || '—'],
              ['Inventory Date', formatDate(inv.dateCreated)],
              ['Signature Date', formatDate(Date.now())],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', color: '#64748b', fontWeight: 'bold', width: '35%' }}>{label}</td>
                <td style={{ padding: '8px', color: '#0f172a' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Front image */}
        {inv.frontImage && (
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <img src={inv.frontImage} crossOrigin="anonymous" alt="Property" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '4px' }} />
          </div>
        )}

        {/* All rooms and items */}
        {rooms.map(room => (
          <div key={room.id} style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 'bold', backgroundColor: '#0f172a', color: '#fff', padding: '8px 12px', margin: 0 }}>{room.name}</h2>
            {room.items.map(item => {
              const photos = item.photos.map(p => { try { return JSON.parse(p) as Photo; } catch { return null; } }).filter(Boolean) as Photo[];
              const condBadge = CONDITION_BADGE[item.condition] || { bg: '#e2e8f0', color: '#334155' };
              const cleanBadge = CLEANLINESS_BADGE[item.cleanliness] || { bg: '#e2e8f0', color: '#334155' };
              return (
                <div key={item.id} style={{ borderBottom: '1px solid #e2e8f0', padding: '8px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '12px' }}>{item.name}</strong>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px', backgroundColor: condBadge.bg, color: condBadge.color }}>{item.condition}</span>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px', backgroundColor: cleanBadge.bg, color: cleanBadge.color }}>{item.cleanliness}</span>
                    </div>
                  </div>
                  {(item.meterType || item.supplier || item.make || item.model || item.serialNumber || item.workingStatus) && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {[item.meterType && `Type: ${item.meterType}`, item.supplier && `Supplier: ${item.supplier}`, item.make && `Make: ${item.make}`, item.model && `Model: ${item.model}`, item.serialNumber && `Serial: ${item.serialNumber}`, item.workingStatus && `Status: ${item.workingStatus}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {item.description && <p style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', margin: '3px 0 0' }}>"{item.description}"</p>}
                  {photos.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {photos.map(ph => (
                        <img key={ph.id} src={ph.url} crossOrigin="anonymous" alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '3px' }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Declaration */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '4px', marginTop: '24px', marginBottom: '20px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
          I confirm that I have received and reviewed the Inventory &amp; Schedule of Condition for the above property. I acknowledge that this document forms part of my tenancy agreement and agree that it represents an accurate record of the property at the date of inspection, subject to any disputes I may raise during the 5-day review period following my move-in.
        </div>

        {/* Tenant signature */}
        <div>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Tenant Signature — {data?.tenantName} — {formatDate(Date.now())}</p>
          {sigForPdf ? (
            <img src={sigForPdf} alt="Tenant Signature" style={{ maxWidth: '300px', height: '80px', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
          ) : (
            <div style={{ border: '1px solid #e2e8f0', height: '80px', borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '12px', color: '#94a3b8', fontSize: '12px' }}>
              Awaiting signature...
            </div>
          )}
        </div>
      </div>

      {/* ── Visible page ── */}
      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="bg-bergason-navy text-white px-6 pt-8 pb-14 rounded-b-3xl shadow-xl">
          <div className="flex justify-center mb-5"><BergasonLogo /></div>
          <h1 className="text-center text-xl font-bold">Inventory &amp; Schedule of Condition</h1>
          <p className="text-center text-blue-200 text-sm mt-1">{inv.address}</p>
          <p className="text-center text-blue-200 text-xs mt-1">Inventory date: {formatDate(inv.dateCreated)}</p>
        </div>

        <div className="px-4 -mt-8 max-w-xl mx-auto space-y-4">
          {/* Property card */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h2 className="font-bold text-slate-800 mb-3">Property Details</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between"><span className="font-medium text-slate-400">Tenant</span><span>{data?.tenantName}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Property</span><span className="text-right max-w-[60%]">{inv.address}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Type</span><span>{inv.propertyType || '—'}</span></div>
              <div className="flex justify-between"><span className="font-medium text-slate-400">Rooms</span><span>{rooms.length}</span></div>
            </div>
          </div>

          {/* Instruction banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">Please review and sign below</p>
            <p>Scroll through the full inventory. When you are satisfied, sign at the bottom to confirm you have received this document. A signed copy will be emailed to you.</p>
            <p className="mt-2">You will also receive a separate link to go through the inventory room-by-room within 5 days of your move-in and raise any disputes.</p>
          </div>

          {/* Front image */}
          {inv.frontImage && (
            <div className="rounded-xl overflow-hidden shadow-md">
              <img src={inv.frontImage} alt="Property" className="w-full object-cover max-h-56" />
            </div>
          )}

          {/* Full inventory — read only */}
          {rooms.map(room => (
            <div key={room.id}>
              <div className="bg-[#0f172a] text-white px-4 py-3 rounded-t-xl">
                <h2 className="font-bold text-base">{room.name}</h2>
                <p className="text-xs text-blue-200 mt-0.5">{room.items.length} items</p>
              </div>
              <div className="bg-white rounded-b-xl shadow-md divide-y divide-slate-100 overflow-hidden">
                {room.items.map(item => {
                  const photos = item.photos.map(p => { try { return JSON.parse(p) as Photo; } catch { return null; } }).filter(Boolean) as Photo[];
                  const condBadge = CONDITION_BADGE[item.condition] || { bg: '#e2e8f0', color: '#334155' };
                  const cleanBadge = CLEANLINESS_BADGE[item.cleanliness] || { bg: '#e2e8f0', color: '#334155' };
                  return (
                    <div key={item.id} className="p-4">
                      <h3 className="font-bold text-slate-800 text-sm mb-2">{item.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: condBadge.bg, color: condBadge.color }}>{item.condition}</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: cleanBadge.bg, color: cleanBadge.color }}>{item.cleanliness}</span>
                      </div>
                      {(item.meterType || item.supplier || item.make || item.model || item.serialNumber || item.workingStatus) && (
                        <div className="text-xs text-slate-400 mb-2 space-y-0.5">
                          {item.meterType && <div>Type: {item.meterType}</div>}
                          {item.supplier && <div>Supplier: {item.supplier}</div>}
                          {item.make && <div>Make: {item.make} {item.model ? `— ${item.model}` : ''}</div>}
                          {item.serialNumber && <div>Serial: {item.serialNumber}</div>}
                          {item.workingStatus && <div>Status: {item.workingStatus}</div>}
                        </div>
                      )}
                      {item.description && <p className="text-xs text-slate-500 italic mb-2">"{item.description}"</p>}
                      {photos.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {photos.map(photo => (
                            <img key={photo.id} src={photo.url} className="w-16 h-16 object-cover rounded-lg border border-slate-200" alt="" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Declaration box */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-800 mb-1">Declaration</p>
            I confirm that I have received and reviewed the Inventory &amp; Schedule of Condition for the above property. I acknowledge that this document forms part of my tenancy agreement and agree that it represents an accurate record of the property at the date of inspection, subject to any disputes I may raise during the 5-day review period following my move-in.
          </div>

          {/* Signature pad */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h3 className="font-bold text-slate-800 mb-1">Sign to Confirm Receipt</h3>
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
