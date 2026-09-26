// Lenient matching for Serbian: most people type without diacritics (c for č,
// d or dj for đ), and some type in Cyrillic, while every headword is stored in
// Latin with diacritics. English is unaffected — none of these letters occur.

export const DIACRITIC_FOLD = { 'č': 'c', 'ć': 'c', 'đ': 'd', 'š': 's', 'ž': 'z' }

// One letter, for the letter-by-letter answer check in study.
export function foldChar(ch) {
  const l = ch.toLowerCase()
  return DIACRITIC_FOLD[l] ?? l
}

const CYRILLIC = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž',
  'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n',
  'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š',
}

// A whole string, for search. Serbian Cyrillic is transliterated to Latin and
// "dj" folds like "đ", so "djak", "đak" and "ђак" all compare equal. Apply it
// to both sides of a comparison. Not for Russian text — it would turn Russian
// letters into Latin ones.
export function foldText(str) {
  return [...(str ?? '').toLowerCase()]
    .map(ch => CYRILLIC[ch] ?? ch)
    .join('')
    .replace(/[čćđšž]/g, ch => DIACRITIC_FOLD[ch])
    .replace(/dj/g, 'd')
}
