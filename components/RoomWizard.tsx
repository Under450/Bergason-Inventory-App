import React, { useState } from 'react';
import { Room, InventoryItem, Condition, Cleanliness } from '../types';
import { CheckOutItemResult, TenantReviewData } from '../services/inventory';
import {
  CONDITION_COLORS,
  CLEANLINESS_COLORS,
  ROOM_ICONS,
  DEFAULT_DESCRIPTIONS,
} from '../constants';

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

const CONDITIONS: Condition[] = [
  Condition.EXCELLENT, Condition.GOOD, Condition.FAIR,
  Condition.CWA, Condition.POOR, Condition.NEEDS_ATTENTION
];

const CLEANLINESS_OPTIONS: Cleanliness[] = [
  Cleanliness.PROFESSIONAL, Cleanliness.DOMESTIC, Cleanliness.GOOD,
  Cleanliness.FAIR, Cleanliness.POOR, Cleanliness.DIRTY
];

// Strong solid selected colours for condition buttons
const CONDITION_SELECTED: Record<string, string> = {
  [Condition.EXCELLENT]: 'bg-emerald-600 text-white border-emerald-700',
  [Condition.GOOD]: 'bg-green-600 text-white border-green-700',
  [Condition.FAIR]: 'bg-yellow-500 text-white border-yellow-600',
  [Condition.CWA]: 'bg-blue-600 text-white border-blue-700',
  [Condition.POOR]: 'bg-orange-600 text-white border-orange-700',
  [Condition.NEEDS_ATTENTION]: 'bg-red-600 text-white border-red-700',
};

// Strong solid selected colours for cleanliness buttons
const CLEANLINESS_SELECTED: Record<string, string> = {
  [Cleanliness.PROFESSIONAL]: 'bg-violet-600 text-white border-violet-700',
  [Cleanliness.DOMESTIC]: 'bg-blue-600 text-white border-blue-700',
  [Cleanliness.GOOD]: 'bg-green-600 text-white border-green-700',
  [Cleanliness.FAIR]: 'bg-yellow-500 text-white border-yellow-600',
  [Cleanliness.POOR]: 'bg-orange-600 text-white border-orange-700',
  [Cleanliness.DIRTY]: 'bg-red-600 text-white border-red-700',
};

// Helpers for room progress
function getRoomProgress(room: Room, mode: 'checkin' | 'checkout', checkoutItems?: { [itemId: string]: CheckOutItemResult }) {
  const activeItems = room.items.filter(i => !i.excluded);
  const total = activeItems.length;
  let done = 0;
  if (mode === 'checkin') {
    done = activeItems.filter(i => i.condition).length;
  } else {
    done = activeItems.filter(i => checkoutItems?.[i.id] !== undefined).length;
  }
  return { done, total, isComplete: total > 0 && done === total, isInProgress: done > 0 && done < total };
}

// --- Room Sidebar ---

interface RoomSidebarProps {
  rooms: Room[];
  activeRoomIds: string[];
  selectedRoomId: string | null;
  mode: 'checkin' | 'checkout';
  checkoutItems?: { [itemId: string]: CheckOutItemResult };
  onRoomSelect: (roomId: string) => void;
  onToggleRoom: (roomId: string) => void;
  readOnly?: boolean;
}

