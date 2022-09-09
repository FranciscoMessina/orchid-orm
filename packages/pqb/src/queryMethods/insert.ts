import {
  AddQuerySelect,
  defaultsKey,
  Query,
  QueryReturnType,
  SetQueryReturnsAll,
  SetQueryReturnsOne,
  SetQueryReturnsVoid,
} from '../query';
import {
  pushQueryArray,
  pushQueryValue,
  setQueryValue,
} from '../queryDataUtils';
import { isRaw, RawExpression } from '../common';
import {
  BelongsToRelation,
  HasOneRelation,
  Relation,
  RelationQuery,
} from '../relations';
import { MaybeArray, noop, SetOptional } from '../utils';
import { InsertQueryData } from '../sql';

export type ReturningArg<T extends Query> = (keyof T['shape'])[] | '*';

export type OptionalKeys<T extends Query> = {
  [K in keyof T['shape']]: T['shape'][K]['isPrimaryKey'] extends true
    ? K
    : T['shape'][K]['isNullable'] extends true
    ? K
    : never;
}[keyof T['shape']];

export type InsertData<
  T extends Query,
  DefaultKeys extends string = T[defaultsKey] extends string
    ? T[defaultsKey]
    : never,
  Data = SetOptional<SetOptional<T['type'], OptionalKeys<T>>, DefaultKeys>,
> = [keyof T['relations']] extends [never]
  ? Data
  : Omit<
      Data,
      {
        [K in keyof T['relations']]: T['relations'][K] extends BelongsToRelation
          ? T['relations'][K]['options']['foreignKey']
          : never;
      }[keyof T['relations']]
    > &
      {
        [Key in keyof T['relations']]: T['relations'][Key] extends BelongsToRelation
          ?
              | SetOptional<
                  {
                    [K in T['relations'][Key]['options']['foreignKey']]: T['relations'][Key]['options']['foreignKey'] extends keyof T['type']
                      ? T['type'][T['relations'][Key]['options']['foreignKey']]
                      : never;
                  },
                  DefaultKeys
                >
              | {
                  [K in Key]: {
                    create: InsertData<
                      T['relations'][Key]['nestedCreateQuery']
                    >;
                  };
                }
          : T['relations'][Key] extends HasOneRelation
          ? 'through' extends T['relations'][Key]['options']
            ? // eslint-disable-next-line @typescript-eslint/ban-types
              {}
            : {
                [K in Key]?: {
                  create: InsertData<T['relations'][Key]['nestedCreateQuery']>;
                };
              }
          : T['relations'][Key] extends Relation
          ? 'through' extends T['relations'][Key]['options']
            ? // eslint-disable-next-line @typescript-eslint/ban-types
              {}
            : {
                [K in Key]?: {
                  create: InsertData<
                    T['relations'][Key]['nestedCreateQuery']
                  >[];
                };
              }
          : // eslint-disable-next-line @typescript-eslint/ban-types
            {};
      }[keyof T['relations']];

type InsertOneResult<
  T extends Query,
  Returning extends ReturningArg<T> | undefined,
> = Returning extends ReturningArg<T>
  ? Returning extends '*'
    ? SetQueryReturnsOne<AddQuerySelect<T, T['shape']>>
    : SetQueryReturnsOne<AddQuerySelect<T, Pick<T['shape'], Returning[number]>>>
  : SetQueryReturnsVoid<T>;

type InsertManyResult<
  T extends Query,
  Returning extends ReturningArg<T> | undefined,
> = Returning extends ReturningArg<T>
  ? Returning extends '*'
    ? SetQueryReturnsAll<AddQuerySelect<T, T['shape']>>
    : SetQueryReturnsAll<AddQuerySelect<T, Pick<T['shape'], Returning[number]>>>
  : SetQueryReturnsVoid<T>;

type OnConflictArg<T extends Query> =
  | keyof T['shape']
  | (keyof T['shape'])[]
  | RawExpression;

type PrependRelationTuple = [
  relationName: string,
  rowIndex: number,
  columnIndex: number,
  data: Record<string, unknown>,
];

type AppendRelationTuple = [
  relationName: string,
  rowIndex: number,
  data: Record<string, unknown>,
];

type BeforeInsertCallback<T extends Query> = (
  q: T,
  data:
    | MaybeArray<InsertData<T>>
    | { columns: string[]; values: RawExpression },
  returning?: ReturningArg<T>,
) => void | Query;

type AfterInsertCallback<T extends Query> = (
  q: T,
  data:
    | MaybeArray<InsertData<T>>
    | { columns: string[]; values: RawExpression },
  returning: ReturningArg<T> | undefined,
  inserted: unknown,
) => void | Promise<void>;

