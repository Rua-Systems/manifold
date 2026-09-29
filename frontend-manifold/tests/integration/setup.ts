import { loadEnv } from '$lib/server/env';
import { inject } from 'vitest';
import { testEnvironment } from '../support/environment.ts';

// Modules that call getEnv() or getDb() see the test database.
loadEnv(testEnvironment(inject('databaseUrl'), 'http://localhost:4173'), { dev: true });
