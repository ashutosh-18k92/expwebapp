"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { BiometricPrimer, LocalSettingsCache } from "@/lib/native-permissions";
import { BiometricIcon, PermissionPrimer } from "@/components/PermissionPrimer";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, dateOfBirth }),
    });
    const data = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    if (await biometricsAvailable()) {
      setShowBiometricPrompt(true);
      return;
    }

    router.push("/dashboard");
  }

  async function biometricsAvailable() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const result = await BiometricPrimer.isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }

  async function handleEnableBiometrics() {
    try {
      const result = await BiometricPrimer.authenticate({ title: "Confirm it's you" });
      // Biometric sign-in is a per-device preference (FR-2.7) - written
      // straight to this device's own store, never to the account.
      if (result.success) {
        await LocalSettingsCache.setBiometricEnabled({ enabled: true });
      }
    } catch {
      // Plugin unavailable or the prompt failed - just skip enabling.
    }
    setShowBiometricPrompt(false);
    router.push("/dashboard");
  }

  function handleDismissBiometrics() {
    setShowBiometricPrompt(false);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">Create an account</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          First name
          <Input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Date of birth
          <Input
            type="date"
            required
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      {showBiometricPrompt && (
        <PermissionPrimer
          icon={<BiometricIcon />}
          title="Enable biometric sign-in"
          description="Use your fingerprint or face to get back into the app quickly next time."
          allowLabel="Enable Biometric Sign-in"
          onAllow={handleEnableBiometrics}
          onDismiss={handleDismissBiometrics}
        />
      )}
    </div>
  );
}
