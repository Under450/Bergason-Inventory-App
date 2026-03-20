import React, { useState } from 'react';
import { Room, InventoryItem, Condition, Cleanliness } from '../types';
import { CheckOutItemResult, TenantReviewData } from '../services/inventory';
import {
  CONDITION_COLORS,
  CLEANLINESS_COLORS,
  ROOM_ICONS,
  DEFAULT_DESCRIPTIONS,
} from '../constants';

// Note: onRoomComplete from the spec is omitted — progress is tracked via item-level
// localStorage state. Add it in future if per-room Firestore writes are needed.
export interface RoomWizardProps {
  rooms: Room[];
  activeRoomIds: string[];
  mode: 'checkin' | 'checkout';
  baseline?: { [itemId: string]: InventoryItem };
  checkoutItems?: { [itemId: string]: CheckOutItemResult };
  tenantReview?: TenantReviewData;
  onItemUpdate: (roomId: string, itemId: string, updates: Partial<InventoryItem>) => void;
  onCheckoutItemUpdate?: (roomId: string, itemId: string, result: CheckOutItemResult) => void;
  onToggleRoom: (roomId: string) => void;
  onToggleItem: (roomId: string, itemId: string) => void;
  onAddPhoto: (roomId: string, itemId: string, file: File) => Promise<void>;
  readOnly?: boolean;
}

// --- Room Overview ---

interface RoomOverviewProps {
  rooms: Room[];
  activeRoomIds: string[];
  mode: 'checkin' | 'checkout';
  checkoutItems?: { [itemId: string]: CheckOutItemResult };
  onRoomSelect: (roomId: string) => void;
  onToggleRoom: (roomId: string) => void;
  readOnly?: boolean;
}

