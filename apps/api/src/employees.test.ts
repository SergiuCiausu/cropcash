import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { findFunction, loadData, type WriteFunction } from '@cropcash/shared';
import { createApp } from './app';
import { FARM_SELECT, RepoError, type FarmRow, type NewExpense, type Repo } from './db/repo';
import { EmployeesError, employeeFromRow, type EmployeeStore } from './db/employees';

const data = loadData();
const verifyToken = async (token: string) => ({ userId: `u-${token}`, email: `${token}@example.com` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const NELU = '6f1c1d6a-1f0b-4f7e-9a51-2a3c4b5d6e7f';
const CLIENT = '0b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';

const farm: FarmRow = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: 1970,
  start_balance_bani: 0,
  parcels: [{ crop_id: 'grau', area_ari: 10_000, is_arable: true }],
};

function setup(store: Partial<EmployeeStore> = {}, addExpense?: Repo['addExpense']) {
  const employees: EmployeeStore = {
    add: vi.fn(async () => NELU),
    update: vi.fn(async (_t: string, id: string) => id === NELU),
    archive: vi.fn(async (_t: string, id: string) => id === NELU),
    setOwnFieldWork: vi.fn(async () => {}),
    ...store,
  };
  const expenses: NewExpense[] = [];
  const repo = {
    getMyFarm: vi.fn(async (token: string) => (token === 'ion' ? farm : null)),
    addExpense:
      addExpense ??
      vi.fn(async (_t: string, e: NewExpense) => {
        expenses.push(e);
        return 'tx-1';
      }),
  } as unknown as Repo;
  const app = createApp({ corsOrigins: [], verifyToken, repo, data, getRates: async () => null, employees, now: () => new Date('2026-11-14T10:00:00Z') });
  return { app, employees, expenses };
}

/** The request the phone's registry builds, sent as the phone sends it. */
function send(app: ReturnType<typeof setup>['app'], name: string, input: unknown, token = 'ion') {
  const { method, path, body } = (findFunction(name) as WriteFunction).request(input as never);
  const r = request(app)[method.toLowerCase() as 'put' | 'post' | 'delete'](path).set(as(token));
  return body === undefined ? r : r.send(body as object);
}

const nelu = { name: 'Nelu', role: 'tractorist', kind: 'permanent', costLei: 7500, payBasis: 'month', startsOn: '2026-03-01' };

describe('people API', () => {
  it('needs a session', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/employees').send(nelu)).status).toBe(401);
  });

  it('adds a person as a row in bani, with the phone’s id', async () => {
    const { app, employees } = setup();
    const res = await send(app, 'add_employee', { ...nelu, clientId: CLIENT });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: NELU });
    expect(employees.add).toHaveBeenCalledWith(
      'ion',
      'farm-1',
      {
        name: 'Nelu',
        role: 'tractorist',
        kind: 'permanent',
        cost_bani: 750_000,
        pay_basis: 'month',
        days_per_month: null,
        active_months: null,
        pay_day: 10,
        starts_on: '2026-03-01',
        ends_on: null,
      },
      CLIENT,
    );
  });

  it('adds a zilier with their days and months', async () => {
    const { app, employees } = setup();
    const res = await send(app, 'add_employee', { name: 'Vasile', kind: 'zilier', costLei: 200, payBasis: 'day', daysPerMonth: 12, activeMonths: [8, 7], startsOn: '2026-07-01' });
    expect(res.status).toBe(201);
    expect(employees.add).toHaveBeenCalledWith('ion', 'farm-1', expect.objectContaining({ cost_bani: 20_000, days_per_month: 12, active_months: [7, 8] }), undefined);
  });

  it('refuses a person that breaks the rules, before the database', async () => {
    const { app, employees } = setup();
    for (const bad of [
      { ...nelu, kind: 'zilier' },
      { ...nelu, costLei: 0 },
      { ...nelu, endsOn: '2026-01-01' },
      { ...nelu, cnp: '1700101123456' },
    ]) {
      expect((await request(app).post('/api/employees').set(as('ion')).send(bad)).status).toBe(400);
    }
    expect(employees.add).not.toHaveBeenCalled();
  });

  it('answers no_farm without a farm', async () => {
    const { app } = setup();
    const res = await send(app, 'add_employee', nelu, 'nobody');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'no_farm' });
  });

  it('passes on a refusal from the database', async () => {
    const { app } = setup({ add: vi.fn(async () => Promise.reject(new EmployeesError(400, 'invalid_input', 'check'))) });
    expect((await send(app, 'add_employee', nelu)).body).toEqual({ error: 'invalid_input' });
  });

  it('changes every field, and 404s someone else’s person', async () => {
    const { app, employees } = setup();
    const res = await send(app, 'update_employee', { ...nelu, id: NELU, costLei: 8000, payDay: 15 });
    expect(res.status).toBe(204);
    expect(employees.update).toHaveBeenCalledWith('ion', NELU, expect.objectContaining({ cost_bani: 800_000, pay_day: 15, role: 'tractorist' }));
    const other = await send(app, 'update_employee', { ...nelu, id: CLIENT });
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ error: 'not_found' });
  });

  it('refuses a bad id in the path', async () => {
    const { app } = setup();
    expect((await request(app).put('/api/employees/abc').set(as('ion')).send(nelu)).status).toBe(400);
  });

  it('archives with an optional last day, on the server’s clock', async () => {
    const { app, employees } = setup();
    expect((await send(app, 'archive_employee', { id: NELU, endsOn: '2026-10-31' })).status).toBe(204);
    expect(employees.archive).toHaveBeenCalledWith('ion', NELU, '2026-10-31', new Date('2026-11-14T10:00:00Z'));
    expect((await send(app, 'archive_employee', { id: NELU })).status).toBe(204);
    expect(employees.archive).toHaveBeenLastCalledWith('ion', NELU, undefined, expect.any(Date));
    expect((await send(app, 'archive_employee', { id: CLIENT })).status).toBe(404);
  });

  it('keeps the people routes off without a store', async () => {
    const app = createApp({ corsOrigins: [], verifyToken, repo: {} as Repo, data, getRates: async () => null });
    expect((await request(app).post('/api/employees').set(as('ion')).send(nelu)).status).toBe(404);
  });
});

