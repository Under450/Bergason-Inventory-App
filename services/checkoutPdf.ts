import jsPDF from 'jspdf';
import { FirestoreInventory } from './inventory';

const NAVY: [number, number, number] = [15, 23, 42];
const GOLD: [number, number, number] = [212, 175, 55];
const SLATE: [number, number, number] = [100, 116, 139];
const WHITE: [number, number, number] = [255, 255, 255];

const fmt = (ts: number | undefined) =>
  ts ? new Date(ts).toLocaleDateString('en-GB') : '—';

const chargeLabel = (ct: string | undefined): string => {
  const map: Record<string, string> = {
    beyond_fwt: 'Beyond Fair Wear & Tear',
    repair: 'Repair',
    replace: 'Replace',
    missing: 'Missing',
    left_behind: 'Items Left Behind',
  };
  return ct ? (map[ct] ?? ct) : '—';
};

export const generateAdjudicatorPdf = async (firestoreDoc: FirestoreInventory): Promise<Blob> => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;
  const CW = W - M * 2;
  let y = M;

  const newPage = () => { pdf.addPage(); y = M; };
  const checkY = (needed: number) => { if (y + needed > 280) newPage(); };

  const setHeading = (text: string, size = 11) => {
    checkY(10);
    pdf.setFontSize(size);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...NAVY);
    pdf.text(text, M, y);
    y += size * 0.45 + 2;
  };

  const setBody = (text: string, size = 9) => {
    checkY(7);
    pdf.setFontSize(size);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 41, 59);
    const lines = pdf.splitTextToSize(text, CW) as string[];
    pdf.text(lines, M, y);
    y += lines.length * (size * 0.38 + 1);
  };

  const rule = (color: [number, number, number] = SLATE) => {
    checkY(3);
    pdf.setDrawColor(...color);
    pdf.line(M, y, W - M, y);
    y += 3;
  };

  const fieldRow = (label: string, value: string) => {
    checkY(7);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...SLATE);
    pdf.text(label, M, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 41, 59);
    pdf.text(value, M + 50, y);
    y += 7;
  };

  const inv = firestoreDoc.inventory;
  const checkout = firestoreDoc.checkOutData;

  // ---- PAGE 1: COVER ----
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 50, 'F');
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...WHITE);
  pdf.text('ADJUDICATOR REPORT', M, 22);
  pdf.setFontSize(10);
  pdf.setTextColor(...GOLD);
  pdf.text('Bergason Property Services', M, 32);
  y = 60;

  fieldRow('Property', inv.address);
  fieldRow('Tenant', firestoreDoc.tenantName);
  fieldRow('Inspector', checkout?.inspectorName ?? inv.inspectorName);
  y += 2; rule();
  fieldRow('Tenancy Start', fmt(firestoreDoc.tenancyStartDate));
  fieldRow('Tenancy End', fmt(firestoreDoc.tenancyEndDate));
  fieldRow('Check-In Date', fmt(firestoreDoc.checkInDate ?? inv.dateCreated));
  fieldRow('Check-Out Date', fmt(checkout?.checkOutDate));

  // ---- PAGE 2: FRONT SUMMARY ----
  newPage();
  setHeading('SECTION A — ITEMS IN DISPUTE', 13);
  rule(GOLD);
  y += 2;

  // Disputes table
  const dCols = [M, M + 25, M + 55, M + 100, M + 140, M + 162];
  const dHdrs = ['Room', 'Item', "Tenant's Claim", "Agent's Position", 'Status', 'Charged'];
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...NAVY);
  dHdrs.forEach((h, i) => pdf.text(h, dCols[i], y));
  y += 5; rule();

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 41, 59);
  inv.rooms.forEach(room => {
    room.items.forEach(item => {
      const review = firestoreDoc.tenantReview?.[item.id];
      if (!review || review.agreed) return;
      const response = firestoreDoc.agentDisputeResponse?.[item.id];
      const coItem = checkout?.items[item.id];
      checkY(5);
      pdf.setFontSize(7.5);
      pdf.text(room.name.substring(0, 12), dCols[0], y);
      pdf.text(item.name.substring(0, 14), dCols[1], y);
      pdf.text((review.comment ?? '').substring(0, 20), dCols[2], y);
      pdf.text((response?.notes ?? (response?.accepted ? 'Accepted' : 'Rejected')).substring(0, 18), dCols[3], y);
      pdf.text(response?.accepted ? 'ACCEPTED' : 'IN DISPUTE', dCols[4], y);
      pdf.text(coItem?.changed ? `£${(coItem.estimatedCost ?? 0).toFixed(2)}` : 'No', dCols[5], y);
      y += 5;
    });
  });

  y += 5;
  setHeading('SECTION B — CHECK-OUT FINDINGS', 13);
  rule(GOLD);
  y += 2;

  const fCols = [M, M + 25, M + 55, M + 90, M + 120, M + 148, M + 168];
  const fHdrs = ['Room', 'Item', 'Notes', 'Type', 'Responsibility', 'Cost', ''];
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...NAVY);
  fHdrs.forEach((h, i) => pdf.text(h, fCols[i], y));
  y += 5; rule();

  let tenantTotal = 0;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 41, 59);

  if (checkout) {
    inv.rooms.forEach(room => {
      room.items.forEach(item => {
        const result = checkout.items[item.id];
        if (!result?.changed) return;
        checkY(5);
        pdf.setFontSize(7.5);
        pdf.text(room.name.substring(0, 12), fCols[0], y);
        pdf.text(item.name.substring(0, 14), fCols[1], y);
        pdf.text((result.notes ?? '—').substring(0, 16), fCols[2], y);
        pdf.text(chargeLabel(result.chargeType).substring(0, 16), fCols[3], y);
        pdf.text(result.responsibility ?? 'tenant', fCols[4], y);
        const cost = result.estimatedCost ?? 0;
        pdf.text(`£${cost.toFixed(2)}`, fCols[5], y);
        if (result.responsibility === 'tenant') tenantTotal += cost;
        y += 5;
      });
    });
  }

  y += 3; rule();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(`Total Tenant Liability: £${tenantTotal.toFixed(2)}`, W - M - 65, y);
  y += 8;

  // ---- PAGES 3+: ROOM BY ROOM ----
  const activeRoomIds = inv.activeRoomIds ?? inv.rooms.map(r => r.id);

  inv.rooms.forEach(room => {
    if (!activeRoomIds.includes(room.id)) return;

    newPage();

    // Room header bar
    pdf.setFillColor(...NAVY);
    pdf.rect(0, y - 4, W, 10, 'F');
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...WHITE);
    pdf.text(room.name.toUpperCase(), M, y + 3);
    y += 10;

    if (room.odourNotes) setBody(`Odour at check-in: ${room.odourNotes}`);
    if (room.decorationColour || room.lastDecorated) {
      setBody(`Decoration: ${[room.decorationColour, room.lastDecorated ? `last decorated ${room.lastDecorated}` : ''].filter(Boolean).join(', ')}`);
    }
    y += 2;

    // Items with disputes or checkout changes — stacked audit log
    room.items.forEach(item => {
      if (item.excluded) return;
      const review = firestoreDoc.tenantReview?.[item.id];
      const response = firestoreDoc.agentDisputeResponse?.[item.id];
      const result = checkout?.items[item.id];
      const hasContent = (review && !review.agreed) || result?.changed;
      if (!hasContent) return;

      checkY(8);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...NAVY);
      pdf.text(item.name, M, y);
      y += 5;

      rule(SLATE);
      setBody(
        `Check-In: ${item.condition} · ${item.cleanliness} · ${item.description || '—'}` +
        (item.qualityTier ? ` · Tier: ${item.qualityTier}` : '') +
        (item.installedDate ? ` · Installed: ${item.installedDate}` : '') +
        (item.purchasePrice ? ` · £${item.purchasePrice}` : '')
      );

      if (review && !review.agreed) {
        setBody(`Tenant Disputed: ${review.comment ?? '(no comment)'}`);
        if (response) {
          setBody(`Agent Response (${fmt(response.respondedAt)}): ${response.accepted ? 'ACCEPTED' : 'REJECTED'}${response.notes ? ` — ${response.notes}` : ''}`);
        }
      }

      if (result?.changed) {
        const photoCount = result.photos?.length ?? 0;
        setBody(
          `Check-Out (${fmt(checkout?.checkOutDate)}): ${chargeLabel(result.chargeType)} · ${result.responsibility ?? '—'} · £${(result.estimatedCost ?? 0).toFixed(2)}${result.notes ? ` · ${result.notes}` : ''}${photoCount > 0 ? ` · ${photoCount} photo(s) on file` : ''}`
        );
      }
      y += 3;
    });

    // Condensed summary for unchanged items
    const unchanged = room.items.filter(item => {
      if (item.excluded) return false;
      const review = firestoreDoc.tenantReview?.[item.id];
      const result = checkout?.items[item.id];
      return !(review && !review.agreed) && !result?.changed;
    });

    if (unchanged.length > 0) {
      checkY(8);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...SLATE);
      pdf.text('No change:', M, y);
      y += 4;
      pdf.setFont('helvetica', 'normal');
      unchanged.forEach(item => {
        checkY(4);
        pdf.setFontSize(7.5);
        pdf.setTextColor(30, 41, 59);
        pdf.text(`${item.name} — ${item.condition} / ${item.cleanliness}`, M + 3, y);
        y += 4;
      });
    }
  });

  // ---- FINAL PAGES ----
  newPage();

  if (checkout?.meterReadings) {
    setHeading('METER READINGS', 12); rule(GOLD);
    if (checkout.meterReadings.gas) fieldRow('Gas', checkout.meterReadings.gas.reading);
    if (checkout.meterReadings.electric) fieldRow('Electric', checkout.meterReadings.electric.reading);
    if (checkout.meterReadings.water) fieldRow('Water', checkout.meterReadings.water.reading);
    y += 4;
  }

  if (checkout?.keysReturned) {
    setHeading('KEYS RETURNED', 12); rule(GOLD);
    fieldRow('Count', String(checkout.keysReturned.count));
    if (checkout.keysReturned.notes) fieldRow('Notes', checkout.keysReturned.notes);
    y += 4;
  }

  setHeading('DECLARATION', 12); rule(GOLD);
  fieldRow('Inspector', checkout?.inspectorName ?? '—');
  fieldRow('Tenant Present', checkout?.tenantPresent ? 'Yes' : 'No');
  if (!checkout?.tenantPresent) {
    fieldRow('Reason', checkout?.tenantRefusedToSign ? 'Tenant refused to sign' : 'Tenant not present');
  }
  fieldRow('Cleaning Standard', checkout?.cleaningStandard ?? '—');

  return pdf.output('blob');
};
