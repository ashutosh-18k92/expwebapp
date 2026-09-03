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

// Static placeholder rates, GBP 1 -> currency unit. NOT live market data.
// Indicative only, for this pre-launch demo, and must be replaced with a
// reviewed live-rate source (and compliance sign-off) before any
// customer-facing use.
export const PLACEHOLDER_GBP_RATES: Record<string, number> = {
  GBP: 1,
  EUR: 1.17,
  CHF: 1.11,
  SEK: 13.4,
  NOK: 13.9,
  DKK: 8.74,
  PLN: 5.02,
  CZK: 28.9,
  HUF: 452,
  RON: 5.93,
  BGN: 2.29,
  TRY: 53.6,
  USD: 1.27,
  CAD: 1.76,
  MXN: 24.9,
  BRL: 7.1,
  AUD: 1.94,
  NZD: 2.13,
  JPY: 190,
  CNY: 9.15,
  HKD: 9.9,
  SGD: 1.66,
  THB: 43.5,
  VND: 32300,
  MYR: 5.6,
  IDR: 20400,
  PHP: 72.4,
  KRW: 1770,
  INR: 108,
  AED: 4.66,
  QAR: 4.63,
  SAR: 4.76,
  ILS: 4.6,
  EGP: 62.5,
  MAD: 12.6,
  ZAR: 22.9,
};

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