describe('„Lucrările pe câmp le fac oamenii tăi?”', () => {
  it('saves the answer on the farm', async () => {
    const { app, employees } = setup();
    expect((await send(app, 'set_own_field_work', { ownFieldWork: true })).status).toBe(204);
    expect(employees.setOwnFieldWork).toHaveBeenCalledWith('ion', 'farm-1', true);
    expect((await send(app, 'set_own_field_work', { ownFieldWork: false })).status).toBe(204);
    expect(employees.setOwnFieldWork).toHaveBeenLastCalledWith('ion', 'farm-1', false);
  });

  it('refuses anything but yes or no, and answers no_farm without a farm', async () => {
    const { app, employees } = setup();
    for (const bad of [{}, { ownFieldWork: 'da' }, { ownFieldWork: null }, { ownFieldWork: true, extra: 1 }]) {
      expect((await request(app).put('/api/farm/own-field-work').set(as('ion')).send(bad)).status).toBe(400);
    }
    expect((await send(app, 'set_own_field_work', { ownFieldWork: true }, 'nobody')).status).toBe(404);
    expect(employees.setOwnFieldWork).not.toHaveBeenCalled();
  });
});

describe('a salary expense', () => {
  const pay = { category: 'salaries', amountLei: 7500, date: '2026-11-10', employeeId: NELU };

  it('names the person', async () => {
    const { app, expenses } = setup();
    expect((await send(app, 'add_expense', pay)).status).toBe(201);
    expect(expenses[0]).toEqual(expect.objectContaining({ category: 'salaries', amountBani: 750_000, employeeId: NELU }));
  });

  it('is allowed without a person', async () => {
    const { app, expenses } = setup();
    expect((await send(app, 'add_expense', { ...pay, employeeId: undefined })).status).toBe(201);
    expect(expenses[0]!.employeeId).toBeUndefined();
  });

  it('refuses a person on any other category', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/expenses').set(as('ion')).send({ ...pay, category: 'diesel' })).status).toBe(400);
  });

  it('says unknown_employee when the person isn’t this farm’s', async () => {
    const { app } = setup({}, vi.fn(async () => Promise.reject(new RepoError('not_found', 'unknown employee'))));
    const res = await send(app, 'add_expense', pay);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_employee' });
  });
});

describe('the farm read', () => {
  it('brings the people and whose pay each expense was', () => {
    expect(FARM_SELECT).toMatch(/employees \(id, name, role, kind, cost_bani/);
    expect(FARM_SELECT).toMatch(/transactions \([^)]*employee_id/);
    expect(FARM_SELECT).toMatch(/^id, [^(]*own_field_work/);
  });

  it('turns a bigint cost that came back as text into a number', () => {
    expect(employeeFromRow({ id: NELU, cost_bani: '750000' }).cost_bani).toBe(750_000);
  });
});
