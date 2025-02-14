import {
  ColumnType,
  ForeignKeyTable,
  ForeignKeyOptions,
  getRaw,
  isRaw,
  quote,
  Sql,
  TableData,
  toArray,
} from 'pqb';
import { ColumnComment, Migration } from './migration';
import {
  getSchemaAndTableFromName,
  joinColumns,
  quoteWithSchema,
} from '../common';

export const columnToSql = (
  key: string,
  item: ColumnType,
  values: unknown[],
  hasMultiplePrimaryKeys: boolean,
): string => {
  const line = [`"${key}" ${item.toSQL()}`];

  if (item.data.compression) {
    line.push(`COMPRESSION ${item.data.compression}`);
  }

  if (item.data.collate) {
    line.push(`COLLATE ${quote(item.data.collate)}`);
  }

  if (item.isPrimaryKey && !hasMultiplePrimaryKeys) {
    line.push('PRIMARY KEY');
  } else if (!item.data.isNullable) {
    line.push('NOT NULL');
  }

  if (item.data.default !== undefined) {
    if (
      typeof item.data.default === 'object' &&
      item.data.default &&
      isRaw(item.data.default)
    ) {
      line.push(`DEFAULT ${getRaw(item.data.default, values)}`);
    } else {
      line.push(`DEFAULT ${quote(item.data.default)}`);
    }
  }

  const { foreignKeys } = item.data;
  if (foreignKeys) {
    for (const foreignKey of foreignKeys) {
      const [schema, table] = getForeignKeyTable(
        'fn' in foreignKey ? foreignKey.fn : foreignKey.table,
      );

      if (foreignKey.name) {
        line.push(`CONSTRAINT "${foreignKey.name}"`);
      }

      line.push(referencesToSql(schema, table, foreignKey.columns, foreignKey));
    }
  }

  return line.join(' ');
};

export const addColumnIndex = (
  indexes: TableData.Index[],
  key: string,
  item: ColumnType,
) => {
  if (item.data.indexes) {
    indexes.push(
      ...item.data.indexes.map((index) => ({
        columns: [{ ...index, column: key }],
        options: index,
      })),
    );
  }
};

export const addColumnComment = (
  comments: ColumnComment[],
  key: string,
  item: ColumnType,
) => {
  if (item.data.comment) {
    comments.push({ column: key, comment: item.data.comment });
  }
};

export const getForeignKeyTable = (
  fnOrTable: (() => ForeignKeyTable) | string,
): [string | undefined, string] => {
  if (typeof fnOrTable === 'string') {
    return getSchemaAndTableFromName(fnOrTable);
  }

  const item = new (fnOrTable())();
  return [item.schema, item.table];
};

export const getForeignKeyName = (table: string, columns: string[]) => {
  return `${table}_${columns.join('_')}_fkey`;
};

export const constraintToSql = (
  { name }: { schema?: string; name: string },
  up: boolean,
  foreignKey: TableData['foreignKeys'][number],
) => {
  const constraintName =
    foreignKey.options.name || getForeignKeyName(name, foreignKey.columns);

  if (!up) {
    const { dropMode } = foreignKey.options;
    return `CONSTRAINT "${constraintName}"${dropMode ? ` ${dropMode}` : ''}`;
  }

  const [schema, table] = getForeignKeyTable(foreignKey.fnOrTable);
  return `CONSTRAINT "${constraintName}" FOREIGN KEY (${joinColumns(
    foreignKey.columns,
  )}) ${referencesToSql(
    schema,
    table,
    foreignKey.foreignColumns,
    foreignKey.options,
  )}`;
};

export const referencesToSql = (
  schema: string | undefined,
  table: string,
  columns: string[],
  foreignKey: Pick<ForeignKeyOptions, 'match' | 'onDelete' | 'onUpdate'>,
) => {
  const sql: string[] = [
    `REFERENCES ${quoteWithSchema({ schema, name: table })}(${joinColumns(
      columns,
    )})`,
  ];

  if (foreignKey.match) {
    sql.push(`MATCH ${foreignKey.match.toUpperCase()}`);
  }

  if (foreignKey.onDelete) {
    sql.push(`ON DELETE ${foreignKey.onDelete.toUpperCase()}`);
  }

  if (foreignKey.onUpdate) {
    sql.push(`ON UPDATE ${foreignKey.onUpdate.toUpperCase()}`);
  }

  return sql.join(' ');
};

