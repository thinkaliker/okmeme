/**
 * Defaults so the unit suite can construct env() without a database.
 *
 * The suites that need real SQL — the visibility predicate is the one that
 * matters — opt in through TEST_DATABASE_URL and skip themselves without it.
 * They are the only place the ring rule is checked against Postgres rather than
 * against a reimplementation of Postgres, so CI should always set it.
 */
if (process.env['TEST_DATABASE_URL'] !== undefined) {
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
}

process.env['DATABASE_URL'] ??= 'postgresql://okmeme:okmeme@localhost:5432/okmeme_test';
process.env['IP_SALT'] ??= 'test-salt';
process.env['NODE_ENV'] = 'test';
