// Static ISO 3166-1 alpha-2 country -> ISO 4217 currency mapping.
// Covers common UK-outbound travel destinations. Countries not listed here
// fall through to the manual currency picker in the UI.
export const COUNTRY_CURRENCY: Record<string, string> = {
  GB: "GBP",
  IE: "EUR",
  FR: "EUR",
  ES: "EUR",
  PT: "EUR",
  IT: "EUR",
  DE: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  GR: "EUR",
  CY: "EUR",
  MT: "EUR",
  FI: "EUR",
  LU: "EUR",
  SI: "EUR",
  SK: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  HR: "EUR",
  TR: "TRY",
  US: "USD",
  CA: "CAD",
  MX: "MXN",
  BR: "BRL",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  CN: "CNY",
  HK: "HKD",
  SG: "SGD",
  TH: "THB",
  VN: "VND",
  MY: "MYR",
  ID: "IDR",
  PH: "PHP",
  KR: "KRW",
  IN: "INR",
  AE: "AED",
  QA: "QAR",
  SA: "SAR",
  IL: "ILS",
  EG: "EGP",
  MA: "MAD",
  ZA: "ZAR",
};

// Currency codes selectable in the UI, derived from COUNTRY_CURRENCY.
export const KNOWN_CURRENCIES: string[] = Array.from(new Set(Object.values(COUNTRY_CURRENCY))).sort();

// Frankfurter serves the ECB's daily reference rates - free, keyless, no
// rate limit for this kind of light client-side use. ECB doesn't publish
// reference rates for every currency in COUNTRY_CURRENCY (notably several
// Gulf/African/Vietnamese pegs) - resolveRate() below returns null for
// those, and the UI shows the rate as unavailable rather than guessing.
// Rates update once per weekday around 16:00 CET - this is a daily reference
// rate, not an intraday/real-time feed.
export interface LiveGbpRates {
  rates: Record<string, number>;
  asOfDate: string;
  fetchedAt: number;
}

export async function fetchLiveGbpRates(): Promise<LiveGbpRates | null> {
  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?from=GBP");
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.rates || typeof data.rates !== "object") return null;
    return { rates: data.rates, asOfDate: data.date, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

const RATES_STORAGE_KEY = "fog.liveGbpRates";
const RATES_CACHE_TTL_MS = 60 * 60 * 1000;

export function loadCachedLiveGbpRates(): LiveGbpRates | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveGbpRates;
    if (Date.now() - parsed.fetchedAt > RATES_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLiveGbpRates(value: LiveGbpRates): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // sessionStorage unavailable (e.g. private mode) - fail silently, caller keeps in-memory state.
  }
}

// GBP-to-GBP is trivially 1 regardless of API state. Everything else needs
// a live rate - returns null if the live-rate fetch failed entirely or the
// feed doesn't cover this currency, and the UI treats both as unavailable.
export function resolveRate(currencyCode: string, liveRates: LiveGbpRates | null): number | null {
  if (currencyCode === "GBP") return 1;
  const live = liveRates?.rates[currencyCode];
  return typeof live === "number" ? live : null;
}

export interface DeviceLocationCurrency {
  countryCode: string;
  currencyCode: string;
  resolvedAt: number;
}

export class LocationCurrencyError extends Error {
  constructor(
    message: string,
    public reason: "unsupported" | "permission-denied" | "timeout" | "geocode-failed" | "unmapped-country",
  ) {
    super(message);
    this.name = "LocationCurrencyError";
  }
}

function getCurrentCoordinates(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationCurrencyError("Geolocation is not available in this environment.", "unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new LocationCurrencyError("Location permission was denied.", "permission-denied"));
        } else if (error.code === error.TIMEOUT) {
          reject(new LocationCurrencyError("Timed out waiting for a location fix.", "timeout"));
        } else {
          reject(new LocationCurrencyError("Could not read the device location.", "timeout"));
        }
      },
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

// Reverse-geocodes coordinates to a country code via BigDataCloud's free,
// keyless, client-side reverse-geocode endpoint. This sends the device's
// coordinates to that third party - the raw coordinates are never stored,
// only the resolved country/currency code.
async function reverseGeocodeCountry(latitude: number, longitude: number): Promise<string> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new LocationCurrencyError("Reverse geocoding request failed.", "geocode-failed");
  }
  const data = await response.json();
  const countryCode = typeof data?.countryCode === "string" ? data.countryCode.toUpperCase() : "";
  if (!countryCode) {
    throw new LocationCurrencyError("Reverse geocoding did not return a country.", "geocode-failed");
  }
  return countryCode;
}

export async function resolveDeviceLocationCurrency(): Promise<DeviceLocationCurrency> {
  const { latitude, longitude } = await getCurrentCoordinates();
  const countryCode = await reverseGeocodeCountry(latitude, longitude);
  const currencyCode = COUNTRY_CURRENCY[countryCode];
  if (!currencyCode) {
    throw new LocationCurrencyError(
      `No currency mapping for country "${countryCode}".`,
      "unmapped-country",
    );
  }
  return { countryCode, currencyCode, resolvedAt: Date.now() };
}

const STORAGE_KEY = "fog.locationCurrency";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Only the resolved country/currency code and a timestamp are cached, never
// raw coordinates, and it lives in sessionStorage so it clears with the tab.
export function loadCachedLocationCurrency(): DeviceLocationCurrency | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceLocationCurrency;
    if (Date.now() - parsed.resolvedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocationCurrency(value: DeviceLocationCurrency): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // sessionStorage unavailable (e.g. private mode) - fail silently, caller keeps in-memory state.
  }
}

export function clearLocationCurrency(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