export const getIndexName = (
  table: string,
  columns: TableData.Index['columns'],
) => {
  return `${table}_${columns
    .map((it) =>
      'column' in it
        ? it.column
        : it.expression.match(/\w+/g)?.join('_') || 'expression',
    )
    .join('_')}_idx`;
};

export const indexesToQuery = (
  up: boolean,
  { schema, name }: { schema?: string; name: string },
  indexes: TableData.Index[],
): Sql[] => {
  return indexes.map(({ columns, options }) => {
    const indexName = options.name || getIndexName(name, columns);

    if (!up) {
      return {
        text: `DROP INDEX "${indexName}"${
          options.dropMode ? ` ${options.dropMode}` : ''
        }`,
        values: [],
      };
    }

    const values: unknown[] = [];

    const sql: string[] = ['CREATE'];

    if (options.unique) {
      sql.push('UNIQUE');
    }

    sql.push(`INDEX "${indexName}" ON ${quoteWithSchema({ schema, name })}`);

    if (options.using) {
      sql.push(`USING ${options.using}`);
    }

    const columnsSql: string[] = [];

    columns.forEach((column) => {
      const columnSql: string[] = [
        'column' in column ? `"${column.column}"` : `(${column.expression})`,
      ];

      if (column.collate) {
        columnSql.push(`COLLATE '${column.collate}'`);
      }

      if (column.opclass) {
        columnSql.push(column.opclass);
      }

      if (column.order) {
        columnSql.push(column.order);
      }

      columnsSql.push(columnSql.join(' '));
    });

    sql.push(`(${columnsSql.join(', ')})`);

    if (options.include) {
      sql.push(
        `INCLUDE (${toArray(options.include)
          .map((column) => `"${column}"`)
          .join(', ')})`,
      );
    }

    if (options.with) {
      sql.push(`WITH (${options.with})`);
    }

    if (options.tablespace) {
      sql.push(`TABLESPACE ${options.tablespace}`);
    }

    if (options.where) {
      sql.push(
        `WHERE ${
          typeof options.where === 'object' &&
          options.where &&
          isRaw(options.where)
            ? getRaw(options.where, values)
            : options.where
        }`,
      );
    }

    return { text: sql.join(' '), values };
  });
};

export const commentsToQuery = (
  schemaTable: { schema?: string; name: string },
  comments: ColumnComment[],
): Sql[] => {
  return comments.map(({ column, comment }) => ({
    text: `COMMENT ON COLUMN ${quoteWithSchema(
      schemaTable,
    )}."${column}" IS ${quote(comment)}`,
    values: [],
  }));
};

export const primaryKeyToSql = (
  primaryKey: Exclude<TableData['primaryKey'], undefined>,
) => {
  const name = primaryKey.options?.name;
  return `${name ? `CONSTRAINT "${name}" ` : ''}PRIMARY KEY (${joinColumns(
    primaryKey.columns,
  )})`;
};

export const getPrimaryKeysOfTable = async (
  db: Migration,
  tableName: string,
): Promise<{ name: string; type: string }[]> => {
  const { rows } = await db.adapter.query<{ name: string; type: string }>(
    {
      text: `SELECT
  pg_attribute.attname AS name,
  format_type(pg_attribute.atttypid, pg_attribute.atttypmod) AS type
FROM pg_index, pg_class, pg_attribute, pg_namespace
WHERE
  pg_class.oid = $1::regclass AND
  indrelid = pg_class.oid AND
  nspname = 'public' AND
  pg_class.relnamespace = pg_namespace.oid AND
  pg_attribute.attrelid = pg_class.oid AND
  pg_attribute.attnum = any(pg_index.indkey) AND
  indisprimary`,
      values: [tableName],
    },
    db.adapter.types,
  );

  return rows;
};
