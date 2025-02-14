import {
  Adapter,
  Db,
  AdapterOptions,
  QueryLogOptions,
  columnTypes,
  NoPrimaryKeyOption,
  anyShape,
  DbTableOptions,
} from 'pqb';
import { DbTable, Table, TableClasses } from './table';
import { applyRelations } from './relations/relations';
import { transaction } from './transaction';

export type OrchidORM<T extends TableClasses> = {
  [K in keyof T]: DbTable<T[K]>;
} & {
  $transaction: typeof transaction;
  $adapter: Adapter;
  $queryBuilder: Db;
  $close(): Promise<void>;
};

export const orchidORM = <T extends TableClasses>(
  {
    log,
    logger,
    autoPreparedStatements,
    noPrimaryKey = 'error',
    ...options
  }: ({ adapter: Adapter } | Omit<AdapterOptions, 'log'>) &
    QueryLogOptions & {
      autoPreparedStatements?: boolean;
      noPrimaryKey?: NoPrimaryKeyOption;
    },
  tables: T,
): OrchidORM<T> => {
  const adapter = 'adapter' in options ? options.adapter : new Adapter(options);
  const commonOptions = {
    log,
    logger,
    autoPreparedStatements,
    noPrimaryKey,
  };
  const qb = new Db(
    adapter,
    undefined as unknown as Db,
    undefined,
    anyShape,
    columnTypes,
    commonOptions,
  );
  qb.queryBuilder = qb as unknown as Db;

  const result = {
    $transaction: transaction,
    $adapter: adapter,
    $queryBuilder: qb,
    $close: () => adapter.close(),
  } as unknown as OrchidORM<TableClasses>;

  const tableInstances: Record<string, Table> = {};

  for (const key in tables) {
    if (key[0] === '$') {
      throw new Error(`Table class name must not start with $`);
    }

    const table = new tables[key]();
    tableInstances[key] = table;

    const options: DbTableOptions = {
      ...commonOptions,
      schema: table.schema,
    };

    if (table.noPrimaryKey) options.noPrimaryKey = 'ignore';

    const dbTable = new Db(
      adapter,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qb as any,
      table.table,
      table.columns.shape,
      table.columnTypes,
      options,
    );

    (dbTable as unknown as { definedAs: string }).definedAs = key;
    (dbTable as unknown as { db: unknown }).db = result;

    (result as Record<string, unknown>)[key] = dbTable;
  }

  applyRelations(qb, tableInstances, result);

  return result as unknown as OrchidORM<T>;
};
