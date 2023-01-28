import { migrate, rollback } from './migrateOrRollback';
import { createSchemaMigrations, migrationConfigDefaults } from '../common';
import { getMigrationFiles } from '../common';
import { Adapter, noop, TransactionAdapter } from 'pqb';
import { change } from '../migration/change';
import { asMock } from '../test-utils';

jest.mock('../common', () => ({
  ...jest.requireActual('../common'),
  getMigrationFiles: jest.fn(),
  createSchemaMigrations: jest.fn(),
}));

const options = { databaseURL: 'postgres://user@localhost/dbname' };

const files = [
  { path: 'file1', version: '1' },
  { path: 'file2', version: '2' },
  { path: 'file3', version: '3' },
];

const getMigratedVersionsArrayMock = jest.fn();
Adapter.prototype.arrays = getMigratedVersionsArrayMock;

const queryMock = jest.fn();
Adapter.prototype.query = queryMock;
queryMock.mockImplementation(() => undefined);

Adapter.prototype.transaction = (cb) => {
  return cb({} as unknown as TransactionAdapter);
};

const transactionQueryMock = jest.fn();
TransactionAdapter.prototype.query = transactionQueryMock;

const requireTsMock = jest.fn();
const config = {
  ...migrationConfigDefaults,
  requireTs: requireTsMock,
  log: false,
  logger: {
    log: jest.fn(),
    error: noop,
    warn: noop,
  },
};

const createTableCallback = () => {
  change(async (db) => {
    await db.createTable('table', (t) => ({
      id: t.serial().primaryKey(),
    }));
  });
};

let migrationFiles: { path: string; version: string }[] = [];
asMock(getMigrationFiles).mockImplementation(() => migrationFiles);

let migratedVersions: string[] = [];
getMigratedVersionsArrayMock.mockImplementation(() => ({
  rows: migratedVersions.map((version) => [version]),
}));

describe('migrateOrRollback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireTsMock.mockImplementation(() => undefined);
  });

  describe('migrate', () => {
    it('should work properly', async () => {
      migrationFiles = files;
      migratedVersions = ['1'];

      await migrate(options, config, []);

      expect(getMigrationFiles).toBeCalledWith(config, true);

      expect(requireTsMock).toBeCalledWith('file2');
      expect(requireTsMock).toBeCalledWith('file3');

      expect(transactionQueryMock).toBeCalledWith(
        `INSERT INTO "schemaMigrations" VALUES ('2')`,
        undefined,
      );
      expect(transactionQueryMock).toBeCalledWith(
        `INSERT INTO "schemaMigrations" VALUES ('3')`,
        undefined,
      );

      expect(config.logger.log).toBeCalledWith('file2 migrated');
      expect(config.logger.log).toBeCalledWith('file3 migrated');
    });

    it('should create migrations table if it not exist', async () => {
      migrationFiles = [];
      getMigratedVersionsArrayMock.mockRejectedValueOnce({ code: '42P01' });
      (createSchemaMigrations as jest.Mock).mockResolvedValueOnce(undefined);

      await migrate(options, config, []);

      expect(getMigrationFiles).toBeCalledWith(config, true);
      expect(createSchemaMigrations).toBeCalled();
      expect(requireTsMock).not.toBeCalled();
      expect(transactionQueryMock).not.toBeCalled();
      expect(config.logger.log).not.toBeCalled();
    });

    it('should call appCodeUpdater only on the first run', async () => {
      migrationFiles = [files[0]];
      migratedVersions = [];
      requireTsMock.mockImplementationOnce(createTableCallback);
      const appCodeUpdater = jest.fn();

      await migrate(
        [options, options],
        { ...config, appCodeUpdater, useCodeUpdater: true },
        [],
      );

      expect(appCodeUpdater).toBeCalledTimes(1);
    });

    it('should not call appCodeUpdater when useCodeUpdater is set to false in config', async () => {
      migrationFiles = [files[0]];
      migratedVersions = [];
      requireTsMock.mockImplementation(createTableCallback);
      const appCodeUpdater = jest.fn();

      await migrate(
        options,
        { ...config, appCodeUpdater, useCodeUpdater: false },
        [],
      );

      expect(appCodeUpdater).not.toBeCalled();
    });

    it('should not call appCodeUpdater when having argument --code false', async () => {
      migrationFiles = [files[0]];
      migratedVersions = [];
      requireTsMock.mockImplementation(createTableCallback);
      const appCodeUpdater = jest.fn();

      await migrate(
        options,
        { ...config, appCodeUpdater, useCodeUpdater: true },
        ['--code', 'false'],
      );

      expect(appCodeUpdater).not.toBeCalled();
    });

    it('should call appCodeUpdater when having argument --code', async () => {
      migrationFiles = [files[0]];
      migratedVersions = [];
      requireTsMock.mockImplementation(createTableCallback);
      const appCodeUpdater = jest.fn();

      await migrate(
        options,
        { ...config, appCodeUpdater, useCodeUpdater: false },
        ['--code'],
      );

      expect(appCodeUpdater).toBeCalled();
    });
  });

  describe('rollback', () => {
    it('should work properly', async () => {
      migrationFiles = files.reverse();
      migratedVersions = ['1', '2'];

      await rollback(options, config, []);

      expect(getMigrationFiles).toBeCalledWith(config, false);

      expect(requireTsMock).toBeCalledTimes(1);
      expect(requireTsMock).toBeCalledWith('file2');

      expect(transactionQueryMock).toBeCalledTimes(1);
      expect(transactionQueryMock).toBeCalledWith(
        `DELETE FROM "schemaMigrations" WHERE version = '2'`,
        undefined,
      );

      expect(config.logger.log).toBeCalledTimes(1);
      expect(config.logger.log).toBeCalledWith('file2 rolled back');
    });

    it('should create migrations table if it not exist', async () => {
      migrationFiles = [];
      getMigratedVersionsArrayMock.mockRejectedValueOnce({ code: '42P01' });
      (createSchemaMigrations as jest.Mock).mockResolvedValueOnce(undefined);

      await rollback(options, config, []);

      expect(getMigrationFiles).toBeCalledWith(config, false);
      expect(createSchemaMigrations).toBeCalled();
      expect(requireTsMock).not.toBeCalled();
      expect(transactionQueryMock).not.toBeCalled();
      expect(config.logger.log).not.toBeCalled();
    });
  });
});
