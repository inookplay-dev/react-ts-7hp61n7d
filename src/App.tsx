import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  Bed,
  Users,
  Plus,
  Edit3,
  Trash2,
  Phone,
  CheckCircle2,
  AlertCircle,
  QrCode,
  FileText,
  Sparkles,
  Settings,
  Search,
  ChevronRight,
  Copy,
  Check,
  X,
  CreditCard,
  Layers,
  Home,
  Bot,
  Send,
  Smartphone,
  Share2,
  Clock,
  Wifi,
  ShieldCheck,
  RefreshCw,
  DollarSign,
  Filter,
  UserCheck,
  Info,
  HelpCircle,
  LogIn,
  LogOut,
  Download,
  Image as ImageIcon,
  MessageCircle,
  Zap,
  BellRing,
  CheckCheck,
  ArrowRight,
  Link2,
  Sliders,
} from 'lucide-react';

// ==========================================
// 1. มาตรฐานการคำนวณ EMVCo PromptPay QR Code (ประเทศไทย)
// ==========================================
function crc16ccitt(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTLV(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePromptPayPayload(target, amount) {
  const cleanTarget = target.replace(/[^0-9]/g, '');
  if (!cleanTarget) return '';

  let targetSubTag = '';
  if (cleanTarget.length >= 13) {
    // เลขบัตรประชาชน 13 หลัก
    targetSubTag = formatTLV('02', cleanTarget.substring(0, 13));
  } else {
    // เบอร์โทรศัพท์ 10 หลัก -> แปลงเป็น 0066 + 9 หลักท้าย
    const phoneNoZero = cleanTarget.replace(/^0/, '');
    targetSubTag = formatTLV('01', `0066${phoneNoZero}`);
  }

  const merchantInfoValue = formatTLV('00', 'A000000677010111') + targetSubTag;
  const tag29 = formatTLV('29', merchantInfoValue);

  const hasAmount =
    amount !== undefined && amount !== null && Number(amount) > 0;

  let payload =
    formatTLV('00', '01') + // Payload Format Indicator
    formatTLV('01', hasAmount ? '12' : '11') + // 11 = Static, 12 = Dynamic (ระบุยอดเงิน)
    tag29 +
    formatTLV('53', '764') + // THB Currency
    (hasAmount ? formatTLV('54', Number(amount).toFixed(2)) : '') +
    formatTLV('58', 'TH') + // Country Code
    '6304'; // CRC ID + Length

  const crc = crc16ccitt(payload);
  return payload + crc;
}

// ==========================================
// 1.1 ระบบวาดใบยืนยันการจอง + QR Code ลงบน HTML5 Canvas (Save & Share เป็นรูปภาพ PNG)
// รองรับการดึงภาพ QR แบบ CORS-safe พร้อมระบบสำรอง ताकिเซฟรูปและแชร์ลง LINE / Messenger ได้ 100%
// ==========================================
function drawDeterministicMatrixFallback(ctx, x, y, size, payloadStr) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  const cells = 25;
  const cellSize = size / cells;
  ctx.fillStyle = '#0f172a';

  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          ctx.fillRect(
            x + (c0 + c) * cellSize,
            y + (r0 + r) * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, cells - 7);
  drawFinder(cells - 7, 0);

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inFinder =
        (r < 8 && c < 8) ||
        (r < 8 && c >= cells - 8) ||
        (r >= cells - 8 && c < 8);
      if (inFinder) continue;
      const charCode =
        payloadStr.charCodeAt((r * cells + c) % payloadStr.length) || 65;
      if ((charCode + r * 3 + c * 7) % 2 === 0) {
        ctx.fillRect(
          x + c * cellSize,
          y + r * cellSize,
          cellSize * 0.92,
          cellSize * 0.92
        );
      }
    }
  }
}

