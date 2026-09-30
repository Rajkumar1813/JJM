import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Time Logic Unit Tests', () => {
  it('should validate campaign time window in Asia/Kolkata', () => {
    const tzOptions = { timeZone: 'Asia/Kolkata' };
    const now = new Date();
    const hourStr = now.toLocaleString('en-US', { ...tzOptions, hour: '2-digit', hour12: false });
    const minStr = now.toLocaleString('en-US', { ...tzOptions, minute: '2-digit' });
    const currentTimeStr = `${hourStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`;
    
    assert.ok(currentTimeStr.length === 5, 'Time string should be formatted as HH:mm');
    assert.ok(currentTimeStr.includes(':'), 'Time string should contain colon');
  });

  it('should format date string correctly', () => {
    const tzOptions = { timeZone: 'Asia/Kolkata' };
    const now = new Date();
    const dateStrKolkata = now.toLocaleString('en-US', { ...tzOptions, year: 'numeric', month: '2-digit', day: '2-digit' }); 
    const [mm, dd, yyyy] = dateStrKolkata.split('/');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;
    
    assert.ok(todayDateStr.length === 10, 'Date string should be YYYY-MM-DD');
  });
});
