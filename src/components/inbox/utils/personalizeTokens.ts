import {
  PERSONALIZATION_TOKENS,
  type PersonalizationToken,
} from "../../../utils/personalization";

export const SMS_PERSONALIZE_TOKENS: PersonalizationToken[] =
  PERSONALIZATION_TOKENS.filter((t) =>
    [
      "{firstname}",
      "{lastname}",
      "{area}",
      "{senderfullname}",
      "{sendername}",
    ].includes(t.token),
  );

export const EMAIL_PERSONALIZE_TOKENS: PersonalizationToken[] =
  PERSONALIZATION_TOKENS.filter((t) =>
    ["{firstname}", "{lastname}", "{senderfullname}", "{sendername}"].includes(
      t.token,
    ),
  );
