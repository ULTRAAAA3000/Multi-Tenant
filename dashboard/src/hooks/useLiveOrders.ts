import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Order, OrderStatus } from "../lib/types";

const POLL_INTERVAL_MS = 8000;

/**
 * Plays a short two-tone bell using the Web Audio API — no audio file
 * to host or load, just oscillators. Created fresh per play rather
 * than reused, since AudioContext nodes are single-use.
 */
function playBellAlert() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();

    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.18);
    playTone(1320, now + 0.15, 0.22);
  } catch (err) {
    // Browsers block audio until a user gesture has occurred on the
    // page at least once — this is expected on first load and not
    // worth surfacing as an error to the person using the dashboard.
    console.warn("Could not play order alert sound:", err);
  }
}

interface UseLiveOrdersResult {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  refresh: () => Promise<void>;
  updateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
}

export function useLiveOrders(tenantId: string | null): UseLiveOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const knownOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const loadOrders = useCallback(async () => {
    if (!tenantId) return;
    try {
      const list = await api.listOrders(tenantId);
      setError(null);

      if (!isFirstLoad.current) {
        const newOnes = list.filter((o) => !knownOrderIds.current.has(o.id));
        if (newOnes.length > 0 && soundEnabled) {
          playBellAlert();
        }
      }

      knownOrderIds.current = new Set(list.map((o) => o.id));
      isFirstLoad.current = false;
      setOrders(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load orders.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, soundEnabled]);

  useEffect(() => {
    isFirstLoad.current = true;
    knownOrderIds.current = new Set();
    setIsLoading(true);
    loadOrders();

    const interval = setInterval(loadOrders, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    if (!tenantId) return;
    const updated = await api.updateOrderStatus(tenantId, orderId, status);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
  };

  return {
    orders,
    isLoading,
    error,
    soundEnabled,
    setSoundEnabled,
    refresh: loadOrders,
    updateStatus,
  };
}
