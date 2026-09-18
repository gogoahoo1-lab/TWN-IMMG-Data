// ============================================================
// STARLUX Lounge — TDX Flight Sync Edge Function
// ============================================================
// File: supabase/functions/sync-tdx-flights/index.ts
//
// Purpose: Fetches STARLUX (JX) departure schedules from
// TDX FIDS API and upserts into the `flights` table.
// Scheduled to run every 5 minutes via pg_cron.
//
// Env variables required (set via `supabase secrets set`):
//   - TDX_CLIENT_ID
//   - TDX_CLIENT_SECRET
//   - SUPABASE_URL         (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TDX_ID = Deno.env.get('TDX_CLIENT_ID');
const TDX_SECRET = Deno.env.get('TDX_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const AIRLINE_CODE = 'JX'; // STARLUX
const AIRPORT_CODE = 'TPE'; // 桃園

// 機場代碼 → 中文名（可自行擴充）
const CITY_NAMES: Record<string, string> = {
  // 東北亞
  HND: '東京羽田', NRT: '東京成田', KIX: '大阪關西', NGO: '名古屋中部',
  FUK: '福岡', CTS: '札幌新千歲', OKA: '沖繩那霸', OKJ: '岡山',
  KMJ: '熊本', KOJ: '鹿兒島', TAK: '高松', TKS: '德島',
  ICN: '首爾仁川', GMP: '首爾金浦', PUS: '釜山',
  // 東南亞
  BKK: '曼谷', HKT: '普吉島', DMK: '曼谷廊曼',
  SIN: '新加坡', KUL: '吉隆坡', PEN: '檳城',
  MNL: '馬尼拉', CEB: '宿霧', CRK: '克拉克',
  SGN: '胡志明市', HAN: '河內',
  CGK: '雅加達', DPS: '峇里島',
  RGN: '仰光', PNH: '金邊', VTE: '永珍',
  // 港澳
  HKG: '香港', MFM: '澳門',
  // 中國
  SHA: '上海虹橋', PVG: '上海浦東', PEK: '北京首都', PKX: '北京大興',
  CAN: '廣州', SZX: '深圳', CTU: '成都', CKG: '重慶',
  // 北美
  LAX: '洛杉磯', SFO: '舊金山', SEA: '西雅圖', ONT: '安大略',
  JFK: '紐約甘迺迪', EWR: '紐約紐華克',
  // 歐洲
  LHR: '倫敦希斯洛', CDG: '巴黎戴高樂', FRA: '法蘭克福', AMS: '阿姆斯特丹',
  // 大洋洲
  SYD: '雪梨', MEL: '墨爾本', BNE: '布里斯本',
};

// ============================================================
// TDX Auth — get bearer token (with caching)
// ============================================================
let cachedToken: { token: string; expires: number } | null = null;

async function getTdxToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expires > now + 60000) {
    return cachedToken.token;
  }
  if (!TDX_ID || !TDX_SECRET) {
    throw new Error('Missing TDX_CLIENT_ID or TDX_CLIENT_SECRET secrets');
  }
  const res = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: TDX_ID,
        client_secret: TDX_SECRET,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`TDX auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expires: now + (data.expires_in || 86400) * 1000,
  };
  return cachedToken.token;
}

// ============================================================
// TDX FIDS — fetch today's JX departures from TPE
// ============================================================
interface TdxFlight {
  FlightDate: string;
  AirlineID: string;
  FlightNumber: string;
  ScheduleDepartureTime: string;
  ActualDepartureTime?: string;
  EstimatedDepartureTime?: string;
  ArrivalAirportID: string;
  Terminal?: string;
  Gate?: string;
  DepartureRemark?: string;
  FlightStatus?: string;
}

async function fetchDepartures(token: string): Promise<TdxFlight[]> {
  const url = `https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Departure/${AIRPORT_CODE}?$filter=AirlineID%20eq%20'${AIRLINE_CODE}'&$format=JSON`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TDX FIDS failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

// ============================================================
// Transform → upsert into flights table
// ============================================================
function extractTime(iso: string | undefined): string | null {
  if (!iso) return null;
  // "2026-09-18T09:55:00+08:00" → "09:55"
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function normalizeFlightNumber(raw: string): string {
  // "0121" → "121", "121" → "121"
  return `${AIRLINE_CODE}${parseInt(raw, 10) || raw}`;
}

function normalizeTerminal(t: string | undefined): string | null {
  if (!t) return null;
  // TDX sometimes returns "1", "2", "T1", "TERMINAL1"
  const m = t.toString().match(/[12]/);
  return m ? `T${m[0]}` : null;
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = await getTdxToken();
    const flights = await fetchDepartures(token);

    if (!Array.isArray(flights)) {
      throw new Error('TDX returned non-array: ' + JSON.stringify(flights).substring(0, 200));
    }

    // Deduplicate by flight_no (some flights appear with codeshare duplicates)
    const seen = new Set<string>();
    const upserts = flights
      .map((f) => {
        const flightNo = normalizeFlightNumber(f.FlightNumber);
        if (seen.has(flightNo)) return null;
        seen.add(flightNo);
        return {
          flight_no: flightNo,
          destination: f.ArrivalAirportID,
          destination_name: CITY_NAMES[f.ArrivalAirportID] || f.ArrivalAirportID,
          std: extractTime(f.EstimatedDepartureTime || f.ScheduleDepartureTime),
          terminal: normalizeTerminal(f.Terminal),
          status: f.DepartureRemark || f.FlightStatus || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.std !== null);

    if (upserts.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          count: 0,
          message: 'No JX departures returned by TDX',
          raw_count: flights.length,
        }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const { error } = await supabase
      .from('flights')
      .upsert(upserts, { onConflict: 'flight_no' });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        count: upserts.length,
        synced_at: new Date().toISOString(),
        sample: upserts.slice(0, 3),
      }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  } catch (e) {
    console.error('sync-tdx-flights error:', e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      }
    );
  }
});
