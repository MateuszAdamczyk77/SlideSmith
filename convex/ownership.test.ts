/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const allowedEmail = 'owner@example.com';

beforeEach(() => {
  vi.stubEnv('ALLOWED_USER_EMAIL', allowedEmail);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authentication and ownership', () => {
  test('rejects unauthenticated and non-allowlisted callers', async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.config.get, {})).rejects.toThrow('Not authenticated');
    await expect(
      t.withIdentity({ email: 'intruder@example.com' }).query(api.config.get, {}),
    ).rejects.toThrow('Unauthorized');
  });

  test('creates owner-scoped data and blocks a different identity token', async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ email: allowedEmail, tokenIdentifier: 'owner-token' });
    const otherSession = t.withIdentity({ email: allowedEmail, tokenIdentifier: 'other-token' });

    await owner.mutation(api.projects.ensureDefault, {});
    const config = await owner.query(api.config.get, {});
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe('Project 1');

    await owner.mutation(api.projects.update, {
      projectId: config.projects[0].id,
      name: 'Private project',
    });
    await expect(
      otherSession.mutation(api.projects.update, {
        projectId: config.projects[0].id,
        name: 'Stolen project',
      }),
    ).rejects.toThrow('Project not found');

    const updated = await owner.query(api.config.get, {});
    expect(updated.projects[0].name).toBe('Private project');
  });

  test('returns an empty queue before the first project is created', async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ email: allowedEmail, tokenIdentifier: 'owner-token' });

    await expect(owner.query(api.slideshows.listQueue, {})).resolves.toEqual([]);
  });
});
