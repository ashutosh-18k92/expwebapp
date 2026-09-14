import { create } from "zustand";

interface BiometricGateState {
  /**
   * True once the user has successfully authenticated with biometrics
   * during this continuous app session. Deliberately in-memory only (no
   * persist middleware, no localStorage) - a fresh app launch creates a
   * fresh JS/module context, which resets this back to false and re-locks
   * the gate, exactly as a biometric lock should. It only needs to survive
   * client-side route transitions within one open session (see
   * components/BiometricGate.tsx, mounted fresh on every visit to `/`),
   * not an actual app restart.
   */
  unlockedThisSession: boolean;
  markUnlocked: () => void;
  reset: () => void;
}

export const useBiometricGateStore = create<BiometricGateState>((set) => ({
  unlockedThisSession: false,
  markUnlocked: () => set({ unlockedThisSession: true }),
  reset: () => set({ unlockedThisSession: false }),
}));
