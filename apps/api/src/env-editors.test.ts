import { describe, expect, it } from 'vitest';
import { adminEmails, catalogueEditors } from './env';

/* Who may change what (docs/admin-panel-plan.md steps 3 and 7). */
describe('admins and fertilizer editors', () => {
  it('with nothing set, the demo account is both', () => {
    const vars = { DEMO_EMAIL: 'Demo@CropCash.test' };
    expect(adminEmails(vars)).toEqual(['demo@cropcash.test']);
    expect(catalogueEditors(vars)).toEqual(['demo@cropcash.test']);
  });

  it('every admin may add fertilizers, plus the extra editors, each once', () => {
    const vars = { DEMO_EMAIL: 'demo@cropcash.test', ADMIN_EMAILS: 'ana@x.ro, Ion@x.ro', CATALOGUE_EDITORS: 'agronom@x.ro,ion@x.ro' };
    expect(adminEmails(vars)).toEqual(['ana@x.ro', 'ion@x.ro']);
    expect(catalogueEditors(vars)).toEqual(['ana@x.ro', 'ion@x.ro', 'agronom@x.ro']);
  });

  it('an extra editor is not an admin', () => {
    const vars = { DEMO_EMAIL: 'demo@cropcash.test', CATALOGUE_EDITORS: 'agronom@x.ro' };
    expect(adminEmails(vars)).toEqual(['demo@cropcash.test']);
    expect(catalogueEditors(vars)).toEqual(['demo@cropcash.test', 'agronom@x.ro']);
  });
});
