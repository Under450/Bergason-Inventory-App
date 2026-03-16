import React, { useState, useEffect, useRef } from 'react';
import bergasonLogo from './bergasonlogo.png';
import { HashRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import TenantReview from './pages/TenantReview';
import TenantSign from './pages/TenantSign';
import { saveInventoryToFirestore, activateReviewLink, updateTenantProgress } from './services/inventory';
import { captureElementAsPDF } from './services/pdf';
import { uploadPDFToStorage } from './services/storage';
import { sendInventoryEmail } from './services/email';
import { Inventory, InventoryItem, Condition, Cleanliness, MeterType, SignatureEntry, Photo } from './types';
import { generateId, formatDate, formatDateTime } from './utils';
import { uploadImage } from './services/cloudinary';
import { Button } from './components/Button';
import {
  PREDEFINED_ROOMS,
  DEFAULT_ITEMS,
  METER_ITEMS,
  KITCHEN_ITEMS,
  MAJOR_APPLIANCES,
  REQUIRED_DOCUMENTS_LIST,
  CONDITION_COLORS,
  CLEANLINESS_COLORS,
  CONDITION_CSS,
  CLEANLINESS_CSS,
  CONDITION_ICONS,
  CLEANLINESS_ICONS,
  HS_QUESTIONS,
  DISCLAIMER_TEXT,
  GUIDANCE_NOTES,
  DECLARATION_TEXT,
  PROPERTY_TYPES,
  getExcludedRooms
} from './constants';

// --- Services ---

const STORAGE_KEY = 'bergason_inventories_v5';
const TOKEN_STORAGE_KEY = 'bergason_tokens_v1';
const OFFICE_EMAIL_DISPLAY = 'cjeavons@bergason.co.uk';

interface TokenState {
  signToken: string;
  tenantName: string;
  tenantEmail: string;
  sentPdfUrl: string | null;
  dispatchRef: string | null;
  reviewSentLink: string | null;
  reviewDispatchRef: string | null;
}

const getTokenState = (inventoryId: string): TokenState | null => {
  try {
    const data = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!data) return null;
    const all = JSON.parse(data) as Record<string, TokenState>;
    return all[inventoryId] ?? null;
  } catch { return null; }
};

