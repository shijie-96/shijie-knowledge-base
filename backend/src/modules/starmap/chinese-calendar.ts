/**
 * 中国农历 / 节气 / 节日 计算工具（氛围层用）
 *
 * 仅覆盖任务规定的中国主要节日：春节、元宵、清明、端午、中秋、七夕、国庆、元旦、除夕。
 * 农历采用 1900-2100 查表法（标准农历数据，无需外部依赖）。
 * 所有日期均为「日历日期」语义（不涉及时区时刻），保证任何时区下判定一致。
 */

/** 农历数据（1900-2100，共 201 项）。每项一个 16 进制数：
 *  低 4 位 = 闰月月份（0 表示无闰月）
 *  第 4..15 位 = 12 个月的大小（1=大月 30 天，0=小月 29 天）
 *  第 16 位 = 闰月大小（1=30 天，0=29 天） */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

/** 公历 1900-01-31 = 农历 1900 年正月初一 */
const BASE_DAY_NUM = Math.floor(Date.UTC(1900, 0, 31) / 86400000);
const MS_DAY = 86400000;

/** 该农历年闰月月份（0=无闰月） */
function leapMonth(year: number): number {
  return LUNAR_INFO[year - 1900] & 0xf;
}

/** 该农历年闰月天数（0=无闰月） */
function leapDays(year: number): number {
  if (!leapMonth(year)) return 0;
  return LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29;
}

/** 该农历年第 m 月天数 */
function monthDays(year: number, month: number): number {
  return LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29;
}

/** 该农历年总天数 */
function lunarYearDays(year: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    if (LUNAR_INFO[year - 1900] & i) sum += 1;
  }
  return sum + leapDays(year);
}

/** 日历日期 → 距 1900-01-31 的天数序号（纯日历语义） */
function toDayNum(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_DAY);
}

/** 天数序号 → 日历日期（纯日历语义） */
function fromDayNum(n: number): { y: number; m: number; d: number } {
  const dt = new Date(n * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const toYmd = (date: Date) => ({
  y: date.getFullYear(),
  m: date.getMonth() + 1,
  d: date.getDate(),
});

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

/** 公历日期 → 农历日期（超出 1900-2100 范围返回 null） */
export function toLunar(date: Date): LunarDate | null {
  const { y, m, d } = toYmd(date);
  let offset = toDayNum(y, m, d) - BASE_DAY_NUM;
  if (offset < 0) return null;

  let year = 1900;
  while (offset >= lunarYearDays(year)) {
    offset -= lunarYearDays(year);
    year++;
    if (year > 2100) return null;
  }

  const leap = leapMonth(year);
  let month = 1;
  let isLeap = false;
  for (;;) {
    const days = isLeap ? leapDays(year) : monthDays(year, month);
    if (offset < days) break;
    offset -= days;
    if (!isLeap && leap === month) {
      isLeap = true;
    } else {
      month++;
      isLeap = false;
    }
  }
  return { year, month, day: offset + 1, isLeap };
}

/** 农历某年正月初一的天数序号 */
function springFestivalDayNum(lunarYear: number): number {
  let offset = 0;
  for (let y = 1900; y < lunarYear; y++) offset += lunarYearDays(y);
  return BASE_DAY_NUM + offset;
}

export interface FestivalInfo {
  key: string;
  name: string;
  decoration: string;
}

/** 清明（公历，节气近似：太阳黄经 15°，1900-2100 通用） */
function qingmingDay(year: number): number {
  return Math.floor(
    0.2422 * (year - 1900) + 4.81 - Math.floor((year - 1900) / 4),
  );
}

/** 当前日期是否处于节日（中国主要节日，任务红线限定范围） */
export function getFestival(date: Date): FestivalInfo | null {
  const { y, m, d } = toYmd(date);

  // —— 固定公历节日 ——
  if (m === 1 && d === 1) {
    return { key: 'new_year', name: '元旦', decoration: 'firework' };
  }
  // 清明：近似日 ± 1 天窗口（覆盖节气时刻跨天与时区差异）
  const qm = qingmingDay(y);
  if (m === 4 && (d === qm || d === qm + 1)) {
    return { key: 'qingming', name: '清明节', decoration: 'qingming' };
  }
  if (m === 10 && d === 1) {
    return { key: 'national_day', name: '国庆节', decoration: 'national_day' };
  }

  // —— 农历节日 ——
  const lunar = toLunar(date);
  if (!lunar) return null;
  if (lunar.month === 1 && lunar.day === 1) {
    return { key: 'spring_festival', name: '春节', decoration: 'spring' };
  }
  if (lunar.month === 1 && lunar.day === 15) {
    return { key: 'lantern_festival', name: '元宵节', decoration: 'lantern' };
  }
  if (lunar.month === 5 && lunar.day === 5) {
    return { key: 'dragon_boat', name: '端午节', decoration: 'dragon_boat' };
  }
  if (lunar.month === 7 && lunar.day === 7) {
    return { key: 'qixi', name: '七夕节', decoration: 'qixi' };
  }
  if (lunar.month === 8 && lunar.day === 15) {
    return { key: 'mid_autumn', name: '中秋节', decoration: 'mid_autumn' };
  }
  // 除夕 = 当前农历年的最后一天（= 次年正月初一前一天）
  if (lunar.year + 1 <= 2100) {
    const chuxi = fromDayNum(springFestivalDayNum(lunar.year + 1) - 1);
    if (chuxi.y === y && chuxi.m === m && chuxi.d === d) {
      return { key: 'chuxi', name: '除夕', decoration: 'firework' };
    }
  }
  return null;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 四季（按公历月份：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬） */
export function getSeason(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 日期字符串 YYYY-MM-DD（日历日期，本地时区） */
export function toYmdString(date: Date): string {
  const { y, m, d } = toYmd(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
