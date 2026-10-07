// Open-Meteo — free, no API key, generous rate limits at personal-app scale. Kept as plain
// fetch() calls (no SDK) since both endpoints are simple GETs, same precedent as chatAssistant's
// own callApi() helper for calling this app's own API.

interface GeocodeResult {
  lat: number;
  lon: number;
  resolvedName: string;
  timezone: string;
}

// A handful of common abbreviations people actually type that never appear as a substring of
// Open-Meteo's full country names ("usa".includes check against "united states" is false) —
// not an exhaustive ISO country-code table, just the ones a user is realistically going to type.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  uk: "united kingdom",
  uae: "united arab emirates",
};

// Open-Meteo's geocoder matches on the bare place name only — passing the full "City, Country"
// string as typed (the format Settings asks for) returns zero results. Splitting on the comma
// and querying just the city part, then preferring whichever match's country or region contains
// the trailing part, both fixes that AND disambiguates common duplicate city names (there's a
// London in Ontario and nine Parises in the US) rather than blindly taking the first hit.
export async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  const cityQuery = parts[0] || query;
  const rawHint = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : undefined;
  const countryHint = rawHint ? (COUNTRY_ALIASES[rawHint] ?? rawHint) : undefined;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding request failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: {
      latitude: number;
      longitude: number;
      name: string;
      country?: string;
      admin1?: string;
      timezone: string;
    }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) return null;

  const match =
    (countryHint &&
      results.find((r) => {
        const country = r.country?.toLowerCase() ?? "";
        const region = r.admin1?.toLowerCase() ?? "";
        return country.includes(countryHint) || region.includes(countryHint) || countryHint.includes(country);
      })) ||
    results[0];

  return {
    lat: match.latitude,
    lon: match.longitude,
    resolvedName: match.country ? `${match.name}, ${match.country}` : match.name,
    timezone: match.timezone,
  };
}

// WMO weather codes (the scheme Open-Meteo uses) collapsed to short human phrases — just the
// ranges relevant to a daily life-tracking app's reminders, not an exhaustive meteorological list.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "clear sky",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  61: "light rain",
  63: "moderate rain",
  65: "heavy rain",
  71: "light snow",
  73: "moderate snow",
  75: "heavy snow",
  80: "light rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with heavy hail",
};

function describeWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? `weather code ${code}`;
}

export interface WeatherSnapshot {
  resolvedName: string;
  current: { tempC: number; condition: string };
  dailyForecast: { date: string; condition: string; highC: number; lowC: number; precipitationMm: number }[];
}

export async function fetchWeather(geo: GeocodeResult): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&current=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=${encodeURIComponent(geo.timezone)}&forecast_days=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
  };

  return {
    resolvedName: geo.resolvedName,
    current: {
      tempC: data.current.temperature_2m,
      condition: describeWeatherCode(data.current.weather_code),
    },
    dailyForecast: data.daily.time.map((date, i) => ({
      date,
      condition: describeWeatherCode(data.daily.weather_code[i]),
      highC: data.daily.temperature_2m_max[i],
      lowC: data.daily.temperature_2m_min[i],
      precipitationMm: data.daily.precipitation_sum[i],
    })),
  };
}
