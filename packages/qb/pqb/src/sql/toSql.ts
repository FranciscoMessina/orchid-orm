import { Query, queryTypeWithLimitOne } from '../query';
import { addValue, q, qc } from './common';
import { JoinItem, Sql } from './types';
import { pushDistinctSql } from './distinct';
import { pushSelectSql } from './select';
import { windowToSql } from './window';
import { pushJoinSql } from './join';
import { pushWhereStatementSql } from './where';
import { pushHavingSql } from './having';
import { pushWithSql } from './with';
import { pushFromAndAs } from './fromAndAs';
import { pushInsertSql } from './insert';
import { pushUpdateSql } from './update';
import { pushDeleteSql } from './delete';
import { pushTruncateSql } from './truncate';
import { pushColumnInfoSql } from './columnInfo';
import { pushOrderBySql } from './orderBy';
import { OnQueryBuilder, WhereQueryBuilder } from '../queryMethods';
import { getRaw, isRaw } from '../raw';
import { QueryData } from './data';
import { pushCopySql } from './copy';

export type ToSqlCtx = {
  whereQueryBuilder: typeof WhereQueryBuilder;
  onQueryBuilder: typeof OnQueryBuilder;
  sql: string[];
  values: unknown[];
};

export type toSqlCacheKey = typeof toSqlCacheKey;
export const toSqlCacheKey = Symbol('toSqlCache');

export type ToSqlOptions = {
  clearCache?: boolean;
  values?: unknown[];
};

export const toSql = (table: Query, options?: ToSqlOptions): Sql => {
  return (
    (!options?.clearCache && table.query[toSqlCacheKey]) ||
    (table.query[toSqlCacheKey] = makeSql(table, options))
  );
};

export const makeSql = (
  table: Query,
  { values = [] }: ToSqlOptions = {},
): Sql => {
  const query = table.query;
  const sql: string[] = [];
  const ctx: ToSqlCtx = {
    whereQueryBuilder: table.whereQueryBuilder,
    onQueryBuilder: table.onQueryBuilder,
    sql,
    values,
  };

  if (query.with) {
    pushWithSql(ctx, query.with);
  }

  if (query.type) {
    if (query.type === 'truncate') {
      if (!table.table) throw new Error('Table is missing for truncate');

      pushTruncateSql(ctx, table.table, query);
      return { text: sql.join(' '), values };
    }

    if (query.type === 'columnInfo') {
      if (!table.table) throw new Error('Table is missing for truncate');

      pushColumnInfoSql(ctx, table.table, query);
      return { text: sql.join(' '), values };
    }

    if (!table.table) throw new Error(`Table is missing for ${query.type}`);

    const quotedAs = q(query.as || table.table);

    if (query.type === 'insert') {
      pushInsertSql(ctx, table, query, q(table.table));
      return { text: sql.join(' '), values };
    }

    if (query.type === 'update') {
      pushUpdateSql(ctx, table, query, quotedAs);
      return { text: sql.join(' '), values };
    }

    if (query.type === 'delete') {
      pushDeleteSql(ctx, table, query, quotedAs);
      return { text: sql.join(' '), values };
    }

    if (query.type === 'copy') {
      pushCopySql(ctx, table, query, quotedAs);
      return { text: sql.join(' '), values };
    }
  }

  const quotedAs = table.table && q(query.as || table.table);

  sql.push('SELECT');

  if (query.distinct) {
    pushDistinctSql(ctx, query.distinct, quotedAs);
  }

  pushSelectSql(ctx, table, query, quotedAs);

  if (table.table || query.from) {
    pushFromAndAs(ctx, table, query, quotedAs);
  }

  if (query.join) {
    pushJoinSql(
      ctx,
      table,
      query as QueryData & { join: JoinItem[] },
      quotedAs,
    );
  }

  if (query.and || query.or) {
    pushWhereStatementSql(ctx, table, query, quotedAs);
  }

  if (query.group) {
    const group = query.group.map((item) =>
      typeof item === 'object' && isRaw(item)
        ? getRaw(item, values)
        : qc(item as string, quotedAs),
    );
    sql.push(`GROUP BY ${group.join(', ')}`);
  }

  if (query.having || query.havingOr) {
    pushHavingSql(ctx, table, query, quotedAs);
  }

  if (query.window) {
    const window: string[] = [];
    query.window.forEach((item) => {
      for (const key in item) {
        window.push(`${q(key)} AS ${windowToSql(item[key], values, quotedAs)}`);
      }
    });
    sql.push(`WINDOW ${window.join(', ')}`);
  }

  if (query.union) {
    query.union.forEach((item) => {
      let itemSql: string;
      if (isRaw(item.arg)) {
        itemSql = getRaw(item.arg, values);
      } else {
        const argSql = makeSql(item.arg, { values });
        itemSql = argSql.text;
      }
      sql.push(`${item.kind} ${item.wrap ? `(${itemSql})` : itemSql}`);
    });
  }

  if (query.order) {
    pushOrderBySql(ctx, quotedAs, query.order);
  }

  const limit = queryTypeWithLimitOne[query.returnType] ? 1 : query.limit;
  if (limit) {
    sql.push(`LIMIT ${addValue(values, limit)}`);
  }

  if (query.offset) {
    sql.push(`OFFSET ${addValue(values, query.offset)}`);
  }

  if (query.for) {
    sql.push('FOR', query.for.type);
    const { tableNames } = query.for;
    if (tableNames) {
      if (isRaw(tableNames)) {
        sql.push('OF', getRaw(tableNames, values));
      } else {
        sql.push('OF', tableNames.map(q).join(', '));
      }
    }
    if (query.for.mode) sql.push(query.for.mode);
  }

  return { text: sql.join(' '), values };
};
