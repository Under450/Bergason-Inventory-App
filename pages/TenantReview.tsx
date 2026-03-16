import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getInventoryByToken, updateTenantProgress, FirestoreInventory, TenantReviewData } from '../services/inventory';
import { captureElementAsPDF } from '../services/pdf';
import { uploadPDFToStorage } from '../services/storage';
import { sendInventoryEmail } from '../services/email';
import { SignaturePad } from '../components/SignaturePad';
import { uploadImage } from '../services/cloudinary';
import { Photo } from '../types';
import { formatDate } from '../utils';

type Stage = 'loading' | 'welcome' | 'review' | 'signature' | 'complete' | 'expired' | 'error';

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
  <div className="flex flex-col items-center justify-center bg-black p-3 border-2 border-amber-500 w-32">
    <div className="text-xl font-serif text-white tracking-wide">Bergason</div>
    <div className="text-[8px] uppercase tracking-widest text-white border-t border-amber-500 pt-1 w-full text-center mt-1">
      Property Services
    </div>
  </div>
);

const TenantReview: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>('loading');
  const [data, setData] = useState<FirestoreInventory | null>(null);
  const [review, setReview] = useState<TenantReviewData>({});
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [reviewPdfUrl, setReviewPdfUrl] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const reviewReportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) { setStage('error'); return; }
    loadInventory();
  }, [token]);

  useEffect(() => {
    if (!data?.expiresAt) return;
    const tick = () => {
      const ms = data.expiresAt! - Date.now();
      if (ms <= 0) { setStage('expired'); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setTimeRemaining(d > 0 ? `${d}d ${h}h remaining` : h > 0 ? `${h}h ${m}m remaining` : `${m} minutes remaining`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [data]);

  const loadInventory = async () => {
    try {
      const inv = await getInventoryByToken(token!);
      if (!inv) { setStage('error'); return; }
      if (inv.expiresAt && inv.expiresAt < Date.now()) { setStage('expired'); return; }
      if (inv.status === 'completed') { setData(inv); setStage('complete'); return; }
      setData(inv);
      setReview(inv.tenantReview || {});
      setStage('welcome');
    } catch {
      setStage('error');
    }
  };

  const getActiveRooms = (inv: FirestoreInventory) => {
    const activeIds = inv.inventory.activeRoomIds;
    return activeIds && activeIds.length > 0
      ? inv.inventory.rooms.filter(r => activeIds.includes(r.id))
      : inv.inventory.rooms;
  };

  const getTotalItems = () => {
    if (!data) return 0;
    return getActiveRooms(data).reduce((sum, r) => sum + r.items.length, 0);
  };

  const getReviewedCount = () => Object.keys(review).length;

  const allReviewed = () => getReviewedCount() >= getTotalItems() && getTotalItems() > 0;

  const hasUncommentedDisputes = () =>
    Object.values(review).some(r => r.agreed === false && !r.comment?.trim());

  const canSubmit = allReviewed() && !hasUncommentedDisputes();

  const handleItemReview = async (itemId: string, agreed: boolean, comment = '') => {
    const existing = review[itemId] || {};
    const updated = { ...review, [itemId]: { ...existing, agreed, comment: agreed ? '' : (existing.comment || comment) } };
    setReview(updated);
    if (token) await updateTenantProgress(token, { tenantReview: updated, status: 'reviewing' });
  };

  const handleDisputeComment = async (itemId: string, comment: string) => {
    const existing = review[itemId] || { agreed: false };
    const updated = { ...review, [itemId]: { ...existing, comment } };
    setReview(updated);
    if (token) await updateTenantProgress(token, { tenantReview: updated });
  };

  const handlePhotoUpload = async (itemId: string, file: File) => {
    setUploadingItem(itemId);
    try {
      const url = await uploadImage(file);
      const existing = review[itemId] || { agreed: false };
      const photos = [...(existing.photos || []), url];
      const updated = { ...review, [itemId]: { ...existing, photos } };
      setReview(updated);
      if (token) await updateTenantProgress(token, { tenantReview: updated });
    } finally {
      setUploadingItem(null);
    }
  };

  const saveAndContinueLater = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await updateTenantProgress(token, { tenantReview: review, status: 'reviewing' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (signatureData: string) => {
    if (!token) return;
    setSaving(true);
    const completedAt = Date.now();
    try {
      setSaveStatus('Saving your review...');
      await updateTenantProgress(token, {
        tenantSignature: signatureData,
        tenantReviewCompletedAt: completedAt,
        status: 'completed',
      });

      setSaveStatus('Generating PDF report...');
      if (reviewReportRef.current && data) {
        try {
          const pdfBlob = await captureElementAsPDF(reviewReportRef.current);
          setSaveStatus('Uploading PDF...');
          const storagePath = `pdfs/${token}/review.pdf`;
          const pdfUrl = await uploadPDFToStorage(pdfBlob, storagePath);
          await updateTenantProgress(token, { reviewPdfUrl: pdfUrl });
          setReviewPdfUrl(pdfUrl);

          setSaveStatus('Sending email...');
          await sendInventoryEmail({
            type: 'review_complete',
            tenantEmail: data.tenantEmail,
            tenantName: data.tenantName,
            address: data.inventory.address,
            pdfStoragePath: storagePath,
            firestoreToken: token!,
          });
        } catch (pdfErr) {
          console.warn('Review PDF/email failed (non-fatal):', pdfErr);
        }
      }
      setStage('complete');
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-circle-notch fa-spin text-3xl text-slate-400 mb-4 block"></i>
          <p className="text-slate-500">Loading your inventory...</p>
        </div>
      </div>
    );
  }

  if (stage === 'expired') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-clock text-red-500 text-2xl"></i>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Review Period Closed</h1>
          <p className="text-slate-500">The 5-day review window has closed. Please contact Bergason Property Services if you have any concerns.</p>
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Link</h1>
          <p className="text-slate-500">This link is not valid or has expired. Please check your email or contact Bergason Property Services.</p>
        </div>
      </div>
    );
  }

  const inv = data!.inventory;
  const rooms = getActiveRooms(data!);
  const totalItems = getTotalItems();
  const reviewedCount = getReviewedCount();
  const progressPct = totalItems > 0 ? Math.round((reviewedCount / totalItems) * 100) : 0;

  // ── WELCOME ────────────────────────────────────────────────────────────────
  if (stage === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="bg-[#0f172a] text-white px-6 pt-8 pb-16 rounded-b-3xl shadow-xl">
          <div className="flex justify-center mb-5"><BergasonLogo /></div>
          <h1 className="text-center text-xl font-bold">{inv.address}</h1>
          <p className="text-center text-blue-200 text-sm mt-1">Inventory date: {formatDate(inv.dateCreated)}</p>
          {timeRemaining && (
            <div className="flex items-center justify-center gap-2 mt-2 text-amber-400 font-semibold text-sm">
              <i className="fas fa-clock"></i>
              <span>{timeRemaining}</span>
            </div>
          )}
        </div>

        <div className="px-4 -mt-10 max-w-xl mx-auto space-y-4">
          {/* Property card */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h2 className="font-bold text-slate-800 mb-3">Your Inventory</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between"><span className="text-slate-400 font-medium">Tenant</span><span>{data?.tenantName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 font-medium">Property</span><span className="text-right max-w-[60%]">{inv.address}</span></div>
              {inv.propertyType && <div className="flex justify-between"><span className="text-slate-400 font-medium">Type</span><span>{inv.propertyType}</span></div>}
              <div className="flex justify-between"><span className="text-slate-400 font-medium">Rooms</span><span>{rooms.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 font-medium">Total items</span><span>{totalItems}</span></div>
            </div>
          </div>

          {/* Progress (if returning) */}
          {reviewedCount > 0 && (
            <div className="bg-white rounded-xl shadow-md p-5">
              <div className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                <span>Progress saved</span>
                <span>{reviewedCount} / {totalItems} items</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-[#0f172a] h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
            <p className="font-bold">What you need to do:</p>
            <p>Scroll through the full inventory below. For each item, tap <strong>Agree</strong> if it matches what you found, or <strong>Dispute</strong> if you disagree — add a comment and photo if disputing.</p>
            <p>Your progress saves automatically. You can close and return at any time{timeRemaining ? ` — ${timeRemaining}` : ''}.</p>
          </div>

          {/* Room list preview */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Rooms in this inventory</h2>
            </div>
            {rooms.map(room => (
              <div key={room.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-700">{room.name}</span>
                <span className="text-xs text-slate-400">{room.items.length} items</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setStage('review'); window.scrollTo(0, 0); }}
            className="w-full bg-[#0f172a] text-white py-4 rounded-xl font-bold text-base shadow-lg active:scale-95 transition-transform"
          >
            {reviewedCount > 0 ? `Continue Review (${reviewedCount}/${totalItems}) →` : 'Begin Full Review →'}
          </button>
        </div>
      </div>
    );
  }

  // ── REVIEW — full scrollable inventory ────────────────────────────────────
  if (stage === 'review') {
    return (
      <div className="min-h-screen bg-slate-50 pb-40">
        {/* Sticky progress header */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
            <button onClick={() => { setStage('welcome'); window.scrollTo(0, 0); }} className="text-slate-500 text-sm">
              <i className="fas fa-arrow-left mr-1" /> Back
            </button>
            <div className="text-center">
              <div className="text-sm font-bold text-slate-800">{reviewedCount} / {totalItems} reviewed</div>
              {timeRemaining && <div className="text-xs text-amber-500">{timeRemaining}</div>}
            </div>
            <div className="w-16 text-right">
              {saving
                ? <i className="fas fa-circle-notch fa-spin text-amber-400 text-sm" />
                : <i className="fas fa-cloud text-green-400 text-sm" />}
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1">
            <div className="bg-[#0f172a] h-1 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-4">
          {/* Property header */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3"><BergasonLogo /></div>
            <h1 className="font-bold text-slate-900 text-lg">{inv.address}</h1>
            <p className="text-slate-500 text-sm">Inventory date: {formatDate(inv.dateCreated)}</p>
            {inv.propertyType && <p className="text-slate-400 text-xs mt-1">{inv.propertyType}</p>}
          </div>

          {/* Front image */}
          {inv.frontImage && (
            <div className="mb-6 rounded-xl overflow-hidden shadow-md">
              <img src={inv.frontImage} alt="Property" className="w-full object-cover max-h-64" />
            </div>
          )}

          {/* All rooms */}
          {rooms.map(room => {
            const roomReviewed = room.items.filter(i => review[i.id] !== undefined).length;
            return (
              <div key={room.id} className="mb-6">
                {/* Room header */}
                <div className="bg-[#0f172a] text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
                  <h2 className="font-bold text-base">{room.name}</h2>
                  <span className="text-xs text-blue-200">{roomReviewed}/{room.items.length} reviewed</span>
                </div>

                {/* Items */}
                <div className="bg-white rounded-b-xl shadow-md divide-y divide-slate-100 overflow-hidden">
                  {room.items.map(item => {
                    const r = review[item.id];
                    const photos = item.photos.map(p => {
                      try { return JSON.parse(p) as Photo; } catch { return null; }
                    }).filter(Boolean) as Photo[];
                    const condBadge = CONDITION_BADGE[item.condition] || { bg: '#e2e8f0', color: '#334155' };
                    const cleanBadge = CLEANLINESS_BADGE[item.cleanliness] || { bg: '#e2e8f0', color: '#334155' };
                    const isMeter = item.meterType !== undefined || item.supplier !== undefined;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 transition-colors ${
                          r === undefined ? '' : r.agreed ? 'bg-green-50/50' : 'bg-orange-50/50'
                        }`}
                      >
                        {/* Item name + status badge */}
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <h3 className="font-bold text-slate-800 text-sm leading-snug">{item.name}</h3>
                          {r !== undefined && (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              r.agreed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {r.agreed ? '✓ Agreed' : '⚠ Disputed'}
                            </span>
                          )}
                        </div>

                        {/* Condition + Cleanliness badges */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: condBadge.bg, color: condBadge.color }}>
                            {item.condition}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: cleanBadge.bg, color: cleanBadge.color }}>
                            {item.cleanliness}
                          </span>
                        </div>

                        {/* Meter details */}
                        {isMeter && (
                          <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 mb-2 space-y-0.5">
                            {item.meterType && <div><span className="font-medium">Type:</span> {item.meterType}</div>}
                            {item.supplier && <div><span className="font-medium">Supplier:</span> {item.supplier}</div>}
                            {item.make && <div><span className="font-medium">Make:</span> {item.make}</div>}
                            {item.model && <div><span className="font-medium">Model:</span> {item.model}</div>}
                            {item.serialNumber && <div><span className="font-medium">Serial:</span> {item.serialNumber}</div>}
                            {item.workingStatus && <div><span className="font-medium">Status:</span> {item.workingStatus}</div>}
                          </div>
                        )}

                        {/* Appliance details (non-meter) */}
                        {!isMeter && (item.make || item.model || item.serialNumber || item.workingStatus) && (
                          <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 mb-2 space-y-0.5">
                            {item.make && <div><span className="font-medium">Make:</span> {item.make}</div>}
                            {item.model && <div><span className="font-medium">Model:</span> {item.model}</div>}
                            {item.serialNumber && <div><span className="font-medium">Serial:</span> {item.serialNumber}</div>}
                            {item.workingStatus && <div><span className="font-medium">Status:</span> {item.workingStatus}</div>}
                          </div>
                        )}

                        {/* Inspector notes */}
                        {item.description && (
                          <p className="text-sm text-slate-500 italic mb-3">"{item.description}"</p>
                        )}

                        {/* Inspector photos */}
                        {photos.length > 0 && (
                          <div className="flex gap-2 flex-wrap mb-3">
                            {photos.map(photo => (
                              <img
                                key={photo.id}
                                src={photo.url}
                                className="w-20 h-20 object-cover rounded-lg cursor-pointer border border-slate-200 hover:opacity-80"
                                onClick={() => setViewingPhoto(photo.url)}
                                alt=""
                              />
                            ))}
                          </div>
                        )}

                        {/* Agree / Dispute buttons */}
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => handleItemReview(item.id, true)}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${
                              r?.agreed === true
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-green-400 hover:text-green-600'
                            }`}
                          >
                            ✅ Agree
                          </button>
                          <button
                            onClick={() => handleItemReview(item.id, false, r?.comment || '')}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${
                              r?.agreed === false
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-orange-400 hover:text-orange-600'
                            }`}
                          >
                            ❌ Dispute
                          </button>
                        </div>

                        {/* Dispute details */}
                        {r?.agreed === false && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={r.comment || ''}
                              onChange={e => handleDisputeComment(item.id, e.target.value)}
                              placeholder="Describe the issue clearly... *required"
                              className="w-full text-sm p-3 border-2 border-orange-200 rounded-lg outline-none focus:border-orange-400 min-h-[70px] resize-y bg-white"
                            />
                            {!r.comment?.trim() && (
                              <p className="text-xs text-red-500">A comment is required.</p>
                            )}
                            <label className="flex items-center gap-2 text-sm text-orange-600 font-medium cursor-pointer w-fit">
                              {uploadingItem === item.id
                                ? <><i className="fas fa-circle-notch fa-spin" /> Uploading...</>
                                : <><i className="fas fa-camera" /> Add photo (optional)</>}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => e.target.files?.[0] && handlePhotoUpload(item.id, e.target.files[0])} />
                            </label>
                            {r.photos && r.photos.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {r.photos.map((url, i) => (
                                  <img key={i} src={url} className="w-14 h-14 object-cover rounded-lg border-2 border-orange-200 cursor-pointer"
                                    onClick={() => setViewingPhoto(url)} />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Fixed bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl p-4">
          <div className="max-w-2xl mx-auto space-y-2">
            {allReviewed() && hasUncommentedDisputes() && (
              <p className="text-xs text-center text-red-500">Please add a comment for each disputed item before submitting.</p>
            )}
            {!allReviewed() && (
              <p className="text-xs text-center text-slate-400">
                {totalItems - reviewedCount} item{totalItems - reviewedCount !== 1 ? 's' : ''} still to review
              </p>
            )}
            <button
              onClick={() => { setStage('signature'); window.scrollTo(0, 0); }}
              disabled={!canSubmit}
              className={`w-full py-3.5 rounded-xl font-bold text-base transition-all ${
                canSubmit ? 'bg-[#0f172a] text-white shadow-lg active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {canSubmit ? 'Submit & Sign Review →' : `Review All Items (${reviewedCount}/${totalItems})`}
            </button>
            <button
              onClick={async () => { await saveAndContinueLater(); setStage('welcome'); window.scrollTo(0, 0); }}
              className="w-full py-2 text-sm text-slate-400 font-medium hover:text-slate-600"
            >
              💾 Save & Continue Later
            </button>
          </div>
        </div>

        {/* Photo lightbox */}
        {viewingPhoto && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewingPhoto(null)}>
            <img src={viewingPhoto} className="max-w-full max-h-full rounded-lg object-contain" alt="" />
            <button className="absolute top-5 right-5 text-white text-3xl leading-none">×</button>
          </div>
        )}
      </div>
    );
  }

  // ── SIGNATURE ──────────────────────────────────────────────────────────────
  if (stage === 'signature') {
    const agreedCount = Object.values(review).filter(r => r.agreed).length;
    const disputedCount = Object.values(review).filter(r => !r.agreed).length;
    const disputes = rooms.flatMap(room =>
      room.items
        .filter(item => review[item.id]?.agreed === false)
        .map(item => ({ room: room.name, item: item.name, comment: review[item.id]?.comment, photos: review[item.id]?.photos }))
    );

    return (
      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="bg-[#0f172a] text-white px-6 pt-8 pb-10 rounded-b-3xl">
          <h1 className="text-2xl font-bold text-center">Review Complete</h1>
          <p className="text-blue-200 text-sm text-center mt-1">{inv.address}</p>
        </div>

        <div className="max-w-xl mx-auto px-4 pt-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{agreedCount}</div>
              <div className="text-xs text-green-600 font-bold uppercase tracking-wide mt-1">Items Agreed</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-500">{disputedCount}</div>
              <div className="text-xs text-orange-500 font-bold uppercase tracking-wide mt-1">Items Disputed</div>
            </div>
          </div>

          {/* Disputes summary */}
          {disputes.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <h3 className="font-bold text-orange-800 mb-3 text-sm uppercase tracking-wide">Your Disputes</h3>
              <div className="space-y-3">
                {disputes.map((d, i) => (
                  <div key={i} className="border-b border-orange-100 pb-2 last:border-0 last:pb-0">
                    <p className="font-bold text-sm text-orange-800">{d.room} — {d.item}</p>
                    {d.comment && <p className="text-sm text-orange-700 mt-0.5">"{d.comment}"</p>}
                    {d.photos && d.photos.length > 0 && (
                      <div className="flex gap-2 mt-1">
                        {d.photos.map((url, j) => (
                          <img key={j} src={url} className="w-12 h-12 object-cover rounded cursor-pointer"
                            onClick={() => setViewingPhoto(url)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { setStage('review'); window.scrollTo(0, 0); }}
            className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
            ← Go back and amend
          </button>

          {/* Declaration */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
            By signing below, I confirm I have reviewed this inventory in full. Any disputes raised are recorded above and will be forwarded to Bergason Property Services. I understand this signed review forms part of my tenancy record.
          </div>

          {/* Signature */}
          <div className="bg-white rounded-xl shadow-md p-5">
            <h3 className="font-bold text-slate-800 mb-1">Sign to Submit</h3>
            <p className="text-xs text-slate-400 mb-4">{data?.tenantName} — {formatDate(Date.now())}</p>
            {saving ? (
              <div className="py-8 text-center">
                <i className="fas fa-circle-notch fa-spin text-3xl text-slate-400 mb-3 block"></i>
                <p className="text-sm font-bold text-slate-600">{saveStatus}</p>
              </div>
            ) : (
              <SignaturePad onSave={handleSubmit} onClear={() => {}} />
            )}
          </div>
        </div>

        {viewingPhoto && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewingPhoto(null)}>
            <img src={viewingPhoto} className="max-w-full max-h-full rounded-lg object-contain" />
            <button className="absolute top-5 right-5 text-white text-3xl">×</button>
          </div>
        )}
      </div>
    );
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden review report for PDF generation */}
      <div
        ref={reviewReportRef}
        style={{ position: 'fixed', top: 0, left: '-10000px', width: '794px', backgroundColor: '#fff', padding: '40px', fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#1e293b' }}
      >
        <div style={{ textAlign: 'center', borderBottom: '3px double #d4af37', paddingBottom: '24px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#0f172a', display: 'inline-block', padding: '12px 24px', marginBottom: '12px' }}>
            <div style={{ color: '#d4af37', fontSize: '20px', fontWeight: 'bold', letterSpacing: '2px' }}>BERGASON</div>
            <div style={{ color: '#fff', fontSize: '9px', letterSpacing: '4px', textAlign: 'center' }}>PROPERTY SERVICES</div>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '8px' }}>Tenant Review Report</h1>
          <p style={{ color: '#64748b', marginTop: '4px' }}>{data?.inventory.address}</p>
          <p style={{ color: '#64748b', fontSize: '12px' }}>Original Inventory: {formatDate(data?.inventory.dateCreated ?? 0)}</p>
          <p style={{ color: '#64748b', fontSize: '12px' }}>Tenant: {data?.tenantName}</p>
        </div>
        {data && (() => {
          const agreed = Object.values(review).filter(r => r.agreed).length;
          const disputed = Object.values(review).filter(r => !r.agreed).length;
          return (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <div style={{ flex: 1, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>{agreed}</div>
                <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>Items Agreed</div>
              </div>
              <div style={{ flex: 1, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ea580c' }}>{disputed}</div>
                <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: 'bold' }}>Items Disputed</div>
              </div>
            </div>
          );
        })()}
        {rooms.map(room => (
          <div key={room.id} style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#0f172a', color: '#fff', padding: '8px 12px' }}>{room.name}</h2>
            {room.items.map(item => {
              const r = review[item.id];
              const photos = item.photos.map(p => { try { return JSON.parse(p) as Photo; } catch { return null; } }).filter(Boolean) as Photo[];
              return (
                <div key={item.id} style={{ borderBottom: '1px solid #e2e8f0', padding: '10px 12px', backgroundColor: r?.agreed === false ? '#fff7ed' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{item.name}</strong>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: r?.agreed ? '#16a34a' : '#ea580c' }}>
                      {r?.agreed ? '✅ Agreed' : '❌ Disputed'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Condition: {item.condition} &nbsp;|&nbsp; Cleanliness: {item.cleanliness}
                  </div>
                  {item.description && <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#475569', marginTop: '3px' }}>"{item.description}"</div>}
                  {photos.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {photos.map(ph => <img key={ph.id} src={ph.url} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} crossOrigin="anonymous" />)}
                    </div>
                  )}
                  {r?.agreed === false && r.comment && (
                    <div style={{ marginTop: '6px', backgroundColor: '#ffedd5', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', color: '#9a3412' }}>
                      <strong>Tenant comment:</strong> {r.comment}
                    </div>
                  )}
                  {r?.photos && r.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {r.photos.map((url, i) => <img key={i} src={url} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '2px solid #fed7aa' }} crossOrigin="anonymous" />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {data?.tenantSignature && (
          <div style={{ marginTop: '32px', borderTop: '2px solid #e2e8f0', paddingTop: '16px' }}>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Signed: {data.tenantName} — {formatDate(data.tenantReviewCompletedAt ?? Date.now())}</p>
            <img src={data.tenantSignature} alt="Signature" style={{ maxWidth: '300px', height: '80px', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      {/* Complete screen */}
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-circle text-green-500 text-4xl" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Review Submitted</h1>
          <p className="text-slate-600 mb-4">
            Thank you, {data?.tenantName}. Your review has been signed and submitted to Bergason Property Services.
          </p>
          {reviewPdfUrl && (
            <a href={reviewPdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0f172a] text-white px-5 py-3 rounded-xl font-bold text-sm mb-4 hover:bg-slate-700">
              <i className="fas fa-file-pdf text-red-400"></i> Download Your Review PDF
            </a>
          )}
          <p className="text-slate-400 text-sm">Any disputes you raised have been recorded and will be reviewed. You do not need to take any further action.</p>
        </div>
      </div>
    </>
  );
};

export default TenantReview;
