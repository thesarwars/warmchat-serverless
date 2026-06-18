/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { normalizeE164 } from "../../_shared/phone.ts";

/**
 * POST /api/telnyx/activation - upsert the user's Telnyx 10DLC application.
 */
interface ActivationInput {
  business_type?: string;
  legal_name?: string; address_line1?: string; address_line2?: string;
  city?: string; state?: string; postal_code?: string; country?: string;
  email?: string; phone?: string;
  brokerage_name?: string; website?: string;
  privacy_policy_url?: string; terms_url?: string;
  ein?: string; ssn_last4?: string;
  sole_prop_verification_status?: string;
  sole_prop_verification_id?: string;
  sole_prop_verified_at?: string;
}

const VALID_TYPES = new Set(["sole_proprietor", "registered_business"]);

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const data = (await readJson<ActivationInput>(request)) || {};
  const businessType = (data.business_type || "").toLowerCase().trim();
  if (!VALID_TYPES.has(businessType)) {
    return error("business_type must be sole_proprietor or registered_business", 400);
  }
  const required = ["legal_name", "address_line1", "city", "state", "postal_code", "email", "phone"] as const;
  const missing = required.filter((k) => !String(data[k] || "").trim());
  if (businessType === "sole_proprietor" && !String(data.brokerage_name || "").trim()) {
    missing.push("brokerage_name" as never);
  }
  if (missing.length > 0) return error(`Missing required fields: ${missing.join(", ")}`, 400);

  // EIN / SSN are OPTIONAL: the umbrella model registers numbers under a shared
  // master brand + campaign (no per-agent Telnyx brand registration), so agents
  // don't need to supply EIN/SSN. The onboarding form no longer collects them.
  // When a value IS provided, still validate its format.
  if (businessType === "registered_business") {
    if (data.ein && !/^\d{9}$/.test(data.ein)) return error("ein must be 9 digits", 400);
  } else {
    if (data.ssn_last4 && !/^\d{4}$/.test(data.ssn_last4.replace(/\D/g, "").slice(0, 4))) {
      return error("ssn_last4 must be 4 digits", 400);
    }
  }

  let phoneE164: string;
  try {
    phoneE164 = normalizeE164(data.phone || "");
  } catch (e) {
    return error((e as Error).message, 400);
  }

  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM telnyx_sms_activation WHERE user_id = ?`, user.id,
  );
  const country = (data.country || "US").trim().toUpperCase().slice(0, 2) || "US";
  const ein = businessType === "registered_business" ? data.ein || null : null;
  const ssn = businessType === "sole_proprietor"
    ? (data.ssn_last4 || "").replace(/\D/g, "").slice(0, 4) || null
    : null;

  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE telnyx_sms_activation
          SET business_type = ?, legal_name = ?, address_line1 = ?, address_line2 = ?,
              city = ?, state = ?, postal_code = ?, country = ?, email = ?, phone = ?,
              brokerage_name = ?, website = ?, privacy_policy_url = ?, terms_url = ?,
              ein = ?, ssn_last4 = ?,
              sole_prop_verification_status = ?, sole_prop_verification_id = ?, sole_prop_verified_at = ?,
              updated_at = ?
        WHERE id = ?`,
      businessType, data.legal_name, data.address_line1, data.address_line2 || null,
      data.city, data.state, data.postal_code, country, data.email, phoneE164,
      businessType === "sole_proprietor" ? data.brokerage_name || null : null,
      data.website || null, data.privacy_policy_url || null, data.terms_url || null,
      ein, ssn,
      data.sole_prop_verification_status || null, data.sole_prop_verification_id || null,
      data.sole_prop_verified_at || null, nowIso(), existing.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO telnyx_sms_activation
         (user_id, business_type, legal_name, address_line1, address_line2,
          city, state, postal_code, country, email, phone,
          brokerage_name, website, privacy_policy_url, terms_url, ein, ssn_last4,
          sole_prop_verification_status, sole_prop_verification_id, sole_prop_verified_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, businessType, data.legal_name, data.address_line1, data.address_line2 || null,
      data.city, data.state, data.postal_code, country, data.email, phoneE164,
      businessType === "sole_proprietor" ? data.brokerage_name || null : null,
      data.website || null, data.privacy_policy_url || null, data.terms_url || null,
      ein, ssn,
      data.sole_prop_verification_status || null, data.sole_prop_verification_id || null,
      data.sole_prop_verified_at || null, nowIso(), nowIso(),
    );
  }

  const activation = await queryFirst(
    env.D1DB, `SELECT * FROM telnyx_sms_activation WHERE user_id = ?`, user.id,
  );
  const u = await queryFirst(
    env.D1DB,
    `SELECT telnyx_messaging_profile_id, telnyx_brand_id, telnyx_campaign_id,
            telnyx_phone_number, telnyx_sms_status, telnyx_error_reason,
            telnyx_campaign_number_status, agent_slug
       FROM "user" WHERE id = ?`,
    user.id,
  );
  return json({ activation, user: u });
};
