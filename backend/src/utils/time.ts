export function getISTDateString(date: Date): string {
  const tzOptions = { timeZone: 'Asia/Kolkata' };
  const dateStrKolkata = date.toLocaleString('en-US', { ...tzOptions, year: 'numeric', month: '2-digit', day: '2-digit' }); 
  const [mm, dd, yyyy] = dateStrKolkata.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export function getISTTimeString(date: Date): string {
  const tzOptions = { timeZone: 'Asia/Kolkata' };
  const hourStr = date.toLocaleString('en-US', { ...tzOptions, hour: '2-digit', hour12: false });
  const minStr = date.toLocaleString('en-US', { ...tzOptions, minute: '2-digit' });
  return `${hourStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`;
}

export function getISTDayOfWeek(date: Date): number {
  const dateStr = getISTDateString(date);
  const kolkataDateObj = new Date(`${dateStr}T12:00:00Z`);
  return kolkataDateObj.getUTCDay();
}