const RoomOverview: React.FC<RoomOverviewProps> = ({
  rooms, activeRoomIds, mode, checkoutItems, onRoomSelect, onToggleRoom, readOnly
}) => {
  const firstIncomplete = rooms.find(r => {
    if (!activeRoomIds.includes(r.id)) return false;
    const activeItems = r.items.filter(i => !i.excluded);
    if (mode === 'checkin') return activeItems.some(i => !i.condition);
    return activeItems.some(i => !checkoutItems?.[i.id]);
  });

  const groups: { label: string; rooms: Room[] }[] = [];
  rooms.forEach(room => {
    const label = room.floorGroup ?? 'Other';
    const existing = groups.find(g => g.label === label);
    if (existing) existing.rooms.push(room);
    else groups.push({ label, rooms: [room] });
  });

  const allActive = rooms.filter(r => activeRoomIds.includes(r.id));
  const allActiveItems = allActive.flatMap(r => r.items.filter(i => !i.excluded));
  const doneItems = mode === 'checkin'
    ? allActiveItems.filter(i => i.condition).length
    : allActiveItems.filter(i => checkoutItems?.[i.id] !== undefined).length;
  const pct = allActiveItems.length ? Math.round((doneItems / allActiveItems.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-[#0f172a] text-white px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
            {mode === 'checkin' ? 'Check-In' : 'Check-Out'} — Rooms
          </span>
          <span className="text-[#d4af37] text-sm font-bold">{pct}% complete</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #d4af37, #f59e0b)' }}
          />
        </div>
      </div>

      {firstIncomplete && !readOnly && (
        <div className="px-4 py-3 bg-[#0f172a] border-t border-slate-700">
          <button
            onClick={() => onRoomSelect(firstIncomplete.id)}
            className="w-full bg-[#d4af37] text-[#0f172a] font-bold py-2.5 rounded-xl text-sm"
          >
            Continue → {firstIncomplete.name}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {groups.map(group => (
          <div key={group.label}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.rooms.map(room => {
                const isActive = activeRoomIds.includes(room.id);
                const activeItems = room.items.filter(i => !i.excluded);
                const hiddenCount = room.items.filter(i => i.excluded).length;

                let doneCount = 0;
                if (mode === 'checkin') {
                  doneCount = activeItems.filter(i => i.condition).length;
                } else {
                  doneCount = activeItems.filter(i => checkoutItems?.[i.id] !== undefined).length;
                }
                const total = activeItems.length;
                const isComplete = total > 0 && doneCount === total;
                const isInProgress = doneCount > 0 && !isComplete;
                const iconClass = ROOM_ICONS[room.name] ?? 'fa-home';

                return (
                  <div
                    key={room.id}
                    className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
                      !isActive
                        ? 'border-slate-100 opacity-50'
                        : isComplete
                        ? 'border-green-400'
                        : isInProgress
                        ? 'border-[#d4af37]'
                        : 'border-slate-200'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => isActive && !readOnly && onRoomSelect(room.id)}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isComplete ? 'bg-green-100' : 'bg-slate-100'
                      }`}>
                        {isComplete
                          ? <i className="fas fa-check text-green-600 text-sm" />
                          : <i className={`fas ${iconClass} text-slate-600 text-sm`} />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm ${!isActive ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {room.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {isComplete
                            ? <span className="text-green-600 font-semibold">Complete ✓</span>
                            : isInProgress
                            ? <span className="text-[#d4af37] font-semibold">{doneCount} / {total} items</span>
                            : `${total} items`
                          }
                          {hiddenCount > 0 && (
                            <span className="ml-2 text-slate-400">({hiddenCount} hidden)</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!readOnly && (
                          <button
                            onClick={e => { e.stopPropagation(); onToggleRoom(room.id); }}
                            title={isActive ? 'Exclude room from report' : 'Include room in report'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isActive ? 'text-slate-400 hover:text-red-400' : 'text-slate-300 hover:text-green-500'
                            }`}
                          >
                            <i className={`fas ${isActive ? 'fa-eye' : 'fa-eye-slash'} text-sm`} />
                          </button>
                        )}
                        {isActive && !readOnly && (
                          <i className="fas fa-chevron-right text-slate-300 text-xs" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Item Wizard ---

interface ItemWizardProps {
  room: Room;
  mode: 'checkin' | 'checkout';
  baseline?: { [itemId: string]: InventoryItem };
  checkoutItems?: { [itemId: string]: CheckOutItemResult };
  tenantReview?: TenantReviewData;
  onItemUpdate: (itemId: string, updates: Partial<InventoryItem>) => void;
  onCheckoutItemUpdate?: (itemId: string, result: CheckOutItemResult) => void;
  onToggleItem: (itemId: string) => void;
  onAddPhoto: (itemId: string, file: File) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

const CONDITIONS: Condition[] = [
  Condition.EXCELLENT, Condition.GOOD, Condition.FAIR,
  Condition.CWA, Condition.POOR, Condition.NEEDS_ATTENTION
];

const CLEANLINESS_OPTIONS: Cleanliness[] = [
  Cleanliness.PROFESSIONAL, Cleanliness.DOMESTIC, Cleanliness.GOOD,
  Cleanliness.FAIR, Cleanliness.POOR, Cleanliness.DIRTY
];

const ItemWizard: React.FC<ItemWizardProps> = ({
  room, mode, baseline, checkoutItems, tenantReview,
  onItemUpdate, onCheckoutItemUpdate, onToggleItem, onAddPhoto, onBack, readOnly
}) => {
  const activeItems = room.items.filter(i => !i.excluded);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [quickSetApplied, setQuickSetApplied] = useState(false);

  const item = activeItems[currentIndex];
  if (!item) return null;

  const checkoutResult = checkoutItems?.[item.id];
  const baselineItem = baseline?.[item.id];
  const disputeData = tenantReview?.[item.id];

  const handleQuickSet = (condition: Condition, cleanliness: Cleanliness) => {
    activeItems.forEach(i => {
      onItemUpdate(i.id, { condition, cleanliness });
    });
    setQuickSetApplied(true);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await onAddPhoto(item.id, file); } finally { setUploading(false); }
  };

  const goNext = () => {
    if (currentIndex < activeItems.length - 1) setCurrentIndex(i => i + 1);
    else onBack();
  };

  const pct = Math.round(((currentIndex + 1) / activeItems.length) * 100);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-[#0f172a] text-white px-4 pt-3 pb-2">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white p-1">
            <i className="fas fa-arrow-left" />
          </button>
          <span className="text-sm font-semibold truncate flex-1">{room.name}</span>
          <span className="text-[#d4af37] text-sm font-bold whitespace-nowrap">
            {currentIndex + 1} / {activeItems.length}
          </span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-1 bg-[#d4af37] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {currentIndex === 0 && mode === 'checkin' && !quickSetApplied && !readOnly && (
        <div className="bg-[#d4af37]/10 border-b border-[#d4af37]/30 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-slate-600 font-semibold">Set all:</span>
          <button
            onClick={() => handleQuickSet(Condition.GOOD, Cleanliness.DOMESTIC)}
            className="bg-[#0f172a] text-[#d4af37] text-xs font-bold px-3 py-1.5 rounded-lg"
          >
            Good / Domestic
          </button>
          <button
            onClick={() => handleQuickSet(Condition.GOOD, Cleanliness.PROFESSIONAL)}
            className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            Good / Professional
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
          {!readOnly && (
            <button
              onClick={() => onToggleItem(item.id)}
              title="Hide item from report"
              className="text-slate-400 hover:text-red-400 p-1 mt-0.5"
            >
              <i className="fas fa-eye text-sm" />
            </button>
          )}
        </div>

        {mode === 'checkout' && baselineItem && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Check-In Baseline</div>
            <div className="flex gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CONDITION_COLORS[baselineItem.condition]}`}>
                {baselineItem.condition}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CLEANLINESS_COLORS[baselineItem.cleanliness]}`}>
                {baselineItem.cleanliness}
              </span>
            </div>
            {baselineItem.description && (
              <p className="text-xs text-slate-600">{baselineItem.description}</p>
            )}
            {(baselineItem.qualityTier || baselineItem.installedDate || baselineItem.purchasePrice) && (
              <div className="text-[10px] text-slate-400 mt-1 space-x-3">
                {baselineItem.qualityTier && <span>Tier: {baselineItem.qualityTier}</span>}
                {baselineItem.installedDate && <span>Installed: {baselineItem.installedDate}</span>}
                {baselineItem.purchasePrice && <span>Price: {baselineItem.purchasePrice}</span>}
              </div>
            )}
          </div>
        )}

        {mode === 'checkout' && disputeData && !disputeData.agreed && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">Tenant Disputed</div>
            {disputeData.comment && <p className="text-xs text-slate-700">{disputeData.comment}</p>}
          </div>
        )}

        {mode === 'checkin' && (
          <>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Description</label>
              <input
                type="text"
                value={item.description}
                onChange={e => onItemUpdate(item.id, { description: e.target.value })}
                placeholder={DEFAULT_DESCRIPTIONS[item.name] ?? 'Add description…'}
                disabled={readOnly}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Condition</label>
              <div className="grid grid-cols-3 gap-2">
                {CONDITIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => !readOnly && onItemUpdate(item.id, { condition: c })}
                    className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all min-h-[44px] ${
                      item.condition === c
                        ? 'border-[#0f172a] ' + CONDITION_COLORS[c] + ' shadow-md scale-105'
                        : 'border-transparent ' + CONDITION_COLORS[c] + ' opacity-60'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Cleanliness</label>
              <div className="grid grid-cols-3 gap-2">
                {CLEANLINESS_OPTIONS.map(cl => (
                  <button
                    key={cl}
                    onClick={() => !readOnly && onItemUpdate(item.id, { cleanliness: cl })}
                    className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all min-h-[44px] ${
                      item.cleanliness === cl
                        ? 'border-[#0f172a] ' + CLEANLINESS_COLORS[cl] + ' shadow-md scale-105'
                        : 'border-transparent ' + CLEANLINESS_COLORS[cl] + ' opacity-60'
                    }`}
                  >
                    {cl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
                Photos ({item.photos.length})
              </label>
              {item.photos.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto">
                  {item.photos.map((p, i) => {
                    const url = typeof p === 'string' && p.startsWith('{') ? JSON.parse(p).url : p;
                    return (
                      <img key={i} src={url} alt="" className="h-16 w-16 object-cover rounded-lg flex-shrink-0 border border-slate-200" />
                    );
                  })}
                </div>
              )}
              {!readOnly && (
                <label className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 cursor-pointer ${uploading ? 'opacity-50' : 'hover:border-[#d4af37] hover:text-[#d4af37]'}`}>
                  <i className="fas fa-camera" />
                  {uploading ? 'Uploading…' : 'Add Photo'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} disabled={uploading} />
                </label>
              )}
            </div>
          </>
        )}

        {mode === 'checkout' && !readOnly && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onCheckoutItemUpdate?.(item.id, { changed: false })}
                className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                  checkoutResult && !checkoutResult.changed
                    ? 'bg-green-100 border-green-500 text-green-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <i className="fas fa-check mr-2" />No Change
              </button>
              <button
                onClick={() => onCheckoutItemUpdate?.(item.id, { changed: true, responsibility: 'tenant' })}
                className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                  checkoutResult?.changed
                    ? 'bg-red-100 border-red-500 text-red-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <i className="fas fa-exclamation-triangle mr-2" />Changed
              </button>
            </div>

            {checkoutResult?.changed && (
              <div className="space-y-3 bg-red-50 rounded-xl p-3 border border-red-100">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Charge Type</label>
                  <div className="flex flex-wrap gap-2">
                    {(['beyond_fwt', 'repair', 'replace', 'missing', 'left_behind'] as const).map(ct => (
                      <button
                        key={ct}
                        onClick={() => onCheckoutItemUpdate?.(item.id, { ...checkoutResult, chargeType: ct })}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                          checkoutResult.chargeType === ct
                            ? 'bg-[#0f172a] text-white border-[#0f172a]'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {ct === 'beyond_fwt' ? 'Beyond F.W.T.' : ct === 'left_behind' ? 'Left Behind' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(['tenant', 'landlord'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => onCheckoutItemUpdate?.(item.id, { ...checkoutResult, responsibility: r })}
                      className={`py-2 rounded-lg font-bold text-xs border-2 transition-all ${
                        checkoutResult.responsibility === r
                          ? r === 'tenant' ? 'bg-red-100 border-red-500 text-red-800' : 'bg-blue-100 border-blue-500 text-blue-800'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>

                {checkoutResult.responsibility === 'tenant' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Estimated Cost (£)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={checkoutResult.estimatedCost ?? ''}
                      onChange={e => onCheckoutItemUpdate?.(item.id, { ...checkoutResult, estimatedCost: parseFloat(e.target.value) || undefined })}
                      placeholder="0.00"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Notes</label>
                  <textarea
                    value={checkoutResult.notes ?? ''}
                    onChange={e => onCheckoutItemUpdate?.(item.id, { ...checkoutResult, notes: e.target.value })}
                    rows={2}
                    placeholder="Describe the damage or change…"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37] resize-none"
                  />
                </div>

                <label className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border-2 border-dashed border-red-200 text-red-400 cursor-pointer ${uploading ? 'opacity-50' : 'hover:border-red-400'}`}>
                  <i className="fas fa-camera" />
                  {uploading ? 'Uploading…' : `Add Photo (${checkoutResult.photos?.length ?? 0}/5)`}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} disabled={uploading || (checkoutResult.photos?.length ?? 0) >= 5} />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-4 bg-white border-t border-slate-100">
        <button
          onClick={goNext}
          className="w-full bg-[#d4af37] text-[#0f172a] font-bold py-3 rounded-xl text-sm"
        >
          {currentIndex < activeItems.length - 1 ? 'Next →' : 'Finish Room ✓'}
        </button>
      </div>
    </div>
  );
};

// --- Main RoomWizard ---

export const RoomWizard: React.FC<RoomWizardProps> = ({
  rooms, activeRoomIds, mode, baseline, checkoutItems, tenantReview,
  onItemUpdate, onCheckoutItemUpdate, onToggleRoom, onToggleItem, onAddPhoto, readOnly
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  if (selectedRoom) {
    return (
      <ItemWizard
        room={selectedRoom}
        mode={mode}
        baseline={baseline}
        checkoutItems={checkoutItems}
        tenantReview={tenantReview}
        onItemUpdate={(itemId, updates) => onItemUpdate(selectedRoom.id, itemId, updates)}
        onCheckoutItemUpdate={onCheckoutItemUpdate
          ? (itemId, result) => onCheckoutItemUpdate(selectedRoom.id, itemId, result)
          : undefined
        }
        onToggleItem={itemId => onToggleItem(selectedRoom.id, itemId)}
        onAddPhoto={(itemId, file) => onAddPhoto(selectedRoom.id, itemId, file)}
        onBack={() => setSelectedRoomId(null)}
        readOnly={readOnly}
      />
    );
  }

  return (
    <RoomOverview
      rooms={rooms}
      activeRoomIds={activeRoomIds}
      mode={mode}
      checkoutItems={checkoutItems}
      onRoomSelect={setSelectedRoomId}
      onToggleRoom={onToggleRoom}
      readOnly={readOnly}
    />
  );
};

export default RoomWizard;
