// French national holidays for any year. Easter-based dates use the Anonymous
// Gregorian algorithm (Meeus/Jones/Butcher). Returns a Set of "M-D" strings
// keyed on month (1-12) and day, so lookups are local-time and DST-safe.

function computeEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, delta: number): { month: number; day: number } {
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  return { month: date.getMonth() + 1, day: date.getDate() };
}

export function getFrenchHolidays(year: number): Set<string> {
  const easter = computeEaster(year);
  const easterMonday = addDays(year, easter.month, easter.day, 1);
  const ascension = addDays(year, easter.month, easter.day, 39);
  const pentecoteMonday = addDays(year, easter.month, easter.day, 50);

  const set = new Set<string>();
  // Fixed dates
  set.add("1-1");    // Jour de l'an
  set.add("5-1");    // Fête du travail
  set.add("5-8");    // Victoire 1945
  set.add("7-14");   // Fête nationale
  set.add("8-15");   // Assomption
  set.add("11-1");   // Toussaint
  set.add("11-11");  // Armistice 1918
  set.add("12-25");  // Noël
  // Easter-based
  set.add(`${easterMonday.month}-${easterMonday.day}`);
  set.add(`${ascension.month}-${ascension.day}`);
  set.add(`${pentecoteMonday.month}-${pentecoteMonday.day}`);

  return set;
}

// Nombre réel de jours ouvrés "plein temps" dans un mois : les lundis→vendredis,
// jours fériés français déduits. C'est la base d'un rythme 5 j/semaine.
// `fromDay` (inclus) permet de ne compter que la fin du mois.
export function countWeekdaysMinusHolidays(year: number, month: number, fromDay: number = 1): number {
  const holidays = getFrenchHolidays(year);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = Math.max(1, fromDay); day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0=dim … 6=sam
    if (dow >= 1 && dow <= 5 && !holidays.has(`${month}-${day}`)) count++;
  }
  return count;
}

// Jours travaillés par défaut dans le mois, mappés sur le rythme du praticien :
// (lundis→vendredis hors fériés) × daysPerWeek / 5. Pour 5 j/sem → comptage exact ;
// pour 4 j/sem → prorata 4/5 (on ignore quel jour est chômé).
export function countWorkingDays(year: number, month: number, daysPerWeek: number = 5): number {
  const dpw = Math.max(1, Math.min(7, daysPerWeek));
  return Math.round(countWeekdaysMinusHolidays(year, month) * dpw / 5);
}

// Même mapping appliqué aux jours restants, de `fromDay` (inclus) à la fin du mois.
export function countRemainingWorkingDays(year: number, month: number, fromDay: number, daysPerWeek: number = 5): number {
  const dpw = Math.max(1, Math.min(7, daysPerWeek));
  return Math.round(countWeekdaysMinusHolidays(year, month, fromDay) * dpw / 5);
}
