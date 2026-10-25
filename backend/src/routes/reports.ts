import ExcelJS from 'exceljs';
import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireAuth, requireRole } from '../auth';
import { config } from '../config';
import { HttpError, wrap } from '../http';
import { sequelize } from '../models';
import { getBranding } from '../services/branding';
import { audit } from '../services/log';
import { EDIT_TEXT, parseFilters, runReport, STATUS_TEXT } from '../services/report';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// Everything here needs a signed-in admin (the router is mounted after requireAuth).
reportsRouter.get(
  '/report',
  requireRole('admin'),
  wrap(async (req, res) => res.json(await runReport(parseFilters(req.query))))
);

// The editing queue: captured people and whether their video is edited yet. Admin and videographer.
reportsRouter.get(
  '/editing',
  requireRole('admin', 'videographer'),
  wrap(async (req, res) => {
    const f = parseFilters({ ...req.query, status: 'done' });
    const r = await runReport(f);
    res.json({ ...r, rows: r.rows.slice(-400).reverse() });
  })
);

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const HEAD = ['Date', 'Time', 'Sales person', 'Supervisor', 'Sales manager', 'Capture', 'Video editing', 'Edited on', 'Videographer'];

reportsRouter.get(
  '/report.csv',
  requireRole('admin'),
  wrap(async (req, res) => {
    const { filters, rows } = await runReport(parseFilters(req.query));
    const lines = [HEAD, ...rows.map((r) => [r.date, r.time, r.person, r.supervisor, r.manager, STATUS_TEXT[r.status], EDIT_TEXT[r.editing], r.editedOn ?? '', r.videographer])];
    await audit(req.user!.id, 'report.export', 'report', null, { format: 'csv', from: filters.from, to: filters.to });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="capture-report-${filters.from}-to-${filters.to}.csv"`);
    res.send('﻿' + lines.map((l) => l.map(q).join(',')).join('\r\n'));
  })
);

reportsRouter.get(
  '/report.xlsx',
  requireRole('admin'),
  wrap(async (req, res) => {
    const { filters, summary, rows } = await runReport(parseFilters(req.query));
    const brand = await getBranding();
    const argb = 'FF' + brand.color.replace('#', '').toUpperCase();
    const wb = new ExcelJS.Workbook();
    wb.creator = brand.name;
    wb.created = new Date();

    const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    s.columns = [{ width: 26 }, { width: 22 }];
    s.mergeCells('A1:B1');
    s.getCell('A1').value = `${brand.name} · Capture report`;
    s.getCell('A1').font = { size: 16, bold: true, color: { argb } };
    s.getCell('A2').value = 'Period';
    s.getCell('B2').value = `${filters.from} to ${filters.to}`;
    const sum: [string, string | number][] = [
      ['People scheduled', summary.total],
      ['Captured', summary.captured],
      ['Missed', summary.missed],
      ['Still booked', summary.booked],
      ['Capture rate', `${summary.captureRate}%`],
      ['Videos edited', summary.edited],
      ['Waiting for editing', summary.pendingEdit],
      ['Editing rate', `${summary.editRate}%`],
    ];
    sum.forEach(([k, v], i) => {
      s.getCell(`A${4 + i}`).value = k;
      s.getCell(`B${4 + i}`).value = v;
      s.getCell(`A${4 + i}`).font = { color: { argb: 'FF475569' } };
      s.getCell(`B${4 + i}`).font = { bold: true };
      s.getCell(`B${4 + i}`).alignment = { horizontal: 'left' };
    });

    const ws = wb.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = HEAD.map((h, i) => ({ header: h, key: String(i), width: [12, 8, 24, 20, 20, 12, 14, 12, 20][i] }));
    rows.forEach((r) => ws.addRow([r.date, r.time, r.person, r.supervisor, r.manager, STATUS_TEXT[r.status], EDIT_TEXT[r.editing], r.editedOn ?? '', r.videographer]));
    ws.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      c.alignment = { vertical: 'middle' };
    });
    ws.getRow(1).height = 22;
    ws.autoFilter = { from: 'A1', to: `I1` };
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const cap = String(row.getCell(6).value);
      const ed = String(row.getCell(7).value);
      if (cap === 'Missed') row.getCell(6).font = { color: { argb: 'FFB42318' }, bold: true };
      if (cap === 'Captured') row.getCell(6).font = { color: { argb: 'FF067647' }, bold: true };
      if (ed === 'Not edited') row.getCell(7).font = { color: { argb: 'FFB54708' }, bold: true };
      if (ed === 'Edited') row.getCell(7).font = { color: { argb: 'FF067647' }, bold: true };
    });

    await audit(req.user!.id, 'report.export', 'report', null, { format: 'xlsx', from: filters.from, to: filters.to });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="capture-report-${filters.from}-to-${filters.to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  })
);

// A consistent copy of the whole database (SQLite only), for backups.
reportsRouter.get(
  '/backup',
  requireRole('admin'),
  wrap(async (req, res) => {
    if (config.databaseUrl) throw new HttpError(400, 'Backups from the app work with the built-in SQLite database. Use your database tool for PostgreSQL or MySQL.');
    const tmp = path.join(os.tmpdir(), `callsheet-backup-${Date.now()}.sqlite`);
    await sequelize.query(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    await audit(req.user!.id, 'backup.download', 'system', null, {});
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(tmp, `callsheet-backup-${stamp}.sqlite`, () => fs.rm(tmp, () => {}));
  })
);
