import { Campaign } from '../types';
import { getISTDateString, getISTTimeString, getISTDayOfWeek } from '../utils/time';

export function isCampaignActiveInTime(c: Partial<Campaign>, now: Date = new Date()): boolean {
  const todayDateStr = getISTDateString(now);
  const currentTimeStr = getISTTimeString(now);
  const currentDay = getISTDayOfWeek(now);

  const daysOfWeek = c.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
  if (daysOfWeek.length > 0) {
    const normalizedDays = daysOfWeek.map((d: number) => (d === 7 ? 0 : d));
    if (!normalizedDays.includes(currentDay)) return false;
  }
  
  if (c.startTime && c.endTime) {
    if (currentTimeStr < c.startTime || currentTimeStr > c.endTime) return false;
  }
  
  if (c.startDate && todayDateStr < c.startDate) return false;
  if (c.endDate && todayDateStr > c.endDate) return false;
  
  return true;
}

export function isCampaignTargeting(c: Partial<Campaign>, screenId: string, departmentId: string): boolean {
  let isTargeted = false;
  if (c.targetIds) {
    for (const t of c.targetIds) {
      if (t === 'all') isTargeted = true;
      if (t === departmentId) isTargeted = true;
      if (t === screenId) isTargeted = true;
    }
  }
  // If targets array is present (which is the new format in some places)
  if ((c as any).targets) {
    for (const t of (c as any).targets) {
      if (t.targetType === 'ALL' || t.targetId === 'all') isTargeted = true;
      if (t.targetType === 'DEPARTMENT' && t.targetId === departmentId) isTargeted = true;
      if (t.targetType === 'SCREEN' && t.targetId === screenId) isTargeted = true;
    }
  }
  return isTargeted;
}