const saveTokenState = (inventoryId: string, state: Partial<TokenState>) => {
  try {
    const data = localStorage.getItem(TOKEN_STORAGE_KEY);
    const all = data ? JSON.parse(data) as Record<string, TokenState> : {};
    all[inventoryId] = { ...all[inventoryId], ...state } as TokenState;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

const getInventories = (): Inventory[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const saveInventory = (inventory: Inventory) => {
  const all = getInventories();
  const index = all.findIndex(i => i.id === inventory.id);
  if (index >= 0) {
    all[index] = inventory;
  } else {
    all.push(inventory);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

const getInventoryById = (id: string): Inventory | undefined => {
  return getInventories().find(i => i.id === id);
};

// --- Components ---

const BergasonLogo = ({ className = "" }: { className?: string }) => (
  <img src={bergasonLogo} alt="Bergason Property Services" className={`w-28 h-auto ${className}`} />
);

const Dashboard = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [showPropertyTypeModal, setShowPropertyTypeModal] = useState(false);
  const [selectedPropertyType, setSelectedPropertyType] = useState(PROPERTY_TYPES[4].label); // default "1 Bed House"
  const navigate = useNavigate();

  useEffect(() => {
    setInventories(getInventories().sort((a, b) => b.dateUpdated - a.dateUpdated));
  }, []);

  const createNew = (propertyTypeLabel: string) => {
    const selectedType = PROPERTY_TYPES.find(t => t.label === propertyTypeLabel) || PROPERTY_TYPES[4];
    const excludedRooms = getExcludedRooms(selectedType.style, selectedType.beds);

    const rooms = PREDEFINED_ROOMS.flatMap(group =>
      group.names.map(name => {
        let itemsToUse = DEFAULT_ITEMS;
        if (name === "Meter Cupboard") itemsToUse = METER_ITEMS;
        if (name === "Kitchen") itemsToUse = KITCHEN_ITEMS;

        return {
          id: generateId(),
          name,
          floorGroup: group.group,
          items: itemsToUse.map(itemName => ({
            id: generateId(),
            name: itemName,
            condition: Condition.GOOD,
            cleanliness: Cleanliness.GOOD,
            description: '',
            photos: [],
            meterType: MeterType.STANDARD,
            workingStatus: 'Not Tested'
          }))
        };
      })
    );

    const activeRoomIds = rooms
      .filter(r => !excludedRooms.includes(r.name))
      .map(r => r.id);

    const newInv: Inventory = {
      id: generateId(),
      address: '',
      clientName: '',
      dateCreated: Date.now(),
      dateUpdated: Date.now(),
      status: 'DRAFT',
      inspectorName: '',
      tenantPresent: false,
      declarationAgreed: false,
      signatures: [],
      documents: REQUIRED_DOCUMENTS_LIST.map(name => ({
        id: generateId(),
        name: name,
        fileData: null,
        uploadDate: null
      })),
      propertyDescription: '',
      frontImage: undefined,
      propertyType: selectedType.label,
      activeRoomIds,
      healthSafetyChecks: HS_QUESTIONS.map(q => ({
        id: generateId(),
        question: q,
        answer: null
      })),
      rooms,
    };
    saveInventory(newInv);
    navigate(`/inventory/${newInv.id}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-bergason-navy text-white pt-8 pb-12 px-6 shadow-xl rounded-b-[2.5rem]">
        <div className="flex justify-center mb-6">
          <BergasonLogo />
        </div>
        <div className="text-center mb-6">
          <h2 className="text-blue-100 font-light text-sm uppercase tracking-widest">
            Inventory Management System
          </h2>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => setShowPropertyTypeModal(true)}
            className="bg-bergason-gold text-white hover:bg-amber-600 shadow-lg shadow-amber-900/20 px-8 py-3 rounded-full font-bold transition-transform hover:scale-105"
          >
            <i className="fas fa-plus mr-2"></i> New Inventory
          </Button>
        </div>
      </header>

      <main className="px-4 -mt-8 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg shadow-slate-200/50 min-h-[50vh] p-2">
          {inventories.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-200 text-3xl">
                <i className="fas fa-clipboard-list"></i>
              </div>
              <h3 className="text-xl font-bold text-slate-700 mb-2">No Inventories Found</h3>
              <p className="text-slate-500 mb-8">Tap 'New Inventory' above to start.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {inventories.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/inventory/${inv.id}`)}
                  className="p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer flex items-center gap-4 group"
                >
                  <div
                    className={`w-16 h-16 shrink-0 rounded-lg flex items-center justify-center text-lg shadow-sm border overflow-hidden ${
                      inv.status === 'LOCKED' ? 'border-green-200' : 'border-slate-100'
                    }`}
                  >
                    {inv.frontImage ? (
                      <img src={inv.frontImage} className="w-full h-full object-cover" alt="Property" />
                    ) : (
                      <i
                        className={`fas ${
                          inv.status === 'LOCKED'
                            ? 'fa-lock text-green-500'
                            : 'fa-home text-slate-300'
                        }`}
                      ></i>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 text-base truncate group-hover:text-bergason-navy transition-colors">
                      {inv.address || "Untitled Property"}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>{formatDate(inv.dateCreated)}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span>{inv.rooms.length} Rooms</span>
                      {inv.propertyType && (
                        <>
                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                          <span>{inv.propertyType}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-slate-200 group-hover:text-bergason-gold"></i>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Property Type Selection Modal */}
      {showPropertyTypeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-xl text-slate-800 mb-1">Select Property Type</h3>
            <p className="text-sm text-slate-500 mb-5">
              This will pre-select the relevant rooms for this inventory.
            </p>
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Property Type</label>
              <select
                value={selectedPropertyType}
                onChange={e => setSelectedPropertyType(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400 bg-white"
              >
                {PROPERTY_TYPES.map(t => (
                  <option key={t.label} value={t.label}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPropertyTypeModal(false)}
                className="flex-1 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPropertyTypeModal(false);
                  createNew(selectedPropertyType);
                }}
                className="flex-1 py-3 rounded-lg text-sm font-bold text-white bg-bergason-navy hover:bg-slate-800 transition-colors"
              >
                Create Inventory →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// NOTE: SignaturePad is referenced by your app. It must exist in your repo.
// If you previously deleted it, restore that component file as well.
const SignaturePad = ({ onSave }: { onSave: (dataUrl: string) => void; onClear?: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    draw(e);
  };
  const end = () => {
    drawing.current = false;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.beginPath();
  };
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className="w-full bg-white border border-slate-200 rounded"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex gap-2 mt-2">
        <Button onClick={clear} className="bg-slate-200 text-slate-800">Clear</Button>
        <Button onClick={save} className="bg-bergason-navy text-white">Save Signature</Button>
      </div>
    </div>
  );
};

const InventoryEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  const reportRef = useRef<HTMLDivElement>(null);
  const [signerName, setSignerName] = useState("");
  const [signerType, setSignerType] = useState<string>("Tenant");
  const [tenantCount, setTenantCount] = useState<number>(1);
  const [guidanceTicked, setGuidanceTicked] = useState<Set<string>>(new Set());
  const [uploadingItems, setUploadingItems] = useState<Set<string>>(new Set());
  const [frontImageUploading, setFrontImageUploading] = useState(false);
  // Stage 1 — Send for Signature
  const [showSignModal, setShowSignModal] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [signToken, setSignToken] = useState<string | null>(null);
  const [sentPdfUrl, setSentPdfUrl] = useState<string | null>(null);
  const [dispatchRef, setDispatchRef] = useState<string | null>(null);
  // Stage 2 — Send Review Link
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewSentLink, setReviewSentLink] = useState<string | null>(null);
  const [reviewDispatchRef, setReviewDispatchRef] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const data = getInventoryById(id);
      if (data) {
        if (!data.rooms || data.rooms.length === 0) {
          navigate('/');
          return;
        }

        if (!data.signatures) data.signatures = [];
        if (data.tenantPresent === undefined) data.tenantPresent = false;

        if (!data.documents || data.documents.length === 0) {
          data.documents = REQUIRED_DOCUMENTS_LIST.map(name => ({
            id: generateId(),
            name,
            fileData: null,
            uploadDate: null
          }));
        }

        setInventory(data);

        // Restore send state from localStorage so page refresh doesn't lose it
        const saved = getTokenState(data.id);
        if (saved?.signToken) {
          setSignToken(saved.signToken);
          setTenantName(saved.tenantName ?? '');
          setTenantEmail(saved.tenantEmail ?? '');
          setSentPdfUrl(saved.sentPdfUrl ?? null);
          setDispatchRef(saved.dispatchRef ?? null);
          setReviewSentLink(saved.reviewSentLink ?? null);
          setReviewDispatchRef(saved.reviewDispatchRef ?? null);
        }
      } else {
        navigate('/');
      }
    }
  }, [id, navigate]);

  const updateInventory = (updates: Partial<Inventory>) => {
    if (!inventory) return;
    const updated = { ...inventory, ...updates, dateUpdated: Date.now() };
    setInventory(updated);
    saveInventory(updated);
  };

  const updateHSCheck = (checkId: string, answer: 'YES' | 'NO' | 'N/A') => {
    if (!inventory) return;
    const newChecks = inventory.healthSafetyChecks.map(c =>
      c.id === checkId ? { ...c, answer } : c
    );
    updateInventory({ healthSafetyChecks: newChecks });
  };

  const updateItem = (roomId: string, itemId: string, updates: Partial<InventoryItem>) => {
    if (!inventory) return;
    const rooms = [...inventory.rooms];
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      const itemIndex = room.items.findIndex(i => i.id === itemId);
      if (itemIndex >= 0) {
        room.items[itemIndex] = { ...room.items[itemIndex], ...updates };
        updateInventory({ rooms });
      }
    }
  };

  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const toggleRoomActive = (roomId: string) => {
    if (!inventory) return;
    const current = inventory.activeRoomIds || inventory.rooms.map(r => r.id);
    const updated = current.includes(roomId)
      ? current.filter(id => id !== roomId)
      : [...current, roomId];
    updateInventory({ activeRoomIds: updated });
  };

  const addPhoto = async (roomId: string, itemId: string, file: File) => {
    if (!inventory) return;
    setUploadingItems(prev => new Set(prev).add(itemId));
    try {
      const url = await uploadImage(file);
      const photoObj: Photo = {
        id: generateId(),
        url,
        timestamp: Date.now(),
        roomRef: roomId,
        itemRef: itemId
      };
      const rooms = [...inventory.rooms];
      const room = rooms.find(r => r.id === roomId);
      const item = room?.items.find(i => i.id === itemId);
      if (item) {
        item.photos.push(JSON.stringify(photoObj));
        updateInventory({ rooms });
      }
    } catch {
      alert('Photo upload failed. Please check your connection and try again.');
    } finally {
      setUploadingItems(prev => { const n = new Set(prev); n.delete(itemId); return n; });
    }
  };

  const handleFrontImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrontImageUploading(true);
    try {
      const url = await uploadImage(file);
      updateInventory({ frontImage: url });
    } catch {
      alert('Front image upload failed. Please try again.');
    } finally {
      setFrontImageUploading(false);
    }
  };

  const handleDocUpload = (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!inventory) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const docs = inventory.documents.map(d => {
        if (d.id === docId) {
          return { ...d, fileData: evt.target?.result as string, uploadDate: Date.now() };
        }
        return d;
      });
      updateInventory({ documents: docs });
    };
    reader.readAsDataURL(file);
  };


  if (!inventory) {
    return (
      <div className="h-screen flex items-center justify-center">
        <i className="fas fa-circle-notch fa-spin text-bergason-navy text-2xl"></i>
      </div>
    );
  }

  const isLocked = inventory.status === 'LOCKED';
  const isReadOnly = isPreviewMode || isLocked;

  const allPhotos: { photo: Photo; roomName: string; itemName: string; index: number }[] = [];
  inventory.rooms.forEach(room => {
    room.items.forEach(item => {
      item.photos.forEach(pStr => {
        const p = JSON.parse(pStr) as Photo;
        allPhotos.push({
          photo: p,
          roomName: room.name,
          itemName: item.name,
          index: allPhotos.length + 1
        });
      });
    });
  });

  return (
    <div className={`min-h-screen bg-white ${isPreviewMode ? '' : 'pb-24'}`}>

      {/* Top Bar */}
      {!isPreviewMode && (
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
          <div className="flex justify-between items-center px-4 py-3">
            <button
              onClick={() => navigate('/')}
              className="text-slate-500 hover:text-bergason-navy flex items-center gap-1 font-medium"
            >
              <i className="fas fa-chevron-left"></i> <span className="hidden xs:inline">Back</span>
            </button>
            <div className="font-serif font-bold text-bergason-navy text-lg truncate px-2">
              {inventory.address || 'New Inventory'}
            </div>
            <button
              onClick={() => setIsPreviewMode(true)}
              className="bg-bergason-navy text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Preview
            </button>
          </div>
        </div>
      )}

      {isPreviewMode && (
        <div data-pdf-hide="true" className="fixed top-0 left-0 right-0 z-50 bg-bergason-navy text-white p-4 flex justify-between items-center print:hidden shadow-xl">
          <button
            onClick={() => setIsPreviewMode(false)}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm font-semibold backdrop-blur"
          >
            <i className="fas fa-edit mr-2"></i> Edit Mode
          </button>
          <button
            onClick={() => window.print()}
            className="bg-bergason-gold text-bergason-navy px-4 py-2 rounded text-sm font-bold shadow-lg hover:bg-amber-400"
          >
            <i className="fas fa-print mr-2"></i> Print / Save PDF
          </button>
        </div>
      )}

      <div ref={reportRef} className={`max-w-[210mm] mx-auto bg-white min-h-screen ${isPreviewMode ? 'pt-20 print:pt-0' : 'p-4 md:p-8'}`}>

        {/* REPORT HEADER */}
        <div className="text-center py-8 border-b-4 border-double border-bergason-gold mb-10">
          <div className="flex justify-center mb-6">
            <BergasonLogo />
          </div>
          <h1 className="font-sans text-3xl font-bold text-slate-900 uppercase tracking-widest mt-4">
            Inventory & Schedule of Condition
          </h1>
        </div>

        {/* 1. PROPERTY DETAILS / COVER PAGE */}
        <section className="mb-12 break-inside-avoid">
          {/* FRONT IMAGE UPLOAD */}
          <div className="mb-8">
            {frontImageUploading ? (
              <div className="w-full h-48 md:h-64 border-2 border-dashed border-bergason-gold rounded-xl bg-amber-50 flex flex-col items-center justify-center gap-3 text-bergason-navy">
                <i className="fas fa-circle-notch fa-spin text-3xl text-bergason-gold"></i>
                <span className="text-sm font-bold">Uploading photo...</span>
              </div>
            ) : inventory.frontImage ? (
              <div className="relative group rounded-xl overflow-hidden shadow-lg border-2 border-slate-100 bg-slate-100">
                <img
                  src={inventory.frontImage}
                  alt="Property Front"
                  className="w-full max-h-[600px] object-contain mx-auto"
                />
                {!isReadOnly && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <label className="cursor-pointer bg-white text-bergason-navy px-5 py-3 rounded-full font-bold hover:bg-bergason-gold hover:text-white transition-colors shadow-xl">
                      <i className="fas fa-camera mr-2"></i> Change Photo
                      <input type="file" accept="image/*" className="hidden" onChange={handleFrontImageUpload} />
                    </label>
                  </div>
                )}
              </div>
            ) : (
              !isReadOnly ? (
                <label className="block w-full h-48 md:h-64 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-bergason-navy group">
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center group-hover:bg-white group-hover:shadow-md transition-all">
                    <i className="fas fa-camera text-2xl"></i>
                  </div>
                  <span className="font-bold tracking-wide uppercase text-xs">Add Front Property Photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFrontImageUpload} />
                </label>
              ) : (
                <div className="w-full h-48 md:h-64 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 italic">
                  No Property Photo
                </div>
              )
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Property Address
              </label>
              <input
                value={inventory.address}
                readOnly={isReadOnly}
                onChange={(e) => updateInventory({ address: e.target.value })}
                placeholder="Enter full address of the property"
                className={`w-full text-2xl font-serif font-medium text-slate-800 border-b ${isReadOnly ? 'border-transparent' : 'border-slate-200'} focus:border-bergason-navy outline-none py-1 placeholder:font-sans placeholder:text-slate-300`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Property ID <span className="text-red-500">*</span>
              </label>
              <input
                value={inventory.propertyId || ''}
                readOnly={isReadOnly}
                onChange={(e) => updateInventory({ propertyId: e.target.value })}
                placeholder="e.g. BPS-00123 (required)"
                className={`w-full text-base font-mono font-medium border-b outline-none py-1 placeholder:font-sans placeholder:text-slate-300 ${
                  isReadOnly ? 'border-transparent text-slate-800' :
                  !inventory.propertyId ? 'border-red-300 text-slate-800 focus:border-red-500' :
                  'border-slate-200 text-slate-800 focus:border-bergason-navy'
                }`}
              />
              {!isReadOnly && !inventory.propertyId && (
                <p className="text-[10px] text-red-400 mt-0.5">Required before sending to tenant</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Property Type
              </label>
              <div className="text-base text-slate-700 py-1">{inventory.propertyType || '—'}</div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Property Description
              </label>
              <textarea
                value={inventory.propertyDescription || ''}
                readOnly={isReadOnly}
                onChange={(e) => updateInventory({ propertyDescription: e.target.value })}
                placeholder="e.g. A detached 4-bedroom house with garage and garden..."
                className={`w-full text-base text-slate-800 border ${isReadOnly ? 'border-transparent px-0' : 'border-slate-200 p-3 rounded-lg'} focus:border-bergason-navy outline-none min-h-[100px] resize-y`}
              />
            </div>
          </div>
        </section>

        {/* 2. HEALTH & SAFETY */}
        <section className="mb-12 break-inside-avoid">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-bergason-gold tracking-widest mb-4 border-b border-slate-100 pb-2">
            <i className="fas fa-shield-alt"></i> Health & Safety Alarm Compliance Checks
          </h3>
          <div className="bg-slate-50 rounded-lg p-1 border border-slate-200">
            <table className="w-full">
              <tbody className="divide-y divide-slate-200">
                {inventory.healthSafetyChecks.map((check) => (
                  <tr key={check.id} className="group hover:bg-white">
                    <td className="p-3 text-xs md:text-sm font-medium text-slate-700 w-2/3">
                      {check.question}
                    </td>
                    <td className="p-3 w-1/3 text-right">
                      {isReadOnly ? (
                        <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${
                          check.answer === 'YES' ? 'bg-green-100 text-green-700' :
                          check.answer === 'NO' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {check.answer || '-'}
                        </span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {(['YES', 'NO', 'N/A'] as const).map(opt => (
                            <button
                              key={opt}
                              onClick={() => updateHSCheck(check.id, opt)}
                              className={`px-3 py-1 text-[10px] font-bold rounded border transition-all ${
                                check.answer === opt
                                  ? (opt === 'YES'
                                    ? 'bg-green-600 text-white border-green-600'
                                    : opt === 'NO'
                                      ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-slate-600 text-white border-slate-600')
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2b. CONDITION / CLEANLINESS LEGEND */}
        <section className="mb-8 break-inside-avoid">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest mb-3">Condition Key</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(CONDITION_ICONS).map(([label, colorClass]) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-slate-700">
                    <i className={`fas fa-circle text-lg ${colorClass}`}></i>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest mb-3">Cleanliness Key</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(CLEANLINESS_ICONS).map(([label, colorClass]) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-slate-700">
                    <i className={`fas fa-circle text-lg ${colorClass}`}></i>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. ROOMS GRID */}
        <div className="space-y-4">
          {inventory.rooms.map((room, roomIndex) => {
            const showHeader = roomIndex === 0 || inventory.rooms[roomIndex - 1].floorGroup !== room.floorGroup;
            const isExpanded = isPreviewMode || expandedRooms[room.id];
            const isMeterRoom = room.name === "Meter Cupboard";
            const isKitchen = room.name === "Kitchen";
            const activeIds = inventory.activeRoomIds;
            const isRoomActive = !activeIds || activeIds.includes(room.id);

            // In preview/print mode, skip inactive rooms
            if (isPreviewMode && !isRoomActive) return null;

            return (
              <div key={room.id} className={`break-inside-avoid ${!isRoomActive ? 'opacity-40' : ''}`}>
                {showHeader && (
                  <h2 className="text-xl font-bold bg-bergason-navy text-white p-2 uppercase tracking-widest text-center mb-6 mt-8 print:mt-4">
                    {room.floorGroup}
                  </h2>
                )}

                <div className={`border rounded-lg overflow-hidden mb-4 ${!isRoomActive ? 'border-slate-100' : 'border-slate-200'}`}>
                  {/* Room Header */}
                  <div
                    onClick={() => !isPreviewMode && toggleRoom(room.id)}
                    className={`flex justify-between items-center p-4 cursor-pointer transition-colors ${
                      isExpanded ? 'bg-slate-100 border-b border-slate-200' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <h3 className={`font-serif font-bold text-xl flex items-center gap-2 ${isRoomActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                      {roomIndex + 1}. {room.name}
                      {room.items.some(i => i.photos.length > 0) && (
                        <i className="fas fa-camera text-red-500 text-sm" title="This room has photos"></i>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {!isReadOnly && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleRoomActive(room.id); }}
                          title={isRoomActive ? 'Exclude room' : 'Include room'}
                          className={`text-sm px-2 py-1 rounded transition-colors ${
                            isRoomActive
                              ? 'text-slate-400 hover:text-red-400'
                              : 'text-slate-300 hover:text-green-500'
                          }`}
                        >
                          <i className={`fas ${isRoomActive ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        </button>
                      )}
                      <i className={`fas fa-chevron-down transition-transform text-slate-400 ${isExpanded ? 'rotate-180' : ''}`}></i>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-2 md:p-4 bg-white">
                      <div className="hidden md:grid grid-cols-12 gap-2 bg-slate-50 p-2 text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">
                        <div className="col-span-2">Item</div>
                        <div className="col-span-4">Description/Details</div>
                        <div className="col-span-2">{isMeterRoom ? "Supplier" : "Condition"}</div>
                        <div className="col-span-2">{isMeterRoom ? "Type" : "Cleanliness"}</div>
                        <div className="col-span-2">Photos</div>
                      </div>

                      <div className="space-y-6 md:space-y-0 md:divide-y md:divide-slate-100">
                        {room.items.map((item, itemIndex) => {
                          const isAppliance = isKitchen && MAJOR_APPLIANCES.includes(item.name);
                          const isMeter = isMeterRoom && item.name.includes("Meter");

                          return (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 py-4 md:py-2 relative border-b md:border-none border-slate-100 pb-4 md:pb-2">

                              <div className="col-span-2 font-bold text-slate-800 text-sm flex items-start gap-1">
                                <span className="text-slate-400 font-mono text-xs">{roomIndex + 1}.{itemIndex + 1}</span>
                                {item.name}
                              </div>

                              <div className="col-span-4 space-y-2">
                                {isAppliance && (
                                  <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input
                                      placeholder="Make"
                                      className="text-xs p-1 border rounded"
                                      value={item.make || ''}
                                      readOnly={isReadOnly}
                                      onChange={e => updateItem(room.id, item.id, { make: e.target.value })}
                                    />
                                    <input
                                      placeholder="Model"
                                      className="text-xs p-1 border rounded"
                                      value={item.model || ''}
                                      readOnly={isReadOnly}
                                      onChange={e => updateItem(room.id, item.id, { model: e.target.value })}
                                    />
                                    <input
                                      placeholder="Serial No"
                                      className="text-xs p-1 border rounded col-span-2"
                                      value={item.serialNumber || ''}
                                      readOnly={isReadOnly}
                                      onChange={e => updateItem(room.id, item.id, { serialNumber: e.target.value })}
                                    />
                                  </div>
                                )}

                                {isMeter && (
                                  <div className="mb-2">
                                    <input
                                      placeholder="Serial Number"
                                      className="w-full text-xs p-1 border rounded"
                                      value={item.serialNumber || ''}
                                      readOnly={isReadOnly}
                                      onChange={e => updateItem(room.id, item.id, { serialNumber: e.target.value })}
                                    />
                                  </div>
                                )}

                                {isReadOnly ? (
                                  <div className="text-sm text-slate-600 whitespace-pre-wrap">{item.description || '-'}</div>
                                ) : (
                                  <textarea
                                    value={item.description}
                                    onChange={(e) => updateItem(room.id, item.id, { description: e.target.value })}
                                    className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded focus:border-bergason-gold outline-none resize-y h-16 md:h-auto"
                                    placeholder="Notes..."
                                  />
                                )}
                              </div>

                              <div className="col-span-2">
                                {isMeter ? (
                                  <input
                                    placeholder="Supplier"
                                    className="w-full text-xs p-1 border rounded"
                                    value={item.supplier || ''}
                                    readOnly={isReadOnly}
                                    onChange={e => updateItem(room.id, item.id, { supplier: e.target.value })}
                                  />
                                ) : isAppliance ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Working Status</label>
                                    <select
                                      disabled={isReadOnly}
                                      value={item.workingStatus}
                                      onChange={(e) => updateItem(room.id, item.id, { workingStatus: e.target.value })}
                                      className="w-full text-xs p-1 rounded border bg-white border-slate-200 outline-none"
                                    >
                                      {['Working', 'Not Working', 'Not Tested', 'N/A'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                ) : (
                                  isReadOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded border ${CONDITION_COLORS[item.condition]}`}>
                                      <i className="fas fa-circle text-[8px]"></i>
                                      {item.condition}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Condition</label>
                                      <select
                                        value={item.condition}
                                        onChange={(e) => updateItem(room.id, item.id, { condition: e.target.value as Condition })}
                                        className="w-full text-xs p-1 rounded border-l-4 outline-none font-semibold"
                                        style={{ backgroundColor: CONDITION_CSS[item.condition].bg, color: CONDITION_CSS[item.condition].color, borderLeftColor: CONDITION_CSS[item.condition].bg }}
                                      >
                                        {Object.values(Condition).map(c => (
                                          <option key={c} value={c} style={{ backgroundColor: CONDITION_CSS[c].bg, color: CONDITION_CSS[c].color }}>{c}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="col-span-2">
                                {isMeter ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Type</label>
                                    <select
                                      disabled={isReadOnly}
                                      value={item.meterType}
                                      onChange={(e) => updateItem(room.id, item.id, { meterType: e.target.value as MeterType })}
                                      className="w-full text-xs p-1 rounded border bg-white border-slate-200 outline-none"
                                    >
                                      {Object.values(MeterType).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                ) : (
                                  isReadOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded border ${CLEANLINESS_COLORS[item.cleanliness]}`}>
                                      <i className="fas fa-circle text-[8px]"></i>
                                      {item.cleanliness}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Cleanliness</label>
                                      <select
                                        value={item.cleanliness}
                                        onChange={(e) => updateItem(room.id, item.id, { cleanliness: e.target.value as Cleanliness })}
                                        className="w-full text-xs p-1 rounded border-l-4 outline-none font-semibold"
                                        style={{ backgroundColor: CLEANLINESS_CSS[item.cleanliness].bg, color: CLEANLINESS_CSS[item.cleanliness].color, borderLeftColor: CLEANLINESS_CSS[item.cleanliness].bg }}
                                      >
                                        {Object.values(Cleanliness).map(c => (
                                          <option key={c} value={c} style={{ backgroundColor: CLEANLINESS_CSS[c].bg, color: CLEANLINESS_CSS[c].color }}>{c}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="col-span-2">
                                <div className="flex flex-wrap gap-2 items-start">
                                  {uploadingItems.has(item.id) && (
                                    <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded text-[10px] font-bold text-amber-600">
                                      <i className="fas fa-circle-notch fa-spin"></i> Uploading...
                                    </span>
                                  )}
                                  {item.photos.length > 0 && item.photos.map((pStr, idx) => {
                                    const photo = JSON.parse(pStr) as Photo;
                                    const globalIdx = allPhotos.findIndex(p => p.photo.id === photo.id) + 1;

                                    return (
                                      <a
                                        href={photo.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        key={idx}
                                        className="flex items-center gap-1 bg-slate-100 hover:bg-bergason-gold hover:text-white px-2 py-1 rounded text-[10px] font-bold text-slate-600 transition-colors border border-slate-200"
                                        title="Click to view full-size photo"
                                      >
                                        <i className="fas fa-camera"></i>
                                        Ref #{globalIdx}
                                      </a>
                                    );
                                  })}

                                  {!isReadOnly && (
                                    <label
                                      className="w-8 h-8 flex items-center justify-center border border-dashed border-slate-300 text-slate-400 rounded cursor-pointer hover:bg-slate-100 hover:text-bergason-navy transition-colors"
                                      title="Add Photo"
                                    >
                                      <i className="fas fa-plus text-xs"></i>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          if (e.target.files?.[0]) addPhoto(room.id, item.id, e.target.files[0]);
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. DOCUMENTS */}
        <section className="mt-16 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase text-bergason-gold tracking-widest mb-6 border-b border-slate-100 pb-2">
            Documents
          </h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
            {inventory.documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 flex items-center justify-center rounded ${doc.fileData ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
                    <i className="far fa-file-pdf"></i>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{doc.name}</div>
                    {doc.uploadDate && <div className="text-[10px] text-slate-400">Uploaded {formatDate(doc.uploadDate)}</div>}
                  </div>
                </div>
                <div>
                  {doc.fileData ? (
                    <div className="flex gap-2">
                      <a
                        href={doc.fileData}
                        download={doc.name}
                        className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-medium text-slate-600"
                      >
                        Download
                      </a>
                      {!isReadOnly && (
                        <label className="cursor-pointer text-xs bg-white border border-slate-200 hover:border-bergason-gold hover:text-bergason-gold px-3 py-1 rounded font-medium text-slate-400">
                          Replace
                          <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleDocUpload(doc.id, e)} />
                        </label>
                      )}
                    </div>
                  ) : (
                    !isReadOnly && (
                      <label className="cursor-pointer text-xs bg-bergason-navy text-white hover:bg-slate-800 px-3 py-1.5 rounded font-bold shadow-sm">
                        <i className="fas fa-upload mr-1"></i> Upload
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleDocUpload(doc.id, e)} />
                      </label>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. GUIDANCE & DISCLAIMERS */}
        <section className="mt-12 break-inside-avoid">
          <div className="bg-slate-50 p-6 rounded-lg text-xs text-slate-600 text-justify leading-relaxed border border-slate-200 mb-8">
            <h4 className="font-bold text-slate-800 uppercase mb-2">Disclaimer</h4>
            <div className="whitespace-pre-wrap mb-4">{DISCLAIMER_TEXT}</div>

            <h4 className="font-bold text-slate-800 uppercase mb-2 mt-6">Guidance Notes to Tenants</h4>
            <div className="whitespace-pre-wrap mb-4">{GUIDANCE_NOTES}</div>
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Tenant Acknowledgements</p>
              {[
                'I have read and understood the check-out process',
                'I have read and understood what is required before the check-out report',
                'I have read and understood the issues to look out for during my tenancy',
              ].map(item => (
                <label key={item} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guidanceTicked.has(item)}
                    onChange={() => setGuidanceTicked(prev => {
                      const next = new Set(prev);
                      next.has(item) ? next.delete(item) : next.add(item);
                      return next;
                    })}
                    className="mt-0.5 w-4 h-4 accent-bergason-navy shrink-0"
                  />
                  <span className="text-xs text-slate-700">{item}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 6. SIGNATURES */}
        <section className="mt-8 border-t-4 border-double border-bergason-gold pt-10 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase text-bergason-gold tracking-widest mb-6">
            Declaration & Signatures
          </h3>

          <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={isReadOnly}
                checked={inventory.declarationAgreed}
                onChange={(e) => updateInventory({ declarationAgreed: e.target.checked })}
                className="mt-1 w-5 h-5 accent-bergason-navy"
              />
              <div className="text-xs text-slate-700 leading-relaxed">
                {DECLARATION_TEXT}
              </div>
            </label>
          </div>

          <div className="mb-8 flex items-center gap-4">
            <span className="text-sm font-bold text-slate-700">Was the tenant present during the inspection?</span>
            <div className="flex gap-2">
              <button
                disabled={isReadOnly}
                onClick={() => updateInventory({ tenantPresent: true })}
                className={`px-4 py-1 rounded text-xs font-bold border ${inventory.tenantPresent ? 'bg-bergason-navy text-white' : 'bg-white text-slate-500'}`}
              >
                YES
              </button>
              <button
                disabled={isReadOnly}
                onClick={() => updateInventory({ tenantPresent: false })}
                className={`px-4 py-1 rounded text-xs font-bold border ${!inventory.tenantPresent ? 'bg-bergason-navy text-white' : 'bg-white text-slate-500'}`}
              >
                NO
              </button>
            </div>
          </div>


          {!isReadOnly && (
            <div className="space-y-6">
              {/* How many tenants */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="text-xs font-bold uppercase text-slate-500 block mb-3">How many tenants are signing?</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setTenantCount(n)}
                      className={`w-12 h-12 rounded-full font-bold text-base border-2 transition-all ${
                        tenantCount === n
                          ? 'bg-bergason-navy text-white border-bergason-navy shadow-md'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-bergason-navy'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* One signature box per tenant */}
              {Array.from({ length: tenantCount }).map((_, idx) => {
                const tenantSig = inventory.signatures.filter(s => s.type === 'Tenant')[idx];
                return (
                  <div key={idx} className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-4">
                      Tenant {tenantCount > 1 ? idx + 1 : ''} Signature
                    </h4>
                    {tenantSig ? (
                      <div className="flex items-start gap-4">
                        <div>
                          <img src={tenantSig.data} className="h-16 mix-blend-multiply" alt="Signed" />
                          <p className="text-base font-serif text-slate-800 mt-1">{tenantSig.name}</p>
                          <p className="text-[10px] font-bold uppercase text-green-600">✓ Signed {formatDateTime(tenantSig.date)}</p>
                        </div>
                        <button
                          onClick={() => updateInventory({ signatures: inventory.signatures.filter(s => s.id !== tenantSig.id) })}
                          className="text-xs text-red-400 hover:text-red-600 mt-1"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          placeholder={`Tenant ${tenantCount > 1 ? idx + 1 : ''} full name`}
                          value={idx === 0 ? signerName : ''}
                          onChange={(e) => setSignerName(e.target.value)}
                          className="w-full p-2 border rounded text-sm mb-3"
                        />
                        <SignaturePad
                          key={`tenant-${idx}-${inventory.signatures.filter(s => s.type === 'Tenant').length}`}
                          onSave={(dataUrl) => {
                            if (!inventory) return;
                            const name = signerName.trim() || `Tenant ${idx + 1}`;
                            const newSig: SignatureEntry = {
                              id: generateId(),
                              name,
                              type: 'Tenant',
                              data: dataUrl,
                              date: Date.now(),
                            };
                            updateInventory({ signatures: [...inventory.signatures, newSig] });
                            setSignerName('');
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Other signers (inspector, Bergason etc.) */}
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-4">Other Signature (Inspector / Bergason)</h4>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <input
                    placeholder="Full Name"
                    value={signerType === 'Tenant' ? '' : signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="flex-1 p-2 border rounded text-sm"
                  />
                  <select
                    value={signerType === 'Tenant' ? 'Bergason' : signerType}
                    onChange={(e) => setSignerType(e.target.value)}
                    className="p-2 border rounded text-sm bg-white"
                  >
                    <option value="Bergason">Bergason</option>
                    <option value="Clerk">Inventory Clerk</option>
                    <option value="Landlord">Landlord</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <SignaturePad
                  key={`other-${inventory.signatures.filter(s => s.type !== 'Tenant').length}`}
                  onSave={(dataUrl) => {
                    if (!inventory) return;
                    const type = signerType === 'Tenant' ? 'Bergason' : signerType;
                    const newSig: SignatureEntry = {
                      id: generateId(),
                      name: signerName.trim() || type,
                      type,
                      data: dataUrl,
                      date: Date.now(),
                    };
                    updateInventory({ signatures: [...inventory.signatures, newSig] });
                    setSignerName('');
                  }}
                />
                {inventory.signatures.filter(s => s.type !== 'Tenant').map(sig => (
                  <div key={sig.id} className="flex items-start gap-4 mt-4 pt-4 border-t border-slate-200">
                    <div>
                      <img src={sig.data} className="h-16 mix-blend-multiply" alt="Signed" />
                      <p className="text-base font-serif text-slate-800 mt-1">{sig.name}</p>
                      <p className="text-[10px] font-bold uppercase text-green-600">✓ {sig.type} — {formatDateTime(sig.date)}</p>
                    </div>
                    <button
                      onClick={() => updateInventory({ signatures: inventory.signatures.filter(s => s.id !== sig.id) })}
                      className="text-xs text-red-400 hover:text-red-600 mt-1"
                    >
                      Clear
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isPreviewMode && inventory.signatures.length > 0 && (
            <div className="mt-8 space-y-4" data-pdf-hide="true">

              {/* ── STAGE 1 — Send for Signature ── */}
              <div>
                {!signToken ? (
                  <>
                  {!inventory.propertyId && (
                    <p className="text-xs text-center text-red-500 mb-2"><i className="fas fa-exclamation-circle mr-1"></i>Add a Property ID above before sending</p>
                  )}
                  <Button
                    onClick={() => setShowSignModal(true)}
                    disabled={!inventory.propertyId}
                    className={`w-full ${inventory.propertyId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-300 cursor-not-allowed'} text-white`}
                  >
                    <i className="fas fa-pen-nib mr-2"></i> Send for Signature
                  </Button>
                  </>
                ) : (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                    <p className="text-sm font-bold text-green-700"><i className="fas fa-check-circle mr-1"></i> Stage 1 complete — signature request sent</p>
                    {dispatchRef && (
                      <div className="bg-white border border-green-300 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Dispatch Reference</p>
                        <p className="text-base font-bold text-bergason-navy font-mono">{dispatchRef}</p>
                        <p className="text-[10px] text-slate-400">Confirmation sent to {OFFICE_EMAIL_DISPLAY}</p>
                      </div>
                    )}
                    {sentPdfUrl && (
                      <a href={sentPdfUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 font-mono truncate">
                        <i className="fas fa-file-pdf text-red-500"></i>
                        <span className="truncate">PDF 1 — Original Inventory</span>
                      </a>
                    )}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tenant Signature Link</p>
                      <div className="flex gap-2 items-center">
                        <input readOnly value={`${window.location.origin}${window.location.pathname}#/sign/${signToken}`}
                          className="flex-1 text-xs p-2 border rounded bg-white text-slate-600 font-mono" />
                        <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/sign/${signToken}`)}
                          className="text-xs bg-green-600 text-white px-3 py-2 rounded font-bold whitespace-nowrap">
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── STAGE 2 — Send Review Link (move-in day) ── */}
              {signToken && (
                <div>
                  {!reviewSentLink ? (
                    <Button
                      onClick={() => setShowReviewModal(true)}
                      className="w-full bg-bergason-navy hover:bg-slate-700 text-white"
                    >
                      <i className="fas fa-clock mr-2"></i> Send Review Link (Move-In Day)
                    </Button>
                  ) : (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                      <p className="text-sm font-bold text-blue-700"><i className="fas fa-check-circle mr-1"></i> Stage 2 complete — 5-day review link sent</p>
                      {reviewDispatchRef && (
                        <div className="bg-white border border-blue-300 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Dispatch Reference</p>
                          <p className="text-base font-bold text-bergason-navy font-mono">{reviewDispatchRef}</p>
                          <p className="text-[10px] text-slate-400">Day 3 &amp; Day 5 reminders scheduled. Expiry proof sent to {OFFICE_EMAIL_DISPLAY} on Day 6 if not completed.</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tenant Review Link</p>
                        <div className="flex gap-2 items-center">
                          <input readOnly value={reviewSentLink}
                            className="flex-1 text-xs p-2 border rounded bg-white text-slate-600 font-mono" />
                          <button onClick={() => navigator.clipboard.writeText(reviewSentLink)}
                            className="text-xs bg-blue-600 text-white px-3 py-2 rounded font-bold whitespace-nowrap">
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lock Inventory */}
              {!isLocked && inventory.declarationAgreed && (
                <div className="text-center">
                  <Button
                    onClick={() => {
                      if (window.confirm("Are you sure? This will lock the inventory preventing further edits.")) {
                        updateInventory({ status: 'LOCKED' });
                      }
                    }}
                    className="w-full md:w-auto bg-green-600 hover:bg-green-700"
                  >
                    <i className="fas fa-lock mr-2"></i> Lock Inventory
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Stage 1 Modal — Send for Signature ── */}
          {showSignModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-xl text-slate-800 mb-1">Send for Signature</h3>
                <p className="text-sm text-slate-500 mb-5">
                  The inventory PDF will be saved to Firebase and the tenant will receive a digital signature link.
                </p>
                {sending ? (
                  <div className="py-8 text-center">
                    <i className="fas fa-circle-notch fa-spin text-3xl text-amber-500 mb-3 block"></i>
                    <p className="text-sm font-bold text-slate-700">{sendStatus}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-5">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tenant Full Name</label>
                        <input
                          value={tenantName}
                          onChange={e => setTenantName(e.target.value)}
                          placeholder="e.g. Joe Bloggs"
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tenant Email Address</label>
                        <input
                          type="email"
                          value={tenantEmail}
                          onChange={e => setTenantEmail(e.target.value)}
                          placeholder="e.g. tenant@email.com"
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowSignModal(false)}
                        className="flex-1 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-500"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!tenantName.trim() || !tenantEmail.trim()}
                        onClick={async () => {
                          if (!inventory || !reportRef.current) return;
                          setSending(true);
                          try {
                            setSendStatus('Saving to database...');
                            const token = await saveInventoryToFirestore(inventory, tenantEmail.trim(), tenantName.trim());

                            setSendStatus('Generating PDF...');
                            let pdfUrl: string | null = null;
                            try {
                              const pdfBlob = await captureElementAsPDF(reportRef.current);
                              setSendStatus('Uploading PDF...');
                              const storagePath = `pdfs/${token}/original.pdf`;
                              pdfUrl = await uploadPDFToStorage(pdfBlob, storagePath);
                              await updateTenantProgress(token, { originalPdfUrl: pdfUrl });
                            } catch (pdfErr) {
                              console.warn('PDF generation/upload failed:', pdfErr);
                            }

                            setSendStatus('Sending signature request email...');
                            const signLink = `${window.location.origin}${window.location.pathname}#/sign/${token}`;
                            let emailRef: string | null = null;
                            try {
                              emailRef = await sendInventoryEmail({
                                type: 'signature_request',
                                tenantEmail: tenantEmail.trim(),
                                tenantName: tenantName.trim(),
                                address: inventory.address,
                                pdfStoragePath: pdfUrl ? `pdfs/${token}/original.pdf` : '',
                                firestoreToken: token,
                                propertyId: inventory.propertyId,
                                signLink,
                              });
                              setDispatchRef(emailRef);
                            } catch (emailErr) {
                              console.warn('Email failed:', emailErr);
                              alert('Email failed to send, but the signature link has been created. You can copy it manually.');
                            }

                            setSignToken(token);
                            if (pdfUrl) setSentPdfUrl(pdfUrl);
                            saveTokenState(inventory.id, {
                              signToken: token,
                              tenantName: tenantName.trim(),
                              tenantEmail: tenantEmail.trim(),
                              sentPdfUrl: pdfUrl ?? null,
                              dispatchRef: emailRef,
                              reviewSentLink: null,
                              reviewDispatchRef: null,
                            });
                            setShowSignModal(false);
                          } catch {
                            alert('Failed to save. Please check your connection and try again.');
                          } finally {
                            setSending(false);
                            setSendStatus('');
                          }
                        }}
                        className={`flex-1 py-3 rounded-lg text-sm font-bold text-white transition-colors ${
                          !tenantName.trim() || !tenantEmail.trim()
                            ? 'bg-slate-300 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-600'
                        }`}
                      >
                        Generate PDF &amp; Send
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Stage 2 Modal — Send Review Link ── */}
          {showReviewModal && signToken && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-xl text-slate-800 mb-1">Send Review Link</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Send the tenant their 5-day review link. Day 3 and Day 5 reminders will be sent automatically. If not completed, an expiry proof email is sent to you on Day 6.
                </p>
                <div className="bg-slate-50 rounded-lg p-3 mb-5 text-sm text-slate-600 space-y-1">
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Tenant</span><span>{tenantName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Email</span><span className="truncate ml-4">{tenantEmail}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Property</span><span className="truncate ml-4">{inventory.address}</span></div>
                </div>
                {reviewSending ? (
                  <div className="py-6 text-center">
                    <i className="fas fa-circle-notch fa-spin text-3xl text-bergason-navy mb-3 block"></i>
                    <p className="text-sm font-bold text-slate-700">Activating review link &amp; sending email…</p>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowReviewModal(false)}
                      className="flex-1 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setReviewSending(true);
                        try {
                          await activateReviewLink(signToken);
                          const link = `${window.location.origin}${window.location.pathname}#/review/${signToken}`;
                          const ref = await sendInventoryEmail({
                            type: 'review_link',
                            tenantEmail,
                            tenantName,
                            address: inventory.address,
                            pdfStoragePath: sentPdfUrl ? `pdfs/${signToken}/original.pdf` : '',
                            firestoreToken: signToken,
                            propertyId: inventory.propertyId,
                            reviewLink: link,
                          });
                          setReviewSentLink(link);
                          setReviewDispatchRef(ref);
                          saveTokenState(inventory.id, { reviewSentLink: link, reviewDispatchRef: ref ?? null });
                          setShowReviewModal(false);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : String(err);
                          alert(`Failed to send review link: ${msg}`);
                        } finally {
                          setReviewSending(false);
                        }
                      }}
                      className="flex-1 py-3 rounded-lg text-sm font-bold text-white bg-bergason-navy hover:bg-slate-700 transition-colors"
                    >
                      Send Review Link
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 7. PHOTO VAULT */}
        {allPhotos.length > 0 && (
          <section className="mt-20 break-before-page">
            <div className="text-center py-6 border-b border-slate-200 mb-8">
              <h2 className="font-serif text-2xl font-bold text-slate-900 uppercase tracking-widest">
                Appendix: Photo Schedule
              </h2>
              <p className="text-slate-500 text-sm mt-2">
                High resolution evidence with digital timestamps
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {allPhotos.map((item) => (
                <div key={item.photo.id} id={`photo-vault-${item.index}`} className="break-inside-avoid mb-6">
                  <div className="bg-slate-100 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <a href={item.photo.url} target="_blank" rel="noreferrer">
                      <img
                        src={item.photo.url}
                        alt={`Ref ${item.index}`}
                        className="w-full aspect-[4/3] object-cover hover:opacity-90 transition-opacity"
                      />
                    </a>
                    <div className="p-3 bg-white">
                      <div className="flex justify-between items-start mb-1">
                        <span className="inline-block bg-bergason-navy text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Ref #{item.index}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {formatDateTime(item.photo.timestamp)}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-800 truncate">{item.roomName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.itemName}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
};

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory/:id" element={<InventoryEditor />} />
        <Route path="/sign/:token" element={<TenantSign />} />
        <Route path="/review/:token" element={<TenantReview />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
