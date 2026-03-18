import React, { useState, useEffect, useRef } from 'react';
import bergasonLogo from '../bergasonlogo.png';
import { useNavigate } from 'react-router-dom';
import { loadDraftsFromFirestore, loadAllInventoriesForPortal, saveInventoryToFirestore, updateTenantProgress } from '../services/inventory';
import { sendInventoryEmail } from '../services/email';
import { uploadPDFToStorage } from '../services/storage';
import { generateInventoryPDF } from '../services/pdfTemplate';
import { Inventory, Photo } from '../types';
import { formatDate } from '../utils';

// ── Simple hardcoded office credentials ──────────────────────────────────────
const OFFICE_EMAIL = 'cjeavons@bergason.co.uk';
const OFFICE_PASSWORD = 'Bergason2026!';

const CONDITION_BADGE: Record<string, { bg: string; color: string }> = {
  'Excellent':            { bg: '#16a34a', color: '#fff' },
  'Good':                 { bg: '#dcfce7', color: '#166534' },
  'Fair':                 { bg: '#fef9c3', color: '#854d0e' },
  'Consistent With Age':  { bg: '#dbeafe', color: '#1e40af' },
  'Poor':                 { bg: '#ffedd5', color: '#9a3412' },
  'Needs Attention':      { bg: '#dc2626', color: '#fff' },
};
const CLEAN_BADGE: Record<string, { bg: string; color: string }> = {
  'Professional Clean':   { bg: '#16a34a', color: '#fff' },
  'Domestic Clean':       { bg: '#dbeafe', color: '#1e40af' },
  'Good':                 { bg: '#dcfce7', color: '#166534' },
  'Fair':                 { bg: '#fef9c3', color: '#854d0e' },
  'Poor':                 { bg: '#ffedd5', color: '#9a3412' },
  'Dirty':                { bg: '#dc2626', color: '#fff' },
};

const Badge = ({ label, map }: { label: string; map: Record<string, { bg: string; color: string }> }) => {
  const s = map[label] || { bg: '#e2e8f0', color: '#334155' };
  return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:3, fontSize:10, fontWeight:700, background:s.bg, color:s.color }}>{label||'—'}</span>;
};

// ── Step indicator ────────────────────────────────────────────────────────────
const Steps = ({ current }: { current: number }) => {
  const steps = ['Review inventory','Confirm documents','Tenant signs','Send & confirm'];
  return (
    <div style={{ display:'flex', gap:0, marginBottom:24 }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} style={{ display:'flex', alignItems:'center', flex: i < 3 ? 1 : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{
                width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:700, flexShrink:0,
                background: done ? '#16a34a' : active ? '#d4af37' : '#e2e8f0',
                color: done || active ? '#fff' : '#94a3b8',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize:12, fontWeight: active ? 700 : 400, color: active ? '#0f172a' : done ? '#16a34a' : '#94a3b8', whiteSpace:'nowrap' }}>{s}</span>
            </div>
            {i < 3 && <div style={{ flex:1, height:1, background:'#e2e8f0', margin:'0 12px', minWidth:20 }} />}
          </div>
        );
      })}
    </div>
  );
};

