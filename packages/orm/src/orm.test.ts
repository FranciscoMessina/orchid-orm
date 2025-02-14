import { OrchidORM, orchidORM } from './orm';
import {
  assertType,
  expectSql,
  userData,
  useTestDatabase,
} from './test-utils/test-utils';
import { pgConfig } from './test-utils/test-db';
import { createBaseTable } from './table';

describe('orm', () => {
  useTestDatabase();

  let db:
    | OrchidORM<{ user: typeof UserTable; profile: typeof ProfileTable }>
    | undefined;

  afterEach(async () => {
    if (db) await db.$close();
  });

  const BaseTable = createBaseTable();

  type User = UserTable['columns']['type'];
  class UserTable extends BaseTable {
    table = 'user';
    columns = this.setColumns((t) => ({
      id: t.serial().primaryKey(),
      name: t.text(1, 10),
      password: t.text(1, 10),
    }));
  }

  class ProfileTable extends BaseTable {
    table = 'profile';
    columns = this.setColumns((t) => ({
      id: t.serial().primaryKey(),
    }));
  }

  it('should return object with provided adapter, close and transaction method, tables', () => {
    db = orchidORM(pgConfig, {
      user: UserTable,
      profile: ProfileTable,
    });

    expect('$adapter' in db).toBe(true);
    expect(db.$close).toBeInstanceOf(Function);
    expect(db.$transaction).toBeInstanceOf(Function);
    expect(Object.keys(db)).toEqual(
      expect.arrayContaining(['user', 'profile']),
    );
  });

  it('should return table which is a queryable interface', async () => {
    db = orchidORM(pgConfig, {
      user: UserTable,
      profile: ProfileTable,
    });

    const { id, name } = await db.user.create(userData);

    const query = db.user.select('id', 'name').where({ id: { gt: 0 } });

    expectSql(
      query.toSql(),
      `
        SELECT "user"."id", "user"."name"
        FROM "user"
        WHERE "user"."id" > $1
      `,
      [0],
    );

    const result = await query;
    expect(result).toEqual([{ id, name }]);

    assertType<typeof result, Pick<User, 'id' | 'name'>[]>();
  });

  it('should be able to turn on autoPreparedStatements', () => {
    db = orchidORM(
      { ...pgConfig, autoPreparedStatements: true },
      {
        user: UserTable,
        profile: ProfileTable,
      },
    );

    expect(db.user.query.autoPreparedStatements).toBe(true);
  });
});
