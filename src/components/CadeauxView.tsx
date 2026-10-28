import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gift,
  Award,
  Sparkles,
  CheckCircle2,
  Sliders,
  Lock,
  Calendar,
  ShieldCheck,
  FileCheck,
  AlertCircle,
  Play,
  History,
  Bell,
  ShoppingBag,
  Plus,
  Download,
  Clock,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { BaobabLogo } from './BaobabLogo';

function apiFetch(url: string, options: RequestInit = {}, role = 'Vendeur') {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': role,
      ...(options.headers || {}),
    },
  });
}

interface CadeauxViewProps {
  currentUser: UserSession;
  pdvs: any[];
  logoUrl?: string;
  onBonUpdated?: () => void;
}

interface SemesterWeights {
  ca: number;
  regularite: number;
  versements: number;
  pdv: number;
  rigueur: number;
}

interface SemesterTiers {
  tier_10_12: number;
  tier_12_5_14_5: number;
  tier_15_17: number;
  tier_17_5_20: number;
}

interface VendorEvaluation {
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  vendor_team?: string;
  semester: string;
  closure_date: string;
  score_ca: number;
  score_regularite: number;
  score_versements: number;
  score_pdv: number;
  score_rigueur: number;
  raw_total: number;
  note_finale: number;
  is_frozen: boolean;
  eligible_for_bon: boolean;
  tier_label: string;
}

export interface FefoCatalogItem {
  id: string;
  code: string;
  name: string;
  gamme: string;
  packaging: string;
  units_per_box: number;
  price_box: number;
  stock_depot: number;
  available_fefo_boxes: number;
  next_fefo_lot: string | null;
  next_fefo_expiry: string | null;
  in_stock_non_expired: boolean;
}

export interface BonBasketLine {
  productId: string;
  code: string;
  name: string;
  gamme?: string;
  cartons: number;
  unitPrice: number;
  lineTotal: number;
  fefoLotNumber?: string | null;
  fefoExpiryDate?: string | null;
  replacedFromProductId?: string;
  replacedFromName?: string;
  replacementReason?: string;
}

interface BonCadeau {
  id: string;
  reference: string;
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  vendor_team?: string;
  semester: string;
  closure_date: string;
  note: number;
  revealed: boolean;
  revealed_at: string | null;
  issued_at: string;
  expires_at: string;
  validity_days: number;
  days_remaining: number;
  reminder_15_days?: boolean;
  is_expired?: boolean;
  status: string;
  amount?: number; // Strictly undefined before revelation!
  items?: BonBasketLine[];
  basket_total?: number;
  delivered_total?: number;
  requested_at?: string | null;
  prepared_by?: string | null;
  remis_at?: string | null;
  confirmed_reception_at?: string | null;
  prolongation_days?: number;
  prolongation_motif?: string | null;
  prolonged_by?: string | null;
  prolonged_at?: string | null;
  settlement_rule?: string;
}