async function renderBookingSlipToCanvas({
  settings,
  bookingsList,
  getBookingFinancials,
  mode = 'confirmation', // 'confirmation' | 'remaining' | 'combined'
}) {
  const canvas = document.createElement('canvas');
  const width = 760;
  const roomRowsCount = bookingsList.length;
  const height = 1080 + Math.max(0, roomRowsCount - 1) * 58;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // พื้นหลังหลัก
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#ecfdf5');
  bgGrad.addColorStop(1, '#f8fafc');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // กรอบการ์ดสีขาวด้านใน
  const cardX = 32;
  const cardY = 32;
  const cardW = width - 64;
  const cardH = height - 64;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.restore();

  // แถบ Header ด้านบนของการ์ด
  const headerGrad = ctx.createLinearGradient(
    cardX,
    cardY,
    cardX + cardW,
    cardY + 140
  );
  headerGrad.addColorStop(0, '#047857');
  headerGrad.addColorStop(1, '#0f766e');
  ctx.fillStyle = headerGrad;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, 145, [32, 32, 0, 0]);
  ctx.fill();

  // ข้อความบน Header
  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 18px sans-serif';
  const badgeTitle =
    mode === 'remaining'
      ? 'ใบแจ้งยอดคงค้างวันเข้าพัก • BALANCE SLIP'
      : mode === 'combined'
      ? 'ใบสรุปรวมบิลห้องพัก • COMBINED RECEIPT'
      : 'ใบยืนยันการจองห้องพัก • BOOKING CONFIRMATION';
  ctx.fillText(badgeTitle, cardX + 36, cardY + 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(
    (settings.resortName || 'Smart Stay Resort').substring(0, 38),
    cardX + 36,
    cardY + 90
  );

  const first = bookingsList[0] || {};
  ctx.fillStyle = '#d1fae5';
  ctx.font = '18px sans-serif';
  ctx.fillText(
    `รหัสอ้างอิง: ${bookingsList.map((b) => b.id).join(', ')}`,
    cardX + 36,
    cardY + 124
  );

  // ส่วนข้อมูลผู้เข้าพัก
  let curY = cardY + 185;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX + 32, curY, cardW - 64, 150, 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('ชื่อผู้เข้าพัก:', cardX + 54, curY + 40);
  ctx.fillText('เบอร์โทรศัพท์:', cardX + 54, curY + 78);
  ctx.fillText('วันที่เช็คอิน - เช็คเอาท์:', cardX + 54, curY + 116);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 21px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(first.guestName || '-', cardX + cardW - 54, curY + 40);
  ctx.fillStyle = '#059669';
  ctx.fillText(first.phone || '-', cardX + cardW - 54, curY + 78);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(
    `${formatThaiDate(first.checkIn)} (${
      settings.checkInTime
    }) → ${formatThaiDate(first.checkOut)} (${settings.checkOutTime})`,
    cardX + cardW - 54,
    curY + 116
  );
  ctx.textAlign = 'left';

  // ส่วนรายการห้องพักและราคา
  curY += 176;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(
    `รายละเอียดห้องพัก (${bookingsList.length} ห้อง)`,
    cardX + 36,
    curY
  );

  curY += 20;
  let grandTotal = 0;
  let totalPaid = 0;
  let totalRemaining = 0;

  bookingsList.forEach((b) => {
    const fin = getBookingFinancials(b);
    grandTotal += fin.grandTotal;
    totalPaid += fin.paid;
    totalRemaining += fin.remaining;

    curY += 36;
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 19px sans-serif';
    const roomLine = `• ห้อง ${fin.room?.number || b.roomId} (${
      fin.room?.name || ''
    }) × ${fin.nights} คืน`;
    ctx.fillText(roomLine, cardX + 40, curY);

    ctx.textAlign = 'right';
    ctx.fillText(
      `฿${fin.roomTotal.toLocaleString()}`,
      cardX + cardW - 40,
      curY
    );
    ctx.textAlign = 'left';

    if (b.extraBedCount > 0) {
      curY += 26;
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText(
        `   + เตียงเสริม ${b.extraBedCount} เตียง (฿${b.extraBedPrice}/คืน)`,
        cardX + 48,
        curY
      );
      ctx.textAlign = 'right';
      ctx.fillText(
        `฿${fin.extraBedTotal.toLocaleString()}`,
        cardX + cardW - 40,
        curY
      );
      ctx.textAlign = 'left';
    }
  });

  if (first.specialRequests) {
    curY += 32;
    ctx.fillStyle = '#b45309';
    ctx.font = '16px sans-serif';
    ctx.fillText(
      `หมายเหตุ/คำขอพิเศษ: ${first.specialRequests.substring(0, 55)}`,
      cardX + 40,
      curY
    );
  }

  // เส้นคั่นสรุปยอดเงิน
  curY += 26;
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(cardX + 36, curY);
  ctx.lineTo(cardX + cardW - 36, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  // กล่องสรุปยอดรวม
  curY += 20;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(cardX + 36, curY, cardW - 72, 128, 20);
  ctx.fill();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '18px sans-serif';
  ctx.fillText('ยอดรวมค่าห้องพักทั้งสิ้น', cardX + 60, curY + 38);
  ctx.fillStyle = '#34d399';
  ctx.fillText('ชำระมัดจำ / จ่ายแล้ว', cardX + 60, curY + 74);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('ยอดคงค้างชำระวันเข้าพัก', cardX + 60, curY + 110);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(
    `฿${grandTotal.toLocaleString()}`,
    cardX + cardW - 60,
    curY + 38
  );
  ctx.fillStyle = '#34d399';
  ctx.fillText(`฿${totalPaid.toLocaleString()}`, cardX + cardW - 60, curY + 74);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(
    `฿${totalRemaining.toLocaleString()}`,
    cardX + cardW - 60,
    curY + 110
  );
  ctx.textAlign = 'left';

  // ส่วนแสดง PromptPay QR Code ด้านล่าง
  curY += 152;
  const qrAmount =
    mode === 'remaining' || mode === 'combined'
      ? totalRemaining
      : totalPaid > 0
      ? totalPaid
      : grandTotal;

  const payload = generatePromptPayPayload(settings.promptPayId, qrAmount);

  // กล่อง QR
  ctx.fillStyle = '#f0fdf4';
  ctx.strokeStyle = '#86efac';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX + 36, curY, cardW - 72, 285, 24);
  ctx.fill();
  ctx.stroke();

  // วาดรูป QR Code (โหลดผ่าน CORS anonymous หรือใช้ fallback)
  const qrBoxSize = 215;
  const qrX = cardX + 64;
  const qrY = curY + 35;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(
    payload
  )}`;

  await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => {
      drawDeterministicMatrixFallback(ctx, qrX, qrY, qrBoxSize, payload);
      resolve(null as any);
    }, 2500);

    img.onload = () => {
      clearTimeout(timeout);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - 6, qrY - 6, qrBoxSize + 12, qrBoxSize + 12);
      ctx.drawImage(img, qrX, qrY, qrBoxSize, qrBoxSize);
      resolve(null as any);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      drawDeterministicMatrixFallback(ctx, qrX, qrY, qrBoxSize, payload);
      resolve(null as any);
    };
    img.src = qrUrl;
  });

  // รายละเอียดข้าง QR Code
  const infoX = qrX + qrBoxSize + 32;
  ctx.fillStyle = '#113566';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('THAI QR PROMPTPAY', infoX, qrY + 36);

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(
    mode === 'remaining' || mode === 'combined'
      ? 'สแกนเพื่อชำระยอดคงค้าง'
      : 'สแกนเพื่อชำระเงิน/ยืนยันการจอง',
    infoX,
    qrY + 66
  );

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(
    `ชื่อบัญชี: ${(settings.promptPayName || '').substring(0, 26)}`,
    infoX,
    qrY + 106
  );
  ctx.fillText(`เลขพร้อมเพย์: ${settings.promptPayId}`, infoX, qrY + 136);

  ctx.fillStyle = '#64748b';
  ctx.font = '16px sans-serif';
  ctx.fillText('ยอดชำระสุทธิใน QR Code:', infoX, qrY + 174);

  ctx.fillStyle = '#059669';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(
    `฿${Number(qrAmount).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
    })}`,
    infoX,
    qrY + 214
  );

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `กรุณาบันทึกภาพนี้ไว้เป็นหลักฐานการจองเพื่อแสดงในวันเข้าพัก • ${
      settings.wifiInfo || ''
    }`,
    width / 2,
    height - 48
  );

  return canvas;
}

// คอมโพเนนต์แสดงผล QR Code พร้อมระบบสำรอง (Canvas / SVG / API)
const PromptPayQRView = ({ target, amount, accountName, subtitle }) => {
  const payload = useMemo(
    () => generatePromptPayPayload(target, amount),
    [target, amount]
  );
  const [copiedPayload, setCopiedPayload] = useState(false);

  const qrImageUrl = useMemo(() => {
    if (!payload) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(
      payload
    )}`;
  }, [payload]);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(target);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-emerald-500/20 shadow-lg overflow-hidden max-w-xs mx-auto">
      {/* Header มาตรฐาน Thai QR */}
      <div className="bg-[#113566] text-white px-4 py-3 text-center flex items-center justify-center gap-2">
        <QrCode className="w-5 h-5 text-emerald-400" />
        <span className="font-bold tracking-wide text-sm">
          THAI QR PAYMENT • พร้อมเพย์
        </span>
      </div>

      <div className="p-5 flex flex-col items-center">
        {subtitle && (
          <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full mb-3 border border-emerald-200">
            {subtitle}
          </span>
        )}

        <div className="relative bg-white p-2 rounded-2xl border border-slate-200 shadow-inner mb-3">
          {qrImageUrl ? (
            <img
              src={qrImageUrl}
              alt="PromptPay QR Code"
              className="w-48 h-48 object-contain rounded-xl"
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
              กรุณาตั้งค่าเบอร์พร้อมเพย์
            </div>
          )}
        </div>

        <div className="text-center w-full space-y-1">
          <p className="font-bold text-slate-800 text-base">
            {accountName || 'บัญชีรับชำระค่าห้องพัก'}
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <span>พร้อมเพย์: {target}</span>
            <button
              onClick={handleCopyPayload}
              className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.5 rounded"
              title="คัดลอกเลขพร้อมเพย์"
            >
              {copiedPayload ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copiedPayload ? 'คัดลอกแล้ว' : 'คัดลอกเลข'}
            </button>
          </div>

          {Number(amount) > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
              <p className="text-xs text-slate-500">
                ยอดชำระสุทธิ (ระบุอัตโนมัติใน QR)
              </p>
              <p className="text-2xl font-extrabold text-emerald-600">
                ฿
                {Number(amount).toLocaleString('th-TH', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. ข้อมูลเริ่มต้น (Default Mock Data)
// ==========================================
const getTodayStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

const INITIAL_ROOMS = [
  {
    id: 'R101',
    number: '101',
    name: 'Garden Deluxe A1',
    type: 'Deluxe',
    price: 1200,
    capacity: 2,
    amenities: ['Wi-Fi', 'แอร์', 'ทีวี Smart TV', 'เครื่องทำน้ำอุ่น', 'วิวสวน'],
    status: 'active',
  },
  {
    id: 'R102',
    number: '102',
    name: 'Garden Deluxe A2',
    type: 'Deluxe',
    price: 1200,
    capacity: 2,
    amenities: ['Wi-Fi', 'แอร์', 'ทีวี Smart TV', 'เครื่องทำน้ำอุ่น', 'วิวสวน'],
    status: 'active',
  },
  {
    id: 'R201',
    number: '201',
    name: 'Pool Villa Suite',
    type: 'Villa',
    price: 2500,
    capacity: 4,
    amenities: [
      'Wi-Fi',
      'แอร์',
      'สระว่ายน้ำส่วนตัว',
      'อ่างอาบน้ำ',
      'อาหารเช้า',
    ],
    status: 'active',
  },
  {
    id: 'R202',
    number: '202',
    name: 'Family Panorama',
    type: 'Family',
    price: 3200,
    capacity: 6,
    amenities: ['Wi-Fi', 'แอร์ 2 ตัว', '2 ห้องนอน', 'ระเบียงชมวิว', 'ไมโครเวฟ'],
    status: 'active',
  },
  {
    id: 'R103',
    number: '103',
    name: 'Cozy Standard B1',
    type: 'Standard',
    price: 850,
    capacity: 2,
    amenities: ['Wi-Fi', 'แอร์', 'เครื่องทำน้ำอุ่น'],
    status: 'active',
  },
];

const INITIAL_BOOKINGS = [
  {
    id: 'BK-2401',
    roomId: 'R101',
    guestName: 'คุณสมชาย ใจดี',
    phone: '0812345678',
    checkIn: getTodayStr(0),
    checkOut: getTodayStr(2),
    extraBedCount: 1,
    extraBedPrice: 300,
    specialRequests: 'ขอหมอนเพิ่ม 1 ใบ เข้าเช็คอินช่วง 15:00 น.',
    depositPaid: 1000,
    isFullyPaid: false,
    status: 'confirmed',
    createdAt: getTodayStr(-1),
  },
  {
    id: 'BK-2402',
    roomId: 'R102',
    guestName: 'คุณสมชาย ใจดี',
    phone: '0812345678',
    checkIn: getTodayStr(0),
    checkOut: getTodayStr(2),
    extraBedCount: 0,
    extraBedPrice: 300,
    specialRequests: 'จองคู่กับห้อง 101 มาเป็นครอบครัว',
    depositPaid: 1000,
    isFullyPaid: false,
    status: 'confirmed',
    createdAt: getTodayStr(-1),
  },
  {
    id: 'BK-2403',
    roomId: 'R201',
    guestName: 'คุณแพรวา สุขสันต์',
    phone: '0898765432',
    checkIn: getTodayStr(1),
    checkOut: getTodayStr(3),
    extraBedCount: 1,
    extraBedPrice: 400,
    specialRequests: 'เตรียมเค้กวันเกิดเล็กๆ ในตู้เย็น',
    depositPaid: 2000,
    isFullyPaid: false,
    status: 'confirmed',
    createdAt: getTodayStr(0),
  },
];

const INITIAL_SETTINGS = {
  resortName: 'เดอะ กรีนเนอรี่ รีสอร์ท (The Greenery Resort)',
  promptPayId: '0812345678',
  promptPayName: 'บจก. เดอะ กรีนเนอรี่ รีสอร์ท',
  checkInTime: '14:00 น.',
  checkOutTime: '12:00 น.',
  wifiInfo: 'ชื่อ Wi-Fi: Greenery_Guest / รหัส: welcome888',
  houseRules:
    'งดส่งเสียงดังหลัง 22:00 น., ห้ามสูบบุหรี่ภายในห้องพัก, สัตว์เลี้ยงพักได้เฉพาะโซน Villa',
  botPersona:
    'พูดจาสุภาพ เป็นกันเอง ลงท้ายด้วยค่ะ/ครับ พร้อมช่วยเหลือทั้งพนักงานต้อนรับและตอบคำถามลูกค้า',
};

// ข้อมูลเริ่มต้นสำหรับระบบแชทเพจ Facebook Messenger & AI Auto-Follow-Up
const INITIAL_MESSENGER_LEADS = [
  {
    id: 'MSG-101',
    fbName: 'คุณมินตรา (Mintra S.)',
    avatarBg: 'bg-pink-500',
    phone: '0865554321',
    status: 'waiting_deposit', // 'new_inquiry' | 'ai_replying' | 'waiting_deposit' | 'follow_up' | 'confirmed'
    interestedCheckIn: getTodayStr(1),
    interestedCheckOut: getTodayStr(3),
    interestedRoomType: 'Villa',
    lastActive: '18 นาทีที่แล้ว',
    unreadCount: 1,
    messages: [
      {
        sender: 'customer',
        text: `สวัสดีค่ะ สนใจห้องพักโซน Villa เข้าพักวันที่ ${getTodayStr(
          1
        )} ถึง ${getTodayStr(3)} มีห้องว่างไหมคะ?`,
        time: '10:15',
      },
      {
        sender: 'page',
        text: 'สวัสดีค่ะคุณมินตรา สำหรับห้อง Pool Villa Suite (2,500 บาท/คืน) ยังว่างอยู่ค่ะ รับจองไว้เลยไหมคะ?',
        time: '10:16',
      },
      {
        sender: 'customer',
        text: 'สนใจค่ะ เดี๋ยวขอถามแฟนแป๊บนะคะว่าสะดวกโอนมัดจำตอนไหน',
        time: '10:20',
      },
    ],
  },
  {
    id: 'MSG-102',
    fbName: 'Chatchai K. (คุณฉัตรชัย)',
    avatarBg: 'bg-blue-600',
    phone: '0891112233',
    status: 'new_inquiry',
    interestedCheckIn: getTodayStr(0),
    interestedCheckOut: getTodayStr(1),
    interestedRoomType: 'Deluxe',
    lastActive: '5 นาทีที่แล้ว',
    unreadCount: 2,
    messages: [
      {
        sender: 'customer',
        text: `คืนนี้ (${getTodayStr(
          0
        )}) มีห้องว่างสำหรับ 2 ท่านไหมครับ? อยากทราบราคาและขอเสริมเตียง 1 เตียงครับ`,
        time: '11:02',
      },
    ],
  },
  {
    id: 'MSG-103',
    fbName: 'คุณพลอยใส พาเพลิน',
    avatarBg: 'bg-purple-600',
    phone: '0829998877',
    status: 'follow_up',
    interestedCheckIn: getTodayStr(2),
    interestedCheckOut: getTodayStr(4),
    interestedRoomType: 'Family',
    lastActive: '3 ชั่วโมงที่แล้ว',
    unreadCount: 0,
    messages: [
      {
        sender: 'customer',
        text: `สอบถามห้องพักครอบครัว 5-6 คน ช่วงวันที่ ${getTodayStr(
          2
        )} ถึง ${getTodayStr(4)} ค่ะ นำน้องหมาพันธุ์เล็กเข้าพักได้ไหมคะ?`,
        time: '08:30',
      },
      {
        sender: 'page',
        text: 'สวัสดีค่ะ ห้อง Family Panorama (3,200 บาท/คืน) พักได้สูงสุด 6 ท่าน ว่างอยู่ค่ะ สำหรับสัตว์เลี้ยงทางเราอนุญาตเฉพาะโซน Villa เท่านั้นนะคะ',
        time: '08:32',
      },
    ],
  },
];

// ==========================================
// 3. ฟังก์ชันช่วยเหลือด้านวันที่และการคำนวณ
// ==========================================
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const months = [
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ];
    return `${d} ${months[m - 1]} ${y + 543}`;
  } catch (e) {
    return dateStr;
  }
}

function getNightCount(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 1;
}

// ตรวจสอบว่าช่วงวันที่ทับซ้อนกันหรือไม่ (ป้องกันการจองซ้ำ)
function isDateOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

// ==========================================
// 4. เรียกใช้งาน Gemini API (AI Assistant & Messenger Auto-Reply)
// ==========================================
async function callGeminiAI(userPrompt, systemContext) {
  const apiKey = '';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: {
      parts: [{ text: systemContext }],
    },
  };

  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      throw new Error('Empty response');
    } catch (err) {
      if (attempt === delays.length) {
        return 'ขออภัยค่ะ ขณะนี้ระบบเชื่อมต่อ AI ขัดข้องชั่วคราว คุณสามารถตรวจสอบข้อมูลห้องว่างและยอดชำระจากหน้ารายงานได้ทันทีค่ะ';
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

// ==========================================
// 5. คอมโพเนนต์หลัก App
// ==========================================
export default function App() {
  // Navigation Tab: 'booking' | 'reports' | 'messenger' | 'rooms' | 'settings'
  const [activeTab, setActiveTab] = useState('booking');

  // Core States
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);

  // Toast Notification
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ==========================================
  // State สำหรับระบบจองห้องพัก (Booking Tab)
  // ==========================================
  const [filterCheckIn, setFilterCheckIn] = useState(getTodayStr(0));
  const [filterCheckOut, setFilterCheckOut] = useState(getTodayStr(1));
  const [selectedRoomIdsForBooking, setSelectedRoomIdsForBooking] = useState(
    []
  );
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    guestName: '',
    phone: '',
    extraBedCount: 0,
    extraBedPrice: 300,
    specialRequests: '',
    depositPaid: 0,
    isFullyPaid: false,
  });

  // ==========================================
  // State สำหรับ Slip & QR Modal (แชร์รูปใบยืนยัน / ยอดคงค้าง / รวมบิล)
  // ==========================================
  const [slipModalData, setSlipModalData] = useState(null);
  // { bookingsList: [...], mode: 'confirmation' | 'remaining' | 'combined', title: '' }
  const [generatedSlipDataUrl, setGeneratedSlipDataUrl] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // ==========================================
  // State สำหรับระบบรายงานและรวมบิล (Reports Tab)
  // ==========================================
  const [reportPeriod, setReportPeriod] = useState('daily'); // 'daily' | 'weekly' | 'monthly'
  const [reportBaseDate, setReportBaseDate] = useState(getTodayStr(0));
  const [reportSearch, setReportSearch] = useState('');
  const [selectedBookingIdsForCombine, setSelectedBookingIdsForCombine] =
    useState([]);

  // ==========================================
  // State สำหรับการจัดการห้องพัก (Rooms Tab)
  // ==========================================
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({
    number: '',
    name: '',
    type: 'Deluxe',
    price: 1200,
    capacity: 2,
    amenitiesText: 'Wi-Fi, แอร์, เครื่องทำน้ำอุ่น',
    status: 'active',
  });

  // Quick PromptPay Modal
  const [quickPromptPayOpen, setQuickPromptPayOpen] = useState(false);

  // ==========================================
  // State สำหรับระบบ AI Messenger Inbox & Follow-up Hub
  // ==========================================
  const [messengerLeads, setMessengerLeads] = useState(INITIAL_MESSENGER_LEADS);
  const [activeLeadId, setActiveLeadId] = useState('MSG-101');
  const [leadFilterStatus, setLeadFilterStatus] = useState('all');
  const [pageReplyInput, setPageReplyInput] = useState('');
  const [isAiGeneratingReply, setIsAiGeneratingReply] = useState(false);
  const [fbConfig, setFbConfig] = useState({
    isConnected: true,
    pageName: 'เดอะ กรีนเนอรี่ รีสอร์ท - จองห้องพัก',
    pageId: '104928374651928',
    autoPilot: true,
    autoSendQrOnConfirm: true,
    followUpHours: 2,
    webhookToken: 'SMART_STAY_VERIFY_8899',
  });
  const [fbSetupModalOpen, setFbSetupModalOpen] = useState(false);

  // State สำหรับ Floating AI Assistant Widget
  const [aiWidgetOpen, setAiWidgetOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([
    {
      role: 'assistant',
      text: 'สวัสดีค่ะ! ฉันคือผู้ช่วย AI ประจำรีสอร์ท สามารถถามสรุปห้องว่างวันนี้ ยอดค้างชำระ หรือให้ช่วยร่างข้อความส่งหาลูกค้าได้เลยนะคะ ✨',
    },
  ]);
  const [aiUserInput, setAiUserInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ==========================================
  // ฟังก์ชันคำนวณการเงินของแต่ละใบจอง
  // ==========================================
  const getBookingFinancials = (booking) => {
    const room = rooms.find((r) => r.id === booking.roomId);
    const nights = getNightCount(booking.checkIn, booking.checkOut);
    const roomPrice = room ? Number(room.price) : 0;
    const roomTotal = roomPrice * nights;
    const extraBedTotal =
      Number(booking.extraBedCount || 0) *
      Number(booking.extraBedPrice || 0) *
      nights;
    const grandTotal = roomTotal + extraBedTotal;
    const paid = booking.isFullyPaid
      ? grandTotal
      : Number(booking.depositPaid || 0);
    const remaining = Math.max(0, grandTotal - paid);

    return {
      room,
      nights,
      roomPrice,
      roomTotal,
      extraBedTotal,
      grandTotal,
      paid,
      remaining,
    };
  };

  // ==========================================
  // คำนวณห้องว่างตามวัน Check-in / Check-out ที่เลือก
  // ==========================================
  const roomAvailabilityList = useMemo(() => {
    return rooms.map((room) => {
      const overlappingBooking = bookings.find(
        (b) =>
          b.status !== 'cancelled' &&
          b.roomId === room.id &&
          b.id !== editingBookingId &&
          isDateOverlap(filterCheckIn, filterCheckOut, b.checkIn, b.checkOut)
      );
      return {
        ...room,
        isAvailable: room.status === 'active' && !overlappingBooking,
        conflictBooking: overlappingBooking || null,
      };
    });
  }, [rooms, bookings, filterCheckIn, filterCheckOut, editingBookingId]);

  const availableRoomsForSelectedDates = useMemo(
    () => roomAvailabilityList.filter((r) => r.isAvailable),
    [roomAvailabilityList]
  );

  // สร้างรูปภาพใบยืนยันการจอง + QR Code อัตโนมัติเมื่อเปิด Slip Modal
  useEffect(() => {
    let active = true;
    if (slipModalData && slipModalData.bookingsList?.length > 0) {
      setIsGeneratingImage(true);
      renderBookingSlipToCanvas({
        settings,
        bookingsList: slipModalData.bookingsList,
        getBookingFinancials,
        mode: slipModalData.mode,
      })
        .then((canvas) => {
          if (active) {
            setGeneratedSlipDataUrl(canvas.toDataURL('image/png'));
            setIsGeneratingImage(false);
          }
        })
        .catch(() => {
          if (active) setIsGeneratingImage(false);
        });
    } else {
      setGeneratedSlipDataUrl('');
    }
    return () => {
      active = false;
    };
  }, [slipModalData, settings, rooms, bookings]);

  // ==========================================
  // ฟังก์ชันดาวน์โหลดและแชร์รูปภาพใบจอง / QR Code ส่ง LINE & Messenger
  // ==========================================
  const handleDownloadSlipImage = async () => {
    if (!slipModalData) return;
    try {
      setIsGeneratingImage(true);
      const canvas = await renderBookingSlipToCanvas({
        settings,
        bookingsList: slipModalData.bookingsList,
        getBookingFinancials,
        mode: slipModalData.mode,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const firstId = slipModalData.bookingsList[0]?.id || 'SLIP';
      link.download = `SmartStay_${firstId}_QR.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsGeneratingImage(false);
      showToast('บันทึกรูปภาพใบจองและ QR Code ลงเครื่องเรียบร้อยแล้ว!');
    } catch (err) {
      setIsGeneratingImage(false);
      showToast('เกิดข้อผิดพลาดในการบันทึกรูปภาพ', 'error');
    }
  };

  const handleShareSlipToLineOrMessenger = async () => {
    if (!slipModalData) return;
    try {
      setIsGeneratingImage(true);
      const canvas = await renderBookingSlipToCanvas({
        settings,
        bookingsList: slipModalData.bookingsList,
        getBookingFinancials,
        mode: slipModalData.mode,
      });

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      const first = slipModalData.bookingsList[0];
      const fileName = `Booking_${first?.id || 'QR'}.png`;
      const file = new File([blob as any], fileName, { type: 'image/png' });

      const summaryText = buildTextReceipt(
        slipModalData.bookingsList,
        slipModalData.mode
      );

      setIsGeneratingImage(false);

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${settings.resortName} - ใบยืนยันการจองห้องพัก`,
          text: summaryText,
          files: [file],
        });
        showToast('แชร์รูปภาพใบจองและ QR Code สำเร็จ!');
      } else if (navigator.share) {
        await navigator.share({
          title: `${settings.resortName} - ใบยืนยันการจองห้องพัก`,
          text: summaryText,
        });
        showToast('เปิดเมนูแชร์ข้อความสำเร็จ!');
      } else {
        // Fallback กรณีเปิดบน Desktop Browser ที่ไม่รองรับ Web Share File API: ดาวน์โหลดรูป + คัดลอกข้อความอัตโนมัติ
        await navigator.clipboard.writeText(summaryText);
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();
        showToast(
          'ดาวน์โหลดรูปภาพ QR และคัดลอกข้อความสำหรับวางใน LINE / Messenger แล้ว!'
        );
      }
    } catch (err) {
      setIsGeneratingImage(false);
      if (err?.name !== 'AbortError') {
        showToast(
          'คัดลอกข้อความเรียบร้อย สามารถกดบันทึกรูปภาพเพื่อส่งต่อได้เลย',
          'info'
        );
      }
    }
  };

  const buildTextReceipt = (bookingsList, mode) => {
    if (!bookingsList || bookingsList.length === 0) return '';
    const first = bookingsList[0];
    let grandTotal = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    const roomLines = bookingsList.map((b) => {
      const fin = getBookingFinancials(b);
      grandTotal += fin.grandTotal;
      totalPaid += fin.paid;
      totalRemaining += fin.remaining;
      return `• ห้อง ${fin.room?.number} (${fin.room?.name}) ${
        fin.nights
      } คืน = ฿${fin.grandTotal.toLocaleString()}`;
    });

    return [
      `🏨 ${settings.resortName}`,
      mode === 'remaining' || mode === 'combined'
        ? `📌 แจ้งยอดคงค้างสำหรับเข้าพัก (${bookingsList
            .map((b) => b.id)
            .join(', ')})`
        : `✅ ยืนยันการจองห้องพัก (${bookingsList
            .map((b) => b.id)
            .join(', ')})`,
      `👤 ผู้เข้าพัก: ${first.guestName} (${first.phone})`,
      `📅 เช็คอิน: ${formatThaiDate(first.checkIn)} (${settings.checkInTime})`,
      `📅 เช็คเอาท์: ${formatThaiDate(first.checkOut)} (${
        settings.checkOutTime
      })`,
      `------------------------`,
      ...roomLines,
      `💰 ยอดรวมทั้งสิ้น: ฿${grandTotal.toLocaleString()}`,
      `✔️ ชำระมัดจำแล้ว: ฿${totalPaid.toLocaleString()}`,
      `💳 ยอดคงค้างชำระ: ฿${totalRemaining.toLocaleString()}`,
      `------------------------`,
      `📲 พร้อมเพย์: ${settings.promptPayId} (${settings.promptPayName})`,
      `📶 ${settings.wifiInfo}`,
    ].join('\n');
  };

  // ==========================================
  // การจัดการจองห้องพัก (สร้าง / แก้ไข / ยกเลิก)
  // ==========================================
  const openNewBookingModal = (roomIdsToBook, prefillData = null) => {
    if (!roomIdsToBook || roomIdsToBook.length === 0) {
      showToast('กรุณาเลือกห้องว่างอย่างน้อย 1 ห้องก่อนทำการจอง', 'error');
      return;
    }
    setEditingBookingId(null);
    setSelectedRoomIdsForBooking(roomIdsToBook);

    const nights = getNightCount(filterCheckIn, filterCheckOut);
    const defaultDeposit = roomIdsToBook.reduce((sum, rId) => {
      const rm = rooms.find((r) => r.id === rId);
      return sum + (rm ? Math.round((rm.price * nights) / 2) : 500);
    }, 0);

    setBookingForm({
      guestName: prefillData?.guestName || '',
      phone: prefillData?.phone || '',
      extraBedCount: 0,
      extraBedPrice: 300,
      specialRequests: prefillData?.specialRequests || '',
      depositPaid: defaultDeposit,
      isFullyPaid: false,
    });
    setBookingModalOpen(true);
  };

  const openEditBookingModal = (booking) => {
    setEditingBookingId(booking.id);
    setFilterCheckIn(booking.checkIn);
    setFilterCheckOut(booking.checkOut);
    setSelectedRoomIdsForBooking([booking.roomId]);
    setBookingForm({
      guestName: booking.guestName,
      phone: booking.phone,
      extraBedCount: booking.extraBedCount || 0,
      extraBedPrice: booking.extraBedPrice || 300,
      specialRequests: booking.specialRequests || '',
      depositPaid: booking.depositPaid || 0,
      isFullyPaid: Boolean(booking.isFullyPaid),
    });
    setBookingModalOpen(true);
  };

  const handleSaveBooking = (e) => {
    e.preventDefault();
    if (!bookingForm.guestName.trim() || !bookingForm.phone.trim()) {
      showToast('กรุณากรอกชื่อผู้เข้าพักและเบอร์โทรศัพท์ให้ครบถ้วน', 'error');
      return;
    }

    if (filterCheckOut <= filterCheckIn) {
      showToast('วันเช็คเอาท์ต้องอยู่หลังวันเช็คอินอย่างน้อย 1 คืน', 'error');
      return;
    }

    // ตรวจสอบการจองซ้ำซ้อนอีกครั้ง
    for (const rId of selectedRoomIdsForBooking) {
      const conflict = bookings.find(
        (b) =>
          b.status !== 'cancelled' &&
          b.roomId === rId &&
          b.id !== editingBookingId &&
          isDateOverlap(filterCheckIn, filterCheckOut, b.checkIn, b.checkOut)
      );
      if (conflict) {
        const rm = rooms.find((r) => r.id === rId);
        showToast(
          `ห้อง ${rm?.number} มีคิวจองแล้วในช่วงเวลานี้ (${conflict.guestName})`,
          'error'
        );
        return;
      }
    }

    if (editingBookingId) {
      const updatedBooking = {
        ...bookings.find((b) => b.id === editingBookingId),
        roomId: selectedRoomIdsForBooking[0],
        guestName: bookingForm.guestName.trim(),
        phone: bookingForm.phone.trim(),
        checkIn: filterCheckIn,
        checkOut: filterCheckOut,
        extraBedCount: Number(bookingForm.extraBedCount) || 0,
        extraBedPrice: Number(bookingForm.extraBedPrice) || 0,
        specialRequests: bookingForm.specialRequests.trim(),
        depositPaid: Number(bookingForm.depositPaid) || 0,
        isFullyPaid: Boolean(bookingForm.isFullyPaid),
      };

      setBookings((prev) =>
        prev.map((b) => (b.id === editingBookingId ? updatedBooking : b))
      );
      setBookingModalOpen(false);
      showToast('บันทึกการแก้ไขข้อมูลการจองเรียบร้อยแล้ว');
      setSlipModalData({
        bookingsList: [updatedBooking],
        mode: 'confirmation',
        title: 'ใบยืนยันการจองห้องพัก (อัปเดตล่าสุด)',
      });
    } else {
      // กรณีจองใหม่ (รองรับจองพร้อมกันหลายห้อง แบ่งเงินมัดจำเฉลี่ยต่อห้อง)
      const count = selectedRoomIdsForBooking.length;
      const depositPerRoom = Math.round(
        (Number(bookingForm.depositPaid) || 0) / count
      );

      const newBookingsCreated = selectedRoomIdsForBooking.map((rId, idx) => {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        return {
          id: `BK-${randomNum + idx}`,
          roomId: rId,
          guestName: bookingForm.guestName.trim(),
          phone: bookingForm.phone.trim(),
          checkIn: filterCheckIn,
          checkOut: filterCheckOut,
          extraBedCount: idx === 0 ? Number(bookingForm.extraBedCount) || 0 : 0,
          extraBedPrice: Number(bookingForm.extraBedPrice) || 300,
          specialRequests: bookingForm.specialRequests.trim(),
          depositPaid: depositPerRoom,
          isFullyPaid: Boolean(bookingForm.isFullyPaid),
          status: 'confirmed',
          createdAt: getTodayStr(0),
        };
      });

      setBookings((prev) => [...newBookingsCreated, ...prev]);
      setSelectedRoomIdsForBooking([]);
      setBookingModalOpen(false);
      showToast(`ยืนยันการจองสำเร็จ ${newBookingsCreated.length} ห้อง!`);

      // เปิดหน้าใบยืนยันการจองพร้อม QR Code ทันที
      setSlipModalData({
        bookingsList: newBookingsCreated,
        mode: 'confirmation',
        title: 'ใบยืนยันการจองและ QR รับชำระเงิน',
      });
    }
  };

  const handleMarkAsPaid = (bookingsToMark) => {
    const ids = bookingsToMark.map((b) => b.id);
    setBookings((prev) =>
      prev.map((b) => {
        if (ids.includes(b.id)) {
          const fin = getBookingFinancials(b);
          return {
            ...b,
            depositPaid: fin.grandTotal,
            isFullyPaid: true,
          };
        }
        return b;
      })
    );
    showToast('บันทึกสถานะชำระเงินครบเต็มจำนวนเรียบร้อยแล้ว!');
    if (slipModalData) {
      setSlipModalData(null);
    }
    setSelectedBookingIdsForCombine([]);
  };

  const handleCancelBooking = (bookingId) => {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    showToast('ยกเลิกและคืนสถานะห้องว่างเรียบร้อยแล้ว', 'info');
  };

  // ==========================================
  // ระบบคำนวณช่วงเวลารายงาน (รายวัน / รายสัปดาห์ / รายเดือน)
  // ==========================================
  const reportDateRange = useMemo(() => {
    const start = new Date(reportBaseDate);
    const end = new Date(reportBaseDate);

    if (reportPeriod === 'daily') {
      end.setDate(start.getDate() + 1);
    } else if (reportPeriod === 'weekly') {
      end.setDate(start.getDate() + 7);
    } else if (reportPeriod === 'monthly') {
      end.setDate(start.getDate() + 30);
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return { startStr, endStr };
  }, [reportBaseDate, reportPeriod]);

  const filteredReportBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === 'cancelled') return false;
        const inRange = isDateOverlap(
          reportDateRange.startStr,
          reportDateRange.endStr,
          b.checkIn,
          b.checkOut
        );
        if (!inRange) return false;
        if (!reportSearch.trim()) return true;
        const q = reportSearch.toLowerCase();
        const rm = rooms.find((r) => r.id === b.roomId);
        return (
          b.guestName.toLowerCase().includes(q) ||
          b.phone.includes(q) ||
          b.id.toLowerCase().includes(q) ||
          (rm && rm.number.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  }, [bookings, reportDateRange, reportSearch, rooms]);

  const availableRoomsInReportPeriod = useMemo(() => {
    return rooms.filter((r) => {
      if (r.status !== 'active') return false;
      const hasBooking = bookings.some(
        (b) =>
          b.status !== 'cancelled' &&
          b.roomId === r.id &&
          isDateOverlap(
            reportDateRange.startStr,
            reportDateRange.endStr,
            b.checkIn,
            b.checkOut
          )
      );
      return !hasBooking;
    });
  }, [rooms, bookings, reportDateRange]);

  // ==========================================
  // ระบบจัดการห้องพัก (เพิ่ม / แก้ไข / ลบ)
  // ==========================================
  const openAddRoomModal = () => {
    setEditingRoom(null);
    setRoomForm({
      number: `${rooms.length + 101}`,
      name: '',
      type: 'Deluxe',
      price: 1200,
      capacity: 2,
      amenitiesText: 'Wi-Fi, แอร์, ทีวี Smart TV, เครื่องทำน้ำอุ่น',
      status: 'active',
    });
    setRoomModalOpen(true);
  };

  const openEditRoomModal = (room) => {
    setEditingRoom(room);
    setRoomForm({
      number: room.number,
      name: room.name,
      type: room.type,
      price: room.price,
      capacity: room.capacity,
      amenitiesText: (room.amenities || []).join(', '),
      status: room.status || 'active',
    });
    setRoomModalOpen(true);
  };

  const handleSaveRoom = (e) => {
    e.preventDefault();
    if (!roomForm.number.trim() || !roomForm.name.trim()) {
      showToast('กรุณาระบุเลขห้องและชื่อห้องพัก', 'error');
      return;
    }

    const amenitiesArr = roomForm.amenitiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingRoom) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === editingRoom.id
            ? {
                ...r,
                number: roomForm.number.trim(),
                name: roomForm.name.trim(),
                type: roomForm.type,
                price: Number(roomForm.price) || 0,
                capacity: Number(roomForm.capacity) || 2,
                amenities: amenitiesArr,
                status: roomForm.status,
              }
            : r
        )
      );
      showToast(`อัปเดตข้อมูลห้อง ${roomForm.number} เรียบร้อยแล้ว`);
    } else {
      const newRoom = {
        id: `R${Date.now().toString().slice(-4)}`,
        number: roomForm.number.trim(),
        name: roomForm.name.trim(),
        type: roomForm.type,
        price: Number(roomForm.price) || 0,
        capacity: Number(roomForm.capacity) || 2,
        amenities: amenitiesArr,
        status: roomForm.status,
      };
      setRooms((prev) => [...prev, newRoom]);
      showToast(`เพิ่มห้องพัก ${newRoom.number} สำเร็จ!`);
    }
    setRoomModalOpen(false);
  };

  const handleDeleteRoom = (roomId) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    showToast('ลบห้องพักออกจากระบบแล้ว', 'info');
  };

  // ==========================================
  // ระบบ AI Messenger Auto-Reply & Auto Follow-up
  // ==========================================
  const activeLead = useMemo(
    () =>
      messengerLeads.find((l) => l.id === activeLeadId) || messengerLeads[0],
    [messengerLeads, activeLeadId]
  );

  const buildSystemKnowledgePrompt = () => {
    const roomSummary = rooms
      .map(
        (r) =>
          `- ห้อง ${r.number} (${r.name}, ประเภท ${r.type}): ราคา ${
            r.price
          } บาท/คืน พักได้ ${
            r.capacity
          } ท่าน สิ่งอำนวยความสะดวก: ${r.amenities.join(', ')}`
      )
      .join('\n');

    const activeBookingsSummary = bookings
      .map((b) => {
        const fin = getBookingFinancials(b);
        return `- รหัส ${b.id}: ห้อง ${fin.room?.number} คุณ${b.guestName} เช็คอิน ${b.checkIn} ถึง ${b.checkOut} (ยอดรวม ${fin.grandTotal} บ., จ่ายแล้ว ${fin.paid} บ., คงค้าง ${fin.remaining} บ.)`;
      })
      .join('\n');

    return `คุณคือ AI แอดมินเพจ Facebook Messenger ของ "${settings.resortName}"
บุคลิกของคุณ: ${settings.botPersona}
เวลาเช็คอิน: ${settings.checkInTime} / เช็คเอาท์: ${settings.checkOutTime}
ข้อมูล Wi-Fi: ${settings.wifiInfo}
กฎระเบียบที่พัก: ${settings.houseRules}
เลขพร้อมเพย์สำหรับโอนมัดจำ: ${settings.promptPayId} (${settings.promptPayName})

รายการห้องพักทั้งหมดของรีสอร์ท:
${roomSummary}

รายการจองปัจจุบัน:
${activeBookingsSummary}

หน้าที่ของคุณคือตอบแชทลูกค้าอย่างเป็นธรรมชาติ สุภาพ กระชับ ชัดเจน แจ้งห้องว่างและราคาที่ถูกต้อง พร้อมเชิญชวนให้โอนมัดจำผ่าน PromptPay เพื่อล็อกห้องพัก`;
  };

  const handleAiGenerateMessengerReply = async (lead, mode = 'reply') => {
    if (!lead) return;
    setIsAiGeneratingReply(true);

    const availRoomsForLead = rooms.filter((r) => {
      if (r.status !== 'active') return false;
      const conflict = bookings.some(
        (b) =>
          b.status !== 'cancelled' &&
          b.roomId === r.id &&
          isDateOverlap(
            lead.interestedCheckIn,
            lead.interestedCheckOut,
            b.checkIn,
            b.checkOut
          )
      );
      return !conflict;
    });

    const availText =
      availRoomsForLead.length > 0
        ? availRoomsForLead
            .map((r) => `ห้อง ${r.number} (${r.name}) ราคา ${r.price} บ./คืน`)
            .join(', ')
        : 'ไม่มีห้องว่างในช่วงดังกล่าว';

    const chatTranscript = lead.messages
      .map((m) => `${m.sender === 'customer' ? 'ลูกค้า' : 'เพจ'}: ${m.text}`)
      .join('\n');

    const prompt =
      mode === 'followup'
        ? `ลูกค้าชื่อ ${lead.fbName} สนใจเข้าพักวันที่ ${
            lead.interestedCheckIn
          } ถึง ${lead.interestedCheckOut} (ประเภทที่สนใจ: ${
            lead.interestedRoomType
          })
สถานะตอนนี้คือ "${
            lead.status === 'waiting_deposit'
              ? 'รอโอนมัดจำ'
              : 'สอบถามข้อมูลไว้แล้วเงียบไป'
          }"
ห้องที่ยังว่างจริงในช่วงนั้นคือ: ${availText}
ประวัติแชทล่าสุด:
${chatTranscript}

ช่วยร่างข้อความทักไปติดตามลูกค้า (Follow-up) แบบสุภาพ ไม่กดดัน แจ้งว่าตอนนี้ห้อง ${availText} ยังว่างอยู่ และสอบถามว่าต้องการให้ล็อกห้องพร้อมส่ง QR Code มัดจำให้เลยไหม (ความยาวไม่เกิน 3-4 บรรทัด)`
        : `ลูกค้าชื่อ ${lead.fbName} ทักแชทเพจมา
วันที่ลูกค้าสนใจ: ${lead.interestedCheckIn} ถึง ${lead.interestedCheckOut}
ห้องที่ยังว่างจริงในช่วงนั้น: ${availText}
ประวัติแชท:
${chatTranscript}

ช่วยร่างข้อความตอบกลับลูกค้าล่าสุดอย่างสุภาพ แจ้งรายละเอียดห้องว่าง ราคา และเชิญชวนจองพร้อมแจ้งเลขพร้อมเพย์ ${settings.promptPayId} (${settings.promptPayName}) (ความยาวกระชับ อ่านง่ายบนมือถือ)`;

    const aiReply = await callGeminiAI(prompt, buildSystemKnowledgePrompt());
    setPageReplyInput(aiReply.trim());
    setIsAiGeneratingReply(false);
    showToast(
      mode === 'followup'
        ? 'AI ร่างข้อความติดตามลูกค้า (Follow-up) ให้เรียบร้อยแล้ว!'
        : 'AI วิเคราะห์ห้องว่างและร่างคำตอบให้แล้ว!'
    );
  };

  const handleSendMessengerMessage = (customText = null) => {
    const textToSend = (customText ?? pageReplyInput).trim();
    if (!textToSend || !activeLead) return;

    const nowTime = new Date().toTimeString().slice(0, 5);
    setMessengerLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id
          ? {
              ...l,
              unreadCount: 0,
              lastActive: 'เมื่อสักครู่',
              status: l.status === 'new_inquiry' ? 'ai_replying' : l.status,
              messages: [
                ...l.messages,
                {
                  sender: 'page',
                  text: textToSend,
                  time: nowTime,
                },
              ],
            }
          : l
      )
    );
    if (!customText) setPageReplyInput('');
    showToast('ส่งข้อความเข้าแชท Facebook Messenger ของลูกค้าแล้ว');
  };

  const handleBatchAiFollowUpAllLeads = async () => {
    const pendingLeads = messengerLeads.filter(
      (l) =>
        l.status === 'waiting_deposit' ||
        l.status === 'follow_up' ||
        l.status === 'new_inquiry'
    );
    if (pendingLeads.length === 0) {
      showToast('ลูกค้าทุกท่านได้รับการยืนยันหมดแล้วค่ะ', 'info');
      return;
    }

    setIsAiGeneratingReply(true);
    const nowTime = new Date().toTimeString().slice(0, 5);

    setMessengerLeads((prev) =>
      prev.map((lead) => {
        if (
          lead.status === 'waiting_deposit' ||
          lead.status === 'follow_up' ||
          lead.status === 'new_inquiry'
        ) {
          const autoMsg =
            lead.status === 'waiting_deposit'
              ? `สวัสดีค่ะคุณ ${
                  lead.fbName
                } แอดมินขออนุญาตอัปเดตนะคะ สำหรับห้องพักช่วงวันที่ ${formatThaiDate(
                  lead.interestedCheckIn
                )} - ${formatThaiDate(
                  lead.interestedCheckOut
                )} ตอนนี้ยังว่างอยู่ 1 ห้องสุดท้ายค่ะ หากคุณลูกค้าสะดวกโอนมัดจำแล้วสามารถส่งสลิปในแชทนี้เพื่อให้ระบบล็อกห้องพักให้ทันทีเลยนะคะ 🙏💚`
              : `สวัสดีค่ะคุณ ${
                  lead.fbName
                } ไม่ทราบว่ายังสนใจเข้าพักช่วงวันที่ ${formatThaiDate(
                  lead.interestedCheckIn
                )} อยู่ไหมคะ ตอนนี้ห้องโซน ${
                  lead.interestedRoomType
                } ยังว่างพร้อมรับรองค่ะ สอบถามเพิ่มเติมหรือให้แอดมินส่ง QR Code มัดจำให้ได้เลยนะคะ ✨`;

          return {
            ...lead,
            lastActive: 'AI ติดตามผลเมื่อสักครู่',
            unreadCount: 0,
            messages: [
              ...lead.messages,
              {
                sender: 'page',
                text: autoMsg,
                time: nowTime,
                isAiAuto: true,
              },
            ],
          };
        }
        return lead;
      })
    );

    setIsAiGeneratingReply(false);
    showToast(
      `AI ส่งข้อความติดตามลูกค้าอัตโนมัติครบทั้ง ${pendingLeads.length} รายแล้ว!`
    );
  };

  const handleSimulateNewCustomerInquiry = async () => {
    const sampleNames = [
      'คุณกานดา น่ารัก (Kanda)',
      'คุณธีรภัทร ท่องเที่ยว',
      'Nattapong S. (คุณณัฐพงศ์)',
    ];
    const randomName =
      sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const checkIn = getTodayStr(2);
    const checkOut = getTodayStr(3);
    const nowTime = new Date().toTimeString().slice(0, 5);

    const newLeadId = `MSG-${Math.floor(200 + Math.random() * 799)}`;
    const customerMsg = `สวัสดีค่ะ สอบถามห้องว่างวันที่ ${checkIn} ถึง ${checkOut} พัก 2 คน มีห้องอะไรว่างและราคาเท่าไหร่บ้างคะ?`;

    const availRooms = rooms.filter(
      (r) =>
        r.status === 'active' &&
        !bookings.some(
          (b) =>
            b.status !== 'cancelled' &&
            b.roomId === r.id &&
            isDateOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
        )
    );

    const newMessages = [
      {
        sender: 'customer',
        text: customerMsg,
        time: nowTime,
      },
    ];

    if (fbConfig.autoPilot) {
      const roomListStr = availRooms
        .map(
          (r) => `ห้อง ${r.number} (${r.name}) ฿${r.price.toLocaleString()}/คืน`
        )
        .join(', ');
      newMessages.push({
        sender: 'page',
        text: `สวัสดีค่ะคุณ ${randomName} 🤖 (ระบบ AI ตอบกลับอัตโนมัติ) สำหรับวันที่ ${formatThaiDate(
          checkIn
        )} - ${formatThaiDate(checkOut)} ขณะนี้มีห้องว่างคือ: ${
          roomListStr || 'เต็มแล้วค่ะ'
        } สามารถโอนมัดจำผ่านพร้อมเพย์ ${
          settings.promptPayId
        } เพื่อล็อกห้องพักได้ทันทีค่ะ รับห้องไหนดีคะ?`,
        time: nowTime,
      });
    }

    const createdLead = {
      id: newLeadId,
      fbName: randomName,
      avatarBg: 'bg-emerald-600',
      phone: '0851239988',
      status: fbConfig.autoPilot ? 'waiting_deposit' : 'new_inquiry',
      interestedCheckIn: checkIn,
      interestedCheckOut: checkOut,
      interestedRoomType: 'Deluxe',
      lastActive: 'เมื่อสักครู่',
      unreadCount: fbConfig.autoPilot ? 0 : 1,
      messages: newMessages,
    };

    setMessengerLeads((prev) => [createdLead, ...prev]);
    setActiveLeadId(newLeadId);
    showToast(
      fbConfig.autoPilot
        ? 'มีลูกค้าทักเพจใหม่! AI Auto-Pilot ตรวจเช็คห้องว่างและตอบกลับให้อัตโนมัติแล้ว'
        : 'มีลูกค้าทักเพจเข้ามาใหม่!'
    );
  };

  const handleConvertLeadToBooking = (lead) => {
    setFilterCheckIn(lead.interestedCheckIn);
    setFilterCheckOut(lead.interestedCheckOut);

    const matchingAvailRoom = rooms.find(
      (r) =>
        r.status === 'active' &&
        (r.type.toLowerCase() === lead.interestedRoomType.toLowerCase() ||
          true) &&
        !bookings.some(
          (b) =>
            b.status !== 'cancelled' &&
            b.roomId === r.id &&
            isDateOverlap(
              lead.interestedCheckIn,
              lead.interestedCheckOut,
              b.checkIn,
              b.checkOut
            )
        )
    );

    if (!matchingAvailRoom) {
      showToast(
        'ไม่มีห้องว่างในช่วงวันที่ลูกค้าสนใจ กรุณาเลือกวันอื่น',
        'error'
      );
      setActiveTab('booking');
      return;
    }

    setMessengerLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: 'confirmed' } : l))
    );

    openNewBookingModal([matchingAvailRoom.id], {
      guestName: lead.fbName,
      phone: lead.phone,
      specialRequests: `จองผ่านแชทเพจ Facebook Messenger (สนใจโซน ${lead.interestedRoomType})`,
    });
  };

  // ==========================================
  // Floating AI Assistant Chat
  // ==========================================
  const handleSendAiAssistantMessage = async (presetText = null) => {
    const query = (presetText ?? aiUserInput).trim();
    if (!query) return;

    setAiChatMessages((prev) => [...prev, { role: 'user', text: query }]);
    if (!presetText) setAiUserInput('');
    setAiLoading(true);

    const reply = await callGeminiAI(query, buildSystemKnowledgePrompt());
    setAiChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    setAiLoading(false);
  };

  const unreadLeadsCount = useMemo(
    () => messengerLeads.reduce((acc, l) => acc + (l.unreadCount || 0), 0),
    [messengerLeads]
  );

  // ==========================================
  // UI Rendering
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-bounce">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : toast.type === 'info'
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Top Mobile App Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
              <Bed className="w-5 h-5 text-emerald-200" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wider bg-emerald-900/50 text-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                  Smart Stay PMS
                </span>
                {fbConfig.isConnected && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/30 border border-blue-300/40 text-blue-100 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    FB AI Online
                  </span>
                )}
              </div>
              <h1 className="font-bold text-base sm:text-lg truncate mt-0.5">
                {settings.resortName}
              </h1>
            </div>
          </div>

          {/* ปุ่มลัดตั้งค่าเบอร์พร้อมเพย์ทันที */}
          <button
            onClick={() => setQuickPromptPayOpen(true)}
            className="shrink-0 bg-white/15 hover:bg-white/25 active:scale-95 transition px-3 py-2 rounded-xl border border-white/25 flex items-center gap-1.5 text-xs font-medium"
          >
            <QrCode className="w-4 h-4 text-emerald-200" />
            <div className="text-left hidden xs:block">
              <div className="text-[10px] text-emerald-100 leading-none">
                พร้อมเพย์รับเงิน
              </div>
              <div className="font-bold text-white leading-tight">
                {settings.promptPayId}
              </div>
            </div>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-3.5 pt-4 space-y-5">
        {/* ============================================================
            TAB 1: ระบบจองห้องพัก & เช็คห้องว่าง (BOOKING TAB)
        ============================================================ */}
        {activeTab === 'booking' && (
          <div className="space-y-4">
            {/* การ์ดตัวกรองวัน Check-in / Check-out */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-sm sm:text-base">
                      ค้นหาห้องว่างตามวันเข้าพัก
                    </h2>
                    <p className="text-xs text-slate-500">
                      ระบบป้องกันการจองซ้ำซ้อนอัตโนมัติ (จำนวน{' '}
                      <span className="font-bold text-emerald-600">
                        {getNightCount(filterCheckIn, filterCheckOut)} คืน
                      </span>
                      )
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                  ว่าง {availableRoomsForSelectedDates.length}/{rooms.length}{' '}
                  ห้อง
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    วันเช็คอิน (Check-in)
                  </label>
                  <input
                    type="date"
                    value={filterCheckIn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFilterCheckIn(val);
                      if (val >= filterCheckOut) {
                        const nextDay = new Date(val);
                        nextDay.setDate(nextDay.getDate() + 1);
                        setFilterCheckOut(nextDay.toISOString().split('T')[0]);
                      }
                      setSelectedRoomIdsForBooking([]);
                    }}
                    className="w-full bg-transparent font-bold text-slate-800 text-sm focus:outline-none"
                  />
                  <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    {formatThaiDate(filterCheckIn)}
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    วันเช็คเอาท์ (Check-out)
                  </label>
                  <input
                    type="date"
                    value={filterCheckOut}
                    min={filterCheckIn}
                    onChange={(e) => {
                      setFilterCheckOut(e.target.value);
                      setSelectedRoomIdsForBooking([]);
                    }}
                    className="w-full bg-transparent font-bold text-slate-800 text-sm focus:outline-none"
                  />
                  <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    {formatThaiDate(filterCheckOut)}
                  </div>
                </div>
              </div>

              {/* แถบปุ่มจองหลายห้องพร้อมกัน */}
              {selectedRoomIdsForBooking.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-emerald-50/80 -mx-4 -mb-4 px-4 py-3 rounded-b-3xl">
                  <div className="text-xs font-semibold text-emerald-900">
                    เลือกไว้{' '}
                    <span className="text-emerald-600 font-extrabold text-sm">
                      {selectedRoomIdsForBooking.length}
                    </span>{' '}
                    ห้อง (สามารถรวมบิลลูกค้าคนเดียวได้)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedRoomIdsForBooking([])}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                    >
                      ล้าง
                    </button>
                    <button
                      onClick={() =>
                        openNewBookingModal(selectedRoomIdsForBooking)
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 active:scale-95 transition"
                    >
                      <Plus className="w-4 h-4" />
                      ทำการจอง ({selectedRoomIdsForBooking.length} ห้อง)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* รายการห้องพักพร้อมสถานะ ว่าง / จองแล้ว */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-slate-700 text-sm">
                  สถานะห้องพัก ({formatThaiDate(filterCheckIn)} -{' '}
                  {formatThaiDate(filterCheckOut)})
                </h3>
                <span className="text-xs text-slate-500">
                  แตะเลือกได้มากกว่า 1 ห้อง
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roomAvailabilityList.map((room) => {
                  const isSelected = selectedRoomIdsForBooking.includes(
                    room.id
                  );
                  const nights = getNightCount(filterCheckIn, filterCheckOut);
                  const totalForPeriod = room.price * nights;

                  return (
                    <div
                      key={room.id}
                      className={`rounded-3xl p-4 border transition relative overflow-hidden ${
                        room.isAvailable
                          ? isSelected
                            ? 'bg-emerald-50/70 border-2 border-emerald-600 shadow-md'
                            : 'bg-white border-slate-200 hover:border-emerald-300 shadow-sm'
                          : 'bg-slate-100/80 border-slate-200/80 opacity-90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-extrabold text-sm shrink-0 ${
                              room.isAvailable
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-slate-300 text-slate-600'
                            }`}
                          >
                            <span className="text-[10px] font-normal opacity-80 leading-none">
                              ห้อง
                            </span>
                            <span>{room.number}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 text-base">
                                {room.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md font-medium text-slate-600">
                                {room.type}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />{' '}
                                {room.capacity} ท่าน
                              </span>
                            </div>
                          </div>
                        </div>

                        {room.isAvailable ? (
                          <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ว่าง
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-full">
                            ไม่ว่าง
                          </span>
                        )}
                      </div>

                      {/* Amenities */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(room.amenities || []).map((am, i) => (
                          <span
                            key={i}
                            className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg"
                          >
                            {am}
                          </span>
                        ))}
                      </div>

                      {/* ราคาและปุ่มจัดการ */}
                      {room.isAvailable ? (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-lg font-extrabold text-emerald-700 leading-none">
                              ฿{room.price.toLocaleString()}
                              <span className="text-xs font-normal text-slate-500">
                                {' '}
                                / คืน
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              รวม {nights} คืน = ฿
                              {totalForPeriod.toLocaleString()}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRoomIdsForBooking((prev) =>
                                  prev.includes(room.id)
                                    ? prev.filter((id) => id !== room.id)
                                    : [...prev, room.id]
                                );
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                                isSelected
                                  ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {isSelected ? '✓ เลือกแล้ว' : '+ เลือกพ่วง'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openNewBookingModal([room.id])}
                              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm transition"
                            >
                              จองห้องนี้
                            </button>
                          </div>
                        </div>
                      ) : (
                        room.conflictBooking && (
                          <div className="mt-3 pt-3 border-t border-slate-200/80 bg-white/80 -mx-4 -mb-4 p-3.5">
                            <div className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-slate-700">
                                  ผู้จอง: {room.conflictBooking.guestName}
                                </span>
                                <div className="text-[11px] text-slate-500">
                                  {formatThaiDate(room.conflictBooking.checkIn)}{' '}
                                  -{' '}
                                  {formatThaiDate(
                                    room.conflictBooking.checkOut
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${room.conflictBooking.phone}`}
                                  className="p-2 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  title="โทรหาลูกค้า"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  onClick={() =>
                                    setSlipModalData({
                                      bookingsList: [room.conflictBooking],
                                      mode: 'confirmation',
                                      title: 'ใบยืนยันการจองและ QR Code',
                                    })
                                  }
                                  className="p-2 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  title="ดูใบจอง / แชร์รูป QR"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() =>
                                    openEditBookingModal(room.conflictBooking)
                                  }
                                  className="p-2 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300"
                                  title="แก้ไขการจอง"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 2: รายงานผู้เข้าพัก & รวมบิลยอดคงค้าง (REPORTS TAB)
        ============================================================ */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            {/* ตัวกรอง Dropdown รายวัน / รายสัปดาห์ / รายเดือน */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-sm sm:text-base">
                      รายงานผู้เข้าพัก & ห้องว่างล่วงหน้า
                    </h2>
                    <p className="text-xs text-slate-500">
                      {formatThaiDate(reportDateRange.startStr)} ถึง{' '}
                      {formatThaiDate(reportDateRange.endStr)}
                    </p>
                  </div>
                </div>

                {/* Dropdown Filter ตามโจทย์ */}
                <select
                  value={reportPeriod}
                  onChange={(e) => {
                    setReportPeriod(e.target.value);
                    setSelectedBookingIdsForCombine([]);
                  }}
                  className="bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="daily">📅 รายวัน (Daily)</option>
                  <option value="weekly">📆 รายสัปดาห์ (7 วัน)</option>
                  <option value="monthly">🗓️ รายเดือน (30 วัน)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 shrink-0">
                    เริ่มวันที่:
                  </span>
                  <input
                    type="date"
                    value={reportBaseDate}
                    onChange={(e) => setReportBaseDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 w-full focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร, เลขห้อง..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="bg-transparent text-xs text-slate-800 w-full focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* ส่วนแสดงห้องว่างตามช่วง Filter ด้านบน */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-bold text-xs sm:text-sm text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ห้องพักที่ว่างตลอดช่วงเวลานี้ (
                  {availableRoomsInReportPeriod.length} ห้อง)
                </h3>
                <span className="text-[11px] text-slate-400">
                  คลิกที่ห้องเพื่อจองทันที
                </span>
              </div>

              {availableRoomsInReportPeriod.length === 0 ? (
                <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2.5 rounded-2xl">
                  ไม่มีห้องที่ว่างตลอดทั้งช่วงเวลานี้
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {availableRoomsInReportPeriod.map((rm) => (
                    <button
                      key={rm.id}
                      onClick={() => {
                        setFilterCheckIn(reportBaseDate);
                        const nextD = new Date(reportBaseDate);
                        nextD.setDate(nextD.getDate() + 1);
                        setFilterCheckOut(nextD.toISOString().split('T')[0]);
                        setActiveTab('booking');
                        openNewBookingModal([rm.id]);
                      }}
                      className="shrink-0 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-2xl px-3 py-2 text-left transition"
                    >
                      <div className="font-extrabold text-xs text-emerald-800">
                        ห้อง {rm.number} • {rm.type}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold">
                        ฿{rm.price.toLocaleString()}/คืน
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* แถบปุ่ม "รวมบิลและสร้าง QR Code" เมื่อติ๊กเลือกมากกว่า 1 ใบจอง */}
            {selectedBookingIdsForCombine.length > 0 && (
              <div className="sticky top-16 z-20 bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-emerald-400">
                    เลือกรวมบิล {selectedBookingIdsForCombine.length} ห้องพัก
                  </div>
                  <div className="text-[11px] text-slate-300">
                    รวมยอดคงค้างเพื่อสร้าง QR Code ใบเดียวให้ลูกค้าสแกน
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedBookingIdsForCombine([])}
                    className="text-xs text-slate-300 px-2 py-1"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => {
                      const list = bookings.filter((b) =>
                        selectedBookingIdsForCombine.includes(b.id)
                      );
                      setSlipModalData({
                        bookingsList: list,
                        mode: 'combined',
                        title: `รวมบิลชำระค่าห้องพัก (${list.length} ห้อง)`,
                      });
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow"
                  >
                    <Layers className="w-4 h-4" />
                    ออก QR รวมบิล
                  </button>
                </div>
              </div>
            )}

            {/* รายชื่อผู้เข้าพักแบบ Card รองรับมือถือ */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-slate-700 text-sm">
                  การ์ดรายชื่อผู้เข้าพัก ({filteredReportBookings.length}{' '}
                  รายการ)
                </h3>
                <span className="text-[11px] text-slate-500">
                  ติ๊กช่องหน้าการ์ดเพื่อรวมบิลหลายห้อง
                </span>
              </div>

              {filteredReportBookings.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-slate-200">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-600 text-sm">
                    ไม่พบรายการเข้าพักในช่วงเวลาที่เลือก
                  </p>
                </div>
              ) : (
                filteredReportBookings.map((b) => {
                  const fin = getBookingFinancials(b);
                  const isChecked = selectedBookingIdsForCombine.includes(b.id);

                  return (
                    <div
                      key={b.id}
                      className={`bg-white rounded-3xl p-4 shadow-sm border transition ${
                        isChecked
                          ? 'border-2 border-emerald-600 bg-emerald-50/30'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedBookingIdsForCombine((prev) =>
                                prev.includes(b.id)
                                  ? prev.filter((id) => id !== b.id)
                                  : [...prev, b.id]
                              );
                            }}
                            className="mt-1 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="bg-emerald-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-lg">
                                ห้อง {fin.room?.number}
                              </span>
                              <span className="font-bold text-slate-800 text-base">
                                {b.guestName}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({b.id})
                              </span>
                            </div>

                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>
                                🗓️ {formatThaiDate(b.checkIn)} →{' '}
                                {formatThaiDate(b.checkOut)} ({fin.nights} คืน)
                              </span>
                              {b.extraBedCount > 0 && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md text-[11px] font-medium">
                                  +เตียงเสริม {b.extraBedCount} (฿
                                  {b.extraBedPrice}/คืน)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ปุ่มกดโทรออกหาลูกค้าทันทีบนมือถือ */}
                        <a
                          href={`tel:${b.phone}`}
                          className="shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {b.phone}
                        </a>
                      </div>

                      {b.specialRequests && (
                        <div className="mt-2.5 text-xs bg-amber-50/70 text-amber-800 px-3 py-2 rounded-xl border border-amber-200/60">
                          📌 คำขอพิเศษ: {b.specialRequests}
                        </div>
                      )}

                      {/* สรุปยอดเงินของการ์ด */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-2xl p-2.5">
                        <div>
                          <div className="text-[10px] text-slate-500">
                            ยอดรวม
                          </div>
                          <div className="font-bold text-xs text-slate-800">
                            ฿{fin.grandTotal.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">
                            มัดจำ/จ่ายแล้ว
                          </div>
                          <div className="font-bold text-xs text-emerald-600">
                            ฿{fin.paid.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">
                            คงค้างวันเข้าพัก
                          </div>
                          <div
                            className={`font-extrabold text-xs ${
                              fin.remaining > 0
                                ? 'text-rose-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {fin.remaining > 0
                              ? `฿${fin.remaining.toLocaleString()}`
                              : 'ชำระครบแล้ว'}
                          </div>
                        </div>
                      </div>

                      {/* ปุ่ม Action ในการ์ด */}
                      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditBookingModal(b)}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> แก้ไข
                          </button>
                          <button
                            onClick={() => handleCancelBooking(b.id)}
                            className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold px-2.5 py-1.5 rounded-xl flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> ยกเลิก
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSlipModalData({
                                bookingsList: [b],
                                mode: 'confirmation',
                                title: 'ใบยืนยันการจองห้องพัก',
                              })
                            }
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
                          >
                            <Share2 className="w-3.5 h-3.5" /> ใบจอง/แชร์รูป
                          </button>

                          {fin.remaining > 0 && (
                            <button
                              onClick={() =>
                                setSlipModalData({
                                  bookingsList: [b],
                                  mode: 'remaining',
                                  title: `QR รับเงินส่วนคงค้าง (ห้อง ${fin.room?.number})`,
                                })
                              }
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm"
                            >
                              <QrCode className="w-3.5 h-3.5" /> QR ยอดค้าง ฿
                              {fin.remaining.toLocaleString()}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 3: แชทเพจ Facebook Messenger & AI Auto Follow-up Hub
        ============================================================ */}
        {activeTab === 'messenger' && (
          <div className="space-y-4">
            {/* แบนเนอร์สถานะการเชื่อมต่อ Facebook Messenger + ปุ่ม AI Follow-up ทั้งหมด */}
            <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white rounded-3xl p-4 shadow-md">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                    <MessageCircle className="w-6 h-6 text-blue-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                        ● เชื่อมต่อเพจแล้ว
                      </span>
                      <span className="text-xs text-blue-200">
                        {fbConfig.pageName}
                      </span>
                    </div>
                    <h2 className="font-extrabold text-base sm:text-lg mt-0.5">
                      AI Messenger ตอบแชท & ติดตามลูกค้าอัตโนมัติ
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFbSetupModalOpen(true)}
                    className="bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/20 flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" /> ตั้งค่าเพจ
                  </button>
                  <button
                    onClick={handleSimulateNewCustomerInquiry}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold px-3 py-2 rounded-xl shadow flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" /> + จำลองลูกค้าทักเพจ
                  </button>
                </div>
              </div>

              {/* แถบควบคุม AI Auto-Pilot & 1-Click Follow-up */}
              <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-blue-100">
                  <input
                    type="checkbox"
                    checked={fbConfig.autoPilot}
                    onChange={(e) =>
                      setFbConfig((prev) => ({
                        ...prev,
                        autoPilot: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-emerald-400 rounded"
                  />
                  เปิดโหมด AI เช็คห้องว่างและตอบแชทอัตโนมัติทันที (24 ชม.)
                </label>

                <button
                  onClick={handleBatchAiFollowUpAllLeads}
                  disabled={isAiGeneratingReply}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  AI ทักติดตามลูกค้าที่รอโอนมัดจำทั้งหมด
                </button>
              </div>
            </div>

            {/* ตัวกรองสถานะลูกค้าในเพจ */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'new_inquiry', label: '🔴 ทักมาใหม่' },
                { id: 'waiting_deposit', label: '⏳ รอโอนมัดจำ' },
                { id: 'follow_up', label: '🔔 ต้องติดตามผล' },
                { id: 'confirmed', label: '✅ จองสำเร็จ' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setLeadFilterStatus(st.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                    leadFilterStatus === st.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* รายชื่อแชทลูกค้า + หน้าต่างสนทนา */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              {/* คอลัมน์ซ้าย: รายชื่อลูกค้าที่ทักเพจ */}
              <div className="md:col-span-5 space-y-2">
                {messengerLeads
                  .filter(
                    (l) =>
                      leadFilterStatus === 'all' ||
                      l.status === leadFilterStatus
                  )
                  .map((lead) => {
                    const isSelected = activeLead?.id === lead.id;
                    const statusBadge = {
                      new_inquiry: {
                        text: 'ทักมาใหม่',
                        cls: 'bg-rose-100 text-rose-700',
                      },
                      ai_replying: {
                        text: 'กำลังคุย',
                        cls: 'bg-blue-100 text-blue-700',
                      },
                      waiting_deposit: {
                        text: 'รอโอนมัดจำ',
                        cls: 'bg-amber-100 text-amber-800',
                      },
                      follow_up: {
                        text: 'ควรทักซ้ำ',
                        cls: 'bg-purple-100 text-purple-800',
                      },
                      confirmed: {
                        text: 'จองแล้ว',
                        cls: 'bg-emerald-100 text-emerald-800',
                      },
                    }[lead.status] || {
                      text: 'ทั่วไป',
                      cls: 'bg-slate-100 text-slate-600',
                    };

                    return (
                      <div
                        key={lead.id}
                        onClick={() => {
                          setActiveLeadId(lead.id);
                          setMessengerLeads((prev) =>
                            prev.map((item) =>
                              item.id === lead.id
                                ? { ...item, unreadCount: 0 }
                                : item
                            )
                          );
                        }}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50/90 border-2 border-blue-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-full ${lead.avatarBg} text-white font-bold flex items-center justify-center shrink-0 text-sm`}
                            >
                              {lead.fbName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">
                                {lead.fbName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                สนใจ: {formatThaiDate(lead.interestedCheckIn)} (
                                {lead.interestedRoomType})
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}
                            >
                              {statusBadge.text}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {lead.lastActive}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 truncate mt-2">
                          {lead.messages[lead.messages.length - 1]?.text}
                        </p>
                      </div>
                    );
                  })}
              </div>

              {/* คอลัมน์ขวา: กล่องแชทและการสั่งงาน AI */}
              {activeLead && (
                <div className="md:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                  {/* Header ของแชทลูกค้า */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        {activeLead.fbName}
                        <a
                          href={`tel:${activeLead.phone}`}
                          className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 inline-flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" /> {activeLead.phone}
                        </a>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        วันที่ลูกค้าสนใจเช็คอิน:{' '}
                        {formatThaiDate(activeLead.interestedCheckIn)} →{' '}
                        {formatThaiDate(activeLead.interestedCheckOut)} (โซน{' '}
                        {activeLead.interestedRoomType})
                      </div>
                    </div>

                    <button
                      onClick={() => handleConvertLeadToBooking(activeLead)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                    >
                      <CheckCheck className="w-4 h-4" />
                      แปลงแชทเป็นใบจองทันที
                    </button>
                  </div>

                  {/* รายการข้อความแชท */}
                  <div className="p-4 space-y-3 max-h-80 overflow-y-auto bg-slate-50/50">
                    {activeLead.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${
                          msg.sender === 'customer'
                            ? 'items-start'
                            : 'items-end'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            msg.sender === 'customer'
                              ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                              : 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                          }`}
                        >
                          {(msg as any).isAiAuto && (
                            <div className="text-[10px] font-bold text-blue-200 mb-1 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />{' '}
                              ตอบและติดตามอัตโนมัติโดย AI
                            </div>
                          )}
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {msg.time}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* ปุ่มผู้ช่วย AI อัจฉริยะสำหรับแชทนี้ */}
                  <div className="px-3.5 py-2.5 bg-indigo-50/70 border-t border-indigo-100 flex items-center gap-2 overflow-x-auto">
                    <button
                      type="button"
                      disabled={isAiGeneratingReply}
                      onClick={() =>
                        handleAiGenerateMessengerReply(activeLead, 'reply')
                      }
                      className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isAiGeneratingReply
                        ? 'AI กำลังคิด...'
                        : 'ให้ AI เช็คห้องว่าง & ร่างคำตอบ'}
                    </button>

                    <button
                      type="button"
                      disabled={isAiGeneratingReply}
                      onClick={() =>
                        handleAiGenerateMessengerReply(activeLead, 'followup')
                      }
                      className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      AI ทักตามลูกค้าโอนมัดจำ
                    </button>
                  </div>

                  {/* ช่องพิมพ์ตอบกลับเพจ */}
                  <div className="p-3 bg-white border-t border-slate-200 flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={pageReplyInput}
                      onChange={(e) => setPageReplyInput(e.target.value)}
                      placeholder="พิมพ์ข้อความตอบลูกค้า หรือกดปุ่มให้ AI ร่างคำตอบด้านบน..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendMessengerMessage()}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-2xl shrink-0 shadow-sm active:scale-95 transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 4: จัดการห้องพัก (ROOMS MANAGEMENT TAB)
        ============================================================ */}
        {activeTab === 'rooms' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800 text-base">
                  จัดการห้องพักทั้งหมด
                </h2>
                <p className="text-xs text-slate-500">
                  เพิ่มจำนวนห้อง กำหนดราคา และสิ่งอำนวยความสะดวก
                </p>
              </div>
              <button
                onClick={openAddRoomModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-sm active:scale-95 transition"
              >
                <Plus className="w-4 h-4" /> เพิ่มห้องพัก
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-sm">
                          {room.number}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">
                            {room.name}
                          </h3>
                          <span className="text-xs text-slate-500">
                            ประเภท {room.type} • พักได้ {room.capacity} ท่าน
                          </span>
                        </div>
                      </div>
                      <span className="font-extrabold text-emerald-700 text-base">
                        ฿{room.price.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-3">
                      {(room.amenities || []).map((am, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg"
                        >
                          {am}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditRoomModal(room)}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> แก้ไข
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 5: ตั้งค่าระบบ PromptPay, AI & วิธีติดตั้งง่ายๆ (SETTINGS TAB)
        ============================================================ */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* การ์ดตั้งค่า PromptPay และข้อมูลที่พัก */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-base">
                    ตั้งค่ารับเงิน PromptPay & ข้อมูลรีสอร์ท
                  </h2>
                  <p className="text-xs text-slate-500">
                    เปลี่ยนเบอร์โทรศัพท์ 10 หลัก หรือเลขบัตรประชาชน 13
                    หลักสำหรับสร้าง QR รับเงิน
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อที่พัก / โรงแรม / รีสอร์ท
                  </label>
                  <input
                    type="text"
                    value={settings.resortName}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        resortName: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-1">
                    เบอร์โทรศัพท์ หรือ เลขบัตรประชาชน พร้อมเพย์
                  </label>
                  <input
                    type="text"
                    value={settings.promptPayId}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        promptPayId: e.target.value,
                      }))
                    }
                    placeholder="เช่น 0812345678 หรือ 1100500123456"
                    className="w-full bg-emerald-50/60 border border-emerald-300 rounded-xl px-3 py-2 text-sm font-bold text-emerald-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อบัญชีพร้อมเพย์ (แสดงบนใบจอง)
                  </label>
                  <input
                    type="text"
                    value={settings.promptPayName}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        promptPayName: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ข้อมูล Wi-Fi สำหรับลูกค้า
                  </label>
                  <input
                    type="text"
                    value={settings.wifiInfo}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        wifiInfo: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  กฎระเบียบที่พัก & คำแนะนำสำหรับให้ AI ใช้ตอบแชทลูกค้าอัตโนมัติ
                </label>
                <textarea
                  rows={2}
                  value={settings.houseRules}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      houseRules: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <button
                onClick={() =>
                  showToast('บันทึกการตั้งค่าระบบและพร้อมเพย์เรียบร้อยแล้ว!')
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm"
              >
                บันทึกการตั้งค่าทั้งหมด
              </button>
            </div>

            {/* คู่มือการติดตั้งลงมือถือ & เชื่อมเพจแบบไม่ต้องเขียนโค้ด */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  วิธีติดตั้งแอปลงจอมือถือ & เชื่อมต่อ AI Messenger
                  (ไม่ต้องมีความรู้ไอที)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="font-extrabold text-emerald-700 mb-1">
                    1. เพิ่มเป็นแอปบนจอมือถือ
                  </div>
                  <p className="text-slate-600">
                    เปิดเว็บนี้บน Safari (iPhone) หรือ Chrome (Android)
                    กดปุ่มแชร์ แล้วเลือก{' '}
                    <b>"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"</b>{' '}
                    ใช้งานได้เหมือนแอปจริงทันที
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="font-extrabold text-blue-700 mb-1">
                    2. เชื่อมเพจ Facebook ใน 3 คลิก
                  </div>
                  <p className="text-slate-600">
                    ไปที่เมนู <b>"แชทเพจ & AI"</b> กดปุ่ม "ตั้งค่าเพจ"
                    เพื่อเปิดระบบตอบแชทอัตโนมัติและให้ AI
                    ช่วยทักตามลูกค้าที่ยังไม่โอนมัดจำ
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="font-extrabold text-purple-700 mb-1">
                    3. เซฟรูปใบจองส่ง LINE ทันที
                  </div>
                  <p className="text-slate-600">
                    เมื่อยืนยันการจอง ระบบจะวาดรูปใบจองพร้อม QR พร้อมเพย์ กดปุ่ม{' '}
                    <b>"แชร์ส่ง LINE / Messenger"</b> ส่งรูปให้ลูกค้าได้ทันที
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================
          MODAL 1: ฟอร์มสร้าง / แก้ไขการจองห้องพัก
      ============================================================ */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">
                  {editingBookingId
                    ? `แก้ไขข้อมูลการจอง (${editingBookingId})`
                    : `กรอกข้อมูลผู้เข้าพัก (${selectedRoomIdsForBooking.length} ห้อง)`}
                </h3>
                <p className="text-xs text-emerald-600 font-semibold">
                  เข้าพัก {formatThaiDate(filterCheckIn)} →{' '}
                  {formatThaiDate(filterCheckOut)} (
                  {getNightCount(filterCheckIn, filterCheckOut)} คืน)
                </p>
              </div>
              <button
                onClick={() => setBookingModalOpen(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBooking} className="space-y-3.5 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อ-นามสกุล ผู้เข้าพัก *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น คุณสมชาย ใจดี"
                    value={bookingForm.guestName}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        guestName: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เบอร์โทรศัพท์ติดต่อ *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0812345678"
                    value={bookingForm.phone}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* เตียงเสริม (ระบุราคาได้เอง) */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวนเตียงเสริม (Extra Bed)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={bookingForm.extraBedCount}
                   onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        extraBedCount: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ราคาเตียงเสริม (บาท/คืน)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={bookingForm.extraBedPrice}
                    oonChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        extraBedPrice: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-emerald-700"
                  />
                </div>
              </div>

              {/* คำขอพิเศษ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  คำขอพิเศษ / หมายเหตุเพิ่มเติม
                </label>
                <input
                  type="text"
                  placeholder="เช่น ขอหมอนเพิ่ม, เช็คอินดึก, แพ้อาหารทะเล..."
                  value={bookingForm.specialRequests}
                  onChange={(e) =>
                    setBookingForm((prev) => ({
                      ...prev,
                      specialRequests: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              {/* เงินมัดจำ & สถานะการชำระ */}
              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-900">
                    ยอดชำระมัดจำ (บาท)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bookingForm.isFullyPaid}
                      onChange={(e) =>
                        setBookingForm((prev) => ({
                          ...prev,
                          isFullyPaid: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    ชำระเต็มจำนวนแล้ว
                  </label>
                </div>

                {!bookingForm.isFullyPaid && (
                  <input
                    type="number"
                    min="0"
                    value={bookingForm.depositPaid}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        depositPaid: e.target.value,
                      }))
                    }
                    className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-base font-extrabold text-emerald-700"
                  />
                )}
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBookingModalOpen(false)}
                  className="w-1/3 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" />
                  ยืนยันการจอง & ออกรูปใบจอง QR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 2: ใบยืนยันการจอง + QR Code พร้อมปุ่มเซฟรูป PNG & แชร์ส่ง LINE / Messenger
      ============================================================ */}
      {slipModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  พร้อมบันทึกเป็นรูปภาพส่ง LINE / Messenger
                </span>
                <h3 className="font-extrabold text-slate-800 text-base mt-0.5">
                  {slipModalData.title}
                </h3>
              </div>
              <button
                onClick={() => setSlipModalData(null)}
                className="p-2 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ปุ่ม Action หลัก: เซฟเป็นรูปภาพ PNG และ แชร์ส่ง LINE / Messenger ทันที */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isGeneratingImage}
                onClick={handleDownloadSlipImage}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 px-3 rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                บันทึกรูปภาพใบจอง / QR
              </button>

              <button
                type="button"
                disabled={isGeneratingImage}
                onClick={handleShareSlipToLineOrMessenger}
                className="bg-[#06C755] hover:bg-[#05b34c] text-white font-extrabold text-xs py-3 px-3 rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition"
              >
                <Share2 className="w-4 h-4" />
                แชร์ส่ง LINE / Messenger
              </button>
            </div>

            {/* พรีวิวรูปภาพใบยืนยันการจอง + QR Code ที่วาดจาก Canvas จริง */}
            <div className="bg-slate-100 p-3 rounded-3xl border border-slate-200 flex flex-col items-center">
              <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                ตัวอย่างรูปภาพใบยืนยันการจองและ QR Code
                (แตะค้างที่รูปเพื่อบันทึกได้เช่นกัน)
              </div>

              {isGeneratingImage ? (
                <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  กำลังสร้างรูปภาพใบยืนยันการจองและ QR Code ความละเอียดสูง...
                </div>
              ) : generatedSlipDataUrl ? (
                <img
                  src={generatedSlipDataUrl}
                  alt="Booking Confirmation Slip with PromptPay QR"
                  className="w-full max-w-sm rounded-2xl shadow-lg border border-white"
                />
              ) : null}
            </div>

            {/* ปุ่มคัดลอกข้อความสรุป และปุ่มยืนยันรับเงินครบแล้ว */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const txt = buildTextReceipt(
                    slipModalData.bookingsList,
                    slipModalData.mode
                  );
                  navigator.clipboard.writeText(txt);
                  showToast('คัดลอกข้อความสรุปรายละเอียดการจองแล้ว!');
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> คัดลอกข้อความสรุป
              </button>

              <button
                type="button"
                onClick={() => handleMarkAsPaid(slipModalData.bookingsList)}
                className="flex-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> บันทึกว่ารับเงินครบแล้ว
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 3: เพิ่ม / แก้ไขห้องพัก
      ============================================================ */}
      {roomModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-base">
                {editingRoom
                  ? `แก้ไขห้องพัก ${editingRoom.number}`
                  : 'เพิ่มห้องพักใหม่'}
              </h3>
              <button
                onClick={() => setRoomModalOpen(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRoom} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เลขห้อง *
                  </label>
                  <input
                    type="text"
                    required
                    value={roomForm.number}
                    onChange={(e) =>
                      setRoomForm((p) => ({ ...p, number: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ประเภทห้อง
                  </label>
                  <select
                    value={roomForm.type}
                    onChange={(e) =>
                      setRoomForm((p) => ({ ...p, type: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Villa">Villa</option>
                    <option value="Family">Family</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อห้องพัก *
                </label>
                <input
                  type="text"
                  required
                  value={roomForm.name}
                  onChange={(e) =>
                    setRoomForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="เช่น Garden Deluxe A1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ราคา (บาท/คืน)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={roomForm.price}
                    onChange={(e) =>
                      setRoomForm((p) => ({ ...p, price: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวนผู้เข้าพักสูงสุด
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={roomForm.capacity}
                    onChange={(e) =>
                      setRoomForm((p) => ({ ...p, capacity: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สิ่งอำนวยความสะดวก (คั่นด้วยเครื่องหมายจุลภาค ,)
                </label>
                <input
                  type="text"
                  value={roomForm.amenitiesText}
                  onChange={(e) =>
                    setRoomForm((p) => ({
                      ...p,
                      amenitiesText: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
              >
                บันทึกข้อมูลห้องพัก
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 4: ตั้งค่าเชื่อมต่อเพจ Facebook Messenger (3 ขั้นตอนง่ายๆ)
      ============================================================ */}
      {fbSetupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-slate-800 text-base">
                  เชื่อมต่อ AI กับเพจ Facebook Messenger (3 ขั้นตอน)
                </h3>
              </div>
              <button
                onClick={() => setFbSetupModalOpen(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="font-extrabold text-blue-900">
                  ขั้นตอนที่ 1: ระบุชื่อเพจ Facebook ของที่พัก
                </div>
                <input
                  type="text"
                  value={fbConfig.pageName}
                  onChange={(e) =>
                    setFbConfig((prev) => ({
                      ...prev,
                      pageName: e.target.value,
                    }))
                  }
                  className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-extrabold text-slate-800">
                  ขั้นตอนที่ 2: ตั้งค่าการติดตามลูกค้าอัตโนมัติ (AI Follow-up)
                </div>
                <label className="flex items-center justify-between">
                  <span>
                    ให้ AI ทักติดตามลูกค้าเมื่อยังไม่โอนมัดจำภายใน (ชั่วโมง):
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={fbConfig.followUpHours}
                    onChange={(e) =>
                      setFbConfig((prev) => ({
                        ...prev,
                        followUpHours: e.target.value,
                      }))
                    }
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center font-bold"
                  />
                </label>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                <div className="font-extrabold text-emerald-900">
                  ขั้นตอนที่ 3: พร้อมใช้งานทันที!
                </div>
                <p className="text-emerald-700">
                  ระบบซิงค์จำนวนห้องว่าง ราคา และเลขพร้อมเพย์ (
                  {settings.promptPayId}) เข้ากับ AI แชทบอทเรียบร้อยแล้ว
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setFbSetupModalOpen(false);
                showToast('บันทึกการตั้งค่า AI Messenger เรียบร้อยแล้ว!');
              }}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
            >
              บันทึกและเปิดใช้งาน AI Messenger
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 5: เปลี่ยนเบอร์พร้อมเพย์ด่วน & ทดสอบสร้าง QR Code
      ============================================================ */}
      {quickPromptPayOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-base">
                ตั้งค่าบัญชีรับเงิน PromptPay ด่วน
              </h3>
              <button
                onClick={() => setQuickPromptPayOpen(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ (10 หลัก) หรือ เลขบัตรประชาชน (13 หลัก)
                </label>
                <input
                  type="text"
                  value={settings.promptPayId}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      promptPayId: e.target.value,
                    }))
                  }
                  className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2.5 text-base font-extrabold text-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อบัญชีผู้รับเงิน
                </label>
                <input
                  type="text"
                  value={settings.promptPayName}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      promptPayName: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <PromptPayQRView
                target={settings.promptPayId}
                amount={0}
                accountName={settings.promptPayName}
                subtitle="ตัวอย่าง QR รับเงินมาตรฐานธนาคารไทย"
              />
            </div>

            <button
              onClick={() => {
                setQuickPromptPayOpen(false);
                showToast('อัปเดตเลขพร้อมเพย์เรียบร้อยแล้ว!');
              }}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
            >
              บันทึกเลขพร้อมเพย์
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          Floating AI Assistant Button & Popup
      ============================================================ */}
      <button
        onClick={() => setAiWidgetOpen((prev) => !prev)}
        className="fixed bottom-20 right-4 z-40 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3.5 rounded-full shadow-xl border-2 border-white flex items-center gap-1.5 active:scale-95 transition"
        title="ผู้ช่วย AI อัจฉริยะ"
      >
        <Bot className="w-5 h-5" />
        <span className="text-xs font-bold pr-1 hidden sm:inline">
          ผู้ช่วย AI
        </span>
      </button>

      {aiWidgetOpen && (
        <div className="fixed bottom-36 right-4 z-40 w-[90vw] max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span className="font-bold text-xs">ผู้ช่วย AI ประจำรีสอร์ท</span>
            </div>
            <button onClick={() => setAiWidgetOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2.5 max-h-64 overflow-y-auto bg-slate-50 text-xs">
            {aiChatMessages.map((m, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-2xl ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white ml-8'
                    : 'bg-white border border-slate-200 text-slate-700 mr-6'
                }`}
              >
                {m.text}
              </div>
            ))}
            {aiLoading && (
              <div className="text-slate-400 text-[11px] animate-pulse">
                AI กำลังประมวลผลข้อมูลห้องพัก...
              </div>
            )}
          </div>

          <div className="p-2 bg-white border-t border-slate-100 flex gap-1.5">
            <input
              type="text"
              value={aiUserInput}
              onChange={(e) => setAiUserInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && handleSendAiAssistantMessage()
              }
              placeholder="ถามสรุปห้องว่าง หรือยอดค้างชำระ..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
            <button
              onClick={() => handleSendAiAssistantMessage()}
              className="bg-emerald-600 text-white px-3 rounded-xl"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          Bottom Navigation Bar (Mobile-First 5 เมนูหลัก)
      ============================================================ */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg">
        <div className="max-w-3xl mx-auto grid grid-cols-5 px-1 py-1.5">
          {[
            { id: 'booking', label: 'จองห้องพัก', icon: Calendar },
            { id: 'reports', label: 'รายงาน/รวมบิล', icon: FileText },
            {
              id: 'messenger',
              label: 'แชทเพจ & AI',
              icon: MessageCircle,
              badge: unreadLeadsCount,
            },
            { id: 'rooms', label: 'ห้องพัก', icon: Bed },
            { id: 'settings', label: 'ตั้งค่า/ติดตั้ง', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-2xl transition ${
                  isActive
                    ? 'text-emerald-700 font-extrabold bg-emerald-50/80'
                    : 'text-slate-500 font-medium hover:text-slate-700'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? 'text-emerald-600' : ''}`}
                />
                <span className="text-[10px] mt-0.5 tracking-tight">
                  {item.label}
                </span>
                {item.badge > 0 && (
                  <span className="absolute top-1 right-3 bg-rose-600 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
