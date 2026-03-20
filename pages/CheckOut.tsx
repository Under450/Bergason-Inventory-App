import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getInventoryByToken,
  saveCheckOutData,
  CheckOutData,
  CheckOutItemResult,
  FirestoreInventory,
} from '../services/inventory';
import { RoomWizard } from '../components/RoomWizard';
import { SignaturePad } from '../components/SignaturePad';
import { uploadImage } from '../services/cloudinary';

const CHECKOUT_STORAGE_KEY = 'bergason_checkout_v1';

const loadCheckoutDraft = (token: string): Partial<CheckOutData> => {
  try {
    const raw = localStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw)[token] ?? {};
  } catch { return {}; }
};

const saveCheckoutDraft = (token: string, data: Partial<CheckOutData>) => {
  try {
    const raw = localStorage.getItem(CHECKOUT_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[token] = data;
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

const clearCheckoutDraft = (token: string) => {
  try {
    const raw = localStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[token];
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

type Phase = 'loading' | 'error' | 'rooms' | 'disputes' | 'metadata' | 'submitted';

const CheckOut: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [doc, setDoc] = useState<FirestoreInventory | null>(null);
  const [checkoutItems, setCheckoutItems] = useState<{ [itemId: string]: CheckOutItemResult }>({});
  const [submitting, setSubmitting] = useState(false);
  const [disputeCharges, setDisputeCharges] = useState<{ [itemId: string]: Partial<CheckOutItemResult> }>({});

  // Metadata state
  const [checkOutDate, setCheckOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspectorName, setInspectorName] = useState(() => localStorage.getItem('bergason_inspector_v1') ?? '');
  const [tenantPresent, setTenantPresent] = useState<boolean | null>(null);
  const [tenantRefused, setTenantRefused] = useState(false);
  const [tenantSignature, setTenantSignature] = useState<string>('');
  const [cleaningStandard, setCleaningStandard] = useState<CheckOutData['cleaningStandard']>(undefined);
  const [gasReading, setGasReading] = useState('');
  const [electricReading, setElectricReading] = useState('');
  const [waterReading, setWaterReading] = useState('');
  const [keysCount, setKeysCount] = useState('');
  const [keysNotes, setKeysNotes] = useState('');

  useEffect(() => {
    if (!token) { setPhase('error'); return; }
    const draft = loadCheckoutDraft(token);
    if (draft.items) setCheckoutItems(draft.items);
    getInventoryByToken(token)
      .then(d => {
        if (!d) { setPhase('error'); return; }
        setDoc(d);
        if (d.inventory.inspectorName) setInspectorName(d.inventory.inspectorName);
        setPhase('rooms');
      })
      .catch(() => setPhase('error'));
  }, [token]);

  const updateCheckoutItem = (roomId: string, itemId: string, result: CheckOutItemResult) => {
    setCheckoutItems(prev => {
      const next = { ...prev, [itemId]: result };
      if (token) saveCheckoutDraft(token, { items: next });
      return next;
    });
  };

  const handleAddPhoto = async (roomId: string, itemId: string, file: File): Promise<void> => {
    const url = await uploadImage(file);
    setCheckoutItems(prev => {
      const existing = prev[itemId] ?? { changed: true };
      const photos = [...(existing.photos ?? []), url].slice(0, 5);
      const next = { ...prev, [itemId]: { ...existing, photos } };
      if (token) saveCheckoutDraft(token, { items: next });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!doc || !token) return;
    setSubmitting(true);
    try {
      const mergedItems = { ...checkoutItems };
      Object.entries(disputeCharges).forEach(([itemId, charge]) => {
        mergedItems[itemId] = { changed: true, ...(charge as CheckOutItemResult) };
      });

      const data: CheckOutData = {
        checkOutDate: new Date(checkOutDate).getTime(),
        inspectorName,
        tenantPresent: tenantPresent ?? false,
        tenantRefusedToSign: tenantRefused || undefined,
        tenantSignatureData: tenantSignature || undefined,
        cleaningStandard,
        meterReadings: {
          gas: gasReading ? { reading: gasReading } : undefined,
          electric: electricReading ? { reading: electricReading } : undefined,
          water: waterReading ? { reading: waterReading } : undefined,
        },
        keysReturned: keysCount ? { count: parseInt(keysCount), notes: keysNotes || undefined } : undefined,
        items: mergedItems,
      };

      await saveCheckOutData(token, data, 'checkout_complete');
      localStorage.setItem('bergason_inspector_v1', inspectorName);
      clearCheckoutDraft(token);
      setPhase('submitted');
    } catch (err) {
      alert('Submission failed. Your progress is saved locally — try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );

  if (phase === 'error') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 font-bold">Check-out not found</p>
        <button onClick={() => navigate('/')} className="mt-4 text-sm text-slate-500 underline">Back to dashboard</button>
      </div>
    </div>
  );

  if (phase === 'submitted') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center px-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check text-green-600 text-2xl" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Check-Out Complete</h2>
        <p className="text-slate-500 text-sm mb-6">All data saved. You can now export the adjudicator PDF from the inventory detail screen.</p>
        <button onClick={() => navigate('/')} className="bg-[#0f172a] text-[#d4af37] font-bold px-6 py-3 rounded-xl text-sm">Back to Dashboard</button>
      </div>
    </div>
  );

  if (!doc) return null;

  const activeRoomIds = doc.inventory.activeRoomIds ?? doc.inventory.rooms.map(r => r.id);
  const activeRooms = doc.inventory.rooms.filter(r => activeRoomIds.includes(r.id));

  const baseline: { [itemId: string]: import('../types').InventoryItem } = {};
  doc.inventory.rooms.forEach(r => r.items.forEach(i => { baseline[i.id] = i; }));

  const openDisputes = doc.inventory.rooms.flatMap(room =>
    room.items
      .filter(item => {
        const review = doc.tenantReview?.[item.id];
        if (!review || review.agreed) return false;
        const response = doc.agentDisputeResponse?.[item.id];
        return !response || !response.accepted;
      })
      .map(item => ({ item, room, review: doc.tenantReview[item.id], response: doc.agentDisputeResponse?.[item.id] }))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {phase === 'rooms' && (
        <div>
          <div className="bg-[#0f172a] text-white px-4 pt-3 pb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white p-1">
                <i className="fas fa-arrow-left" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{doc.inventory.address}</div>
                <div className="text-[#d4af37] text-xs">Check-Out Inspection</div>
              </div>
            </div>
          </div>

          <RoomWizard
            rooms={activeRooms}
            activeRoomIds={activeRoomIds}
            mode="checkout"
            baseline={baseline}
            checkoutItems={checkoutItems}
            tenantReview={doc.tenantReview}
            onItemUpdate={() => {/* no-op in checkout mode — items not edited */}}
            onCheckoutItemUpdate={updateCheckoutItem}
            onToggleRoom={() => {/* read-only in checkout */}}
            onToggleItem={() => {/* read-only in checkout */}}
            onAddPhoto={handleAddPhoto}
          />

          <div className="px-4 pb-6 mt-4">
            <button
              onClick={() => setPhase('disputes')}
              className="w-full bg-[#d4af37] text-[#0f172a] font-bold py-3 rounded-xl text-sm"
            >
              Continue to Disputes &amp; Metadata →
            </button>
          </div>
        </div>
      )}

      {phase === 'disputes' && (
        <div>
          <div className="bg-[#0f172a] text-white px-4 pt-3 pb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setPhase('rooms')} className="text-slate-400 hover:text-white p-1">
                <i className="fas fa-arrow-left" />
              </button>
              <div>
                <div className="font-bold text-sm">Open Disputes</div>
                <div className="text-[#d4af37] text-xs">{openDisputes.length} item{openDisputes.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            {openDisputes.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">No open disputes</div>
            )}
            {openDisputes.map(({ item, room, review, response }) => {
              const charge = disputeCharges[item.id];
              return (
                <div key={item.id} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
                    <span className="font-bold text-sm text-amber-900">{item.name}</span>
                    <span className="text-xs text-amber-600 ml-2">{room.name}</span>
                    {response && <span className="ml-2 text-xs font-bold text-red-600">IN DISPUTE</span>}
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {review.comment && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2">Tenant: &ldquo;{review.comment}&rdquo;</p>}
                    {response?.notes && <p className="text-xs text-slate-500 bg-red-50 rounded p-2">Your response: &ldquo;{response.notes}&rdquo;</p>}

                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {(['beyond_fwt', 'repair', 'replace', 'missing', 'left_behind'] as const).map(ct => (
                          <button
                            key={ct}
                            onClick={() => setDisputeCharges(prev => ({ ...prev, [item.id]: { ...prev[item.id], chargeType: ct, responsibility: 'tenant' } }))}
                            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${charge?.chargeType === ct ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-slate-600 border-slate-200'}`}
                          >
                            {ct === 'beyond_fwt' ? 'Beyond F.W.T.' : ct === 'left_behind' ? 'Left Behind' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                          </button>
                        ))}
                      </div>

                      {charge?.chargeType && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Estimated cost £"
                          value={charge.estimatedCost ?? ''}
                          onChange={e => setDisputeCharges(prev => ({ ...prev, [item.id]: { ...prev[item.id], estimatedCost: parseFloat(e.target.value) || undefined } }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        />
                      )}

                      <button
                        onClick={() => setDisputeCharges(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                        className="w-full text-xs text-slate-500 py-2 border border-slate-200 rounded-lg"
                      >
                        Leave for DPS — no charge
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => setPhase('metadata')}
              className="w-full bg-[#d4af37] text-[#0f172a] font-bold py-3 rounded-xl text-sm"
            >
              Continue to Final Details →
            </button>
          </div>
        </div>
      )}

      {phase === 'metadata' && (
        <div>
          <div className="bg-[#0f172a] text-white px-4 pt-3 pb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setPhase('disputes')} className="text-slate-400 hover:text-white p-1">
                <i className="fas fa-arrow-left" />
              </button>
              <div className="font-bold text-sm">Final Details</div>
            </div>
          </div>

          <div className="px-4 py-4 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Inspection Details</h3>
              <div>
                <label className="text-xs text-slate-600 block mb-1">Inspector Name</label>
                <input type="text" value={inspectorName} onChange={e => setInspectorName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">Check-Out Date</label>
                <input type="date" value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Meter Readings</h3>
              {([['Gas', gasReading, setGasReading], ['Electric', electricReading, setElectricReading], ['Water', waterReading, setWaterReading]] as const).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="text-xs text-slate-600 block mb-1">{label}</label>
                  <input type="text" value={val} onChange={e => setter(e.target.value)} placeholder="Reading…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Keys Returned</h3>
              <input type="number" min="0" value={keysCount} onChange={e => setKeysCount(e.target.value)} placeholder="Number of keys" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input type="text" value={keysNotes} onChange={e => setKeysNotes(e.target.value)} placeholder="Notes (e.g. missing Yale key)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Cleaning Standard at Departure</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['professional', 'domestic', 'good', 'fair', 'poor', 'dirty'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setCleaningStandard(s)}
                    className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${cleaningStandard === s ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Tenant Present</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setTenantPresent(true)} className={`py-2 rounded-lg text-xs font-bold border-2 ${tenantPresent === true ? 'bg-green-100 border-green-500 text-green-800' : 'bg-white border-slate-200 text-slate-600'}`}>Yes</button>
                <button onClick={() => setTenantPresent(false)} className={`py-2 rounded-lg text-xs font-bold border-2 ${tenantPresent === false ? 'bg-red-100 border-red-500 text-red-800' : 'bg-white border-slate-200 text-slate-600'}`}>No</button>
              </div>
              {tenantPresent === true && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-2">Tenant signature:</p>
                  <SignaturePad
                    onSave={(data: string) => setTenantSignature(data)}
                  />
                </div>
              )}
              {tenantPresent === false && (
                <label className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                  <input type="checkbox" checked={tenantRefused} onChange={e => setTenantRefused(e.target.checked)} />
                  Tenant refused to sign
                </label>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !inspectorName.trim()}
              className="w-full bg-[#0f172a] text-[#d4af37] font-bold py-4 rounded-xl text-sm disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Check-Out ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckOut;
