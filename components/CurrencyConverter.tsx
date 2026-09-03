"use client";

import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocationPrimer } from "@/lib/native-permissions";
import { LocationIcon, PermissionPrimer } from "@/components/PermissionPrimer";
import {
  DeviceLocationCurrency,
  KNOWN_CURRENCIES,
  LiveGbpRates,
  LocationCurrencyError,
  fetchLiveGbpRates,
  loadCachedLiveGbpRates,
  loadCachedLocationCurrency,
  resolveDeviceLocationCurrency,
  resolveRate,
  saveLiveGbpRates,
  saveLocationCurrency,
} from "@/lib/location-currency";

type Status = "idle" | "requesting-permission" | "detecting" | "resolved" | "error";

export function CurrencyConverter() {
  const [status, setStatus] = useState<Status>("idle");
  const [location, setLocation] = useState<DeviceLocationCurrency | null>(null);
  const [currencyCode, setCurrencyCode] = useState<string>("EUR");
  const [amount, setAmount] = useState("100");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPrimer, setShowPrimer] = useState(false);
  const [liveRates, setLiveRates] = useState<LiveGbpRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);

  // Cache reads (sessionStorage) must happen client-only, after mount - doing
  // them in useState initializers instead runs them on the client's first
  // render too, before it's had a chance to match the server-rendered (no
  // sessionStorage) markup, which is a hydration mismatch.
  useEffect(() => {
    // One-time restore of client-only cached state on mount (see the comment
    // above) - the resulting extra render pass is negligible for a form this
    // size, so the synchronous setState calls here are intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    const cachedLocation = loadCachedLocationCurrency();
    if (cachedLocation) {
      setLocation(cachedLocation);
      setCurrencyCode(cachedLocation.currencyCode);
    }

    const cachedRates = loadCachedLiveGbpRates();
    if (cachedRates) {
      setLiveRates(cachedRates);
      setLoadingRates(false);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    fetchLiveGbpRates().then((result) => {
      if (cancelled) return;
      if (result) {
        saveLiveGbpRates(result);
        setLiveRates(result);
      }
      setLoadingRates(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rate = resolveRate(currencyCode, liveRates);
  const parsedAmount = Number(amount);
  const converted = useMemo(() => {
    if (rate === null || !Number.isFinite(parsedAmount)) return null;
    return parsedAmount * rate;
  }, [parsedAmount, rate]);
  const rateUnavailable = currencyCode !== "GBP" && !loadingRates && rate === null;

  async function detectFromDevice() {
    setErrorMessage(null);
    if (Capacitor.isNativePlatform()) {
      const permission = await LocationPrimer.isLocationGranted();
      if (!permission.granted) {
        setStatus("requesting-permission");
        setShowPrimer(true);
        return;
      }
    }
    await runDetection();
  }

  async function runDetection() {
    setStatus("detecting");
    try {
      const resolved = await resolveDeviceLocationCurrency();
      saveLocationCurrency(resolved);
      setLocation(resolved);
      setCurrencyCode(resolved.currencyCode);
      setStatus("resolved");
    } catch (error) {
      const message =
        error instanceof LocationCurrencyError
          ? error.message
          : "Could not detect your location. Choose a currency manually below.";
      setErrorMessage(message);
      setStatus("error");
    }
  }

  async function handlePrimerAllow() {
    setShowPrimer(false);
    const result = await LocationPrimer.requestPermission();
    if (!result.granted) {
      setErrorMessage("Location permission was not granted. Choose a currency manually below.");
      setStatus("error");
      return;
    }
    await runDetection();
  }

  function handlePrimerDismiss() {
    setShowPrimer(false);
    setStatus("idle");
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-5">
      <div>
        <h2 className="text-lg font-bold">Currency converter (GBP)</h2>
        <p className="text-sm text-slate-600">
          DRAFT - for illustration only. Rates are the latest available ECB daily reference rate;
          shown as unavailable if that data cannot be retrieved for a currency. Not a real-time
          market rate, and not the rate applied to any premium, payment or refund. Requires
          compliance review before any customer-facing use.
        </p>
      </div>

      <button
        onClick={detectFromDevice}
        disabled={status === "detecting" || status === "requesting-permission"}
        className="self-start rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {status === "detecting" ? "Detecting..." : "Detect currency from my location"}
      </button>

      {location && status === "resolved" && (
        <p className="text-sm text-slate-700">
          Detected country {location.countryCode}, currency {location.currencyCode}.
        </p>
      )}
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm font-medium">
          Amount (GBP)
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col text-sm font-medium">
          Local currency
          <select
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {KNOWN_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-base">
        {currencyCode !== "GBP" && loadingRates
          ? "Fetching the latest exchange rate..."
          : rateUnavailable
            ? "Service unavailable - could not retrieve an exchange rate."
            : converted !== null
              ? `£${parsedAmount.toFixed(2)} GBP is approximately ${converted.toFixed(2)} ${currencyCode}.`
              : "Enter an amount to convert."}
      </p>

      {currencyCode === "GBP" && <p className="text-xs text-slate-500">Same currency - no conversion needed.</p>}
      {currencyCode !== "GBP" && rate !== null && (
        <p className="text-xs text-slate-500">
          Rate: £1 = {rate} {currencyCode} (ECB daily reference rate{liveRates ? `, as of ${liveRates.asOfDate}` : ""}).
        </p>
      )}

      {showPrimer && (
        <PermissionPrimer
          icon={<LocationIcon />}
          title="Enable location services"
          description="Detect your local currency automatically so amounts can be shown in GBP and your local currency side by side."
          allowLabel="Allow Location Access"
          onAllow={handlePrimerAllow}
          onDismiss={handlePrimerDismiss}
        />
      )}
    </section>
  );
}