const processInsertItem = (
  item: Record<string, unknown>,
  rowIndex: number,
  relations: Record<string, Relation>,
  prependRelations: PrependRelationTuple[],
  appendRelations: AppendRelationTuple[],
  requiredReturning: Record<string, boolean>,
  columns: string[],
  columnsMap: Record<string, number>,
) => {
  Object.keys(item).forEach((key) => {
    if (relations[key]) {
      if (relations[key].type === 'belongsTo') {
        const foreignKey = (relations[key] as BelongsToRelation).options
          .foreignKey;

        let columnIndex = columnsMap[foreignKey];
        if (columnIndex === undefined) {
          columnsMap[foreignKey] = columnIndex = columns.length;
          columns.push(foreignKey);
        }

        prependRelations.push([
          key,
          rowIndex,
          columnIndex,
          item[key] as Record<string, unknown>,
        ]);
      } else {
        requiredReturning[relations[key].primaryKey] = true;

        appendRelations.push([
          key,
          rowIndex,
          item[key] as Record<string, unknown>,
        ]);
      }
    } else if (columnsMap[key] === undefined) {
      columnsMap[key] = columns.length;
      columns.push(key);
    }
  });
};

export class Insert {
  insert<
    T extends Query,
    Returning extends ReturningArg<T> | undefined = undefined,
  >(
    this: T,
    data: InsertData<T>,
    returning?: Returning,
  ): InsertOneResult<T, Returning>;
  insert<
    T extends Query,
    Returning extends ReturningArg<T> | undefined = undefined,
  >(
    this: T,
    data: InsertData<T>[] | { columns: string[]; values: RawExpression },
    returning?: Returning,
  ): InsertManyResult<T, Returning>;
  insert(
    this: Query,
    data: InsertData<Query> & InsertData<Query>[],
    returning?: ReturningArg<Query>,
  ) {
    return this.clone()._insert(data, returning) as unknown as InsertOneResult<
      Query,
      ReturningArg<Query>
    > &
      InsertManyResult<Query, ReturningArg<Query>>;
  }

  _insert<
    T extends Query,
    Returning extends ReturningArg<T> | undefined = undefined,
  >(
    this: T,
    data: InsertData<T>,
    returning?: Returning,
  ): InsertOneResult<T, Returning>;
  _insert<
    T extends Query,
    Returning extends ReturningArg<T> | undefined = undefined,
  >(
    this: T,
    data: InsertData<T>[] | { columns: string[]; values: RawExpression },
    returning?: Returning,
  ): InsertManyResult<T, Returning>;
  _insert(
    data:
      | Record<string, unknown>
      | Record<string, unknown>[]
      | { columns: string[]; values: RawExpression },
    returning?: ReturningArg<Query>,
  ) {
    let q = this as unknown as Query;
    const query = q.query as InsertQueryData;
    delete query.and;
    delete query.or;

    if (query.beforeInsert) {
      for (const cb of query.beforeInsert) {
        const result = cb(q, data, returning);
        if (result) q = result as typeof q;
      }
    }

    if (query.afterInsert) {
      pushQueryArray(
        q,
        'afterQuery',
        query.afterInsert.map(
          (cb) => (q: Query, inserted: unknown) =>
            cb(q, data, returning, inserted),
        ),
      );
    }

    let columns: string[];
    const prependRelations: PrependRelationTuple[] = [];
    const appendRelations: AppendRelationTuple[] = [];
    const requiredReturning: Record<string, boolean> = {};
    const relations = (this as unknown as Query).relations as unknown as Record<
      string,
      Relation
    >;
    let values: unknown[][] | RawExpression;

    if (
      'values' in data &&
      typeof data.values === 'object' &&
      data.values &&
      isRaw(data.values)
    ) {
      columns = (data as { columns: string[] }).columns;
      values = data.values;
    } else {
      columns = [];
      const columnsMap: Record<string, number> = {};
      const defaults = q.query?.defaults;

      if (Array.isArray(data)) {
        if (defaults) {
          data = data.map((item) => ({ ...defaults, ...item }));
        }

        data.forEach((item, i) => {
          processInsertItem(
            item,
            i,
            relations,
            prependRelations,
            appendRelations,
            requiredReturning,
            columns,
            columnsMap,
          );
        });

        values = Array(data.length);

        data.forEach((item, i) => {
          (values as unknown[][])[i] = columns.map((key) => item[key]);
        });
      } else {
        if (defaults) {
          data = { ...defaults, ...data };
        }

        processInsertItem(
          data,
          0,
          relations,
          prependRelations,
          appendRelations,
          requiredReturning,
          columns,
          columnsMap,
        );

        values = [columns.map((key) => (data as Record<string, unknown>)[key])];
      }
    }

    if (prependRelations.length) {
      pushQueryArray(
        q,
        'beforeQuery',
        prependRelations.map(([relationName, rowIndex, columnIndex, data]) => {
          const relation = relations[relationName];
          const primaryKey = (relation as BelongsToRelation).options.primaryKey;
          if (data.create) {
            return async () => {
              const result = await relation.model.insert(
                data.create as InsertData<Query>,
                [primaryKey],
              );
              const row = (values as unknown[][])[rowIndex];
              row[columnIndex] = result[primaryKey];
            };
          }
          return noop;
        }),
      );
    }

    if (appendRelations.length) {
      if (returning !== '*') {
        const requiredColumns = Object.keys(requiredReturning);

        if (!returning) {
          returning = requiredColumns;
        } else {
          returning = [
            ...new Set([...(returning as string[]), ...requiredColumns]),
          ];
        }
      }

      pushQueryArray(
        q,
        'afterQuery',
        appendRelations.map(([relationName, rowIndex, data]) => {
          if (data.create) {
            return async (returnType: QueryReturnType, inserted: unknown) => {
              await (this as unknown as Record<string, RelationQuery>)
                [relationName](
                  (returnType === 'all'
                    ? (inserted as unknown[])[rowIndex]
                    : inserted) as never,
                )
                .insert(data.create as InsertData<Query>);
            };
          }
          return noop;
        }),
      );
    }

    setQueryValue(q, 'type', 'insert');
    setQueryValue(q, 'columns', columns);
    setQueryValue(q, 'values', values);

    if (returning) {
      q.returnType = Array.isArray(data) ? 'all' : 'one';
      pushQueryValue(q, 'returning', returning);
    } else {
      q.returnType = 'rowCount';
    }

    return q as unknown as InsertOneResult<Query, ReturningArg<Query>> &
      InsertManyResult<Query, ReturningArg<Query>>;
  }

