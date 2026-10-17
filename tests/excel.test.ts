import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { exportExcel } from '../src/utils/excel';
import { downloadFile } from '../src/utils/download';
import type { Session } from '../src/types';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
describe('Excel reporting', () => {
  it('exports accurate summary and roster while keeping formula-looking names as text', async () => {
    const session: Session = {
      id: 'session',
      course: 'IT101',
      section: 'A',
      roomPin: '492',
      startsAt: 1800000000000,
      graceMinutes: 15,
      state: 'CLOSED',
      roster: [
        { id: '001', name: '=1+1', section: 'A', token: 'a' },
        { id: '002', name: 'Peña, José', section: 'A', token: 'b' },
      ],
    };
    await exportExcel(
      session,
      new Map([
        ['a', { status: 'PRESENT', at: session.startsAt, source: 'QR' }],
        ['b', { status: 'ABSENT', at: session.startsAt, source: 'MANUAL' }],
      ]),
    );
    const [blob, filename] = vi.mocked(downloadFile).mock.calls[0];
    const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets.Attendance;
    expect(filename).toMatch(/IT101_A_.*\.xlsx/);
    expect(sheet.B10.v).toBe('=1+1');
    expect(sheet.B10.t).toBe('s');
    expect(sheet.B10.f).toBeUndefined();
    expect(sheet.A10.v).toBe('001');
    expect(sheet.B11.v).toBe('Peña, José');
    expect(sheet.B5.v).toBe(2);
    expect(sheet.D5.v).toBe(1);
    expect(sheet.B6.v).toBe(1);
    expect(sheet.B7.v).toBe(0.5);
  });
});