// ── Signature pad ─────────────────────────────────────────────────────────────
const SignaturePad = ({ onSave }: { onSave: (data: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    const p = getPos(e);
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSig(true);
  };

  const stop = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const save = () => {
    if (!hasSig) return alert('Please sign before confirming.');
    onSave(canvasRef.current!.toDataURL('image/png'));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={700} height={180}
        style={{ border:'2px dashed #cbd5e1', borderRadius:8, width:'100%', height:180, background:'#f8fafc', cursor:'crosshair', display:'block', touchAction:'none' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
      />
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
        <button onClick={clear} style={{ fontSize:12, color:'#94a3b8', background:'none', border:'none', cursor:'pointer' }}>Clear</button>
        <button
          onClick={save}
          style={{ background: hasSig ? '#0f172a' : '#e2e8f0', color: hasSig ? '#fff' : '#94a3b8', border:'none', padding:'10px 28px', borderRadius:8, fontSize:13, fontWeight:700, cursor: hasSig ? 'pointer' : 'not-allowed' }}
        >
          {hasSig ? 'Confirm signature →' : 'Sign above first'}
        </button>
      </div>
    </div>
  );
};

// ── Main portal ───────────────────────────────────────────────────────────────
const OfficePortal: React.FC = () => {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState('');
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);

  // Signing session state
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [step, setStep] = useState(1);
  const [tenantName, setTenantName] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);
  const [docChecks, setDocChecks] = useState<Record<string, boolean>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | undefined>();
  const [sendingPdf, setSendingPdf] = useState(false);
  const [sendingReview, setSendingReview] = useState(false);
  const [pdfSentRef, setPdfSentRef] = useState<string | null>(null);
  const [reviewSentRef, setReviewSentRef] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (loggedIn) {
      setLoading(true);
      // Load from localStorage first (immediate)
      const STORAGE_KEY = 'bergason_inventories_v5';
      let local: Inventory[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) local = JSON.parse(raw);
      } catch { /* ignore */ }
      if (local.length > 0) setInventories(local.sort((a, b) => b.dateUpdated - a.dateUpdated));

      // Then merge with Firestore (catches inventories from other devices)
      loadAllInventoriesForPortal()
        .then(remote => {
          const localIds = new Set(local.map((i: Inventory) => i.id));
          const merged = [...local];
          for (const inv of remote) {
            if (!localIds.has(inv.id)) merged.push(inv);
            else {
              // Update local copy with remote if remote is newer
              const idx = merged.findIndex(i => i.id === inv.id);
              if (idx >= 0 && (inv.dateUpdated || 0) > (merged[idx].dateUpdated || 0)) {
                merged[idx] = inv;
              }
            }
          }
          setInventories(merged.sort((a, b) => (b.dateUpdated || 0) - (a.dateUpdated || 0)));
        })
        .catch(() => { /* keep local results */ })
        .finally(() => setLoading(false));
    }
  }, [loggedIn]);

  const login = () => {
    if (loginEmail.trim().toLowerCase() === OFFICE_EMAIL && loginPass === OFFICE_PASSWORD) {
      setLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Incorrect email or password.');
    }
  };

  const sendPasswordReset = async () => {
    if (!forgotEmail.trim()) { setForgotStatus('error:Please enter your email address.'); return; }
    if (forgotEmail.trim().toLowerCase() !== OFFICE_EMAIL) {
      setForgotStatus('error:No account found with that email address.');
      return;
    }
    setForgotStatus('sending');
    try {
      // Send reset email via the Cloud Function
      const res = await fetch('https://europe-west2-bergason-inventory.cloudfunctions.net/sendInventoryEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'password_reset',
          tenantEmail: forgotEmail.trim(),
          tenantName: 'Bergason Staff',
          address: 'Office Portal',
          pdfStoragePath: '',
          firestoreToken: 'password-reset',
        }),
      });
      // Whether function handles it or not, show confirmation (security best practice)
      setForgotStatus('sent');
    } catch {
      setForgotStatus('sent'); // Always show sent for security
    }
  };

  const startSession = (inv: Inventory) => {
    setSelected(inv);
    setStep(1);
    setTenantName('');
    setTenantEmail('');
    setMoveInDate(new Date().toISOString().split('T')[0]);
    setDocChecks({});
    setSignatureData(null);
    setToken(null);
    setPdfUrl(null);
    setPdfBase64(undefined);
    setPdfSentRef(null);
    setReviewSentRef(null);
    setStatus('');
  };

  const handleSign = async (sigData: string) => {
    if (!selected) return;
    setSendingPdf(true);
    setStatus('Saving to Bergason system...');
    try {
      const inv: Inventory = { ...selected, signatures: [...(selected.signatures || []), { id: Math.random().toString(36).slice(2), name: tenantName, type: 'Tenant', data: sigData, date: Date.now() }] };
      const t = await saveInventoryToFirestore(inv, tenantEmail, tenantName);
      setToken(t);
      setSignatureData(sigData);

      setStatus('Generating signed PDF...');
      const blob = await generateInventoryPDF(inv, bergasonLogo as string);
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setPdfBase64(b64);

      setStatus('Uploading PDF...');
      const url = await uploadPDFToStorage(blob, `pdfs/${t}/office-signed.pdf`);
      setPdfUrl(url);
      await updateTenantProgress(t, { signatureStatus: 'signed', tenantSignatureData: sigData, status: 'signed', signaturePdfUrl: url });

      setStep(4);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSendingPdf(false);
      setStatus('');
    }
  };

  const sendSignedCopy = async () => {
    if (!token || !selected) return;
    setSendingPdf(true);
    try {
      const ref = await sendInventoryEmail({
        type: 'signature_confirmation',
        tenantEmail,
        tenantName,
        address: selected.address,
        pdfStoragePath: pdfUrl ? `pdfs/${token}/office-signed.pdf` : '',
        pdfBuffer: pdfBase64,
        firestoreToken: token,
      });
      setPdfSentRef(ref);
    } catch (err) {
      alert(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSendingPdf(false);
    }
  };

  const sendReviewLink = async () => {
    if (!token || !selected) return;
    setSendingReview(true);
    try {
      const moveInMs = new Date(moveInDate).getTime();
      const activeRoomIds = selected.activeRoomIds || selected.rooms.map(r => r.id);
      await (await import('../services/inventory')).activateReviewLink(token, moveInMs, activeRoomIds);
      const link = `${window.location.origin}${window.location.pathname}#/review/${token}`;
      const ref = await sendInventoryEmail({
        type: 'review_link',
        tenantEmail,
        tenantName,
        address: selected.address,
        pdfStoragePath: '',
        firestoreToken: token,
        reviewLink: link,
      });
      setReviewSentRef(ref);
    } catch (err) {
      alert(`Failed to send review link: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSendingReview(false);
    }
  };

  const getActiveRooms = (inv: Inventory) => {
    const ids = inv.activeRoomIds;
    return ids?.length ? inv.rooms.filter(r => ids.includes(r.id) && !r.pdfExcluded) : inv.rooms.filter(r => !r.pdfExcluded);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', fontFamily:'Arial, Helvetica, sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#0f172a', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <img src={bergasonLogo as string} alt="Bergason" style={{ height:32, width:'auto' }} />
          <div style={{ color:'#d4af37', fontSize:11, letterSpacing:4, fontWeight:700 }}>OFFICE PORTAL</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {loggedIn && selected && (
            <button onClick={() => setSelected(null)} style={{ fontSize:12, color:'#94a3b8', background:'none', border:'1px solid #334155', padding:'5px 12px', borderRadius:6, cursor:'pointer' }}>
              ← All inventories
            </button>
          )}
          {loggedIn && (
            <button onClick={() => { setLoggedIn(false); setSelected(null); }} style={{ fontSize:12, color:'#94a3b8', background:'none', border:'none', cursor:'pointer' }}>
              Sign out
            </button>
          )}
          <button onClick={() => navigate('/inventories')} style={{ fontSize:12, color:'#64748b', background:'none', border:'none', cursor:'pointer' }}>
            ← Inventory app
          </button>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'32px 16px' }}>

        {/* ── LOGIN ── */}
        {!loggedIn && (
          <div style={{ maxWidth:380, margin:'60px auto' }}>
            <div style={{ textAlign:'center', marginBottom:32 }}>
              <div style={{ fontSize:11, letterSpacing:3, color:'#94a3b8', textTransform:'uppercase', marginBottom:8 }}>Bergason Office Portal</div>
              <div style={{ fontSize:24, fontWeight:700, color:'#0f172a' }}>Sign in</div>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:28 }}>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Email</label>
                <input
                  type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && login()}
                  placeholder="your@bergason.co.uk"
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14 }}
                />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Password</label>
                <input
                  type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && login()}
                  placeholder="••••••••"
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14 }}
                />
              </div>
              {loginError && <p style={{ color:'#dc2626', fontSize:13, marginBottom:12 }}>{loginError}</p>}
              <button onClick={login} style={{ width:'100%', background:'#0f172a', color:'#fff', border:'none', padding:'12px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Sign in to Office Portal
              </button>
              <div style={{ textAlign:'center', marginTop:14 }}>
                <button onClick={() => { setShowForgot(true); setForgotEmail(loginEmail); setForgotStatus(''); }}
                  style={{ fontSize:12, color:'#64748b', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  Forgot password?
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {!loggedIn && showForgot && (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#fff', borderRadius:14, padding:32, width:'100%', maxWidth:380 }}>
              <h3 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 8px' }}>Reset password</h3>
              {forgotStatus === 'sent' ? (
                <div>
                  <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'14px 16px', marginBottom:20 }}>
                    <p style={{ fontSize:14, color:'#166534', margin:0, lineHeight:1.6 }}>
                      If that email is registered, you'll receive a message with your password shortly. Check your inbox at <strong>{forgotEmail}</strong>.
                    </p>
                  </div>
                  <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:8, padding:'12px 14px', marginBottom:20, fontSize:13, color:'#854d0e' }}>
                    <strong>Your current password is: </strong>Bergason2026!<br/>
                    <span style={{ fontSize:12, color:'#92400e' }}>Contact Craig to change it if needed.</span>
                  </div>
                  <button onClick={() => setShowForgot(false)}
                    style={{ width:'100%', background:'#0f172a', color:'#fff', border:'none', padding:'11px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                    Back to sign in
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize:13, color:'#64748b', margin:'0 0 20px' }}>Enter your email address and we'll confirm your access details.</p>
                  <div style={{ marginBottom:16 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase' }}>Email</label>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendPasswordReset()}
                      placeholder="your@bergason.co.uk"
                      style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14 }} />
                  </div>
                  {forgotStatus.startsWith('error:') && (
                    <p style={{ color:'#dc2626', fontSize:13, marginBottom:12 }}>{forgotStatus.replace('error:', '')}</p>
                  )}
                  <button onClick={sendPasswordReset} disabled={forgotStatus === 'sending'}
                    style={{ width:'100%', background: forgotStatus === 'sending' ? '#e2e8f0' : '#0f172a', color: forgotStatus === 'sending' ? '#94a3b8' : '#fff', border:'none', padding:'11px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
                    {forgotStatus === 'sending' ? 'Sending...' : 'Reset password'}
                  </button>
                  <button onClick={() => setShowForgot(false)}
                    style={{ width:'100%', background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', padding:'10px', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INVENTORY LIST ── */}
        {loggedIn && !selected && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h1 style={{ fontSize:22, fontWeight:700, color:'#0f172a', margin:0 }}>Inventories ready to sign</h1>
              <p style={{ color:'#64748b', fontSize:14, margin:'4px 0 0' }}>Select a property to start an office signing session with the tenant.</p>
            </div>
            {loading ? (
              <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>Loading inventories...</div>
            ) : inventories.length === 0 ? (
              <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
                <div>No inventories found. Create one in the inventory app first.</div>
                <button onClick={() => navigate('/inventories')} style={{ marginTop:16, background:'#0f172a', color:'#fff', border:'none', padding:'10px 20px', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                  Go to Inventory App
                </button>
              </div>
            ) : (
              inventories.map(inv => (
                <div
                  key={inv.id}
                  style={{ background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'16px 20px', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between', transition:'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#d4af37')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                >
                  <div style={{ flex:1, cursor:'pointer', minWidth:0 }} onClick={() => startSession(inv)}>
                    <div style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>{inv.address || '(No address)'}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>
                      {inv.propertyType} · {inv.rooms.length} rooms · Created {formatDate(inv.dateCreated)}
                      {inv.propertyId && <span style={{ marginLeft:8, background:'#f1f5f9', padding:'1px 6px', borderRadius:4, fontSize:11 }}>{inv.propertyId}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:12 }}>
                    {/* Status badge */}
                    {(inv as any).signatureStatus === 'signed' || (inv as any).status === 'completed' ? (
                      <span style={{ fontSize:11, background:'#dcfce7', color:'#166534', padding:'3px 10px', borderRadius:20, fontWeight:600 }}>
                        ✓ Completed
                      </span>
                    ) : inv.status === 'LOCKED' ? (
                      <span style={{ fontSize:11, background:'#fef9c3', color:'#854d0e', padding:'3px 10px', borderRadius:20, fontWeight:600 }}>
                        Locked — ready
                      </span>
                    ) : (
                      <span style={{ fontSize:11, background:'#f1f5f9', color:'#64748b', padding:'3px 10px', borderRadius:20, fontWeight:600 }}>
                        Draft
                      </span>
                    )}
                    <span style={{ color:'#cbd5e1', fontSize:16, cursor:'pointer' }} onClick={() => startSession(inv)}>›</span>
                    {/* Delete button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(\`Delete "\${inv.address || 'Untitled Property'}"? This cannot be undone.\`)) {
                          setInventories(prev => prev.filter(i => i.id !== inv.id));
                          // Remove from localStorage
                          try {
                            const raw = localStorage.getItem('bergason_inventories_v5');
                            if (raw) {
                              const all = JSON.parse(raw).filter((i: Inventory) => i.id !== inv.id);
                              localStorage.setItem('bergason_inventories_v5', JSON.stringify(all));
                            }
                          } catch { /* ignore */ }
                          // Remove from Firestore
                          import('../services/inventory').then(m => m.deleteDraftFromFirestore(inv.id)).catch(() => {});
                        }
                      }}
                      title="Delete inventory"
                      style={{ width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:'#cbd5e1', transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color='#ef4444'; e.currentTarget.style.background='#fef2f2'; }}
                      onMouseLeave={e => { e.currentTarget.style.color='#cbd5e1'; e.currentTarget.style.background='transparent'; }}
                    >
                      <i className="fas fa-trash-alt" style={{ fontSize:12 }}></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── SIGNING SESSION ── */}
        {loggedIn && selected && (
          <div>
            {/* Session banner */}
            <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:10, padding:'12px 20px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <span style={{ fontSize:11, fontWeight:700, color:'#854d0e', background:'#fde68a', padding:'2px 10px', borderRadius:20, marginRight:12 }}>OFFICE SIGNING SESSION</span>
                <span style={{ fontSize:13, color:'#92400e', fontWeight:600 }}>{selected.address}</span>
              </div>
              <div style={{ fontSize:12, color:'#92400e' }}>Today: {new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
            </div>

            <Steps current={step} />

            {/* ── STEP 1: Tenant details + review ── */}
            {step === 1 && (
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:24 }}>
                <h2 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Step 1 — Tenant details & inventory review</h2>
                <p style={{ color:'#64748b', fontSize:13, margin:'0 0 20px' }}>Enter the tenant's details, then go through the inventory with them.</p>

                {/* Tenant details */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:24, padding:16, background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase' }}>Tenant Full Name</label>
                    <input value={tenantName} onChange={e => setTenantName(e.target.value)} placeholder="e.g. Wayne Davis"
                      style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase' }}>Tenant Email</label>
                    <input value={tenantEmail} onChange={e => setTenantEmail(e.target.value)} placeholder="tenant@email.com" type="email"
                      style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase' }}>Move-in Date</label>
                    <input value={moveInDate} onChange={e => setMoveInDate(e.target.value)} type="date"
                      style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13 }} />
                  </div>
                </div>

                {/* Room-by-room read-only view */}
                {getActiveRooms(selected).map(room => {
                  const visibleItems = room.items.filter(i => !i.excluded);
                  if (!visibleItems.length) return null;
                  return (
                    <div key={room.id} style={{ marginBottom:12, border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                      <div style={{ background:'#0f172a', color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>
                        {room.name}
                      </div>
                      {visibleItems.map(item => {
                        const photos = item.photos.map(p => { try { return JSON.parse(p) as Photo; } catch { return null; } }).filter(Boolean) as Photo[];
                        return (
                          <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 60px', gap:8, padding:'6px 14px', borderBottom:'1px solid #f1f5f9', fontSize:12, alignItems:'center' }}>
                            <span style={{ fontWeight:600, color:'#1e293b' }}>{item.name}</span>
                            <Badge label={item.condition} map={CONDITION_BADGE} />
                            <Badge label={item.cleanliness} map={CLEAN_BADGE} />
                            <span style={{ color:'#94a3b8', fontSize:11 }}>{photos.length > 0 ? `📷 ${photos.length}` : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                <div style={{ marginTop:20, display:'flex', justifyContent:'flex-end' }}>
                  <button
                    onClick={() => {
                      if (!tenantName.trim() || !tenantEmail.trim()) return alert('Please enter tenant name and email first.');
                      setStep(2);
                    }}
                    style={{ background:'#0f172a', color:'#fff', border:'none', padding:'11px 24px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}
                  >
                    Tenant has reviewed — Next: Documents ›
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Documents ── */}
            {step === 2 && (
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:24 }}>
                <h2 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Step 2 — Confirm documents</h2>
                <p style={{ color:'#64748b', fontSize:13, margin:'0 0 20px' }}>Tick each document as you hand it to <strong>{tenantName}</strong>. These form part of the signed record.</p>

                {selected.documents.map(doc => (
                  <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:8, background: docChecks[doc.id] ? '#f0fdf4' : '#fff', transition:'background 0.2s' }}>
                    <input
                      type="checkbox"
                      id={doc.id}
                      checked={!!docChecks[doc.id]}
                      onChange={e => setDocChecks(prev => ({ ...prev, [doc.id]: e.target.checked }))}
                      style={{ width:18, height:18, accentColor:'#16a34a', cursor:'pointer', flexShrink:0 }}
                    />
                    <label htmlFor={doc.id} style={{ fontSize:14, cursor:'pointer', color:'#1e293b', flex:1 }}>{doc.name}</label>
                    {doc.fileData ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => window.open(doc.fileData!, '_blank')} style={{ fontSize:11, background:'#eff6ff', color:'#2563eb', border:'none', padding:'3px 10px', borderRadius:4, cursor:'pointer' }}>View</button>
                        <span style={{ fontSize:11, background:'#dcfce7', color:'#166534', padding:'3px 10px', borderRadius:4, fontWeight:600 }}>✓ Attached</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:11, background:'#f1f5f9', color:'#94a3b8', padding:'3px 10px', borderRadius:4 }}>Not uploaded</span>
                    )}
                  </div>
                ))}

                <div style={{ marginTop:20, display:'flex', justifyContent:'space-between' }}>
                  <button onClick={() => setStep(1)} style={{ background:'transparent', color:'#0f172a', border:'1.5px solid #e2e8f0', padding:'10px 20px', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                    ‹ Back
                  </button>
                  <button onClick={() => setStep(3)} style={{ background:'#0f172a', color:'#fff', border:'none', padding:'11px 24px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    Documents confirmed — Next: Signature ›
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Signature ── */}
            {step === 3 && (
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:24 }}>
                <h2 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Step 3 — Tenant signature</h2>
                <p style={{ color:'#64748b', fontSize:13, margin:'0 0 20px' }}>
                  Hand the device to <strong>{tenantName}</strong>. Ask them to sign below to confirm they have received and reviewed the inventory.
                </p>

                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:16, marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:8 }}>Declaration</div>
                  <p style={{ fontSize:13, color:'#475569', lineHeight:1.7, margin:0 }}>
                    I confirm that I have received and reviewed the Inventory &amp; Schedule of Condition for <strong>{selected.address}</strong>.
                    I acknowledge that this document forms part of my tenancy agreement and agree that it represents an accurate record
                    of the property at the date of inspection, subject to any disputes I may raise during the 5-day review period
                    following my move-in.
                  </p>
                </div>

                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>
                    {tenantName} — {new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
                  </div>
                  {sendingPdf ? (
                    <div style={{ textAlign:'center', padding:'40px 0', color:'#64748b' }}>
                      <div style={{ fontSize:24, marginBottom:8 }}>⏳</div>
                      <div style={{ fontSize:14, fontWeight:600 }}>{status}</div>
                    </div>
                  ) : (
                    <SignaturePad onSave={handleSign} />
                  )}
                </div>

                {!sendingPdf && (
                  <div style={{ marginTop:16 }}>
                    <button onClick={() => setStep(2)} style={{ background:'transparent', color:'#0f172a', border:'1.5px solid #e2e8f0', padding:'10px 20px', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                      ‹ Back
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4: Send ── */}
            {step === 4 && (
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:24 }}>
                <div style={{ textAlign:'center', paddingBottom:24, borderBottom:'1px solid #f1f5f9', marginBottom:24 }}>
                  <div style={{ width:56, height:56, background:'#dcfce7', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:24, color:'#16a34a' }}>✓</div>
                  <h2 style={{ fontSize:20, fontWeight:700, color:'#0f172a', margin:'0 0 6px' }}>Inventory signed in office</h2>
                  <p style={{ color:'#64748b', fontSize:14, margin:0 }}>Signed PDF saved to Bergason system. Choose what to send to {tenantName} now.</p>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  {/* Send signed copy */}
                  <div style={{ border:'1.5px solid #e2e8f0', borderRadius:10, padding:20 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:6 }}>Send signed copy to tenant</div>
                    <div style={{ fontSize:12, color:'#64748b', marginBottom:16, lineHeight:1.5 }}>
                      Email the signed PDF to <strong>{tenantEmail}</strong> for their records.
                    </div>
                    {pdfSentRef ? (
                      <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#166534', fontWeight:600 }}>
                        ✓ Sent · Ref: {pdfSentRef}
                      </div>
                    ) : (
                      <button
                        onClick={sendSignedCopy}
                        disabled={sendingPdf}
                        style={{ width:'100%', background: sendingPdf ? '#e2e8f0' : '#0f172a', color: sendingPdf ? '#94a3b8' : '#fff', border:'none', padding:'11px', borderRadius:8, fontSize:13, fontWeight:700, cursor: sendingPdf ? 'not-allowed' : 'pointer' }}
                      >
                        {sendingPdf ? 'Sending...' : 'Send signed PDF'}
                      </button>
                    )}
                  </div>

                  {/* Send review link */}
                  <div style={{ border:'1.5px solid #e2e8f0', borderRadius:10, padding:20 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:6 }}>Send 5-day review link</div>
                    <div style={{ fontSize:12, color:'#64748b', marginBottom:12, lineHeight:1.5 }}>
                      Start the review window. Move-in date: <strong>{new Date(moveInDate).toLocaleDateString('en-GB', { day:'numeric', month:'long' })}</strong>. Expires after 5 days.
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:4 }}>Move-in date</label>
                      <input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)}
                        style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12 }} />
                    </div>
                    {reviewSentRef ? (
                      <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#166534', fontWeight:600 }}>
                        ✓ Sent · Ref: {reviewSentRef}
                      </div>
                    ) : (
                      <button
                        onClick={sendReviewLink}
                        disabled={sendingReview}
                        style={{ width:'100%', background: sendingReview ? '#e2e8f0' : '#d4af37', color: sendingReview ? '#94a3b8' : '#0f172a', border:'none', padding:'11px', borderRadius:8, fontSize:13, fontWeight:700, cursor: sendingReview ? 'not-allowed' : 'pointer' }}
                      >
                        {sendingReview ? 'Sending...' : 'Send review link'}
                      </button>
                    )}
                  </div>
                </div>

                {pdfUrl && (
                  <div style={{ marginTop:16, padding:'12px 16px', background:'#f8fafc', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, color:'#64748b' }}>Signed PDF saved to system</span>
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'#2563eb', textDecoration:'underline' }}>View PDF</a>
                  </div>
                )}

                <div style={{ marginTop:16, textAlign:'center' }}>
                  <button onClick={() => { setSelected(null); setStep(1); }} style={{ background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', padding:'9px 20px', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                    ← Back to inventory list
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficePortal;
