// Country picker for the member profile.
//
// The profile stored a two-letter code typed by hand ("SN, FR, KE…"): nobody
// knows the code of Eswatini or Timor-Leste, and a typo was only caught by the
// server. The field is now a list of countries NAMED in the interface
// language (CLDR through `Intl.DisplayNames`, as `countryName` in
// `@/lib/orgs` already does for the directory), sorted by that name. The
// stored value does not change: an ISO 3166-1 alpha-2 code, which the server
// still validates.

// ISO 3166-1 alpha-2, plus XK (Kosovo, user-assigned code in wide use).
// prettier-ignore
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
  'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
  'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
  'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
  'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
  'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
  'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
  'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
  'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
  'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
  'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
  'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
  'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
  'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export type CountryOption = { code: string; name: string };

function displayName(names: Intl.DisplayNames | null, code: string): string {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The countries, named and sorted for `locale`.
 *
 * A stored code outside the list (legacy value) is kept as an option rather
 * than silently replaced: saving the form must never change a field the
 * person did not touch.
 */
export function countryOptions(
  locale: string,
  current?: string,
): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  const codes: string[] = [...COUNTRY_CODES];
  const extra = current?.trim().toUpperCase();
  if (extra && /^[A-Z]{2}$/.test(extra) && !codes.includes(extra)) {
    codes.push(extra);
  }
  const collator = new Intl.Collator(locale);
  return codes
    .map((code) => ({ code, name: displayName(names, code) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

// Accents, case, apostrophes and dashes do not count: "Cote d'Ivoire",
// "côte d’ivoire" and "Côte-d’Ivoire" are the same country.
function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’'`´-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The code of a country written in free text, as the membership form
 * collects it ("Sénégal", "senegal", "Senegal", "SN"), looked up in each of
 * `locales` (the site's languages: an application can be written in any of
 * them). `null` when nothing matches exactly: a guess must never pick the
 * wrong country, the moderator chooses then.
 */
export function guessCountryCode(
  text: string | null | undefined,
  locales: readonly string[],
): string | null {
  const needle = foldName(text ?? '');
  if (!needle) return null;
  const upper = needle.toUpperCase();
  if (
    /^[A-Z]{2}$/.test(upper) &&
    (COUNTRY_CODES as readonly string[]).includes(upper)
  ) {
    return upper;
  }
  for (const locale of locales) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      continue;
    }
    for (const code of COUNTRY_CODES) {
      if (foldName(displayName(names, code)) === needle) return code;
    }
  }
  return null;
}
