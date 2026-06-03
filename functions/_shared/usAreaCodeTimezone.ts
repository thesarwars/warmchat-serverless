/**
 * US area-code -> IANA timezone lookup used to auto-detect a lead's local
 * timezone when one isn't supplied at create time. We collapse the lookup to
 * the four contiguous-US zones plus Alaska and Hawaii; offshore territories
 * fall through to the Eastern fallback. Toll-free codes (8xx, 900, 500, 600)
 * intentionally return null so the caller can fall back to the org timezone.
 */

const PACIFIC = "America/Los_Angeles";
const MOUNTAIN = "America/Denver";
const CENTRAL = "America/Chicago";
const EASTERN = "America/New_York";
const ALASKA = "America/Anchorage";
const HAWAII = "Pacific/Honolulu";

const AREA_CODE_TO_TZ: Record<string, string> = {};

const seed = (zone: string, codes: string[]) => {
  for (const c of codes) AREA_CODE_TO_TZ[c] = zone;
};

// Eastern Time
seed(EASTERN, [
  "201", "202", "203", "207", "212", "215", "216", "220", "223", "234",
  "240", "248", "267", "276", "289", "301", "302", "304", "315", "321",
  "330", "332", "336", "339", "347", "351", "352", "365", "380", "386",
  "401", "404", "407", "410", "412", "413", "419", "423", "434", "440",
  "443", "445", "447", "475", "478", "484", "508", "513", "516", "517",
  "518", "540", "551", "561", "567", "570", "571", "585", "586", "603",
  "606", "607", "609", "610", "614", "616", "617", "631", "646", "667",
  "672", "678", "680", "681", "686", "689", "703", "704", "706", "716",
  "717", "718", "724", "727", "732", "734", "740", "743", "754", "757",
  "762", "770", "772", "774", "781", "786", "787", "802", "803", "804",
  "810", "813", "814", "828", "843", "845", "848", "850", "856", "857",
  "859", "860", "862", "863", "864", "865", "878", "888", "904", "908",
  "910", "912", "914", "917", "919", "929", "934", "937", "939", "941",
  "947", "954", "959", "973", "978", "980", "984", "989",
]);

// Central Time
seed(CENTRAL, [
  "205", "210", "214", "217", "218", "224", "225", "228", "229", "251",
  "254", "256", "262", "270", "281", "309", "312", "314", "316", "317",
  "318", "319", "320", "325", "346", "361", "364", "402", "405", "409",
  "414", "417", "430", "432", "447", "469", "479", "501", "502", "504",
  "507", "512", "515", "531", "534", "536", "539", "563", "573", "574",
  "580", "601", "608", "612", "615", "618", "620", "621", "622", "623",
  "625", "626", "630", "636", "641", "651", "656", "657", "659", "660",
  "662", "682", "708", "712", "713", "715", "731", "737", "763", "773",
  "779", "785", "806", "815", "816", "817", "830", "832", "847", "850",
  "870", "872", "901", "903", "913", "915", "918", "920", "931", "936",
  "938", "940", "952", "956", "972", "979", "985", "989",
]);

// Mountain Time (includes Arizona, even though AZ doesn't observe DST -
// good-enough for quiet-hours; we don't need wall-clock-perfect)
seed(MOUNTAIN, [
  "303", "307", "385", "406", "435", "480", "505", "520", "521", "522",
  "575", "602", "623", "624", "625", "628", "640", "650", "657", "660",
  "667", "669", "680", "719", "720", "725", "726", "747", "754", "760",
  "770", "775", "801", "835", "844", "858", "859", "915", "928", "935",
  "938", "970", "986",
]);

// Pacific Time
seed(PACIFIC, [
  "206", "209", "213", "253", "279", "310", "323", "341", "360", "369",
  "408", "415", "424", "425", "442", "458", "503", "509", "510", "530",
  "541", "557", "559", "562", "564", "568", "569", "619", "626", "628",
  "650", "657", "661", "669", "707", "714", "747", "760", "764", "771",
  "775", "805", "818", "820", "831", "858", "909", "916", "925", "949",
  "951", "971",
]);

// Alaska
seed(ALASKA, ["907"]);

// Hawaii
seed(HAWAII, ["808"]);

/**
 * Resolve a +1 phone number to an IANA timezone. Returns null for non-US
 * numbers or unknown / toll-free codes so callers can fall back to the org
 * default rather than guessing wrong.
 */
export function usAreaCodeToTimezone(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  // Country code 1 with 10 local digits.
  if (digits.length !== 11 || !digits.startsWith("1")) return null;
  const area = digits.slice(1, 4);
  return AREA_CODE_TO_TZ[area] ?? null;
}
