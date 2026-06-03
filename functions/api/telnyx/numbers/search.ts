/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { telnyxCall } from "../../../_shared/telnyx.ts";

/**
 * GET /api/telnyx/numbers/search?area_code=415 - proxy Telnyx number search.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const areaCode = url.searchParams.get("area_code") || "";
  const limit = url.searchParams.get("limit") || "10";

  type TelnyxNumber = {
    phone_number: string;
    record_type?: string;
    cost_information?: { monthly_cost?: string; upfront_cost?: string; currency?: string };
    region_information?: Array<{ region_name?: string; region_type?: string }>;
  };
  const res = await telnyxCall<TelnyxNumber[]>(env, "/v2/available_phone_numbers", {
    query: {
      "filter[country_code]": "US",
      "filter[features]": "sms",
      ...(areaCode ? { "filter[national_destination_code]": areaCode } : {}),
      "filter[limit]": limit,
    },
  });
  if (!res.ok) return error(res.error.message, res.error.status);

  // The UI reads `numbers` (not `data`) and expects flat locality/region fields,
  // so map Telnyx's region_information array into that shape here.
  const numbers = (res.data || []).map((n) => {
    const regions = n.region_information || [];
    const regionName = (type: string) => regions.find((r) => r.region_type === type)?.region_name || "";
    return {
      phone_number: n.phone_number,
      record_type: n.record_type,
      cost_information: n.cost_information,
      locality: regionName("location") || regionName("rate_center"),
      region: regionName("state"),
    };
  });
  return json({ numbers });
};