interface SparkleParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
}

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 280; // Format 3:2 exact (420 x 280)
const BRUSH_SIZE = 32; // Pinceau 28-36 px
const MAX_SPARKLES = 30; // 30 paillettes max
const MEASURE_INTERVAL_MS = 150; // Mesure toutes les 150 ms
const REVEAL_THRESHOLD = 0.55; // Révélation à 55 %
const CONFETTI_COUNT = 60; // Confettis 60 particules
const CONFETTI_DURATION_MS = 2000; // 2 s

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Interactive 3:2 Scratch Card Component (Dégradés autorisés ici seulement)
const ScratchCardItem: React.FC<{
  bon: BonCadeau;
  logoUrl?: string;
  onRevealed: (updatedBon: BonCadeau) => void;
}> = ({ bon, logoUrl, onRevealed }) => {
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isRevealed, setIsRevealed] = useState<boolean>(bon.revealed);
  const [revealedAmount, setRevealedAmount] = useState<number | undefined>(bon.amount);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [isRevealingServer, setIsRevealingServer] = useState<boolean>(false);
  const [scratchPercent, setScratchPercent] = useState<number>(bon.revealed ? 100 : 0);

  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastMeasureTimeRef = useRef<number>(0);
  const revealTriggeredRef = useRef<boolean>(bon.revealed);
  const sparklesRef = useRef<SparkleParticle[]>([]);
  const confettiRef = useRef<ConfettiParticle[]>([]);
  const confettiStartRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Sync if prop updates (e.g. after reload)
  useEffect(() => {
    setIsRevealed(bon.revealed);
    if (bon.revealed && typeof bon.amount === 'number') {
      setRevealedAmount(bon.amount);
      revealTriggeredRef.current = true;
      setScratchPercent(100);
    }
  }, [bon.revealed, bon.amount]);

  // Draw the initial metallic silver scratch layer with canvas grain, reflections, and "GRATTEZ ICI"
  const initSilverLayer = useCallback(() => {
    const canvas = scratchCanvasRef.current;
    if (!canvas || bon.revealed) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Base metallic silver gradient (dégradé argenté)
    const silverGrad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    silverGrad.addColorStop(0, '#CBD5E1');
    silverGrad.addColorStop(0.25, '#F1F5F9');
    silverGrad.addColorStop(0.5, '#94A3B8');
    silverGrad.addColorStop(0.75, '#E2E8F0');
    silverGrad.addColorStop(1, '#64748B');
    ctx.fillStyle = silverGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Diagonal sheen reflections (reflets métalliques)
    const sheenGrad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
    sheenGrad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    sheenGrad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 3. Procedural canvas grain (grain canvas)
    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const grain = ((i * 1103515245 + 12345) & 0x1f) - 15;
      data[i] = Math.min(255, Math.max(0, data[i] + grain));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
    }
    ctx.putImageData(imgData, 0, 0);

    // 4. Inner border & "GRATTEZ ICI" typography
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, CANVAS_WIDTH - 28, CANVAS_HEIGHT - 28);

    ctx.fillStyle = '#1E293B';
    ctx.font = '900 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRATTEZ ICI', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);

    ctx.fillStyle = '#334155';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Frottez avec le doigt ou la souris pour découvrir votre bon', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22);
  }, [bon.revealed]);

  useEffect(() => {
    initSilverLayer();
  }, [initSilverLayer]);

  // Animation loop for sparkles (max 30) & confetti (60 particles, 2 s)
  const runFxLoop = useCallback(() => {
    const fxCanvas = fxCanvasRef.current;
    if (!fxCanvas) return;
    const ctx = fxCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    let hasActiveParticles = false;

    // 1. Render Sparkles (30 max)
    if (sparklesRef.current.length > 0) {
      const nextSparkles: SparkleParticle[] = [];
      for (const sp of sparklesRef.current) {
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.alpha -= 0.045;
        if (sp.alpha > 0) {
          nextSparkles.push(sp);
          ctx.save();
          ctx.globalAlpha = Math.max(0, sp.alpha);
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      sparklesRef.current = nextSparkles;
      if (nextSparkles.length > 0) hasActiveParticles = true;
    }

    // 2. Render Confetti (60 particles, 2000 ms)
    if (confettiStartRef.current !== null && confettiRef.current.length > 0) {
      const elapsed = performance.now() - confettiStartRef.current;
      if (elapsed < CONFETTI_DURATION_MS) {
        hasActiveParticles = true;
        const fadeRatio = elapsed > 1500 ? Math.max(0, 1 - (elapsed - 1500) / 500) : 1;
        for (const c of confettiRef.current) {
          c.x += c.vx;
          c.y += c.vy;
          c.vy += 0.12; // gravity
          c.rotation += c.vRot;

          ctx.save();
          ctx.globalAlpha = fadeRatio;
          ctx.translate(c.x, c.y);
          ctx.rotate(c.rotation);
          ctx.fillStyle = c.color;
          ctx.fillRect(-c.size / 2, -c.size / 3, c.size, c.size * 0.66);
          ctx.restore();
        }
      } else {
        confettiRef.current = [];
        confettiStartRef.current = null;
      }
    }

    if (hasActiveParticles) {
      rafIdRef.current = requestAnimationFrame(runFxLoop);
    } else {
      rafIdRef.current = null;
    }
  }, []);

  const ensureFxAnimation = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(runFxLoop);
    }
  }, [runFxLoop]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Spawn 60 confetti particles for 2 seconds
  const triggerConfetti = useCallback(() => {
    if (prefersReducedMotion()) return;
    const colors = ['#008DA9', '#F59E0B', '#10B981', '#EC4899', '#3B82F6', '#EAB308'];
    const particles: ConfettiParticle[] = [];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + (Math.random() - 0.5) * 0.3;
      const speed = 2.2 + Math.random() * 4.2;
      particles.push({
        x: CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 60,
        y: CANVAS_HEIGHT / 2 + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.4,
        size: 6 + Math.random() * 5,
        color: colors[i % colors.length],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
      });
    }
    confettiRef.current = particles;
    confettiStartRef.current = performance.now();
    ensureFxAnimation();
  }, [ensureFxAnimation]);

  // Spawn sparkles while scratching (capped strictly at 30 max)
  const spawnSparklesAt = useCallback(
    (x: number, y: number) => {
      if (prefersReducedMotion()) return;
      const availableSlots = MAX_SPARKLES - sparklesRef.current.length;
      if (availableSlots <= 0) return;
      const toAdd = Math.min(2, availableSlots);
      const colors = ['#FEF08A', '#FDE047', '#FFFFFF', '#BAE6FD'];
      for (let i = 0; i < toAdd; i++) {
        sparklesRef.current.push({
          id: Date.now() + Math.random(),
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 2.2,
          vy: (Math.random() - 0.5) * 2.2 - 0.5,
          size: 2 + Math.random() * 2.5,
          alpha: 1,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      ensureFxAnimation();
    },
    [ensureFxAnimation]
  );

  // Server call: POST /bons/:id/reveler + 300ms fade out + confetti (60 particles, 2s)
  const triggerServerReveal = useCallback(async () => {
    if (revealTriggeredRef.current || isRevealingServer) return;
    revealTriggeredRef.current = true;
    setIsRevealingServer(true);

    // Vibration courte
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch {
      // ignore if unsupported
    }

    try {
      const response = await apiFetch(`/bons/${bon.id}/reveler`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success && data.bon) {
        setRevealedAmount(data.bon.amount);
        // Fondu 300 ms
        setIsFadingOut(true);
        triggerConfetti();
        setTimeout(() => {
          setIsRevealed(true);
          setScratchPercent(100);
          onRevealed(data.bon);
        }, 300);
      } else {
        revealTriggeredRef.current = false;
      }
    } catch {
      revealTriggeredRef.current = false;
    } finally {
      setIsRevealingServer(false);
    }
  }, [bon.id, isRevealingServer, onRevealed, triggerConfetti]);

  // Measure scratched percentage every 150 ms
  const measureScratchedArea = useCallback(() => {
    const now = performance.now();
    if (now - lastMeasureTimeRef.current < MEASURE_INTERVAL_MS) return;
    lastMeasureTimeRef.current = now;

    const canvas = scratchCanvasRef.current;
    if (!canvas || revealTriggeredRef.current) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels = imgData.data;
    let transparentCount = 0;
    let totalSampled = 0;

    // Sample every 4th pixel on X and Y for ultra-smooth mid-range mobile speed
    const step = 4;
    for (let y = 0; y < CANVAS_HEIGHT; y += step) {
      for (let x = 0; x < CANVAS_WIDTH; x += step) {
        const alphaIdx = (y * CANVAS_WIDTH + x) * 4 + 3;
        totalSampled++;
        if (pixels[alphaIdx] < 128) {
          transparentCount++;
        }
      }
    }

    const ratio = totalSampled > 0 ? transparentCount / totalSampled : 0;
    const pct = Math.min(100, Math.round(ratio * 100));
    setScratchPercent(pct);

    if (ratio >= REVEAL_THRESHOLD) {
      triggerServerReveal();
    }
  }, [triggerServerReveal]);

  // Interpolated brush stroke with destination-out (pinceau 28-36 px)
  const scratchLine = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      const canvas = scratchCanvasRef.current;
      if (!canvas || revealTriggeredRef.current) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = BRUSH_SIZE; // 32 px (in 28-36 px range)

      // Tracé interpolé
      const dist = Math.hypot(toX - fromX, toY - fromY);
      const steps = Math.max(1, Math.ceil(dist / 6));
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ix = fromX + (toX - fromX) * t;
        const iy = fromY + (toY - fromY) * t;
        ctx.lineTo(ix, iy);
      }
      ctx.stroke();
      ctx.restore();

      spawnSparklesAt(toX, toY);
      measureScratchedArea();
    },
    [measureScratchedArea, spawnSparklesAt]
  );

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = scratchCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isRevealed || revealTriggeredRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;

    // Short tactile vibration on touch start
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {
      // ignore
    }

    scratchLine(pt.x, pt.y, pt.x + 0.1, pt.y + 0.1);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || isRevealed || revealTriggeredRef.current) return;
    const pt = getCanvasCoords(e);
    const prev = lastPointRef.current || pt;
    scratchLine(prev.x, prev.y, pt.x, pt.y);
    lastPointRef.current = pt;
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    measureScratchedArea();
  };

  const semesterDisplay =
    bon.semester === 'S1-2026'
      ? '1er Semestre 2026 (Clôture 1er Juillet)'
      : bon.semester === 'S2-2026'
      ? '2e Semestre 2026 (Clôture 1er Janvier)'
      : bon.semester;

  return (
    <div className="w-full max-w-[420px] mx-auto space-y-3">
      {/* CARTE À GRATTER : format 3:2, max 420 px, dégradés autorisés ici seulement */}
      <div
        className="relative w-full max-w-[420px] aspect-[3/2] rounded-2xl overflow-hidden shadow-md border border-amber-300/80 select-none"
        style={{
          backgroundImage: 'linear-gradient(135deg, #042f2e 0%, #0f766e 50%, #0369a1 100%)',
        }}
      >
        {/* Top bar: Logo, Semestre, Note /20 */}
        <div className="relative z-10 flex items-center justify-between px-4 py-2.5 bg-black/25 border-b border-white/15 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/95 p-0.5 flex items-center justify-center shrink-0">
              <BaobabLogo logoUrl={logoUrl} size={22} />
            </div>
            <div className="truncate">
              <div className="text-[11px] font-black tracking-wide uppercase text-amber-300 leading-tight">
                Baobab Distribution
              </div>
              <div className="text-[10px] text-white/90 font-semibold truncate">{semesterDisplay}</div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-xs">
            <Award className="w-3.5 h-3.5" />
            <span>Note : {bon.note} / 20</span>
          </div>
        </div>

        {/* Prize Zone Underneath (Montant absent du DOM et du réseau avant révélation !) */}
        <div className="relative z-0 h-[calc(100%-48px)] flex flex-col items-center justify-center p-4 text-center text-white">
          {typeof revealedAmount === 'number' ? (
            <div className="space-y-1.5 animate-fade-in">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Bon Cadeau Semestriel Révélé
              </div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-amber-300 drop-shadow-xs">
                {revealedAmount.toLocaleString('fr-FR')} FCFA
              </div>
              <div className="text-[11px] text-white/90 font-medium">
                Réf : <span className="font-mono font-bold">{bon.reference}</span> &bull; Valable 90 jours (jusqu'au{' '}
                {bon.expires_at})
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Gift className="w-8 h-8 text-amber-300 mx-auto opacity-80" />
              <div className="text-sm font-bold text-white/90">
                {isRevealingServer ? 'Révélation sécurisée en cours...' : 'Grattez la zone argentée'}
              </div>
              <div className="text-[11px] text-white/75">
                Réf : {bon.reference} &bull; Validité 90 jours ({bon.days_remaining} j restants)
              </div>
            </div>
          )}
        </div>

        {/* Couche Argentée Canvas (touch-action: none SEULEMENT sur le canvas) */}
        {!isRevealed && (
          <canvas
            ref={scratchCanvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            style={{ touchAction: 'none' }}
            className={`absolute inset-x-0 bottom-0 top-[48px] w-full h-[calc(100%-48px)] cursor-crosshair transition-opacity duration-300 ${
              isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            aria-label={`Carte à gratter du semestre ${bon.semester}, note ${bon.note} sur 20`}
          />
        )}

        {/* FX Canvas for Sparkles (max 30) & Confetti (60 particles, 2 s) */}
        <canvas
          ref={fxCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        />
      </div>

      {/* Controls under card: Progress & Bouton "Révéler" 48 px + Clavier Entrée ou Espace */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {isRevealed ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Bon révélé ({revealedAmount?.toLocaleString('fr-FR')} FCFA) &bull; Valable {bon.days_remaining} j
            </span>
          ) : (
            <span>
              Surface grattée : <strong>{scratchPercent}%</strong>{' '}
              <span className="text-slate-400">(auto à 55%)</span>
            </span>
          )}
        </div>

        {!isRevealed && (
          <button
            type="button"
            disabled={isRevealingServer}
            onClick={() => triggerServerReveal()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerServerReveal();
              }
            }}
            className="h-12 min-h-[48px] px-5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-[#008DA9] focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Révéler</span>
          </button>
        )}
      </div>
    </div>
  );
};

// Component for Vendeur to compose FEFO basket line-by-line after revelation, send "Demander le retrait", and confirm reception
const BonBasketComposer: React.FC<{
  bon: BonCadeau;
  fefoCatalog: FefoCatalogItem[];
  currentUserRole: string;
  onUpdated: () => void;
}> = ({ bon, fefoCatalog, currentUserRole, onUpdated }) => {
  const bonAmount = Number(bon.amount || 0);
  const existingItems = bon.items || [];
  const isEditable =
    !bon.is_expired &&
    bon.status !== 'Remis' &&
    bon.status !== 'Reçu' &&
    bon.status !== 'Expiré';

  const [validatedLines, setValidatedLines] = useState<BonBasketLine[]>(existingItems);
  const [currentProductId, setCurrentProductId] = useState<string>('');
  const [currentCartons, setCurrentCartons] = useState<number>(1);
  const [isAddingLine, setIsAddingLine] = useState<boolean>(existingItems.length === 0);
  const [builderError, setBuilderError] = useState<string>('');
  const [builderSuccess, setBuilderSuccess] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmingReception, setConfirmingReception] = useState<boolean>(false);

  useEffect(() => {
    if (bon.items && bon.items.length > 0) {
      setValidatedLines(bon.items);
      setIsAddingLine(false);
    }
  }, [bon.items]);

  const currentBasketTotal = validatedLines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  const remainingBudget = Math.max(0, bonAmount - currentBasketTotal);

  // Only non-expired FEFO products in stock that are not already in validatedLines and whose unit price <= remainingBudget
  const availableFefoProducts = fefoCatalog.filter(
    (p) =>
      p.in_stock_non_expired &&
      p.available_fefo_boxes > 0 &&
      !validatedLines.some((l) => l.productId === p.id)
  );

  useEffect(() => {
    if (isAddingLine && availableFefoProducts.length > 0) {
      const stillValid = availableFefoProducts.some((p) => p.id === currentProductId);
      if (!currentProductId || !stillValid) {
        const affordable = availableFefoProducts.find((p) => p.price_box <= remainingBudget) || availableFefoProducts[0];
        setCurrentProductId(affordable.id);
        const maxByBudget = Math.max(1, Math.floor(remainingBudget / affordable.price_box));
        setCurrentCartons(Math.min(1, maxByBudget, affordable.available_fefo_boxes));
      }
    }
  }, [isAddingLine, availableFefoProducts, currentProductId, remainingBudget]);

  const selectedProduct = fefoCatalog.find((p) => p.id === currentProductId);
  const maxCartonsByBudget = selectedProduct
    ? Math.floor(remainingBudget / selectedProduct.price_box)
    : 0;
  const maxAllowedCartons = selectedProduct
    ? Math.min(selectedProduct.available_fefo_boxes, maxCartonsByBudget)
    : 0;

  // Step 1: "Valider ce choix"
  const handleValidateChoice = () => {
    setBuilderError('');
    setBuilderSuccess('');
    if (!selectedProduct) {
      setBuilderError('Veuillez choisir un produit en stock non périmé (FEFO).');
      return;
    }
    if (!selectedProduct.in_stock_non_expired || selectedProduct.available_fefo_boxes <= 0) {
      setBuilderError('Ce produit est en rupture de lot non périmé (FEFO).');
      return;
    }
    if (validatedLines.some((l) => l.productId === selectedProduct.id)) {
      setBuilderError('Ce produit figure déjà dans votre panier.');
      return;
    }
    if (currentCartons <= 0) {
      setBuilderError('Veuillez saisir au moins 1 carton.');
      return;
    }
    if (currentCartons > selectedProduct.available_fefo_boxes) {
      setBuilderError(
        `Stock FEFO non périmé insuffisant (${selectedProduct.available_fefo_boxes} cartons disponibles).`
      );
      return;
    }
    const lineTotal = currentCartons * selectedProduct.price_box;
    if (currentBasketTotal + lineTotal > bonAmount) {
      setBuilderError(
        `Plafond dépassé : ce choix (${lineTotal.toLocaleString('fr-FR')} FCFA) porterait le panier à ${(
          currentBasketTotal + lineTotal
        ).toLocaleString('fr-FR')} FCFA, au-delà de la valeur du bon (${bonAmount.toLocaleString('fr-FR')} FCFA).`
      );
      return;
    }

    const newLine: BonBasketLine = {
      productId: selectedProduct.id,
      code: selectedProduct.code,
      name: selectedProduct.name,
      gamme: selectedProduct.gamme,
      cartons: currentCartons,
      unitPrice: selectedProduct.price_box,
      lineTotal,
      fefoLotNumber: selectedProduct.next_fefo_lot,
      fefoExpiryDate: selectedProduct.next_fefo_expiry,
    };

    setValidatedLines((prev) => [...prev, newLine]);
    setIsAddingLine(false);
    setCurrentProductId('');
  };

  // Step 2: "+ Ajouter un produit"
  const handleStartAddProduct = () => {
    setBuilderError('');
    setBuilderSuccess('');
    setIsAddingLine(true);
  };

  const handleRemoveLine = (idx: number) => {
    setBuilderError('');
    setBuilderSuccess('');
    setValidatedLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Quick preset helper for 38 400 FCFA on a 40 000 FCFA bon (4 cartons Jus Cajoucy x 9 600 = 38 400 FCFA)
  const handleQuickPreset38400 = () => {
    setBuilderError('');
    setBuilderSuccess('');
    const caj = fefoCatalog.find((p) => p.code === 'JUS-CAJ-12' || p.id === 'prod-caj');
    if (!caj || caj.available_fefo_boxes < 4) {
      setBuilderError('Stock FEFO Jus Cajoucy insuffisant pour composer 4 cartons (38 400 FCFA).');
      return;
    }
    setValidatedLines([
      {
        productId: caj.id,
        code: caj.code,
        name: caj.name,
        gamme: caj.gamme,
        cartons: 4,
        unitPrice: caj.price_box,
        lineTotal: 4 * caj.price_box,
        fefoLotNumber: caj.next_fefo_lot,
        fefoExpiryDate: caj.next_fefo_expiry,
      },
    ]);
    setIsAddingLine(false);
  };

  // Step 3: Envoi "Demander le retrait" (statut "À préparer")
  const handleRequestWithdrawal = async () => {
    setBuilderError('');
    setBuilderSuccess('');
    if (validatedLines.length === 0) {
      setBuilderError('Veuillez valider au moins un produit ("Valider ce choix") avant de demander le retrait.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await apiFetch(
        `/api/bons/${bon.id}/demander-retrait`,
        {
          method: 'POST',
          body: JSON.stringify({ items: validatedLines }),
        },
        currentUserRole
      );
      const data = await res.json();
      if (data.success) {
        setBuilderSuccess(data.message);
        onUpdated();
      } else {
        setBuilderError(data.error || 'Erreur lors de la demande de retrait.');
      }
    } catch {
      setBuilderError('Erreur réseau.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 4: Le Vendeur confirme la réception
  const handleConfirmReception = async () => {
    setBuilderError('');
    setBuilderSuccess('');
    try {
      setConfirmingReception(true);
      const res = await apiFetch(
        `/api/bons/${bon.id}/confirmer-reception`,
        {
          method: 'POST',
        },
        currentUserRole
      );
      const data = await res.json();
      if (data.success) {
        setBuilderSuccess(data.message);
        onUpdated();
      } else {
        setBuilderError(data.error || 'Erreur lors de la confirmation de réception.');
      }
    } catch {
      setBuilderError('Erreur réseau.');
    } finally {
      setConfirmingReception(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3.5 text-xs">
      {/* Rappel 15 jours avant expiration ou Bon expiré après 90 jours */}
      {bon.reminder_15_days && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center gap-2 font-bold">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Rappel (15 jours avant expiration) : Ce bon expire dans {bon.days_remaining} jour
            {bon.days_remaining > 1 ? 's' : ''} (échéance : {bon.expires_at}).
          </span>
        </div>
      )}

      {bon.is_expired && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 flex items-center gap-2 font-bold">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            Bon expiré après 90 jours (échéance dépassée : {bon.expires_at}). Seul l&apos;Administrateur peut le
            prolonger avec un motif.
          </span>
        </div>
      )}

      {bon.prolongation_motif && (
        <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 text-[11px]">
          <strong>Prolongé par l&apos;Administrateur (+{bon.prolongation_days} j) :</strong> Motif : &laquo;{' '}
          {bon.prolongation_motif} &raquo; &bull; Nouvelle échéance : {bon.expires_at}.
        </div>
      )}

      {/* En-tête du panier bon cadeau */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-[#008DA9]" />
          <span className="font-black text-slate-900 dark:text-white">
            Panier du Catalogue (Valorisé au prix de vente &bull; FEFO non périmé)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
              bon.status === 'Reçu'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : bon.status === 'Remis'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                : bon.status === 'À préparer'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : bon.is_expired
                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
            }`}
          >
            Statut : {bon.status === 'actif' ? 'Révélé — Panier à composer' : bon.status}
          </span>
        </div>
      </div>

      {/* Plafond valeur du bon & Règle "Rien en espèces" */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-bold uppercase text-slate-400">Plafond Valeur du Bon</div>
          <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
            {bonAmount.toLocaleString('fr-FR')} FCFA
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Panier (Prix de vente)</div>
          <div className="text-sm font-black text-[#008DA9] mt-0.5">
            {currentBasketTotal.toLocaleString('fr-FR')} FCFA
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-bold uppercase text-slate-400">Reliquat non utilisé</div>
          <div className="text-sm font-black text-amber-700 dark:text-amber-400 mt-0.5">
            {remainingBudget.toLocaleString('fr-FR')} FCFA{' '}
            <span className="text-[10px] font-bold text-slate-500">(Rien en espèces)</span>
          </div>
        </div>
      </div>

      {builderError && (
        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 font-bold">
          {builderError}
        </div>
      )}

      {builderSuccess && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">
          {builderSuccess}
        </div>
      )}

      {/* Lignes validées dans le panier */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-700 dark:text-slate-300">
            Lignes du panier ({validatedLines.length}) :
          </span>
          {isEditable && bonAmount === 40000 && (
            <button
              type="button"
              onClick={handleQuickPreset38400}
              className="text-[11px] font-bold text-[#008DA9] underline hover:opacity-80 cursor-pointer"
            >
              Pré-remplir panier 38 400 FCFA (4 ctn Jus Cajoucy)
            </button>
          )}
        </div>

        {validatedLines.length === 0 ? (
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-400">
            Aucun produit validé dans le panier. Sélectionnez un produit en stock non périmé (FEFO) puis cliquez sur
            &laquo; Valider ce choix &raquo;.
          </div>
        ) : (
          <div className="space-y-1.5">
            {validatedLines.map((line, idx) => (
              <div
                key={`${line.productId}-${idx}`}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 dark:text-white">{line.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                      {line.code}
                    </span>
                    {line.fefoLotNumber && (
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                        Lot FEFO: {line.fefoLotNumber} (exp. {line.fefoExpiryDate})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {line.cartons} carton{line.cartons > 1 ? 's' : ''} &times;{' '}
                    {Number(line.unitPrice).toLocaleString('fr-FR')} FCFA (prix de vente)
                  </div>
                  {line.replacedFromName && (
                    <div className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      <span>
                        Rupture : remplacement proposé à la place de &laquo; {line.replacedFromName} &raquo; (
                        {line.replacementReason || 'Rupture stock'})
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="font-black text-slate-900 dark:text-white">
                    {Number(line.lineTotal).toLocaleString('fr-FR')} FCFA
                  </span>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Constructeur ligne par ligne : "Valider ce choix" puis "+ Ajouter un produit" */}
      {isEditable && (
        <div className="space-y-3 pt-1">
          {isAddingLine ? (
            <div className="p-3 rounded-xl border border-dashed border-[#008DA9] bg-white dark:bg-slate-900 space-y-2.5">
              <div className="text-[11px] font-bold text-[#008DA9]">
                Ajouter une ligne au panier (Produits en stock non périmés FEFO uniquement)
              </div>

              {availableFefoProducts.length === 0 ? (
                <div className="text-slate-400 py-1">
                  Tous les produits en stock non périmés ont déjà été ajoutés au panier.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Produit en stock non périmé (FEFO)
                    </label>
                    <select
                      value={currentProductId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setCurrentProductId(nextId);
                        const prod = fefoCatalog.find((p) => p.id === nextId);
                        if (prod) {
                          const maxB = Math.max(1, Math.floor(remainingBudget / prod.price_box));
                          setCurrentCartons(Math.min(1, maxB, prod.available_fefo_boxes));
                        }
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                    >
                      {availableFefoProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code}) — {p.price_box.toLocaleString('fr-FR')} FCFA/ctn — FEFO dispo:{' '}
                          {p.available_fefo_boxes} ctn (Lot {p.next_fefo_lot})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Cartons (Max budget: {Math.max(0, maxAllowedCartons)})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, maxAllowedCartons)}
                      value={currentCartons}
                      onChange={(e) => setCurrentCartons(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-slate-500">
                  {selectedProduct && (
                    <span>
                      Sous-total ligne :{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {(currentCartons * selectedProduct.price_box).toLocaleString('fr-FR')} FCFA
                      </strong>{' '}
                      &bull; Lot FEFO : <strong>{selectedProduct.next_fefo_lot}</strong>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleValidateChoice}
                  className="px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs transition cursor-pointer"
                >
                  Valider ce choix
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartAddProduct}
              disabled={availableFefoProducts.length === 0 || remainingBudget <= 0}
              className="w-full py-2 rounded-xl border border-dashed border-[#008DA9] text-[#008DA9] dark:text-teal-300 hover:bg-[#008DA9]/5 font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Ajouter un produit</span>
            </button>
          )}

          {/* Bouton d'envoi "Demander le retrait" (statut "À préparer") */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-[11px] text-slate-500">
              Aucun rendu de monnaie sur le reliquat (<strong>Rien en espèces</strong>).
            </span>
            <button
              type="button"
              disabled={submitting || validatedLines.length === 0}
              onClick={handleRequestWithdrawal}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{submitting ? 'Envoi en cours...' : 'Demander le retrait'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation de réception par le Vendeur après que le Magasinier a confirmé "Remise effectuée" */}
      {bon.status === 'Remis' && (
        <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-blue-600" />
              <span>Remise effectuée par le Magasinier ({bon.delivered_total?.toLocaleString('fr-FR')} FCFA)</span>
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300">
              Sortie de stock de type &laquo; Bon cadeau &raquo; validée au dépôt. Confirmez la réception physique de
              vos produits.
            </p>
          </div>
          <button
            type="button"
            disabled={confirmingReception}
            onClick={handleConfirmReception}
            className="px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shrink-0 cursor-pointer disabled:opacity-50"
          >
            {confirmingReception ? 'Confirmation...' : 'Confirmer la réception'}
          </button>
        </div>
      )}

      {bon.status === 'Reçu' && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-emerald-900 dark:text-emerald-200 font-bold">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Réception confirmée par le Vendeur (Valeur remise :{' '}
            {Number(bon.delivered_total || bon.basket_total || 0).toLocaleString('fr-FR')} FCFA &bull; Rien en espèces)
          </span>
          {bon.confirmed_reception_at && (
            <span className="text-[10px] font-mono">
              {String(bon.confirmed_reception_at).replace('T', ' ').slice(0, 16)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const CadeauxView: React.FC<CadeauxViewProps> = ({ currentUser, logoUrl, onBonUpdated }) => {
  const isVendeur = currentUser.role === 'Vendeur';
  const isAdmin = currentUser.role === 'Administrateur';

  const [loading, setLoading] = useState<boolean>(true);
  const [weights, setWeights] = useState<SemesterWeights>({
    ca: 8,
    regularite: 4,
    versements: 4,
    pdv: 2,
    rigueur: 2,
  });
  const [tiers, setTiers] = useState<SemesterTiers>({
    tier_10_12: 10000,
    tier_12_5_14_5: 20000,
    tier_15_17: 40000,
    tier_17_5_20: 75000,
  });
  const [evaluations, setEvaluations] = useState<VendorEvaluation[]>([]);
  const [bons, setBons] = useState<BonCadeau[]>([]);
  const [fefoCatalog, setFefoCatalog] = useState<FefoCatalogItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('S1-2026');

  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [panierTestSummary, setPanierTestSummary] = useState<any | null>(null);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [closingSemester, setClosingSemester] = useState<boolean>(false);

  // Prolongation modal state for Administrateur
  const [prolongingBon, setProlongingBon] = useState<BonCadeau | null>(null);
  const [prolongExtraDays, setProlongExtraDays] = useState<number>(30);
  const [prolongMotif, setProlongMotif] = useState<string>('Déplacement tournée régionale — délai supplémentaire accordé');
  const [isProlonging, setIsProlonging] = useState<boolean>(false);

  const fetchBonsData = useCallback(async () => {
    try {
      setLoading(true);
      const query = isVendeur ? `?vendorId=${encodeURIComponent(currentUser.id)}` : '';
      const res = await apiFetch(`/api/bons${query}`, {}, currentUser.role);
      const data = await res.json();
      if (data.success) {
        setWeights(data.weights);
        setTiers(data.tiers);
        setEvaluations(data.evaluations || []);
        setBons(data.bons || []);
        setFefoCatalog(data.fefoCatalog || []);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (e) {
      console.error('Error loading bons data:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.role, isVendeur]);

  useEffect(() => {
    fetchBonsData();
  }, [fetchBonsData]);

  const handleBonRevealed = (updatedBon: BonCadeau) => {
    setBons((prev) => prev.map((b) => (b.id === updatedBon.id ? updatedBon : b)));
    fetchBonsData();
    if (onBonUpdated) onBonUpdated();
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    const totalWeight =
      Number(weights.ca) +
      Number(weights.regularite) +
      Number(weights.versements) +
      Number(weights.pdv) +
      Number(weights.rigueur);

    if (Math.abs(totalWeight - 20) > 0.01) {
      setStatusBanner({
        type: 'error',
        text: `Le total des pondérations doit être exactement 20 (actuellement : ${totalWeight}/20).`,
      });
      return;
    }

    try {
      setSavingConfig(true);
      const res = await apiFetch(
        '/api/bons/config',
        {
          method: 'PUT',
          body: JSON.stringify({ weights, tiers }),
        },
        currentUser.role
      );
      const data = await res.json();
      if (data.success) {
        setStatusBanner({ type: 'success', text: data.message });
        fetchBonsData();
      } else {
        setStatusBanner({ type: 'error', text: data.error || 'Erreur lors de la sauvegarde.' });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Erreur réseau.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCloseSemester = async (sem: string) => {
    setStatusBanner(null);
    try {
      setClosingSemester(true);
      const res = await apiFetch(
        '/api/bons/cloturer',
        {
          method: 'POST',
          body: JSON.stringify({ semester: sem }),
        },
        currentUser.role
      );
      const data = await res.json();
      if (data.success) {
        setStatusBanner({ type: 'success', text: data.message });
        fetchBonsData();
        if (onBonUpdated) onBonUpdated();
      } else {
        setStatusBanner({ type: 'error', text: data.error || 'Erreur lors de la clôture.' });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Erreur réseau.' });
    } finally {
      setClosingSemester(false);
    }
  };

  const handleRunTestBareme = async () => {
    setStatusBanner(null);
    try {
      const res = await apiFetch(
        '/api/bons/test-bareme',
        {
          method: 'POST',
        },
        currentUser.role
      );
      const data = await res.json();
      setTestResults(data.results || []);
      setStatusBanner({
        type: data.success ? 'success' : 'error',
        text: data.message,
      });
      fetchBonsData();
    } catch {
      setStatusBanner({ type: 'error', text: 'Erreur lors du test.' });
    }
  };

  // Test : bon de 40 000, panier de 38 400, remise, stock en baisse
  const handleRunTestPanierRemise = async () => {
    setStatusBanner(null);
    try {
      const res = await apiFetch(
        '/api/bons/test-panier-remise',
        {
          method: 'POST',
        },
        currentUser.role
      );
      const data = await res.json();
      if (data.success) {
        setPanierTestSummary(data.testSummary);
        setStatusBanner({ type: 'success', text: data.message });
        fetchBonsData();
        if (onBonUpdated) onBonUpdated();
      } else {
        setStatusBanner({ type: 'error', text: data.error || 'Erreur lors du test panier/remise.' });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Erreur réseau lors du test panier/remise.' });
    }
  };

  // Prolongation par l'Administrateur avec motif
  const handleProlongSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prolongingBon) return;
    if (!prolongMotif.trim()) {
      setStatusBanner({ type: 'error', text: 'Le motif est obligatoire pour prolonger un bon cadeau.' });
      return;
    }
    try {
      setIsProlonging(true);
      const res = await apiFetch(
        `/api/bons/${prolongingBon.id}/prolonger`,
        {
          method: 'POST',
          body: JSON.stringify({
            extraDays: prolongExtraDays,
            motif: prolongMotif.trim(),
          }),
        },
        'Administrateur'
      );
      const data = await res.json();
      if (data.success) {
        setStatusBanner({ type: 'success', text: data.message });
        setProlongingBon(null);
        fetchBonsData();
        if (onBonUpdated) onBonUpdated();
      } else {
        setStatusBanner({ type: 'error', text: data.error || 'Erreur lors de la prolongation.' });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Erreur réseau.' });
    } finally {
      setIsProlonging(false);
    }
  };

  // Export CSV du tableau du semestre pour l'Administrateur
  const handleExportAdminSemesterCSV = () => {
    const semEvaluations = evaluations.filter((ev) => ev.semester === selectedSemester);
    const headers = [
      'Semestre',
      'Date Cloture',
      'Code Vendeur',
      'Nom Vendeur',
      'Equipe',
      'CA vs Objectif',
      'Regularite',
      'Versements Delais',
      'Nouveaux PDV',
      'Rigueur',
      'Note / 20',
      'Reference Bon',
      'Valeur Bon (FCFA)',
      'Panier Compose (FCFA)',
      'Valeur Remise (FCFA)',
      'Statut Bon',
      'Echeance (90j)',
      'Motif Prolongation',
      'Regle Especes',
    ];

    const rows = semEvaluations.map((ev) => {
      const b = bons.find((bon) => bon.vendor_id === ev.vendor_id && bon.semester === ev.semester);
      return [
        `"${ev.semester}"`,
        `"${ev.closure_date}"`,
        `"${ev.vendor_code}"`,
        `"${ev.vendor_name}"`,
        `"${ev.vendor_team || ''}"`,
        ev.score_ca,
        ev.score_regularite,
        ev.score_versements,
        ev.score_pdv,
        ev.score_rigueur,
        ev.note_finale,
        `"${b?.reference || 'Aucun bon'}"`,
        b?.revealed && typeof b.amount === 'number' ? b.amount : b ? 'Non revele' : 0,
        b?.basket_total || 0,
        b?.delivered_total || 0,
        `"${b?.status || 'Sans bon'}"`,
        `"${b?.expires_at || '-'}"`,
        `"${(b?.prolongation_motif || '').replace(/"/g, '""')}"`,
        '"Rien en especes"',
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tableau_semestre_${selectedSemester}_baobab.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const unrevealedVendorBons = bons.filter((b) => !b.revealed);
  const filteredEvaluations = evaluations.filter((ev) => ev.semester === selectedSemester);
  const totalWeightsSum =
    Number(weights.ca) +
    Number(weights.regularite) +
    Number(weights.versements) +
    Number(weights.pdv) +
    Number(weights.rigueur);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? 'Mes Cadeaux, Carte à Gratter & Retrait Panier'
                : 'Tableau du Semestre, Paliers de Bon & Bons Cadeaux'}
            </h1>
            {unrevealedVendorBons.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-600 text-white">
                <Bell className="w-3.5 h-3.5" />
                {unrevealedVendorBons.length} carte{unrevealedVendorBons.length > 1 ? 's' : ''} à gratter
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Panier valorisé au prix de vente (FEFO non périmé), plafonné au bon &bull; Rien en espèces &bull; Valable 90
            jours (rappel 15 j avant).
          </p>
        </div>

        {/* Boutons de Tests Réglementaires */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunTestPanierRemise}
            className="px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs"
          >
            <Play className="w-3.5 h-3.5 text-white" />
            <span>Test : bon de 40 000, panier de 38 400, remise, stock en baisse</span>
          </button>

          <button
            type="button"
            onClick={handleRunTestBareme}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tester : 16/20 → 40 000 | 8/20 → Aucun bon</span>
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {statusBanner && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline opacity-75 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Résultat du test : bon de 40 000, panier de 38 400, remise, stock en baisse */}
      {panierTestSummary && (
        <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-[#008DA9] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Vérification : Bon de 40 000 FCFA &rarr; Panier de 38 400 FCFA &rarr; Remise effectuée &rarr; Stock en
              baisse
            </div>
            <button
              type="button"
              onClick={() => setPanierTestSummary(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Masquer
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">1. Valeur du Bon</div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                {Number(panierTestSummary.bonAmount).toLocaleString('fr-FR')} FCFA
              </div>
              <div className="text-[11px] text-slate-500">
                {panierTestSummary.bonReference} ({panierTestSummary.vendorName})
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">2. Panier FEFO (Prix de vente)</div>
              <div className="text-base font-black text-[#008DA9] mt-0.5">
                {Number(panierTestSummary.basketTotal).toLocaleString('fr-FR')} FCFA
              </div>
              <div className="text-[11px] text-slate-500">
                {panierTestSummary.cartonsDelivered} ctn {panierTestSummary.productName} &times;{' '}
                {Number(panierTestSummary.unitPrice).toLocaleString('fr-FR')} FCFA
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">3. Sortie Stock &laquo; Bon cadeau &raquo;</div>
              <div className="text-base font-black text-emerald-600 mt-0.5">
                {Number(panierTestSummary.deliveredValue).toLocaleString('fr-FR')} FCFA
              </div>
              <div className="text-[11px] text-slate-500">
                Reliquat {Number(panierTestSummary.unspentRemainder).toLocaleString('fr-FR')} FCFA :{' '}
                <strong>{panierTestSummary.settlementRule}</strong>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">4. Stock Dépôt en baisse</div>
              <div className="text-base font-black text-amber-600 mt-0.5">
                {panierTestSummary.stockBefore} ctn &rarr; {panierTestSummary.stockAfter} ctn (-
                {panierTestSummary.stockDrop} ctn)
              </div>
              <div className="text-[11px] text-slate-500">Lot FEFO déduit : {panierTestSummary.fefoLot}</div>
            </div>
          </div>
        </div>
      )}

      {/* Résultat du test 16/20 -> 40 000 ; 8/20 -> aucun bon */}
      {testResults && (
        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Vérification serveur du barème : 16/20 donne 40 000 FCFA ; 8/20 donne aucun bon
            </div>
            <button
              type="button"
              onClick={() => setTestResults(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Masquer
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {testResults.map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-black text-slate-900 dark:text-white">{r.test}</div>
                  <div className="text-slate-500">Palier : {r.palier}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-sm text-[#008DA9]">
                    {r.bonGenere ? `${Number(r.montant).toLocaleString('fr-FR')} FCFA` : 'Aucun bon (0 FCFA)'}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Conforme
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION VENDEUR : CARTE À GRATTER + COMPOSITION DU PANIER APRÈS RÉVÉLATION */}
      {isVendeur && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#008DA9]" />
                  Ma Carte à Gratter &amp; Mon Panier Cadeau
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Après révélation, composez votre panier du catalogue ligne par ligne (&laquo; Valider ce choix &raquo;,
                  &laquo; + Ajouter un produit &raquo;), valorisé au prix de vente, plafonné à la valeur du bon, avec
                  produits en stock non périmés (FEFO). Rien en espèces.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Chargement de vos bons semestriels...</div>
            ) : bons.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <Gift className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Aucun bon cadeau disponible pour ce semestre
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Les bons sont générés lors de la clôture du 1er janvier et du 1er juillet lorsque votre note sur 20
                  est supérieure ou égale à 10/20.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {bons.map((bon) => (
                  <div
                    key={bon.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/50 space-y-4"
                  >
                    <ScratchCardItem bon={bon} logoUrl={logoUrl} onRevealed={handleBonRevealed} />

                    {/* Après révélation : composition du panier FEFO ligne par ligne, demande de retrait, confirmation réception */}
                    {bon.revealed && typeof bon.amount === 'number' && (
                      <BonBasketComposer
                        bon={bon}
                        fefoCatalog={fefoCatalog}
                        currentUserRole={currentUser.role}
                        onUpdated={() => {
                          fetchBonsData();
                          if (onBonUpdated) onBonUpdated();
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLEAU DU SEMESTRE POUR L'ADMINISTRATEUR (ET DÉTAIL NOTE SUR 20 POUR LE VENDEUR) + EXPORT CSV */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-[#008DA9]" />
              {isVendeur
                ? 'Détail de ma Note sur 20 par Semestre (Calculée côté serveur)'
                : `Tableau du Semestre (${selectedSemester}) — Notes /20, Bons Cadeaux, Valeur Remise & Prolongations`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              CA vs objectif ({weights.ca}) &bull; Régularité ({weights.regularite}) &bull; Versements dans les délais (
              {weights.versements}) &bull; Nouveaux PDV ({weights.pdv}) &bull; Rigueur ({weights.rigueur}) &bull;
              Arrondi à 0,5 &bull; Rien en espèces.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSelectedSemester('S1-2026')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                selectedSemester === 'S1-2026'
                  ? 'bg-[#008DA9] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              S1-2026 (Clôture 1er Juillet)
            </button>
            <button
              type="button"
              onClick={() => setSelectedSemester('S2-2026')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                selectedSemester === 'S2-2026'
                  ? 'bg-[#008DA9] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              S2-2026 (Clôture 1er Janvier)
            </button>

            <button
              type="button"
              onClick={handleExportAdminSemesterCSV}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#008DA9]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards (< 640px) */}
        <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredEvaluations.map((ev) => {
            const matchingBon = bons.find(
              (b) => b.vendor_id === ev.vendor_id && b.semester === ev.semester
            );
            return (
              <div key={`${ev.vendor_id}-${ev.semester}`} className="p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{ev.vendor_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {ev.vendor_code} &bull; Clôture {ev.closure_date}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-xs ${
                      ev.note_finale >= 10
                        ? 'bg-teal-50 text-[#008DA9] dark:bg-teal-950/60 dark:text-teal-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {ev.note_finale} / 20
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1 text-center p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">CA/{weights.ca}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev.score_ca}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Rég/{weights.regularite}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev.score_regularite}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Vers/{weights.versements}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev.score_versements}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">PDV/{weights.pdv}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev.score_pdv}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Rig/{weights.rigueur}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev.score_rigueur}</span>
                  </div>
                </div>

                {matchingBon ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div>
                      <div className="font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200">
                        {matchingBon.reference} &bull;{' '}
                        <span className="text-[#008DA9]">
                          {matchingBon.revealed && typeof matchingBon.amount === 'number'
                            ? `${matchingBon.amount.toLocaleString('fr-FR')} FCFA`
                            : 'Montant masqué'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Statut : <strong>{matchingBon.status}</strong> &bull; Exp. {matchingBon.expires_at} ({matchingBon.days_remaining}j)
                      </div>
                    </div>

                    {isAdmin && matchingBon.status !== 'Reçu' && (
                      <button
                        type="button"
                        onClick={() => {
                          setProlongingBon(matchingBon);
                          setProlongExtraDays(30);
                          setProlongMotif(
                            matchingBon.prolongation_motif ||
                              'Prolongation exceptionnelle accordée par la Direction'
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Prolonger (motif)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">{ev.tier_label}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tablet & Desktop Table (>= 640px) — Sans débordement */}
        <div className="hidden sm:block">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-3">Vendeur</th>
                <th className="py-3 px-2.5 text-center">Détail des Critères</th>
                <th className="py-3 px-2.5 text-center">Note / 20</th>
                <th className="py-3 px-3 text-center">Bon &amp; Valeur Remise</th>
                <th className="py-3 px-3 text-center">Validité (90j) &amp; Statut</th>
                {isAdmin && <th className="py-3 px-3 text-right">Prolongation</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEvaluations.map((ev) => {
                const matchingBon = bons.find(
                  (b) => b.vendor_id === ev.vendor_id && b.semester === ev.semester
                );
                return (
                  <tr key={`${ev.vendor_id}-${ev.semester}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">{ev.vendor_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {ev.vendor_code} &bull; Clôture {ev.closure_date}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          CA: <strong>{ev.score_ca}</strong>/{weights.ca}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          Rég: <strong>{ev.score_regularite}</strong>/{weights.regularite}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          Vers: <strong>{ev.score_versements}</strong>/{weights.versements}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          PDV: <strong>{ev.score_pdv}</strong>/{weights.pdv}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          Rig: <strong>{ev.score_rigueur}</strong>/{weights.rigueur}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-xs ${
                          ev.note_finale >= 10
                            ? 'bg-teal-50 text-[#008DA9] dark:bg-teal-950/60 dark:text-teal-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {ev.note_finale} / 20
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {matchingBon ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200">
                            {matchingBon.reference}
                          </div>
                          <div className="text-[11px] font-bold text-[#008DA9]">
                            {matchingBon.revealed && typeof matchingBon.amount === 'number'
                              ? `Bon : ${matchingBon.amount.toLocaleString('fr-FR')} FCFA`
                              : 'Carte non grattée (montant masqué)'}
                          </div>
                          {(Number(matchingBon.basket_total || 0) > 0 ||
                            Number(matchingBon.delivered_total || 0) > 0) && (
                            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              Panier : {Number(matchingBon.basket_total || 0).toLocaleString('fr-FR')} FCFA &bull; Remis
                              : {Number(matchingBon.delivered_total || 0).toLocaleString('fr-FR')} FCFA
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">{ev.tier_label}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {matchingBon ? (
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              matchingBon.status === 'Reçu'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : matchingBon.status === 'Remis'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : matchingBon.status === 'À préparer'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : matchingBon.is_expired
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {matchingBon.status}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Exp. {matchingBon.expires_at} ({matchingBon.days_remaining} j)
                          </span>
                          {matchingBon.reminder_15_days && (
                            <span className="text-[10px] font-bold text-amber-600">
                              Rappel 15 j avant expiration
                            </span>
                          )}
                          {matchingBon.prolongation_motif && (
                            <span className="text-[10px] text-teal-600 dark:text-teal-400" title={matchingBon.prolongation_motif}>
                              Prolongé (+{matchingBon.prolongation_days}j) : {matchingBon.prolongation_motif}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-3 text-right">
                        {matchingBon && matchingBon.status !== 'Reçu' && (
                          <button
                            type="button"
                            onClick={() => {
                              setProlongingBon(matchingBon);
                              setProlongExtraDays(30);
                              setProlongMotif(
                                matchingBon.prolongation_motif ||
                                  'Prolongation exceptionnelle accordée par la Direction'
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            Prolonger (motif)
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Administrateur : Prolongation d'un bon avec motif obligatoire */}
      {isAdmin && prolongingBon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#008DA9]" />
                Prolongation du Bon {prolongingBon.reference}
              </h3>
              <button
                type="button"
                onClick={() => setProlongingBon(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-mono"
              >
                &times;
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 space-y-1">
              <div>
                Vendeur : <strong>{prolongingBon.vendor_name}</strong> ({prolongingBon.vendor_code})
              </div>
              <div>
                Échéance actuelle (90 jours) : <strong>{prolongingBon.expires_at}</strong> (
                {prolongingBon.days_remaining} j restants)
              </div>
            </div>

            <form onSubmit={handleProlongSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de jours supplémentaires
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={prolongExtraDays}
                  onChange={(e) => setProlongExtraDays(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif obligatoire de la prolongation
                </label>
                <textarea
                  rows={3}
                  value={prolongMotif}
                  onChange={(e) => setProlongMotif(e.target.value)}
                  required
                  placeholder="Indiquez le motif de prolongation du bon cadeau..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProlongingBon(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProlonging}
                  className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isProlonging ? 'Validation...' : 'Valider la prolongation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BARÈME DES PALIERS DE BON & CONFIGURATION ADMINISTRATEUR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Paliers de bon */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#008DA9]" />
              Paliers de Bon Semestriel (Valable 90 jours)
            </h3>
            <span className="text-[11px] font-bold text-slate-500">Clôture 1er janv. & 1er juil.</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Moins de 10 / 20</span>
              <span className="font-bold text-slate-500">Aucun bon</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">De 10 à 12 / 20</span>
              <span className="font-black text-slate-900 dark:text-white">
                {tiers.tier_10_12.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">De 12,5 à 14,5 / 20</span>
              <span className="font-black text-slate-900 dark:text-white">
                {tiers.tier_12_5_14_5.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">De 15 à 17 / 20</span>
              <span className="font-black text-[#008DA9]">
                {tiers.tier_15_17.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">De 17,5 à 20 / 20</span>
              <span className="font-black text-emerald-600">
                {tiers.tier_17_5_20.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Réglages Administrateur : Pondérations réglables, Paliers réglables & Clôture Semestrielle */}
        {isAdmin && (
          <form
            onSubmit={handleSaveConfig}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#008DA9]" />
                Pondérations & Paliers Réglables (Administrateur)
              </h3>
              <span
                className={`text-xs font-bold ${
                  Math.abs(totalWeightsSum - 20) < 0.01 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                Total : {totalWeightsSum} / 20
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">CA vs Obj.</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={weights.ca}
                  onChange={(e) => setWeights({ ...weights, ca: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Régularité</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={weights.regularite}
                  onChange={(e) => setWeights({ ...weights, regularite: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Versements</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={weights.versements}
                  onChange={(e) => setWeights({ ...weights, versements: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Nouv. PDV</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={weights.pdv}
                  onChange={(e) => setWeights({ ...weights, pdv: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Rigueur</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  value={weights.rigueur}
                  onChange={(e) => setWeights({ ...weights, rigueur: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Palier 10-12</label>
                <input
                  type="number"
                  step="500"
                  value={tiers.tier_10_12}
                  onChange={(e) => setTiers({ ...tiers, tier_10_12: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Palier 12,5-14,5</label>
                <input
                  type="number"
                  step="500"
                  value={tiers.tier_12_5_14_5}
                  onChange={(e) => setTiers({ ...tiers, tier_12_5_14_5: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Palier 15-17</label>
                <input
                  type="number"
                  step="500"
                  value={tiers.tier_15_17}
                  onChange={(e) => setTiers({ ...tiers, tier_15_17: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Palier 17,5-20</label>
                <input
                  type="number"
                  step="500"
                  value={tiers.tier_17_5_20}
                  onChange={(e) => setTiers({ ...tiers, tier_17_5_20: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? 'Enregistrement...' : 'Enregistrer le barème'}
              </button>

              <button
                type="button"
                disabled={closingSemester}
                onClick={() => handleCloseSemester(selectedSemester)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  Clôturer {selectedSemester} ({selectedSemester === 'S1-2026' ? '1er juillet' : '1er janvier'})
                </span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* JOURNAL D'AUDIT DES NOTES & BONS SEMESTRIELS */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <div className="font-bold text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4 text-[#008DA9]" />
            <span>Journal d'Audit (Clôtures, Révélations, Paniers, Remises &amp; Prolongations)</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">{auditLogs.length} entrées</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-72 overflow-y-auto">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400">Aucune entrée d'audit pour le moment.</div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] text-[#008DA9]">
                      {log.action}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{log.user_role}</span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">{log.details}</div>
                </div>
                <div className="text-[11px] font-mono text-slate-400 shrink-0">
                  {String(log.created_at).replace('T', ' ').slice(0, 19)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

