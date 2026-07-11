const STOP_WORDS = new Set([
  "ai",
  "ban",
  "bi",
  "cach",
  "cac",
  "can",
  "cho",
  "co",
  "cua",
  "den",
  "di",
  "duoc",
  "gan",
  "giup",
  "hay",
  "khong",
  "la",
  "lam",
  "minh",
  "mot",
  "nao",
  "nay",
  "o",
  "toi",
  "tim",
  "va",
  "voi",
]);

const TOKEN_ALIASES: Record<string, string> = {
  coffee: "cafe",
  coffeeshop: "cafe",
  "ca phe": "cafe",
  quiet: "yen tinh",
  work: "lam viec",
  restaurant: "nha hang",
  hotel: "khach san",
  airport: "san bay",
  cinema: "rap phim",
  mall: "trung tam thuong mai",
  gas: "tram xang",
  family: "gia dinh",
  romantic: "hen ho",
  saigon: "tp hcm",
  "sai gon": "tp hcm",
  tphcm: "tp hcm",
  hcmc: "tp hcm",
  "ho chi minh": "tp hcm",
  "ho guom": "ho hoan kiem",
  "tan son nhat": "san bay tan son nhat",
  tsn: "san bay tan son nhat",
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function expandAliases(value: string): string {
  let result = normalizeText(value);

  for (const [from, to] of Object.entries(TOKEN_ALIASES)) {
    if (result.includes(from)) {
      result += ` ${to}`;
    }
  }

  return result;
}

export function meaningfulTokens(value: string): string[] {
  return [
    ...new Set(
      expandAliases(value)
        .split(" ")
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
    ),
  ];
}

export function containsPhrase(value: string, phrase: string): boolean {
  return expandAliases(value).includes(normalizeText(phrase));
}