const RoomSidebar: React.FC<RoomSidebarProps> = ({
  rooms, activeRoomIds, selectedRoomId, mode, checkoutItems,
  onRoomSelect, onToggleRoom, readOnly
}) => {
  const allActiveItems = rooms
    .filter(r => activeRoomIds.includes(r.id))
    .flatMap(r => r.items.filter(i => !i.excluded));
  const totalDone = mode === 'checkin'
    ? allActiveItems.filter(i => i.condition).length
    : allActiveItems.filter(i => checkoutItems?.[i.id] !== undefined).length;
  const overallPct = allActiveItems.length
    ? Math.round((totalDone / allActiveItems.length) * 100)
    : 0;

  const firstIncomplete = rooms.find(r => {
    if (!activeRoomIds.includes(r.id)) return false;
    const { isComplete } = getRoomProgress(r, mode, checkoutItems);
    return !isComplete;
  });

  return (
    <div className="flex flex-col h-full bg-[#0f172a] text-white overflow-y-auto">
      {/* Overall progress */}
      <div className="px-3 pt-4 pb-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {mode === 'checkin' ? 'Check-In' : 'Check-Out'}
          </span>
          <span className="text-[#d4af37] text-xs font-bold">{overallPct}%</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #d4af37, #f59e0b)' }}
          />
        </div>
        {firstIncomplete && !readOnly && (
          <button
            onClick={() => onRoomSelect(firstIncomplete.id)}
            className="mt-2.5 w-full bg-[#d4af37] text-[#0f172a] text-xs font-bold py-2 rounded-lg"
          >
            Continue →
          </button>
        )}
      </div>

      {/* Room list */}
      <div className="flex-1 py-2 overflow-y-auto">
        {rooms.map(room => {
          const isActive = activeRoomIds.includes(room.id);
          const { done, total, isComplete, isInProgress } = getRoomProgress(room, mode, checkoutItems);
          const iconClass = ROOM_ICONS[room.name] ?? 'fa-home';
          const isSelected = room.id === selectedRoomId;

          return (
            <div
              key={room.id}
              className={`mx-2 mb-1 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#d4af37]/20 border border-[#d4af37]/60'
                  : 'border border-transparent hover:bg-slate-700/50'
              } ${!isActive ? 'opacity-40' : ''}`}
              onClick={() => isActive && !readOnly && onRoomSelect(room.id)}
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                {/* Icon / tick */}
                <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs ${
                  isComplete ? 'bg-green-500' : isInProgress ? 'bg-[#d4af37]' : 'bg-slate-700'
                }`}>
                  {isComplete
                    ? <i className="fas fa-check text-white text-[10px]" />
                    : <i className={`fas ${iconClass} text-[10px] ${isInProgress ? 'text-[#0f172a]' : 'text-slate-400'}`} />
                  }
                </div>

                {/* Room name + progress */}
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold truncate ${
                    isSelected ? 'text-[#d4af37]' : isComplete ? 'text-green-400' : 'text-slate-200'
                  } ${!isActive ? 'line-through' : ''}`}>
                    {room.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {isComplete
                      ? <span className="text-green-500">Complete ✓</span>
                      : isInProgress
                      ? <span className="text-[#d4af37]">{done}/{total}</span>
                      : <span>{total} items</span>
                    }
                  </div>
                </div>

                {/* Progress mini bar */}
                {total > 0 && (
                  <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${Math.round((done / total) * 100)}%`,
                        background: isComplete ? '#22c55e' : '#d4af37'
                      }}
                    />
                  </div>
                )}

                {/* Eye toggle */}
                {!readOnly && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleRoom(room.id); }}
                    title={isActive ? 'Exclude room' : 'Include room'}
                    className="text-slate-600 hover:text-slate-300 p-0.5 flex-shrink-0"
                  >
                    <i className={`fas ${isActive ? 'fa-eye' : 'fa-eye-slash'} text-[10px]`} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
  readOnly?: boolean;
}

const ItemWizard: React.FC<ItemWizardProps> = ({
  room, mode, baseline, checkoutItems, tenantReview,
  onItemUpdate, onCheckoutItemUpdate, onToggleItem, onAddPhoto, readOnly
}) => {
  const activeItems = room.items.filter(i => !i.excluded);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [quickSetApplied, setQuickSetApplied] = useState(false);

  const item = activeItems[currentIndex];
  if (!item) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
      <i className="fas fa-check-circle text-4xl text-green-400 mb-3" />
      <p className="font-semibold text-slate-600">All items done for {room.name}</p>
    </div>
  );

  const checkoutResult = checkoutItems?.[item.id];
  const baselineItem = baseline?.[item.id];
  const disputeData = tenantReview?.[item.id];

  const handleQuickSet = (condition: Condition, cleanliness: Cleanliness) => {
    activeItems.forEach(i => onItemUpdate(i.id, { condition, cleanliness }));
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
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const pct = Math.round(((currentIndex + 1) / activeItems.length) * 100);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Item header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest truncate">{room.name}</span>
          <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{currentIndex + 1} / {activeItems.length}</span>
        </div>
        <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-1 bg-[#d4af37] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Quick set */}
      {currentIndex === 0 && mode === 'checkin' && !quickSetApplied && !readOnly && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 flex-wrap">
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Item name + hide toggle */}
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
          {!readOnly && (
            <button
              onClick={() => onToggleItem(item.id)}
              title="Hide item from report"
              className="text-slate-400 hover:text-red-400 p-1 mt-0.5 flex-shrink-0"
            >
              <i className="fas fa-eye text-sm" />
            </button>
          )}
        </div>

        {/* Checkout baseline */}
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
            {baselineItem.description && <p className="text-xs text-slate-600">{baselineItem.description}</p>}
            {(baselineItem.qualityTier || baselineItem.installedDate || baselineItem.purchasePrice) && (
              <div className="text-[10px] text-slate-400 mt-1 space-x-3">
                {baselineItem.qualityTier && <span>Tier: {baselineItem.qualityTier}</span>}
                {baselineItem.installedDate && <span>Installed: {baselineItem.installedDate}</span>}
                {baselineItem.purchasePrice && <span>Price: {baselineItem.purchasePrice}</span>}
              </div>
            )}
          </div>
        )}

        {/* Disputed */}
        {mode === 'checkout' && disputeData && !disputeData.agreed && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">Tenant Disputed</div>
            {disputeData.comment && <p className="text-xs text-slate-700">{disputeData.comment}</p>}
          </div>
        )}

        {/* Check-in fields */}
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

            {/* Condition */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Condition</label>
              <div className="grid grid-cols-3 gap-2">
                {CONDITIONS.map(c => {
                  const isSelected = item.condition === c;
                  return (
                    <button
                      key={c}
                      onClick={() => !readOnly && onItemUpdate(item.id, { condition: c })}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all min-h-[48px] ${
                        isSelected
                          ? (CONDITION_SELECTED[c] ?? 'bg-slate-800 text-white border-slate-900') + ' shadow-lg ring-2 ring-offset-1 ring-slate-900/30'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cleanliness */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Cleanliness</label>
              <div className="grid grid-cols-3 gap-2">
                {CLEANLINESS_OPTIONS.map(cl => {
                  const isSelected = item.cleanliness === cl;
                  return (
                    <button
                      key={cl}
                      onClick={() => !readOnly && onItemUpdate(item.id, { cleanliness: cl })}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all min-h-[48px] ${
                        isSelected
                          ? (CLEANLINESS_SELECTED[cl] ?? 'bg-slate-800 text-white border-slate-900') + ' shadow-lg ring-2 ring-offset-1 ring-slate-900/30'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {cl}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Photos */}
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

        {/* Checkout fields */}
        {mode === 'checkout' && !readOnly && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onCheckoutItemUpdate?.(item.id, { changed: false })}
                className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                  checkoutResult && !checkoutResult.changed
                    ? 'bg-green-600 text-white border-green-700 shadow-lg'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <i className="fas fa-check mr-2" />No Change
              </button>
              <button
                onClick={() => onCheckoutItemUpdate?.(item.id, { changed: true, responsibility: 'tenant' })}
                className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${
                  checkoutResult?.changed
                    ? 'bg-red-600 text-white border-red-700 shadow-lg'
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
                          ? 'bg-[#0f172a] text-white border-[#0f172a]'
                          : 'bg-white text-slate-600 border-slate-200'
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                      placeholder="0.00"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Notes</label>
                  <textarea
                    value={checkoutResult.notes ?? ''}
                    onChange={e => onCheckoutItemUpdate?.(item.id, { ...checkoutResult, notes: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    rows={2}
                    placeholder="Describe the issue…"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prev / Next navigation */}
      {!readOnly && (
        <div className="border-t border-slate-200 px-4 py-3 flex gap-3 bg-white">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-500 disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex >= activeItems.length - 1}
            className="flex-2 flex-grow py-3 rounded-xl font-bold text-sm bg-[#0f172a] text-[#d4af37] disabled:opacity-30"
          >
            {currentIndex < activeItems.length - 1 ? 'Next →' : 'All done ✓'}
          </button>
        </div>
      )}
    </div>
  );
};

// --- Welcome panel when no room selected ---

const SelectRoomPanel: React.FC<{ onContinue: () => void; firstIncomplete: Room | undefined; mode: 'checkin' | 'checkout' }> = ({
  onContinue, firstIncomplete, mode
}) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50">
    <div className="w-16 h-16 rounded-full bg-[#0f172a] flex items-center justify-center mb-4">
      <i className="fas fa-clipboard-list text-[#d4af37] text-2xl" />
    </div>
    <h3 className="text-lg font-bold text-slate-800 mb-2">
      {mode === 'checkin' ? 'Check-In Rooms' : 'Check-Out Rooms'}
    </h3>
    <p className="text-sm text-slate-500 mb-6">
      Select any room from the sidebar to begin, or tap Continue to pick up where you left off.
    </p>
    {firstIncomplete && (
      <button
        onClick={onContinue}
        className="bg-[#d4af37] text-[#0f172a] font-bold px-6 py-3 rounded-xl text-sm"
      >
        Continue → {firstIncomplete.name}
      </button>
    )}
  </div>
);

// --- Main RoomWizard ---

export const RoomWizard: React.FC<RoomWizardProps> = ({
  rooms, activeRoomIds, mode, baseline, checkoutItems, tenantReview,
  onItemUpdate, onCheckoutItemUpdate, onToggleRoom, onToggleItem, onAddPhoto, readOnly
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  const firstIncomplete = rooms.find(r => {
    if (!activeRoomIds.includes(r.id)) return false;
    const activeItems = r.items.filter(i => !i.excluded);
    if (mode === 'checkin') return activeItems.some(i => !i.condition);
    return activeItems.some(i => !checkoutItems?.[i.id]);
  });

  return (
    <div className="flex" style={{ minHeight: '70vh' }}>
      {/* Fixed sidebar — hidden on very small screens, shown from sm up */}
      <div className="hidden sm:flex flex-col flex-shrink-0 border-r border-slate-200" style={{ width: 200 }}>
        <RoomSidebar
          rooms={rooms}
          activeRoomIds={activeRoomIds}
          selectedRoomId={selectedRoomId}
          mode={mode}
          checkoutItems={checkoutItems}
          onRoomSelect={setSelectedRoomId}
          onToggleRoom={onToggleRoom}
          readOnly={readOnly}
        />
      </div>

      {/* Mobile: horizontal room strip */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="sm:hidden bg-[#0f172a] px-3 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {rooms.filter(r => activeRoomIds.includes(r.id)).map(room => {
              const { done, total, isComplete } = getRoomProgress(room, mode, checkoutItems);
              const isSelected = room.id === selectedRoomId;
              return (
                <button
                  key={room.id}
                  onClick={() => !readOnly && setSelectedRoomId(room.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-[#d4af37] text-[#0f172a] border-[#d4af37]'
                      : isComplete
                      ? 'bg-green-500/20 text-green-400 border-green-500/40'
                      : 'bg-slate-700 text-slate-300 border-slate-600'
                  }`}
                >
                  {isComplete ? <i className="fas fa-check text-[10px]" /> : null}
                  {room.name}
                  {!isComplete && total > 0 && (
                    <span className="text-[10px] opacity-70">{done}/{total}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {selectedRoom ? (
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
              readOnly={readOnly}
            />
          ) : (
            <SelectRoomPanel
              onContinue={() => firstIncomplete && setSelectedRoomId(firstIncomplete.id)}
              firstIncomplete={firstIncomplete}
              mode={mode}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomWizard;
