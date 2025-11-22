import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Inventory, Room, InventoryItem, Condition, Cleanliness, HealthSafetyCheck, MeterType, SignatureEntry, Photo } from './types';

import { generateId, formatDate, formatDateTime, compressImage } from './utils';
import { Button } from './components/Button';
import { SignaturePad } from './components/SignaturePad';
import { PREDEFINED_ROOMS, DEFAULT_ITEMS, METER_ITEMS, KITCHEN_ITEMS, MAJOR_APPLIANCES, REQUIRED_DOCUMENTS_LIST, CONDITION_COLORS, CLEANLINESS_COLORS, HS_QUESTIONS, DISCLAIMER_TEXT, GUIDANCE_NOTES, DECLARATION_TEXT } from './constants';

// --- Services ---

const STORAGE_KEY = 'bergason_inventories_v5';

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
  <div className={`flex flex-col items-center justify-center bg-black text-bergason-gold p-4 w-[200px] border-2 border-bergason-gold ${className}`}>
    <div className="text-3xl font-serif text-white tracking-wide mb-2">Bergason</div>
    <div className="relative w-24 h-28 bg-[#fef3c7] flex items-center justify-center mb-2">
      <span className="font-serif italic text-black text-[120px] leading-none -ml-2 -mt-4">b</span>
    </div>
    <div className="text-xs uppercase tracking-widest text-white border-t border-bergason-gold pt-1 w-full text-center">
      Property Services
    </div>
  </div>
);

const Dashboard = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setInventories(getInventories().sort((a, b) => b.dateUpdated - a.dateUpdated));
  }, []);

  const createNew = () => {
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
      healthSafetyChecks: HS_QUESTIONS.map(q => ({
        id: generateId(),
        question: q,
        answer: null
      })),
      rooms: PREDEFINED_ROOMS.flatMap(group => 
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
              // Defaults for meter/appliance fields
              meterType: MeterType.STANDARD,
              workingStatus: 'Not Tested'
            }))
          };
        })
      )
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
            <h2 className="text-blue-100 font-light text-sm uppercase tracking-widest">Inventory Management System</h2>
        </div>
        <div className="flex justify-center">
            <Button onClick={createNew} className="bg-bergason-gold text-white hover:bg-amber-600 shadow-lg shadow-amber-900/20 px-8 py-3 rounded-full font-bold transition-transform hover:scale-105">
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
                <div key={inv.id} onClick={() => navigate(`/inventory/${inv.id}`)} className="p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer flex items-center gap-4 group">
                    <div className={`w-16 h-16 shrink-0 rounded-lg flex items-center justify-center text-lg shadow-sm border overflow-hidden ${inv.status === 'LOCKED' ? 'border-green-200' : 'border-slate-100'}`}>
                        {inv.frontImage ? (
                          <img src={inv.frontImage} className="w-full h-full object-cover" alt="Property" />
                        ) : (
                          <i className={`fas ${inv.status === 'LOCKED' ? 'fa-lock text-green-500' : 'fa-home text-slate-300'}`}></i>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-800 text-base truncate group-hover:text-bergason-navy transition-colors">{inv.address || "Untitled Property"}</h3>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                            <span>{formatDate(inv.dateCreated)}</span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span>{inv.rooms.length} Rooms</span>
                        </div>
                    </div>
                    <i className="fas fa-chevron-right text-slate-200 group-hover:text-bergason-gold"></i>
                </div>
                ))}
            </div>
            )}
        </div>
      </main>
    </div>
  );
};

const InventoryEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  // Store expanded state by ID. Default true for "expanded", false for collapsed.
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // Signature state
  const [signerName, setSignerName] = useState("");
  const [signerType, setSignerType] = useState<'Tenant' | 'Clerk' | 'Other'>("Tenant");

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
                name: name,
                fileData: null,
                uploadDate: null
             }));
        }

        setInventory(data);
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

  const addPhoto = async (roomId: string, itemId: string, file: File) => {
    if (!inventory) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const rawBase64 = e.target?.result as string;
        const compressed = await compressImage(rawBase64);
        const photoId = generateId();
        const photoObj: Photo = { 
            id: photoId, 
            url: compressed, 
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
    };
    reader.readAsDataURL(file);
  };

  const handleFrontImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const raw = evt.target?.result as string;
        const compressed = await compressImage(raw, 1200); 
        updateInventory({ frontImage: compressed });
    };
    reader.readAsDataURL(file);
  };

  const handleDocUpload = (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!inventory) return;
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const docs = inventory.documents.map(d => {
            if (d.id === docId) {
                return { ...d, fileData: evt.target?.result as string, uploadDate: Date.now() }
            }
            return d;
        });
        updateInventory({ documents: docs });
    };
    reader.readAsDataURL(file);
  };

  const addSignature = (dataUrl: string) => {
      if (!inventory) return;
      if (!signerName) {
          alert("Please enter the name of the person signing.");
          return;
      }
      const newSig: SignatureEntry = {
          id: generateId(),
          name: signerName,
          type: signerType,
          data: dataUrl,
          date: Date.now()
      };
      updateInventory({ signatures: [...inventory.signatures, newSig] });
      setSignerName("");
  };

  if (!inventory) return <div className="h-screen flex items-center justify-center"><i className="fas fa-circle-notch fa-spin text-bergason-navy text-2xl"></i></div>;
  const isLocked = inventory.status === 'LOCKED';
  const isReadOnly = isPreviewMode || isLocked;

  // Flatten photos for the Vault
  const allPhotos: { photo: Photo, roomName: string, itemName: string, index: number }[] = [];
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

  // Pre-print helper: scroll through Photo Vault so all thumbnails load before printing.
  const prepareForPrint = async () => {
    try {
      setIsPreparingPrint(true);
      // Ensure we are in Preview mode to expand rooms.
      if (!isPreviewMode) setIsPreviewMode(true);

      const vaultStart = document.getElementById('photo-vault-start');
      if (vaultStart) {
        vaultStart.scrollIntoView({ behavior: 'smooth' });
        await new Promise(r => setTimeout(r, 900));
      }

      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 1200));

      window.scrollTo({ top: 0, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 600));

      alert('Photos have been loaded for printing. Now tap Print / Save PDF.');
    } finally {
      setIsPreparingPrint(false);
    }
  };

  return (
    <div className={`min-h-screen bg-white ${isPreviewMode ? '' : 'pb-24'}`}>
      
      {/* Top Bar */}
      {!isPreviewMode && (
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
            <div className="flex justify-between items-center px-4 py-3">
                <button onClick={() => navigate('/')} className="text-slate-500 hover:text-bergason-navy flex items-center gap-1 font-medium">
                    <i className="fas fa-chevron-left"></i> <span className="hidden xs:inline">Back</span>
                </button>
                <div className="font-serif font-bold text-bergason-navy text-lg truncate px-2">{inventory.address || 'New Inventory'}</div>
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
         <div className="fixed top-0 left-0 right-0 z-50 bg-bergason-navy text-white p-4 flex justify-between items-center print:hidden shadow-xl">
             <button onClick={() => setIsPreviewMode(false)} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm font-semibold backdrop-blur">
                 <i className="fas fa-edit mr-2"></i> Edit Mode
             </button>

             <button
                 onClick={prepareForPrint}
                 disabled={isPreparingPrint}
                 className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm font-semibold backdrop-blur disabled:opacity-60"
             >
                 <i className="fas fa-images mr-2"></i>
                 {isPreparingPrint ? "Preparing…" : "Pre-print check"}
             </button>

             <button onClick={() => window.print()} className="bg-bergason-gold text-bergason-navy px-4 py-2 rounded text-sm font-bold shadow-lg hover:bg-amber-400">
                 <i className="fas fa-print mr-2"></i> Print / Save PDF
             </button>
         </div>
      )}

      <div className={`max-w-[210mm] mx-auto bg-white min-h-screen ${isPreviewMode ? 'pt-20 print:pt-0' : 'p-4 md:p-8'}`}>
        
        {/* REPORT HEADER */}
        <div className="text-center py-8 border-b-4 border-double border-bergason-gold mb-10">
            <div className="flex justify-center mb-6">
                <BergasonLogo />
            </div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 uppercase tracking-widest mt-4">Inventory & Schedule of Condition</h1>
        </div>

        {/* 1. PROPERTY DETAILS / COVER PAGE */}
        <section className="mb-12 break-inside-avoid">
            
            {/* FRONT IMAGE UPLOAD */}
            <div className="mb-8">
                {inventory.frontImage ? (
                <div className="relative group rounded-xl overflow-hidden shadow-lg border-2 border-slate-100 bg-slate-100">
                    <img src={inventory.frontImage} alt="Property Front" className="w-full max-h-[600px] object-contain mx-auto" />
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
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Property Address</label>
                    <input 
                        value={inventory.address}
                        readOnly={isReadOnly}
                        onChange={(e) => updateInventory({ address: e.target.value })}
                        placeholder="Enter full address of the property"
                        className={`w-full text-2xl font-serif font-medium text-slate-800 border-b ${isReadOnly ? 'border-transparent' : 'border-slate-200'} focus:border-bergason-navy outline-none py-1 placeholder:font-sans placeholder:text-slate-300`}
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Property Description</label>
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
                                                        ? (opt === 'YES' ? 'bg-green-600 text-white border-green-600' : opt === 'NO' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-600 text-white border-slate-600')
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

        {/* 3. ROOMS GRID */}
        <div className="space-y-4">
            {inventory.rooms.map((room, roomIndex) => {
                const showHeader = roomIndex === 0 || inventory.rooms[roomIndex - 1].floorGroup !== room.floorGroup;
                const isExpanded = isPreviewMode || expandedRooms[room.id];
                const isMeterRoom = room.name === "Meter Cupboard";
                const isKitchen = room.name === "Kitchen";

                return (
                    <div key={room.id} className="break-inside-avoid">
                        {showHeader && (
                            <h2 className="text-xl font-bold bg-bergason-navy text-white p-2 uppercase tracking-widest text-center mb-6 mt-8 print:mt-4">
                                {room.floorGroup}
                            </h2>
                        )}
                        
                        <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                            {/* Room Header - Click to toggle */}
                            <div 
                                onClick={() => !isPreviewMode && toggleRoom(room.id)}
                                className={`flex justify-between items-center p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-100 border-b border-slate-200' : 'bg-white hover:bg-slate-50'}`}
                            >
                                <h3 className="font-serif font-bold text-xl text-slate-900">
                                    {roomIndex + 1}. {room.name}
                                </h3>
                                <i className={`fas fa-chevron-down transition-transform text-slate-400 ${isExpanded ? 'rotate-180' : ''}`}></i>
                            </div>

                            {/* Room Content */}
                            {isExpanded && (
                                <div className="p-2 md:p-4 bg-white">
                                    {/* GRID HEADER - Desktop/Print Only */}
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
                                            const isMeter = isMeterRoom && (item.name.includes("Meter"));

                                            return (
                                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 py-4 md:py-2 relative border-b md:border-none border-slate-100 pb-4 md:pb-2">
                                                    
                                                    {/* 1. Item Name */}
                                                    <div className="col-span-2 font-bold text-slate-800 text-sm flex items-start gap-1">
                                                        <span className="text-slate-400 font-mono text-xs">{roomIndex + 1}.{itemIndex + 1}</span>
                                                        {item.name}
                                                    </div>

                                                    {/* 2. Description / Details */}
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

                                                    {/* 3. Condition / Supplier */}
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
                                                                <span className={`inline-block px-2 py-1 text-[10px] font-bold uppercase rounded border ${CONDITION_COLORS[item.condition]}`}>
                                                                    {item.condition}
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Condition</label>
                                                                    <select
                                                                        value={item.condition}
                                                                        onChange={(e) => updateItem(room.id, item.id, { condition: e.target.value as Condition })}
                                                                        className={`w-full text-xs p-1 rounded border-l-4 ${CONDITION_COLORS[item.condition]} bg-white border-slate-200 outline-none`}
                                                                    >
                                                                        {Object.values(Condition).map(c => <option key={c} value={c}>{c}</option>)}
                                                                    </select>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>

                                                    {/* 4. Cleanliness / Type */}
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
                                                                <span className={`inline-block px-2 py-1 text-[10px] font-bold uppercase rounded border ${CLEANLINESS_COLORS[item.cleanliness]}`}>
                                                                    {item.cleanliness}
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase">Cleanliness</label>
                                                                    <select
                                                                        value={item.cleanliness}
                                                                        onChange={(e) => updateItem(room.id, item.id, { cleanliness: e.target.value as Cleanliness })}
                                                                        className={`w-full text-xs p-1 rounded border-l-4 ${CLEANLINESS_COLORS[item.cleanliness]} bg-white border-slate-200 outline-none`}
                                                                    >
                                                                        {Object.values(Cleanliness).map(c => <option key={c} value={c}>{c}</option>)}
                                                                    </select>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>

                                                    {/* 5. Photos */}
                                                    <div className="col-span-2">
                                                        <div className="flex flex-wrap gap-2 items-start">
                                                            {item.photos.length > 0 && item.photos.map((pStr, idx) => {
                                                                const photo = JSON.parse(pStr) as Photo;
                                                                const globalIdx = allPhotos.findIndex(p => p.photo.id === photo.id) + 1;
                                                                
                                                                return (
                                                                    <a href={`#photo-vault-${globalIdx}`} key={idx} className="flex items-center gap-1 bg-slate-100 hover:bg-bergason-gold hover:text-white px-2 py-1 rounded text-[10px] font-bold text-slate-600 transition-colors border border-slate-200">
                                                                        <i className="fas fa-camera"></i>
                                                                        Ref #{globalIdx}
                                                                    </a>
                                                                )
                                                            })}
                                                            {!isReadOnly && (
                                                                <label className="w-8 h-8 flex items-center justify-center border border-dashed border-slate-300 text-slate-400 rounded cursor-pointer hover:bg-slate-100 hover:text-bergason-navy transition-colors" title="Add Photo">
                                                                    <i className="fas fa-plus text-xs"></i>
                                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                                        if (e.target.files?.[0]) addPhoto(room.id, item.id, e.target.files[0]);
                                                                    }} />
                                                                </label>
                                                            )}
                                                        </div>
                                                    </div>

                                                </div>
                                            )
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
            <h3 className="text-sm font-bold uppercase text-bergason-gold tracking-widest mb-6 border-b border-slate-100 pb-2">Documents</h3>
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
                 <div className="whitespace-pre-wrap">{GUIDANCE_NOTES}</div>
             </div>
        </section>

        {/* 6. SIGNATURES */}
        <section className="mt-8 border-t-4 border-double border-bergason-gold pt-10 break-inside-avoid">
            <h3 className="text-sm font-bold uppercase text-bergason-gold tracking-widest mb-6">Declaration & Signatures</h3>

            {/* Declaration Checkbox */}
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

            {/* Tenant Present Checkbox */}
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

            {/* List Existing Signatures */}
            <div className="space-y-8 mb-8">
                {inventory.signatures.map(sig => (
                     <div key={sig.id} className="border-t border-slate-300 pt-2 w-full md:w-1/2">
                        <div className="relative">
                            <img src={sig.data} className="h-16 mix-blend-multiply" alt="Signed" />
                            <div className="absolute top-0 right-0 text-[9px] text-green-600 font-bold border border-green-200 bg-green-50 px-1 rounded">
                                {formatDateTime(sig.date)}
                            </div>
                        </div>
                        <p className="text-lg font-serif text-slate-800">{sig.name}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">{sig.type} Signature</p>
                     </div>
                ))}
            </div>

            {/* Add New Signature */}
            {!isReadOnly && (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-4">Add Signature</h4>
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <input 
                            placeholder="Full Name"
                            value={signerName}
                            onChange={(e) => setSignerName(e.target.value)}
                            className="flex-1 p-2 border rounded text-sm"
                        />
                        <select 
                            value={signerType} 
                            onChange={(e) => setSignerType(e.target.value as any)}
                            className="p-2 border rounded text-sm bg-white"
                        >
                            <option value="Tenant">Tenant</option>
                            <option value="Clerk">Inventory Clerk</option>
                            <option value="Landlord">Landlord</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <SignaturePad 
                        onSave={addSignature}
                        onClear={() => {}}
                    />
                </div>
            )}
            
            {/* Lock Button */}
            {!isLocked && !isPreviewMode && inventory.signatures.length > 0 && inventory.declarationAgreed && (
                <div className="mt-8 text-center">
                    <Button 
                        onClick={() => {
                            if(window.confirm("Are you sure? This will lock the inventory preventing further edits.")) {
                                updateInventory({ status: 'LOCKED' });
                            }
                        }}
                        className="w-full md:w-auto bg-green-600 hover:bg-green-700"
                    >
                        <i className="fas fa-lock mr-2"></i> Lock Inventory
                    </Button>
                </div>
            )}

        </section>

        {/* 7. PHOTO VAULT (APPENDIX) */}
        {allPhotos.length > 0 && (
            <section id="photo-vault-start" className="mt-20 break-before-page">
                <div className="text-center py-6 border-b border-slate-200 mb-8">
                    <h2 className="font-serif text-2xl font-bold text-slate-900 uppercase tracking-widest">Appendix: Photo Schedule</h2>
                    <p className="text-slate-500 text-sm mt-2">High resolution evidence with digital timestamps</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {allPhotos.map((item) => (
                        <div key={item.photo.id} id={`photo-vault-${item.index}`} className="break-inside-avoid mb-6">
                            <div className="bg-slate-100 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                <a href={item.photo.url} target="_blank" rel="noreferrer">
                                    <img src={item.photo.url} alt={`Ref ${item.index}`} className="w-full aspect-[4/3] object-cover hover:opacity-90 transition-opacity" />
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
      </Routes>
    </HashRouter>
  );
};

export default App;