  defaults<T extends Query, Data extends Partial<InsertData<T>>>(
    this: T,
    data: Data,
  ): T & { [defaultsKey]: keyof Data } {
    return (this.clone() as T)._defaults(data);
  }
  _defaults<T extends Query, Data extends Partial<InsertData<T>>>(
    this: T,
    data: Data,
  ): T & { [defaultsKey]: keyof Data } {
    const q = this.toQuery();
    setQueryValue(q, 'defaults', data);
    return q as T & { [defaultsKey]: keyof Data };
  }

  onConflict<T extends Query, Arg extends OnConflictArg<T>>(
    this: T,
    arg?: Arg,
  ): OnConflictQueryBuilder<T, Arg> {
    return this.clone()._onConflict(arg);
  }
  _onConflict<
    T extends Query,
    Arg extends OnConflictArg<T> | undefined = undefined,
  >(this: T, arg?: Arg): OnConflictQueryBuilder<T, Arg> {
    return new OnConflictQueryBuilder(this, arg as Arg);
  }

  beforeInsert<T extends Query>(this: T, cb: BeforeInsertCallback<T>): T {
    return this.clone()._beforeInsert(cb);
  }
  _beforeInsert<T extends Query>(this: T, cb: BeforeInsertCallback<T>): T {
    return pushQueryValue(this, 'beforeInsert', cb);
  }

  afterInsert<T extends Query>(this: T, cb: AfterInsertCallback<T>): T {
    return this.clone()._afterInsert(cb);
  }
  _afterInsert<T extends Query>(this: T, cb: AfterInsertCallback<T>): T {
    return pushQueryValue(this, 'afterInsert', cb);
  }
}

export class OnConflictQueryBuilder<
  T extends Query,
  Arg extends OnConflictArg<T> | undefined,
> {
  constructor(private query: T, private onConflict: Arg) {}

  ignore(): T {
    const q = this.query.toQuery();
    setQueryValue(q, 'onConflict', {
      type: 'ignore',
      expr: this.onConflict,
    });
    return q;
  }

  merge(
    update?:
      | keyof T['shape']
      | (keyof T['shape'])[]
      | Partial<T['type']>
      | RawExpression,
  ): T {
    const q = this.query.toQuery();
    setQueryValue(q, 'onConflict', {
      type: 'merge',
      expr: this.onConflict,
      update,
    });
    return q;
  }
}
